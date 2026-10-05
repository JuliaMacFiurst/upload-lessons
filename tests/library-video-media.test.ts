import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { BedtimeStoryRecord } from "../lib/bedtime-stories/types.ts";
import { bedtimeStoryPayloadSchema } from "../lib/bedtime-stories/types.ts";
import { hasMp4FileSignature } from "../lib/client/direct-file-upload.ts";
import {
  createLibraryVideoUploadAuthorization,
  finalizeLibraryVideoUpload,
  LIBRARY_VIDEO_CONTENT_TYPE,
  validateLibraryVideoUploadIntent,
} from "../lib/server/library-video-upload.ts";
import { libraryPosterMediaPath, libraryVideoMediaPath, MAX_VIDEO_BYTES } from "../lib/server/bedtime-media.ts";
import { createPresignedR2PutUrl } from "../lib/server/r2-storage.ts";

const now = Date.parse("2026-10-05T12:00:00.000Z");
const signingSecret = "test-video-upload-secret";

function story(contentType: BedtimeStoryRecord["content_type"] = "video"): BedtimeStoryRecord {
  return {
    id: "f3c830a1-4321-4def-9876-0123456789ab",
    slug: "moving-paper-desert",
    status: "draft",
    title: { en: "Moving Paper Desert", ru: "Бумажная пустыня", he: "מדבר נייר" },
    description: { en: "A moving sun.", ru: "Движущееся солнце.", he: "שמש זזה." },
    content_type: contentType,
    media: { url: "https://media.example.com/library/moving-paper-desert/video-old.mp4", posterUrl: "", mimeType: "video/mp4", sizeBytes: 100 },
    category_slugs: ["crafts"],
    emotional_theme: { en: "", ru: "", he: "" },
    full_json: {},
    slides: contentType === "slideshow" ? [{ slide_number: 1, text: { en: "Page", ru: "", he: "" }, illustration_prompt: "", stamp_prompt: "", marker_prompt: "", image_url: "", layers: [] }] : [],
    images: {},
    cover_image_url: null,
    instagram_caption: { en: "", ru: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: {},
    publish_date: null,
    is_published: false,
    created_at: null,
    updated_at: null,
  };
}

function authorization(currentStory = story(), sizeBytes = 4096) {
  return createLibraryVideoUploadAuthorization(currentStory, {
    contentType: LIBRARY_VIDEO_CONTENT_TYPE,
    sizeBytes,
    fileName: "desert.mp4",
  }, {
    now,
    secret: signingSecret,
    createUploadUrl: ({ key, contentType, expiresInSeconds }) => ({
      url: `https://r2.example.test/${key}?signed=${contentType}&expires=${expiresInSeconds}`,
      expiresAt: new Date(now + expiresInSeconds * 1000).toISOString(),
    }),
  });
}

test("admin authorization accepts valid VIDEO MP4 intent and returns a controlled key", () => {
  const result = authorization();
  assert.match(result.key, /^library\/moving-paper-desert\/video-[a-f0-9-]+\.mp4$/);
  assert.equal(result.method, "PUT");
  assert.deepEqual(result.headers, { "Content-Type": "video/mp4" });
  assert.ok(result.uploadToken);

  const authorizeApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/video-upload/authorize.ts", "utf8");
  assert.match(authorizeApi, /requireAdminSession\(req, res\)/);
  assert.match(authorizeApi, /loadBedtimeStory\(supabase, storyId\)/);
});

test("authorization rejects non-video entries, invalid MIME, empty files and oversized files", () => {
  assert.throws(() => validateLibraryVideoUploadIntent(story("slideshow"), { contentType: "video/mp4", sizeBytes: 10 }), /only available for VIDEO/);
  assert.throws(() => validateLibraryVideoUploadIntent(story(), { contentType: "video\/webm", sizeBytes: 10 }), /Only MP4/);
  assert.throws(() => validateLibraryVideoUploadIntent(story(), { contentType: "video\/mp4", sizeBytes: 0 }), /positive integer/);
  assert.throws(() => validateLibraryVideoUploadIntent(story(), { contentType: "video\/mp4", sizeBytes: MAX_VIDEO_BYTES + 1 }), /80 MB maximum/);
});

test("presigned PUT is short-lived, object-scoped and signs Content-Type without exposing credentials", () => {
  const previous = {
    endpoint: process.env.R2_ENDPOINT,
    accessKey: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  };
  process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET_NAME = "library-bucket";
  process.env.R2_PUBLIC_URL = "https://media.example.test";
  try {
    const signed = createPresignedR2PutUrl({ key: "library/moving-paper-desert/video-controlled.mp4", contentType: "video/mp4", expiresInSeconds: 300, now: new Date(now) });
    const url = new URL(signed.url);
    assert.equal(url.pathname, "/library-bucket/library/moving-paper-desert/video-controlled.mp4");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
    assert.equal(url.searchParams.get("X-Amz-Content-Sha256"), "UNSIGNED-PAYLOAD");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
    assert.equal(signed.url.includes("test-secret-key"), false);
  } finally {
    if (previous.endpoint === undefined) delete process.env.R2_ENDPOINT; else process.env.R2_ENDPOINT = previous.endpoint;
    if (previous.accessKey === undefined) delete process.env.R2_ACCESS_KEY_ID; else process.env.R2_ACCESS_KEY_ID = previous.accessKey;
    if (previous.secret === undefined) delete process.env.R2_SECRET_ACCESS_KEY; else process.env.R2_SECRET_ACCESS_KEY = previous.secret;
    if (previous.bucket === undefined) delete process.env.R2_BUCKET_NAME; else process.env.R2_BUCKET_NAME = previous.bucket;
    if (previous.publicUrl === undefined) delete process.env.R2_PUBLIC_URL; else process.env.R2_PUBLIC_URL = previous.publicUrl;
  }
});

test("finalize rejects a missing R2 object before metadata is updated", async () => {
  const current = story();
  const auth = authorization(current);
  let saved = false;
  await assert.rejects(finalizeLibraryVideoUpload(current, auth.uploadToken, {
    secret: signingSecret,
    now: now + 1000,
    headObject: async () => null,
    saveMedia: async () => { saved = true; return current; },
    deleteObject: async () => undefined,
    publicUrl: (key) => `https://media.example.com/${key}`,
    parsePublicKey: () => null,
  }), /not found in R2/);
  assert.equal(saved, false);
});

test("successful finalize verifies metadata, stores canonical media, then deletes the old object", async () => {
  const current = story();
  const auth = authorization(current);
  const events: string[] = [];
  const result = await finalizeLibraryVideoUpload(current, auth.uploadToken, {
    secret: signingSecret,
    now: now + 1000,
    headObject: async (key) => {
      events.push("verify");
      return { key, size: 4096, contentType: "video/mp4", etag: "etag", lastModified: null };
    },
    saveMedia: async (media) => {
      events.push("save");
      return { ...current, media };
    },
    deleteObject: async (key) => { events.push(`delete:${key}`); },
    publicUrl: (key) => `https://media.example.com/${key}`,
    parsePublicKey: () => "library/moving-paper-desert/video-old.mp4",
  });
  assert.equal(result.story.media.url, result.publicUrl);
  assert.equal(result.story.media.mimeType, "video/mp4");
  assert.equal(result.story.media.sizeBytes, 4096);
  assert.deepEqual(events, ["verify", "save", "delete:library/moving-paper-desert/video-old.mp4"]);
});

test("failed replacement preserves old metadata and removes only the new orphan", async () => {
  const current = story();
  const auth = authorization(current);
  const deleted: string[] = [];
  await assert.rejects(finalizeLibraryVideoUpload(current, auth.uploadToken, {
    secret: signingSecret,
    now: now + 1000,
    headObject: async (key) => ({ key, size: 4096, contentType: "video/mp4", etag: null, lastModified: null }),
    saveMedia: async () => { throw new Error("database unavailable"); },
    deleteObject: async (key) => { deleted.push(key); },
    publicUrl: (key) => `https://media.example.com/${key}`,
    parsePublicKey: () => "library/moving-paper-desert/video-old.mp4",
  }), /database unavailable/);
  assert.equal(current.media.url, "https://media.example.com/library/moving-paper-desert/video-old.mp4");
  assert.deepEqual(deleted, [auth.key]);
});

test("a concurrent media change rejects finalize and removes only its controlled orphan", async () => {
  const original = story();
  const auth = authorization(original);
  const current = {
    ...original,
    media: { ...original.media, url: "https://media.example.com/library/moving-paper-desert/video-newer.mp4" },
  };
  const deleted: string[] = [];
  let checkedR2 = false;
  let saved = false;
  await assert.rejects(finalizeLibraryVideoUpload(current, auth.uploadToken, {
    secret: signingSecret,
    now: now + 1000,
    headObject: async () => { checkedR2 = true; return null; },
    saveMedia: async () => { saved = true; return current; },
    deleteObject: async (key) => { deleted.push(key); },
    publicUrl: (key) => `https://media.example.com/${key}`,
    parsePublicKey: () => null,
  }), /changed during upload/);
  assert.equal(checkedR2, false);
  assert.equal(saved, false);
  assert.deepEqual(deleted, [auth.key]);
  assert.equal(current.media.url, "https://media.example.com/library/moving-paper-desert/video-newer.mp4");
});

test("MP4 binary bypasses Vercel APIs and the browser validates the file signature", async () => {
  const page = readFileSync("pages/admin/bedtime-stories.tsx", "utf8");
  const legacyMediaApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/media.ts", "utf8");
  const authorizeApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/video-upload/authorize.ts", "utf8");
  const finalizeApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/video-upload/finalize.ts", "utf8");
  assert.match(page, /uploadFileDirectly\(authorization\.uploadUrl, file/);
  assert.doesNotMatch(page, /videoBase64/);
  assert.doesNotMatch(legacyMediaApi, /videoBase64|decodeLibraryVideo/);
  assert.doesNotMatch(authorizeApi + finalizeApi, /arrayBuffer\(|videoBase64/);

  const validHeader = new Blob([Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom")])]);
  assert.equal(await hasMp4FileSignature(validHeader), true);
  assert.equal(await hasMp4FileSignature(new Blob([Buffer.from("not-an-mp4")])), false);
});

test("video and poster replacements always receive safe unique R2 keys", () => {
  const first = libraryVideoMediaPath("moving-paper-desert");
  const second = libraryVideoMediaPath("moving-paper-desert");
  assert.match(first, /^library\/moving-paper-desert\/video-[a-f0-9-]+\.mp4$/);
  assert.notEqual(first, second);
  assert.match(libraryPosterMediaPath("moving-paper-desert"), /^library\/moving-paper-desert\/poster-[a-f0-9-]+\.webp$/);
  assert.throws(() => libraryVideoMediaPath("../escape"), /Invalid story slug/);
});

test("video model keeps localized descriptions, canonical categories and no database blob", () => {
  const parsed = bedtimeStoryPayloadSchema.parse({
    slug: "moving-paper-desert",
    status: "published",
    title: { en: "Moving Paper Desert", ru: "Бумажная пустыня", he: "מדבר נייר" },
    description: { en: "A moving sun.", ru: "Движущееся солнце.", he: "שמש זזה." },
    content_type: "video",
    media: { url: "https://media.example.com/desert.mp4", posterUrl: "https://media.example.com/desert.webp", mimeType: "video/mp4", sizeBytes: 1234 },
    category_slugs: ["crafts", "science"],
    slides: [],
  });
  assert.equal(parsed.content_type, "video");
  assert.deepEqual(parsed.category_slugs, ["crafts", "science"]);
  assert.equal("blob" in parsed.media, false);
});

test("Delete Video and item deletion retain canonical R2 cleanup", () => {
  const mediaApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/media.ts", "utf8");
  const adminStore = readFileSync("lib/server/bedtime-stories-admin.ts", "utf8");
  assert.match(mediaApi, /body\.kind === "video"[\s\S]+saveLibraryMedia[\s\S]+deletePublicR2Object\(oldKey\)/);
  assert.match(adminStore, /deleteBedtimeStory[\s\S]+parsePublicR2ObjectKey[\s\S]+deletePublicR2Object/);
});
