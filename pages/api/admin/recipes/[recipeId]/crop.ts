import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

type CropKind = "recipe_asset" | "raccoon_sticker";

type CropBody = {
  kind?: CropKind;
  setKey?: string;
  index?: number;
  crop?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
};

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function publicMediaUrl(path: string) {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Missing R2_PUBLIC_URL.");
  }
  return `${base}/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

async function fetchSourceImage(path: string): Promise<Buffer> {
  const response = await fetch(publicMediaUrl(path), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load source sheet (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
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

  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as CropBody;
    const kind = body.kind;
    if (kind !== "recipe_asset" && kind !== "raccoon_sticker") {
      return res.status(400).json({ error: "Unsupported crop kind." });
    }

    const setKey = normalizeStorageSegment(body.setKey ?? "");
    if (!setKey) {
      return res.status(400).json({ error: "Missing setKey." });
    }

    const index = Number.isInteger(body.index) && Number(body.index) > 0 ? Number(body.index) : 1;
    const crop = body.crop ?? {};
    const left = Math.max(0, Math.round(Number(crop.x ?? 0)));
    const top = Math.max(0, Math.round(Number(crop.y ?? 0)));
    const width = Math.max(1, Math.round(Number(crop.width ?? 0)));
    const height = Math.max(1, Math.round(Number(crop.height ?? 0)));

    const basePath =
      kind === "recipe_asset"
        ? `recipes/assets/${setKey}`
        : `stickers/raccoon-stickers/${setKey}`;
    const sourcePath = `${basePath}/source.webp`;
    const outputPath = `${basePath}/${setKey}_${index}.webp`;
    const source = await fetchSourceImage(sourcePath);
    const metadata = await sharp(source).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Source sheet dimensions are unavailable.");
    }

    const safeLeft = Math.min(left, metadata.width - 1);
    const safeTop = Math.min(top, metadata.height - 1);
    const safeWidth = Math.min(width, metadata.width - safeLeft);
    const safeHeight = Math.min(height, metadata.height - safeTop);

    const cropped = await sharp(source, { limitInputPixels: 80_000_000 })
      .extract({
        left: safeLeft,
        top: safeTop,
        width: safeWidth,
        height: safeHeight,
      })
      .webp({ quality: 92, alphaQuality: 95 })
      .toBuffer();

    const publicUrl = await uploadPublicR2Object({
      key: outputPath,
      body: cropped,
      contentType: "image/webp",
    });

    return res.status(200).json({
      ok: true,
      kind,
      setKey,
      index,
      sourcePath,
      path: outputPath,
      publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to crop media.";
    return res.status(500).json({ error: message });
  }
}
