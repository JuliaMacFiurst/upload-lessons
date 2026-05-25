import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { fetchPublicR2Object, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

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
  assetName?: string;
  assetTag?: string;
  crop?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
};

const ALLOWED_TAGS = new Set([
  "asset",
  "decor",
  "food",
  "frame",
  "label",
  "line",
  "logo",
  "ribbon",
  "star",
  "sticker",
]);

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
    const assetTag = normalizeStorageSegment(body.assetTag ?? "");
    if (assetTag && !ALLOWED_TAGS.has(assetTag)) {
      return res.status(400).json({ error: "Unsupported asset tag." });
    }
    const assetName = normalizeStorageSegment(body.assetName ?? "");
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
    const outputName = assetName
      ? [assetTag, assetName, String(index)].filter(Boolean).join("-")
      : [setKey, assetTag, String(index)].filter(Boolean).join("-");
    const outputPath = `${basePath}/${outputName}.webp`;
    const source = await fetchPublicR2Object(sourcePath);
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
