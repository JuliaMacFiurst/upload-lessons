import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalLibraryPublicationFields,
  getLibraryPublishError,
  isCanonicalLibraryPublicationState,
  LIBRARY_EDITORIAL_STATUSES,
  LIBRARY_PUBLISH_ERRORS,
} from "../lib/bedtime-stories/publication.ts";
import { bedtimeStoryPayloadSchema, type BedtimeStoryPayload, type BedtimeStoryRecord } from "../lib/bedtime-stories/types.ts";
import {
  assertOrdinaryLibrarySaveAllowed,
  handleBedtimeStoryValidationError,
  LibraryValidationError,
  mergeBedtimeStoryPatch,
} from "../lib/server/bedtime-stories-admin.ts";

function item(overrides: Partial<BedtimeStoryPayload> = {}): BedtimeStoryPayload {
  return bedtimeStoryPayloadSchema.parse({
    slug: "moving-paper-desert",
    status: "draft",
    title: { en: "Moving Paper Desert", ru: "Бумажная пустыня", he: "מדבר נייר" },
    description: { en: "A moving sun.", ru: "Движущееся солнце.", he: "שמש זזה." },
    content_type: "video",
    media: { url: "", posterUrl: "", mimeType: "" },
    category_slugs: ["crafts"],
    slides: [],
    ...overrides,
  });
}

function record(payload = item()): BedtimeStoryRecord {
  return {
    ...payload,
    id: "f3c830a1-4321-4def-9876-0123456789ab",
    created_at: "2026-10-05T18:42:39.777Z",
    updated_at: "2026-10-05T20:39:13.452Z",
  };
}

test("ordinary Save cannot create or preserve a contradictory published state", () => {
  const draft = record();
  const publishPatch = { status: "published" as const };
  const attempted = mergeBedtimeStoryPatch(draft, publishPatch);
  assert.throws(
    () => assertOrdinaryLibrarySaveAllowed(draft, publishPatch, attempted),
    /only be set by Publish Library Item/,
  );

  const contradictory = record(item({ status: "published", is_published: false, publish_date: null }));
  const edited = mergeBedtimeStoryPatch(contradictory, { title: { en: "Edited" } });
  assert.throws(
    () => assertOrdinaryLibrarySaveAllowed(contradictory, { title: { en: "Edited" } }, edited),
    /require is_published=true and publish_date/,
  );
  assert.equal(
    handleBedtimeStoryValidationError(new LibraryValidationError(LIBRARY_PUBLISH_ERRORS.videoPreview)).status,
    400,
  );
});

test("ordinary status control only offers draft and archived while retaining a legacy read-only value", () => {
  assert.deepEqual([...LIBRARY_EDITORIAL_STATUSES], ["draft", "archived"]);
  const page = readFileSync("pages/admin/bedtime-stories.tsx", "utf8");
  assert.match(page, /const STATUSES = LIBRARY_EDITORIAL_STATUSES/);
  assert.match(page, /activeStory\.status} disabled/);
  assert.match(page, /read-only; use Publish Library Item/);
});

test("VIDEO publish requires MP4 media, a poster or cover, and localized descriptions", () => {
  assert.equal(getLibraryPublishError(item()), LIBRARY_PUBLISH_ERRORS.videoMedia);
  assert.equal(getLibraryPublishError(item({
    media: { url: "https://media.example/video.mp4", posterUrl: "", mimeType: "video/mp4" },
  })), LIBRARY_PUBLISH_ERRORS.videoPreview);
  assert.equal(getLibraryPublishError(item({
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  })), null);
  assert.match(getLibraryPublishError(item({
    description: { en: "", ru: "Описание", he: "תיאור" },
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  })) || "", /EN/);
});

test("canonical Publish produces the public publication fields", () => {
  const ready = item({
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  });
  const fields = canonicalLibraryPublicationFields(ready, new Date("2026-10-05T21:00:00.000Z"));
  assert.deepEqual(fields, {
    status: "exported",
    is_published: true,
    publish_date: "2026-10-05T21:00:00.000Z",
    cover_image_url: "https://media.example/poster.webp",
  });
  assert.equal(isCanonicalLibraryPublicationState(fields), true);
});

test("canonical Publish repairs a contradictory legacy row without routing it through ordinary Save", () => {
  const legacy = record(item({ status: "published", is_published: false, publish_date: null }));
  const editorPatch = {
    title: { en: "Edited before publish" },
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  };
  const prepared = mergeBedtimeStoryPatch(legacy, editorPatch);
  const published = mergeBedtimeStoryPatch(legacy, {
    ...editorPatch,
    ...canonicalLibraryPublicationFields(prepared, new Date("2026-10-05T21:00:00.000Z")),
  });

  assert.equal(isCanonicalLibraryPublicationState(published), true);
  assert.equal(getLibraryPublishError(published), null);

  const page = readFileSync("pages/admin/bedtime-stories.tsx", "utf8");
  assert.match(page, /const currentStory = activeStory\.id \? activeStory : await saveStory\("draft"\)/);
  assert.match(page, /\.\.\.buildEditorPatch\(currentStory\)/);
  assert.doesNotMatch(page, /Story could not be saved before publishing/);
});

test("draft and archived always remain unpublished", () => {
  const publicRecord = record(item({
    status: "published",
    is_published: true,
    publish_date: "2026-10-05T21:00:00.000Z",
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  }));
  for (const status of ["draft", "archived"] as const) {
    const merged = mergeBedtimeStoryPatch(publicRecord, { status });
    assert.equal(merged.status, status);
    assert.equal(merged.is_published, false);
    assert.equal(merged.publish_date, null);
  }
});

test("consistent legacy public rows remain editable without creating a new publication transition", () => {
  const legacy = record(item({
    status: "published",
    is_published: true,
    publish_date: "2026-10-05T21:00:00.000Z",
    media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
  }));
  const patch = { title: { en: "Edited legacy title" } };
  const merged = mergeBedtimeStoryPatch(legacy, patch);
  assert.doesNotThrow(() => assertOrdinaryLibrarySaveAllowed(legacy, patch, merged));
});

test("slideshow and image candidates retain their current publish contracts", () => {
  const slideshow = item({
    content_type: "slideshow",
    media: { url: "", posterUrl: "", mimeType: "" },
    category_slugs: ["stories"],
    slides: [{ slide_number: 1, text: { en: "Page", ru: "Страница", he: "עמוד" }, illustration_prompt: "moon", stamp_prompt: "", marker_prompt: "", image_url: "https://media.example/page.webp", layers: [] }],
    cover_image_url: "https://media.example/page.webp",
  });
  const image = item({
    content_type: "image",
    media: { url: "https://media.example/image.webp", posterUrl: "", mimeType: "image/webp" },
  });
  assert.equal(getLibraryPublishError(slideshow), null);
  assert.equal(getLibraryPublishError(image), null);
});

test("successful Admin publish candidates satisfy the shared public-facing prerequisites", () => {
  const candidates = [
    item({
      media: { url: "https://media.example/video.mp4", posterUrl: "https://media.example/poster.webp", mimeType: "video/mp4" },
    }),
    item({
      content_type: "slideshow",
      category_slugs: ["stories"],
      slides: [{ slide_number: 1, text: { en: "Page", ru: "Страница", he: "עמוד" }, illustration_prompt: "moon", stamp_prompt: "", marker_prompt: "", image_url: "https://media.example/page.webp", layers: [] }],
      cover_image_url: "https://media.example/page.webp",
    }),
    item({
      content_type: "image",
      media: { url: "https://media.example/image.webp", posterUrl: "", mimeType: "image/webp" },
    }),
  ];

  for (const candidate of candidates) {
    assert.equal(getLibraryPublishError(candidate), null);
    assert.equal(isCanonicalLibraryPublicationState(canonicalLibraryPublicationFields(candidate)), true);
  }

  const api = readFileSync("pages/api/admin/bedtime-stories/[storyId].ts", "utf8");
  assert.match(api, /body\.action === "publish"/);
  assert.match(api, /publishBedtimeStory/);
});

test("poster upload remains one explicit mechanism with visible empty and preview states", () => {
  const page = readFileSync("pages/admin/bedtime-stories.tsx", "utf8");
  assert.match(page, /Poster \/ Cover/);
  assert.match(page, /Upload poster/);
  assert.match(page, /Replace poster/);
  assert.match(page, /Video poster preview/);
  assert.match(page, /handleUploadLibraryMedia\("cover"/);
});
