import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  loadRecipe,
  saveRecipeMediaUrl,
} from "../../../../../lib/server/recipes-admin";
import { hasR2Config, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "35mb",
    },
  },
};

type MediaKind = "dish" | "recipe_asset_sheet" | "raccoon_sticker_sheet";

type MediaBody = {
  kind?: MediaKind;
  imageBase64?: string;
  fileName?: string;
  setName?: string;
  removeWhite?: boolean;
};

const RECIPE_EXPORT_BUCKET = process.env.RECIPE_EXPORT_BUCKET || "recipes";

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeImageBase64(value: string): Buffer {
  const payload = value.includes(",") ? value.split(",").pop() ?? "" : value;
  if (!payload.trim()) {
    throw new Error("Missing image payload.");
  }
  return Buffer.from(payload, "base64");
}

async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const base = sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: 2600,
      height: 2600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha();

  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const transparentAt = 248;
  const featherAt = 228;
  const spreadLimit = 28;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const alpha = data[index + 3] ?? 255;
    const min = Math.min(red, green, blue);
    const max = Math.max(red, green, blue);
    const spread = max - min;

    if (min >= transparentAt && spread <= spreadLimit) {
      data[index + 3] = 0;
      continue;
    }

    if (min >= featherAt && spread <= spreadLimit) {
      const opacity = Math.max(0, Math.min(1, (transparentAt - min) / (transparentAt - featherAt)));
      data[index + 3] = Math.round(alpha * opacity);
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

async function imageToWebp(input: Buffer, removeWhite: boolean): Promise<Buffer> {
  if (removeWhite) {
    return removeWhiteBackground(input);
  }

  return sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: 2600,
      height: 2600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

async function uploadMedia(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  path: string,
  buffer: Buffer,
): Promise<string> {
  if (hasR2Config()) {
    return uploadPublicR2Object({
      key: path,
      body: buffer,
      contentType: "image/webp",
    });
  }

  const supabasePath = path.replace(/^recipes\//, "");
  const { error } = await supabase.storage.from(RECIPE_EXPORT_BUCKET).upload(supabasePath, buffer, {
    cacheControl: "3600",
    upsert: true,
    contentType: "image/webp",
  });

  if (error) {
    throw new Error(`Failed to upload media: ${error.message}`);
  }

  const { data } = supabase.storage.from(RECIPE_EXPORT_BUCKET).getPublicUrl(supabasePath);
  return data.publicUrl;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const recipeId = typeof req.query.recipeId === "string" ? req.query.recipeId : "";
  if (!recipeId) {
    return res.status(400).json({ error: "Missing `recipeId`." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as MediaBody;
    const kind = body.kind;
    if (kind !== "dish" && kind !== "recipe_asset_sheet" && kind !== "raccoon_sticker_sheet") {
      return res.status(400).json({ error: "Unsupported media kind." });
    }
    if (!body.imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
    }

    const recipe = await loadRecipe(supabase, recipeId);
    const slug = normalizeStorageSegment(recipe.slug || recipe.id);
    const fallbackSetName = normalizeStorageSegment(body.fileName?.replace(/\.[^/.]+$/, "") || slug);
    const setKey = normalizeStorageSegment(body.setName || fallbackSetName) || slug;
    const input = decodeImageBase64(body.imageBase64);
    const webp = await imageToWebp(input, body.removeWhite !== false);

    let path: string;
    let updatedRecipe = recipe;

    if (kind === "dish") {
      path = `recipes/recipes-pics/${slug}.webp`;
      const publicUrl = await uploadMedia(supabase, path, webp);
      updatedRecipe = await saveRecipeMediaUrl(supabase, recipe.id, { image_url: publicUrl });
      return res.status(200).json({ ok: true, kind, path, publicUrl, recipe: updatedRecipe });
    }

    if (kind === "recipe_asset_sheet") {
      path = `recipes/assets/${setKey}/source.webp`;
      const publicUrl = await uploadMedia(supabase, path, webp);
      updatedRecipe = await saveRecipeMediaUrl(supabase, recipe.id, { asset_set_key: setKey });
      return res.status(200).json({ ok: true, kind, setKey, path, publicUrl, recipe: updatedRecipe });
    }

    path = `stickers/raccoon-stickers/${setKey}/source.webp`;
    const publicUrl = await uploadMedia(supabase, path, webp);
    updatedRecipe = await saveRecipeMediaUrl(supabase, recipe.id, { sticker_set_key: setKey });
    return res.status(200).json({ ok: true, kind, setKey, path, publicUrl, recipe: updatedRecipe });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process recipe media.";
    return res.status(500).json({ error: message });
  }
}
