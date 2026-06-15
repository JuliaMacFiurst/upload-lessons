import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { fetchPublicR2Object, uploadPublicR2Object } from "../../../../lib/server/r2-storage";
import {
  normalizeStickerTags,
  normalizeStorageSegment,
  stickerTitleFromPath,
  upsertStickerAsset,
} from "../../../../lib/server/sticker-assets";
import {
  buildFreeformAlphaMask,
  normalizeFreeformMaskPoints,
  type FreeformMaskInput,
} from "../../../../lib/server/media/freeform-crop";
import { removeEdgeWhiteBackground } from "../../../../lib/server/media/removeWhiteBackground";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "5mb",
    },
  },
};

type StickerCropBody = {
  setKey?: string;
  index?: number;
  assetName?: string;
  assetTag?: string;
  searchTags?: string[] | string;
  crop?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  mask?: FreeformMaskInput;
  removeWhiteBackground?: boolean;
  whiteRemovalIntensity?: number;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const body = (req.body ?? {}) as StickerCropBody;
    const setKey = normalizeStorageSegment(body.setKey ?? "");
    if (!setKey) {
      return res.status(400).json({ error: "Missing setKey." });
    }

    const index = Number.isInteger(body.index) && Number(body.index) > 0 ? Number(body.index) : 1;
    const assetTag = normalizeStorageSegment(body.assetTag ?? "sticker") || "sticker";
    const assetName = normalizeStorageSegment(body.assetName ?? "");
    const crop = body.crop ?? {};
    const left = Math.max(0, Math.round(Number(crop.x ?? 0)));
    const top = Math.max(0, Math.round(Number(crop.y ?? 0)));
    const width = Math.max(1, Math.round(Number(crop.width ?? 0)));
    const height = Math.max(1, Math.round(Number(crop.height ?? 0)));

    const basePath = `stickers/${setKey}`;
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

    const croppedBase = sharp(source, { limitInputPixels: 80_000_000 })
      .extract({
        left: safeLeft,
        top: safeTop,
        width: safeWidth,
        height: safeHeight,
      })
      .ensureAlpha();
    const maskPoints = normalizeFreeformMaskPoints(body.mask, {
      x: safeLeft,
      y: safeTop,
      width: safeWidth,
      height: safeHeight,
    });
    const alphaMask = buildFreeformAlphaMask(safeWidth, safeHeight, maskPoints);
    const croppedImage = alphaMask
      ? croppedBase
          .composite([{ input: alphaMask, blend: "dest-in" }])
      : croppedBase;
    const cropped = body.removeWhiteBackground
      ? await removeEdgeWhiteBackground(croppedImage, body.whiteRemovalIntensity)
      : await croppedImage
          .webp({ quality: 92, alphaQuality: 95 })
          .toBuffer();

    const publicUrl = await uploadPublicR2Object({
      key: outputPath,
      body: cropped,
      contentType: "image/webp",
    });

    const stickerAsset = await upsertStickerAsset(supabase, {
      title: body.assetName?.trim() || stickerTitleFromPath(outputPath),
      tags: normalizeStickerTags(body.searchTags),
      storagePath: outputPath,
      publicUrl,
      setKey,
      sourcePath,
      sourceKind: "raccoon_sticker",
      crop: {
        x: safeLeft,
        y: safeTop,
        width: safeWidth,
        height: safeHeight,
      },
      width: safeWidth,
      height: safeHeight,
    });

    return res.status(200).json({
      ok: true,
      setKey,
      index,
      sourcePath,
      path: outputPath,
      publicUrl,
      stickerAsset,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to crop sticker.";
    return res.status(500).json({ error: message });
  }
}
