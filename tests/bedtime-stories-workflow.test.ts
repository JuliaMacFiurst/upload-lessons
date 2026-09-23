import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bedtimeStoryPayloadSchema } from "../lib/bedtime-stories/types.ts";
import { getBedtimePreviewPages } from "../lib/bedtime-stories/preview.ts";
import { createBedtimeStory, loadBedtimeStory, saveBedtimeStorySlideImage, updateBedtimeStory } from "../lib/server/bedtime-stories-admin.ts";
import { bedtimeSlideMediaPath, decodeBedtimeImage, validateBedtimeImage } from "../lib/server/bedtime-media.ts";

const id = "c585c654-79c1-45fb-a716-6be8f3ca9df8";
const slide = (slide_number: number) => ({
  slide_number,
  text: { ru: `RU ${slide_number}`, en: `EN ${slide_number}`, he: `HE ${slide_number}` },
  illustration_prompt: "",
  stamp_prompt: "",
  marker_prompt: "",
  image_url: "",
  layers: [],
});
const payload = () => bedtimeStoryPayloadSchema.parse({
  slug: "audit-story",
  status: "draft",
  title: { ru: "История", en: "Story", he: "סיפור" },
  slides: [slide(1), slide(2), slide(3)],
});

function database() {
  let row: Record<string, unknown> | null = null;
  const uniqueQuery = {
    limit: () => uniqueQuery,
    neq: () => uniqueQuery,
    then: (resolve: (value: { data: never[]; error: null }) => void) => resolve({ data: [], error: null }),
  };
  const from = () => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: row, error: row ? null : { message: "not found" } }),
        limit: uniqueQuery.limit,
        neq: uniqueQuery.neq,
        then: uniqueQuery.then,
      }),
    }),
    insert: (value: Record<string, unknown>) => ({
      select: () => ({ single: async () => {
        row = { id, ...value, created_at: null, updated_at: null };
        return { data: { id }, error: null };
      } }),
    }),
    update: (value: Record<string, unknown>) => ({
      eq: async () => {
        row = { ...row, ...value };
        return { error: null };
      },
    }),
  });
  return { client: { from } as unknown as SupabaseClient };
}

test("source illustration uploads update shared canonical image, preserving finished exports", async () => {
  const { client } = database();
  let story = await createBedtimeStory(client, payload());
  
  // Prepare existing finished exports
  story = await updateBedtimeStory(client, id, {
    exported_image_urls: {
      "en-01": "finished-en.webp",
      "ru-01": "finished-ru.webp",
      "he-01": "finished-he.webp",
      "ru-02": "finished-ru-02.webp"
    },
    replaceExportedImageUrls: true,
  });

  // CASE 1: Upload while EN selected
  story = await saveBedtimeStorySlideImage(client, id, 1, "https://example.test/en/new.webp", "en");
  assert.equal(story.slides[0].image_url, "https://example.test/en/new.webp");
  assert.equal(story.images["01"], "https://example.test/en/new.webp");
  // CASE 4: exported_image_urls remains unchanged
  assert.equal(story.exported_image_urls["en-01"], "finished-en.webp");
  assert.equal(story.exported_image_urls["ru-01"], "finished-ru.webp");
  assert.equal(story.exported_image_urls["he-01"], "finished-he.webp");
  // CASE 5: other slides untouched
  assert.equal(story.images["02"], undefined);
  assert.equal(story.slides[1].image_url, "");
  
  // CASE 2: Upload while HE selected
  story = await saveBedtimeStorySlideImage(client, id, 1, "https://example.test/he/newer.webp", "he");
  assert.equal(story.slides[0].image_url, "https://example.test/he/newer.webp");
  assert.equal(story.images["01"], "https://example.test/he/newer.webp");
  assert.equal(story.exported_image_urls["he-01"], "finished-he.webp");

  // CASE 3: Upload while RU selected
  story = await saveBedtimeStorySlideImage(client, id, 1, "https://example.test/ru/newest.webp", "ru");
  assert.equal(story.slides[0].image_url, "https://example.test/ru/newest.webp");
  assert.equal(story.images["01"], "https://example.test/ru/newest.webp");
  assert.equal(story.exported_image_urls["ru-01"], "finished-ru.webp");
  
  // Test loading again
  const reloaded = await loadBedtimeStory(client, id);
  assert.equal(reloaded.slides[0].image_url, "https://example.test/ru/newest.webp");
});

test("localized upload paths are isolated and never reuse the same object", () => {
  const ru = bedtimeSlideMediaPath("audit-story", "ru", 1);
  const en = bedtimeSlideMediaPath("audit-story", "en", 1);
  const he = bedtimeSlideMediaPath("audit-story", "he", 2);
  assert.match(ru, /^bedtime_story\/audit-story\/ru\/slide-01-/);
  assert.match(en, /^bedtime_story\/audit-story\/en\/slide-01-/);
  assert.match(he, /^bedtime_story\/audit-story\/he\/slide-02-/);
  assert.notEqual(ru, bedtimeSlideMediaPath("audit-story", "ru", 1));
  assert.throws(() => bedtimeSlideMediaPath("../escape", "ru", 1));
  assert.throws(() => bedtimeSlideMediaPath("audit-story", "de" as "ru", 1));
  assert.throws(() => bedtimeSlideMediaPath("audit-story", "ru", 1.5));
});

test("upload rejects malformed, oversized, and non-image content", async () => {
  assert.throws(() => decodeBedtimeImage("data:text/html;base64,PHNjcmlwdD4="));
  assert.throws(() => decodeBedtimeImage("a".repeat(30 * 1024 * 1024)), /too large/);
  await assert.rejects(validateBedtimeImage(Buffer.from("not an image")), /Invalid image/);
});

import { getBedtimeCleanupKey } from "../lib/server/bedtime-media.ts";

test("R2 media cleanup sequence handles replacement safely", () => {
  const storyMock = {
    exported_image_urls: {
      "en-01": "https://media.laplapla.com/exported.webp",
    }
  };
  const prefix = "https://media.laplapla.com";

  // 1. First upload (no old URL) -> null key (no delete attempted)
  assert.equal(getBedtimeCleanupKey("", "https://media.laplapla.com/new.webp", storyMock, prefix), null);

  // 2. Replacement (old URL exists, not exported) -> returns correct R2 key
  assert.equal(
    getBedtimeCleanupKey("https://media.laplapla.com/old.webp", "https://media.laplapla.com/new.webp", storyMock, prefix), 
    "old.webp"
  );

  // 5. External old URL -> null key (not matched by prefix)
  assert.equal(getBedtimeCleanupKey("https://example.com/other.webp", "https://media.laplapla.com/new.webp", storyMock, prefix), null);

  // 6. Finished export safety -> null key (protected by exported_image_urls)
  assert.equal(getBedtimeCleanupKey("https://media.laplapla.com/exported.webp", "https://media.laplapla.com/new.webp", storyMock, prefix), null);
});