import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { uploadPublicR2Object } from "../../../../lib/server/r2-storage";
import { normalizeStorageSegment } from "../../../../lib/server/sticker-assets";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "35mb",
    },
  },
};

type StickerSheetBody = {
  imageBase64?: string;
  fileName?: string;
  setName?: string;
  removeWhite?: boolean;
};

function fallbackStickerSetKey(fileName: string | undefined) {
  const normalizedFileName = normalizeStorageSegment(fileName?.replace(/\.[^/.]+$/, "") || "");
  return normalizedFileName || `stickers-${Date.now()}`;
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const body = (req.body ?? {}) as StickerSheetBody;
    if (!body.imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
    }

    const fallbackSetName = fallbackStickerSetKey(body.fileName);
    const setKey = normalizeStorageSegment(body.setName || "") || fallbackSetName;
    const webp = await imageToWebp(decodeImageBase64(body.imageBase64), body.removeWhite === true);
    const path = `stickers/${setKey}/source.webp`;
    const publicUrl = await uploadPublicR2Object({
      key: path,
      body: webp,
      contentType: "image/webp",
    });

    return res.status(200).json({ ok: true, setKey, path, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process sticker sheet.";
    return res.status(500).json({ error: message });
  }
}
