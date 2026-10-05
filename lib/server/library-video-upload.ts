import crypto from "node:crypto";
import type { BedtimeStoryRecord } from "../bedtime-stories/types.ts";
import { libraryVideoMediaPath, MAX_VIDEO_BYTES } from "./bedtime-media.ts";
import type { R2ObjectMetadata } from "./r2-storage.ts";

export const LIBRARY_VIDEO_CONTENT_TYPE = "video/mp4";
export const LIBRARY_VIDEO_UPLOAD_TTL_SECONDS = 300;

type VideoUploadClaims = {
  storyId: string;
  key: string;
  contentType: typeof LIBRARY_VIDEO_CONTENT_TYPE;
  sizeBytes: number;
  expectedOldUrl: string;
  expiresAt: number;
};

type VideoUploadIntent = {
  contentType: string;
  sizeBytes: number;
  fileName?: string;
};

function signingSecret() {
  const secret = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!secret) throw new Error("Missing R2 configuration.");
  return secret;
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function validateLibraryVideoUploadIntent(story: BedtimeStoryRecord, intent: VideoUploadIntent) {
  if (story.content_type !== "video") throw new Error("Video upload is only available for VIDEO Library entries.");
  if (intent.contentType.trim().toLowerCase() !== LIBRARY_VIDEO_CONTENT_TYPE) throw new Error("Only MP4 video files are allowed.");
  if (!Number.isSafeInteger(intent.sizeBytes) || intent.sizeBytes <= 0) throw new Error("Video size must be a positive integer.");
  if (intent.sizeBytes > MAX_VIDEO_BYTES) throw new Error("Video is too large (80 MB maximum).");
}

export function createLibraryVideoUploadToken(claims: VideoUploadClaims, secret = signingSecret()) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyLibraryVideoUploadToken(token: string, secret = signingSecret(), now = Date.now()): VideoUploadClaims {
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) throw new Error("Invalid video upload authorization.");
  const expectedSignature = sign(payload, secret);
  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error("Invalid video upload authorization.");
  }

  let claims: VideoUploadClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VideoUploadClaims;
  } catch {
    throw new Error("Invalid video upload authorization.");
  }
  if (claims.expiresAt < now) throw new Error("Video upload authorization expired. Please retry the upload.");
  return claims;
}

export function isExpectedLibraryVideoKey(story: BedtimeStoryRecord, key: string) {
  const escapedSlug = story.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^library/${escapedSlug}/video-[a-f0-9-]+\\.mp4$`).test(key);
}

export function createLibraryVideoUploadAuthorization(
  story: BedtimeStoryRecord,
  intent: VideoUploadIntent,
  dependencies: {
    createUploadUrl: (input: { key: string; contentType: string; expiresInSeconds: number }) => { url: string; expiresAt: string };
    secret?: string;
    now?: number;
  },
) {
  validateLibraryVideoUploadIntent(story, intent);
  const now = dependencies.now ?? Date.now();
  const key = libraryVideoMediaPath(story.slug);
  const signed = dependencies.createUploadUrl({
    key,
    contentType: LIBRARY_VIDEO_CONTENT_TYPE,
    expiresInSeconds: LIBRARY_VIDEO_UPLOAD_TTL_SECONDS,
  });
  const uploadToken = createLibraryVideoUploadToken({
    storyId: story.id,
    key,
    contentType: LIBRARY_VIDEO_CONTENT_TYPE,
    sizeBytes: intent.sizeBytes,
    expectedOldUrl: story.media.url,
    expiresAt: now + LIBRARY_VIDEO_UPLOAD_TTL_SECONDS * 1000,
  }, dependencies.secret);

  return {
    uploadUrl: signed.url,
    uploadToken,
    key,
    expiresAt: signed.expiresAt,
    method: "PUT" as const,
    headers: { "Content-Type": LIBRARY_VIDEO_CONTENT_TYPE },
  };
}

export async function finalizeLibraryVideoUpload(
  story: BedtimeStoryRecord,
  uploadToken: string,
  dependencies: {
    headObject: (key: string) => Promise<R2ObjectMetadata | null>;
    saveMedia: (media: BedtimeStoryRecord["media"]) => Promise<BedtimeStoryRecord>;
    deleteObject: (key: string) => Promise<void>;
    publicUrl: (key: string) => string;
    parsePublicKey: (url: string) => string | null;
    secret?: string;
    now?: number;
  },
) {
  const claims = verifyLibraryVideoUploadToken(uploadToken, dependencies.secret, dependencies.now);
  if (claims.storyId !== story.id || !isExpectedLibraryVideoKey(story, claims.key)) {
    throw new Error("Video upload authorization does not match this Library entry.");
  }
  if (story.content_type !== "video" || story.media.url !== claims.expectedOldUrl) {
    await dependencies.deleteObject(claims.key).catch(() => undefined);
    if (story.content_type !== "video") throw new Error("Video upload is only available for VIDEO Library entries.");
    throw new Error("Library video changed during upload. Please retry.");
  }

  const object = await dependencies.headObject(claims.key);
  if (!object) throw new Error("Uploaded video was not found in R2.");

  const metadataMatches = object.key === claims.key
    && object.contentType === claims.contentType
    && object.size === claims.sizeBytes
    && object.size > 0
    && object.size <= MAX_VIDEO_BYTES;
  if (!metadataMatches) {
    await dependencies.deleteObject(claims.key).catch(() => undefined);
    throw new Error("Uploaded video metadata does not match the authorized file.");
  }

  const publicUrl = dependencies.publicUrl(claims.key);
  let updatedStory: BedtimeStoryRecord;
  try {
    updatedStory = await dependencies.saveMedia({
      ...story.media,
      url: publicUrl,
      mimeType: claims.contentType,
      sizeBytes: object.size,
    });
  } catch (error) {
    await dependencies.deleteObject(claims.key).catch(() => undefined);
    throw error;
  }

  const oldKey = claims.expectedOldUrl ? dependencies.parsePublicKey(claims.expectedOldUrl) : null;
  if (oldKey && oldKey !== claims.key) {
    await dependencies.deleteObject(oldKey).catch((error) => console.error("Failed to cleanup replaced video", error));
  }

  return { story: updatedStory, key: claims.key, publicUrl, object };
}
