import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeLibraryVideo,
  libraryPosterMediaPath,
  libraryVideoMediaPath,
  validateLibraryVideo,
} from "../lib/server/bedtime-media.ts";
import { bedtimeStoryPayloadSchema } from "../lib/bedtime-stories/types.ts";

const fakeMp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(24)]);

test("video upload validation accepts MP4 signature and rejects unsafe payloads", () => {
  validateLibraryVideo(fakeMp4);
  assert.deepEqual(decodeLibraryVideo(`data:video/mp4;base64,${fakeMp4.toString("base64")}`), fakeMp4);
  assert.throws(() => validateLibraryVideo(Buffer.from("not a video")), /Invalid MP4/);
  assert.throws(() => decodeLibraryVideo("data:text/html;base64,PGgxPk5vPC9oMT4="), /Invalid MP4/);
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

test("video replacement, explicit deletion and item deletion keep R2 cleanup in the lifecycle", () => {
  const mediaApi = readFileSync("pages/api/admin/bedtime-stories/[storyId]/media.ts", "utf8");
  const adminStore = readFileSync("lib/server/bedtime-stories-admin.ts", "utf8");
  assert.match(mediaApi, /const updatedStory = await saveLibraryMedia[\s\S]+deletePublicR2Object\(oldKey\)/);
  assert.match(mediaApi, /catch \(error\) \{[\s\S]+deletePublicR2Object\(path\)/);
  assert.match(adminStore, /deleteBedtimeStory[\s\S]+parsePublicR2ObjectKey[\s\S]+deletePublicR2Object/);
});
