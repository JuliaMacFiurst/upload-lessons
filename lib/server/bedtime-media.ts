import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { BedtimeStoryLanguage } from "../bedtime-stories/types.ts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
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

export function decodeLibraryVideo(value: unknown): Buffer {
  if (typeof value !== "string") throw new Error("Missing video payload.");
  const match = /^(?:data:video\/mp4;base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 === 1) throw new Error("Invalid MP4 payload.");
  const estimatedBytes = Math.floor(match[1].length * 3 / 4);
  if (estimatedBytes > MAX_VIDEO_BYTES) throw new Error("Video is too large (80 MB maximum).");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error("Invalid video size.");
  return buffer;
}

export function validateLibraryVideo(buffer: Buffer) {
  // ISO Base Media files (including MP4) carry an ftyp box near the beginning.
  if (buffer.length < 16 || buffer.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new Error("Invalid MP4 file.");
  }
}

export function libraryVideoMediaPath(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid story slug.");
  return `library/${slug}/video-${randomUUID()}.mp4`;
}

export function libraryPosterMediaPath(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Invalid story slug.");
  return `library/${slug}/poster-${randomUUID()}.webp`;
}

export function getBedtimeCleanupKey(oldUrl: string, newUrl: string, story: any, r2Prefix: string): string | null {
  if (!oldUrl || oldUrl === newUrl) return null;
  const isExported = Object.values(story.exported_image_urls ?? {}).includes(oldUrl);
  if (isExported) return null;
  
  const prefix = r2Prefix + "/";
  if (oldUrl.startsWith(prefix)) {
    return decodeURIComponent(oldUrl.slice(prefix.length));
  }
  return null;
}

export async function cleanupReplacedBedtimeMedia(oldUrl: string, newUrl: string, story: any): Promise<boolean> {
  const { parsePublicR2ObjectKey, deletePublicR2Object } = await import("./r2-storage.ts");
  
  // We can just use the pure function by injecting a dummy prefix or use parsePublicR2ObjectKey directly.
  // Actually, we already have parsePublicR2ObjectKey, so we just do:
  if (!oldUrl || oldUrl === newUrl) return false;
  const isExported = Object.values(story.exported_image_urls ?? {}).includes(oldUrl);
  if (isExported) return false;
  
  const oldKey = parsePublicR2ObjectKey(oldUrl);
  if (!oldKey) return false;
  
  try {
    await deletePublicR2Object(oldKey);
    return true;
  } catch (e) {
    console.error("Failed to cleanup old bedtime media:", e);
    return false;
  }
}
