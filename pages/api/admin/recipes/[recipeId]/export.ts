import type { NextApiRequest, NextApiResponse } from "next";
import sharp from "sharp";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  loadRecipe,
  saveRecipeExportUrl,
} from "../../../../../lib/server/recipes-admin";
import { hasR2Config, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";
import {
  buildRecipeExportObjectKey,
  normalizeRecipeExportSlug,
  RECIPE_EXPORT_FORMAT_ERROR,
  validateRecipeExportDeclaredFormat,
  validateRecipeExportImageMetadata,
} from "../../../../../lib/recipes/export-image";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

type ExportBody = {
  language?: "ru" | "en" | "he";
  imageBase64?: string;
  contentType?: string;
  exportId?: string;
  uploadKind?: "studio" | "ai_png";
};

const RECIPE_EXPORT_BUCKET = process.env.RECIPE_EXPORT_BUCKET || "recipes";

function decodeImageBase64(value: string): Buffer {
  const payload = value.includes(",") ? value.split(",").pop() ?? "" : value;
  if (!payload.trim()) {
    throw new Error("Missing image payload.");
  }
  return Buffer.from(payload, "base64");
}

function exportVersionId(value: unknown) {
  if (typeof value === "string" && /^[a-z0-9_-]{6,64}$/i.test(value)) {
    return value;
  }
  return new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
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
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as ExportBody;
    const language = body.language;
    if (language !== "ru" && language !== "en" && language !== "he") {
      return res.status(400).json({ error: "language must be ru, en, or he." });
    }
    if (!body.imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
    }

    const contentType = "image/png";
    try {
      validateRecipeExportDeclaredFormat({ contentType: body.contentType ?? "" });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid recipe export." });
    }
    if (!hasR2Config()) {
      return res.status(500).json({ error: "Cloudflare R2 storage is not configured." });
    }
    const recipe = await loadRecipe(supabase, recipeId);
    const slug = normalizeRecipeExportSlug(recipe.slug || recipe.id);
    const buffer = decodeImageBase64(body.imageBase64);
    try {
      validateRecipeExportImageMetadata(await sharp(buffer, { limitInputPixels: 2_000_000 }).metadata());
    } catch (error) {
      const message = error instanceof Error && error.message.startsWith("Recipe export")
        ? error.message
        : RECIPE_EXPORT_FORMAT_ERROR;
      return res.status(400).json({ error: message });
    }
    const versionId = exportVersionId(body.exportId);
    const path = buildRecipeExportObjectKey({ slug, language, versionId });
    let publicUrl: string;

    if (hasR2Config()) {
      publicUrl = await uploadPublicR2Object({
        key: path,
        body: buffer,
        contentType,
      });
    } else {
      const supabasePath = path.replace(/^recipes\//, "");
      const { error: uploadError } = await supabase.storage
        .from(RECIPE_EXPORT_BUCKET)
        .upload(supabasePath, buffer, {
          cacheControl: "3600",
          upsert: true,
          contentType,
        });

      if (uploadError) {
        throw new Error(`Failed to upload recipe export: ${uploadError.message}`);
      }

      const { data } = supabase.storage.from(RECIPE_EXPORT_BUCKET).getPublicUrl(supabasePath);
      publicUrl = data.publicUrl;
    }

    const updatedRecipe = await saveRecipeExportUrl(supabase, recipeId, language, publicUrl);

    return res.status(200).json({
      ok: true,
      language,
      path,
      publicUrl,
      recipe: updatedRecipe,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload recipe export.";
    return res.status(500).json({ error: message });
  }
}
