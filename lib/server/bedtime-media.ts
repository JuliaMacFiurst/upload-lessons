import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { BedtimeStoryLanguage } from "../bedtime-stories/types.ts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export function decodeBedtimeImage(value: unknown): Buffer {
  if (typeof value !== "string") throw new Error("Missing image payload.");
  const match = /^(?:data:image\/(?:jpeg|png|webp);base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 === 1) throw new Error("Invalid image payload.");
  const estimatedBytes = Math.floor(match[1].length * 3 / 4);
  if (estimatedBytes > MAX_IMAGE_BYTES) throw new Error("Image is too large (20 MB maximum).");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("Invalid image size.");
  return buffer;
}

export async function validateBedtimeImage(buffer: Buffer): Promise<void> {
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new Error("Invalid image file.");
  }
  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error("Only JPEG, PNG, and WebP images are allowed.");
  }
}

export function bedtimeSlideMediaPath(slug: string, language: BedtimeStoryLanguage, slideNumber: number): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid story slug.");
  if (!["ru", "en", "he"].includes(language)) throw new Error("Invalid language.");
  if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 10) throw new Error("Invalid slide number.");
  return `bedtime_story/${slug}/${language}/slide-${String(slideNumber).padStart(2, "0")}-${randomUUID()}.webp`;
}
