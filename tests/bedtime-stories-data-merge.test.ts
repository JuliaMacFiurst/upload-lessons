import test from "node:test";
import assert from "node:assert/strict";
import { mergeBedtimeStoryPatch, parseBedtimeStoryJson } from "../lib/server/bedtime-stories-admin.ts";
import {
  bedtimeStoryPayloadSchema,
  type BedtimeStoryRecord,
  type BedtimeStoryPatch,
} from "../lib/bedtime-stories/types.ts";

test("mergeBedtimeStoryPatch preserves all unrelated data on partial update", () => {
  const existingStory: BedtimeStoryRecord = {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    slug: "original-moon-story",
    status: "draft",
    title: { en: "Moon Story", ru: "Лунная история", he: "סיפור ירח" },
    emotional_theme: { en: "Nostalgic", ru: "Ностальгия", he: "נוסטלגיה" },
    full_json: { raw_field: "custom_value", author_notes: "important" },
    slides: [
      {
        slide_number: 1,
        text: { en: "Page 1 EN", ru: "Page 1 RU", he: "Page 1 HE" },
        illustration_prompt: "illustration prompt 1",
        stamp_prompt: "stamp prompt 1",
        marker_prompt: "marker prompt 1",
        image_url: "https://r2/slide1.webp",
        layers: [{ kind: "bedtime_text_layout", x: 10, y: 20 }],
      },
      {
        slide_number: 2,
        text: { en: "Page 2 EN", ru: "Page 2 RU", he: "Page 2 HE" },
        illustration_prompt: "illustration prompt 2",
        stamp_prompt: "",
        marker_prompt: "marker prompt 2",
        image_url: "https://r2/slide2.webp",
        layers: [{ kind: "bedtime_text_layout", x: 15, y: 25 }],
      },
      {
        slide_number: 3,
        text: { en: "Page 3 EN", ru: "Page 3 RU", he: "Page 3 HE" },
        illustration_prompt: "illustration prompt 3",
        stamp_prompt: "",
        marker_prompt: "marker prompt 3",
        image_url: "https://r2/slide3.webp",
        layers: [{ kind: "bedtime_number_layout", fontSize: 20 }],
      },
      {
        slide_number: 4,
        text: { en: "Page 4 EN", ru: "Page 4 RU", he: "Page 4 HE" },
        illustration_prompt: "illustration prompt 4",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/slide4.webp",
        layers: [],
      },
      {
        slide_number: 5,
        text: { en: "Page 5 EN", ru: "Page 5 RU", he: "Page 5 HE" },
        illustration_prompt: "illustration prompt 5",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/slide5.webp",
        layers: [],
      },
    ],
    images: {
      "01": "https://r2/slide1.webp",
      "02": "https://r2/slide2.webp",
      "03": "https://r2/slide3.webp",
    },
    cover_image_url: "https://r2/cover.webp",
    instagram_caption: { en: "Caption EN", ru: "Caption RU", he: "Caption HE" },
    instagram_hashtags: ["#bedtime", "#story"],
    collection_tags: ["night", "calm"],
    visual_tags: ["watercolor", "moon"],
    stamp_assets: [
      {
        id: "s1",
        kind: "stamp",
        name: "stamp-moon",
        url: "https://r2/stamp.webp",
        path: "stamps/stamp.webp",
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    marker_assets: [
      {
        id: "m1",
        kind: "marker",
        name: "marker-star",
        url: "https://r2/marker.webp",
        path: "markers/marker.webp",
        created_at: "2026-06-01T00:00:00Z",
      },
    ],
    exported_image_urls: {
      "ru-01": "https://r2/export-ru-01.webp",
      "he-01": "https://r2/export-he-01.webp",
    },
    publish_date: "2026-06-01T12:00:00.000Z",
    is_published: false,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  };

  // Patch modifying ONLY:
  // - title
  // - slug
  // - one slide's text
  // - one slide's image
  // - status
  // - exported_image_urls
  const patch: BedtimeStoryPatch = {
    title: { ru: "Обновленная лунная история" },
    slug: "updated-moon-story",
    slides: [
      {
        slide_number: 1,
        text: { ru: "Обновленный текст страницы 1" },
        image_url: "https://r2/new-slide1.webp",
      },
    ],
    status: "exported",
    exported_image_urls: {
      "ru-02": "https://r2/export-ru-02.webp",
    },
  };

  const merged = mergeBedtimeStoryPatch(existingStory, patch);

  // 1. Title was partially updated: ru changed, en and he preserved
  assert.equal(merged.title.ru, "Обновленная лунная история");
  assert.equal(merged.title.en, "Moon Story");
  assert.equal(merged.title.he, "סיפור ירח");

  // 2. Slug was updated
  assert.equal(merged.slug, "updated-moon-story");

  // 3. Status was updated
  assert.equal(merged.status, "exported");

  // 4. Slide 1 was updated: text.ru updated, en/he preserved, image updated
  assert.equal(merged.slides[0].text.ru, "Обновленный текст страницы 1");
  assert.equal(merged.slides[0].text.en, "Page 1 EN");
  assert.equal(merged.slides[0].text.he, "Page 1 HE");
  assert.equal(merged.slides[0].image_url, "https://r2/new-slide1.webp");

  // 5. Slide 1 layers and prompts were PRESERVED
  assert.deepEqual(merged.slides[0].layers, [{ kind: "bedtime_text_layout", x: 10, y: 20 }]);
  assert.equal(merged.slides[0].illustration_prompt, "illustration prompt 1");
  assert.equal(merged.slides[0].stamp_prompt, "stamp prompt 1");
  assert.equal(merged.slides[0].marker_prompt, "marker prompt 1");

  // 6. Slides 2-5 were completely PRESERVED (NOT truncated or erased!)
  assert.equal(merged.slides.length, 5);
  assert.equal(merged.slides[1].text.ru, "Page 2 RU");
  assert.equal(merged.slides[2].text.ru, "Page 3 RU");
  assert.deepEqual(merged.slides[2].layers, [{ kind: "bedtime_number_layout", fontSize: 20 }]);
  assert.equal(merged.slides[3].text.en, "Page 4 EN");
  assert.equal(merged.slides[4].text.he, "Page 5 HE");

  // 7. full_json was PRESERVED
  assert.deepEqual(merged.full_json, { raw_field: "custom_value", author_notes: "important" });

  // 8. stamps and markers were PRESERVED
  assert.deepEqual(merged.stamp_assets, existingStory.stamp_assets);
  assert.deepEqual(merged.marker_assets, existingStory.marker_assets);

  // 9. tags were PRESERVED
  assert.deepEqual(merged.collection_tags, ["night", "calm"]);
  assert.deepEqual(merged.visual_tags, ["watercolor", "moon"]);

  // 10. Instagram metadata was PRESERVED
  assert.deepEqual(merged.instagram_caption, { en: "Caption EN", ru: "Caption RU", he: "Caption HE" });
  assert.deepEqual(merged.instagram_hashtags, ["#bedtime", "#story"]);

  // 11. existing exported_image_urls were PRESERVED and merged
  assert.equal(merged.exported_image_urls["ru-01"], "https://r2/export-ru-01.webp");
  assert.equal(merged.exported_image_urls["he-01"], "https://r2/export-he-01.webp");
  assert.equal(merged.exported_image_urls["ru-02"], "https://r2/export-ru-02.webp");

  // 12. is_published and publish_date were PRESERVED (not altered by status change!)
  assert.equal(merged.is_published, false);
  assert.equal(merged.publish_date, "2026-06-01T12:00:00.000Z");

  // 13. Merged payload passes bedtimeStoryPayloadSchema validation cleanly
  const validated = bedtimeStoryPayloadSchema.parse(merged);
  assert.equal(validated.slug, "updated-moon-story");
});

test("allows 1-page story with empty illustration_prompt without fake data", () => {
  const payload = {
    slug: "fox-and-star",
    status: "draft",
    title: { ru: "Лис и звезда", en: "Fox and Star", he: "" },
    slides: [
      {
        slide_number: 1,
        text: { ru: "Лис смотрел на вечернюю звезду.", en: "Fox looked at the evening star.", he: "" },
        illustration_prompt: "",
        image_url: "https://r2/fox-star.webp",
      },
    ],
  };

  const parsed = bedtimeStoryPayloadSchema.parse(payload);
  assert.equal(parsed.slides.length, 1);
  assert.equal(parsed.slides[0].illustration_prompt, "");
  assert.equal(parsed.slides[0].image_url, "https://r2/fox-star.webp");
});

test("allows 2-page story with empty illustration_prompt without fake data", () => {
  const payload = {
    slug: "two-page-tale",
    status: "draft",
    title: { ru: "Сказка на две страницы", en: "Two Page Tale", he: "" },
    slides: [
      {
        slide_number: 1,
        text: { ru: "Страница 1", en: "Page 1", he: "" },
        illustration_prompt: "",
        image_url: "https://r2/p1.webp",
      },
      {
        slide_number: 2,
        text: { ru: "Страница 2", en: "Page 2", he: "" },
        illustration_prompt: "",
        image_url: "https://r2/p2.webp",
      },
    ],
  };

  const parsed = bedtimeStoryPayloadSchema.parse(payload);
  assert.equal(parsed.slides.length, 2);
  assert.equal(parsed.slides[0].illustration_prompt, "");
  assert.equal(parsed.slides[1].illustration_prompt, "");
});
test("reducing a 2-page story with explicit deleteSlideNumbers cleanly becomes 1 slide", () => {
  const twoPageStory: BedtimeStoryRecord = {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    slug: "two-page-story",
    status: "draft",
    title: { en: "Two Pages", ru: "Две страницы", he: "" },
    emotional_theme: { en: "", ru: "", he: "" },
    full_json: {},
    slides: [
      {
        slide_number: 1,
        text: { en: "Page 1", ru: "Страница 1", he: "" },
        illustration_prompt: "",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/p1.webp",
        layers: [],
      },
      {
        slide_number: 2,
        text: { en: "Page 2", ru: "Страница 2", he: "" },
        illustration_prompt: "",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/p2.webp",
        layers: [],
      },
    ],
    images: { "01": "https://r2/p1.webp", "02": "https://r2/p2.webp" },
    cover_image_url: "https://r2/p1.webp",
    instagram_caption: { en: "", ru: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: { "ru-01": "https://r2/p1.webp", "ru-02": "https://r2/p2.webp" },
    publish_date: null,
    is_published: false,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  };

  // Explicit deletion of slide 2
  const patch: BedtimeStoryPatch = {
    slides: [
      {
        slide_number: 1,
        text: { ru: "Только одна страница осталась." },
      },
    ],
    deleteSlideNumbers: [2],
  };

  const merged = mergeBedtimeStoryPatch(twoPageStory, patch);
  assert.equal(merged.slides.length, 1);
  assert.equal(merged.slides[0].slide_number, 1);
  assert.equal(merged.slides[0].text.ru, "Только одна страница осталась.");
  assert.equal(merged.slides[0].image_url, "https://r2/p1.webp");
  // Cleaned up slide 2 from images and exported_image_urls
  assert.equal(merged.images["02"], undefined);
  assert.equal(merged.exported_image_urls["ru-02"], undefined);
});

test("existing 2-slide story + patch to slide 1 without deleteSlideNumbers still has 2 slides (no heuristic deletion)", () => {
  const twoPageStory: BedtimeStoryRecord = {
    id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    slug: "two-page-story",
    status: "draft",
    title: { en: "Two Pages", ru: "Две страницы", he: "" },
    emotional_theme: { en: "", ru: "", he: "" },
    full_json: {},
    slides: [
      {
        slide_number: 1,
        text: { en: "Page 1", ru: "Страница 1", he: "" },
        illustration_prompt: "",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/p1.webp",
        layers: [],
      },
      {
        slide_number: 2,
        text: { en: "Page 2", ru: "Страница 2", he: "" },
        illustration_prompt: "",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/p2.webp",
        layers: [],
      },
    ],
    images: { "01": "https://r2/p1.webp", "02": "https://r2/p2.webp" },
    cover_image_url: "https://r2/p1.webp",
    instagram_caption: { en: "", ru: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: {},
    publish_date: null,
    is_published: false,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  };

  const patch: BedtimeStoryPatch = {
    slides: [
      {
        slide_number: 1,
        text: { ru: "Обновленный текст 1" },
      },
    ],
  };

  const merged = mergeBedtimeStoryPatch(twoPageStory, patch);
  assert.equal(merged.slides.length, 2, "Must NOT infer deletion of slide 2 from receiving a 1-slide patch");
  assert.equal(merged.slides[0].text.ru, "Обновленный текст 1");
  assert.equal(merged.slides[1].text.ru, "Страница 2");
});

test("existing 5-slide story: audit scenarios 1, 2, 4, 5", () => {
  const fiveSlideStory: BedtimeStoryRecord = {
    id: "55555555-5555-5555-5555-555555555555",
    slug: "five-slide-story",
    status: "draft",
    title: { en: "Five Slides", ru: "Пять слайдов", he: "חמישה שקופיות" },
    emotional_theme: { en: "Theme", ru: "Тема", he: "" },
    full_json: { complex_meta: true },
    slides: [
      { slide_number: 1, text: { en: "S1 EN", ru: "S1 RU", he: "S1 HE" }, illustration_prompt: "P1", stamp_prompt: "ST1", marker_prompt: "M1", image_url: "https://r2/s1.webp", layers: [{ id: "l1" }] },
      { slide_number: 2, text: { en: "S2 EN", ru: "S2 RU", he: "S2 HE" }, illustration_prompt: "P2", stamp_prompt: "", marker_prompt: "M2", image_url: "https://r2/s2.webp", layers: [{ id: "l2" }] },
      { slide_number: 3, text: { en: "S3 EN", ru: "S3 RU", he: "S3 HE" }, illustration_prompt: "P3", stamp_prompt: "", marker_prompt: "M3", image_url: "https://r2/s3.webp", layers: [{ id: "l3" }] },
      { slide_number: 4, text: { en: "S4 EN", ru: "S4 RU", he: "S4 HE" }, illustration_prompt: "P4", stamp_prompt: "", marker_prompt: "M4", image_url: "https://r2/s4.webp", layers: [{ id: "l4" }] },
      { slide_number: 5, text: { en: "S5 EN", ru: "S5 RU", he: "S5 HE" }, illustration_prompt: "P5", stamp_prompt: "", marker_prompt: "M5", image_url: "https://r2/s5.webp", layers: [{ id: "l5" }] },
    ],
    images: { "01": "https://r2/s1.webp", "02": "https://r2/s2.webp", "03": "https://r2/s3.webp", "04": "https://r2/s4.webp", "05": "https://r2/s5.webp" },
    cover_image_url: "https://r2/cover.webp",
    instagram_caption: { en: "", ru: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: { "en-01": "https://r2/exp-en-1.webp", "en-02": "https://r2/exp-en-2.webp" },
    publish_date: null,
    is_published: false,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  };

  // 1. Existing 5-slide story + patch to slide 1 text → still 5 slides
  const textPatch: BedtimeStoryPatch = {
    slides: [{ slide_number: 1, text: { ru: "Новый текст слайда 1" } }],
  };
  const afterText = mergeBedtimeStoryPatch(fiveSlideStory, textPatch);
  assert.equal(afterText.slides.length, 5, "Patching slide 1 text must keep all 5 slides");
  assert.equal(afterText.slides[0].text.ru, "Новый текст слайда 1");
  assert.equal(afterText.slides[0].text.en, "S1 EN", "Preserves English text on slide 1");
  assert.equal(afterText.slides[2].text.ru, "S3 RU", "Slide 3 remains intact");
  assert.equal(afterText.slides[4].text.ru, "S5 RU", "Slide 5 remains intact");

  // 2. Existing 5-slide story + patch to slide 1 image → still 5 slides
  const imagePatch: BedtimeStoryPatch = {
    slides: [{ slide_number: 1, image_url: "https://r2/new-s1.webp" }],
  };
  const afterImage = mergeBedtimeStoryPatch(fiveSlideStory, imagePatch);
  assert.equal(afterImage.slides.length, 5, "Patching slide 1 image must keep all 5 slides");
  assert.equal(afterImage.slides[0].image_url, "https://r2/new-s1.webp");
  assert.equal(afterImage.slides[1].image_url, "https://r2/s2.webp");
  assert.equal(afterImage.slides[4].image_url, "https://r2/s5.webp");

  // 4. Existing 5-slide story opened in Simple Editor + Save Changes without structural edits → still 5 slides
  // Simple editor sends slides 1 & 2 plus carries forward existing slides 3..5
  const simpleEditorSave: BedtimeStoryPatch = {
    title: { ru: "Отредактированный заголовок" },
    slides: [
      { slide_number: 1, text: { ru: "Слайд 1 правка" } },
      { slide_number: 2, text: { ru: "Слайд 2 правка" } },
      fiveSlideStory.slides[2],
      fiveSlideStory.slides[3],
      fiveSlideStory.slides[4],
    ],
  };
  const afterSimpleSave = mergeBedtimeStoryPatch(fiveSlideStory, simpleEditorSave);
  assert.equal(afterSimpleSave.slides.length, 5, "Saving from Simple Editor must preserve all 5 slides");
  assert.equal(afterSimpleSave.title.ru, "Отредактированный заголовок");
  assert.equal(afterSimpleSave.slides[0].text.ru, "Слайд 1 правка");
  assert.equal(afterSimpleSave.slides[2].illustration_prompt, "P3");
  assert.deepEqual(afterSimpleSave.slides[2].layers, [{ id: "l3" }]);

  // 5. Existing 5-slide story + Publish Finished Story → does not delete slides 3–5 or their metadata
  const publishPatch: BedtimeStoryPatch = {
    status: "exported",
    cover_image_url: "https://r2/new-s1.webp",
    exported_image_urls: { "ru-01": "https://r2/new-s1.webp", "ru-02": "https://r2/s2.webp" },
  };
  const afterPublish = mergeBedtimeStoryPatch(fiveSlideStory, publishPatch);
  assert.equal(afterPublish.status, "exported");
  assert.equal(afterPublish.slides.length, 5, "Publishing must NOT delete slides 3–5");
  assert.equal(afterPublish.slides[2].illustration_prompt, "P3");
  assert.equal(afterPublish.slides[2].marker_prompt, "M3");
  assert.deepEqual(afterPublish.slides[2].layers, [{ id: "l3" }]);
  assert.equal(afterPublish.slides[4].illustration_prompt, "P5");
});

test("publishing language keys: publishing RU does not erase existing EN/HE exports and vice versa", () => {
  const storyWithEnHeExports: BedtimeStoryRecord = {
    id: "77777777-7777-7777-7777-777777777777",
    slug: "multilang-export-story",
    status: "draft",
    title: { en: "Multi", ru: "Мульти", he: "" },
    emotional_theme: { en: "", ru: "", he: "" },
    full_json: {},
    slides: [
      { slide_number: 1, text: { en: "P1", ru: "С1", he: "" }, illustration_prompt: "", stamp_prompt: "", marker_prompt: "", image_url: "https://r2/ru1.webp", layers: [] },
    ],
    images: { "01": "https://r2/ru1.webp" },
    cover_image_url: "https://r2/ru1.webp",
    instagram_caption: { en: "", ru: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: {
      "en-01": "https://r2/en-01.webp",
      "en-02": "https://r2/en-02.webp",
      "he-01": "https://r2/he-01.webp",
      "he-02": "https://r2/he-02.webp",
    },
    publish_date: null,
    is_published: false,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
  };

  // Publish RU: updates ru-01, ru-02
  const publishRuPatch: BedtimeStoryPatch = {
    status: "exported",
    exported_image_urls: {
      "ru-01": "https://r2/ru-01.webp",
      "ru-02": "https://r2/ru-02.webp",
    },
  };

  const afterRuPublish = mergeBedtimeStoryPatch(storyWithEnHeExports, publishRuPatch);
  assert.equal(afterRuPublish.exported_image_urls["ru-01"], "https://r2/ru-01.webp");
  assert.equal(afterRuPublish.exported_image_urls["ru-02"], "https://r2/ru-02.webp");
  // CRITICAL: EN and HE exports must NOT be erased!
  assert.equal(afterRuPublish.exported_image_urls["en-01"], "https://r2/en-01.webp");
  assert.equal(afterRuPublish.exported_image_urls["en-02"], "https://r2/en-02.webp");
  assert.equal(afterRuPublish.exported_image_urls["he-01"], "https://r2/he-01.webp");
  assert.equal(afterRuPublish.exported_image_urls["he-02"], "https://r2/he-02.webp");

  // Vice versa: publishing EN updates en-01, does not erase ru-01/ru-02
  const publishEnPatch: BedtimeStoryPatch = {
    exported_image_urls: {
      "en-01": "https://r2/new-en-01.webp",
    },
  };
  const afterEnPublish = mergeBedtimeStoryPatch(
    { ...storyWithEnHeExports, ...afterRuPublish },
    publishEnPatch,
  );
  assert.equal(afterEnPublish.exported_image_urls["en-01"], "https://r2/new-en-01.webp");
  assert.equal(afterEnPublish.exported_image_urls["ru-01"], "https://r2/ru-01.webp");
  assert.equal(afterEnPublish.exported_image_urls["ru-02"], "https://r2/ru-02.webp");
  assert.equal(afterEnPublish.exported_image_urls["he-01"], "https://r2/he-01.webp");
});

test("parseBedtimeStoryJson preserves strict 3-language and prompt contract for imported JSON", () => {
  const validJson = JSON.stringify({
    slug: "strict-moon-train",
    title: {
      en: "Moon Train",
      ru: "Лунный поезд",
      he: "רכבת ירח",
    },
    slides: [
      {
        slide_number: 1,
        text: {
          en: "The train was quiet.",
          ru: "Поезд был тихим.",
          he: "הרכבת הייתה שקטה.",
        },
        illustration_prompt: "quiet silver train in soft moonlight watercolor",
      },
    ],
  });

  const parsed = parseBedtimeStoryJson(validJson);
  assert.equal(parsed.slug, "strict-moon-train");
  assert.equal(parsed.title.ru, "Лунный поезд");
  assert.equal(parsed.title.en, "Moon Train");
  assert.equal(parsed.title.he, "רכבת ירח");
  assert.equal(parsed.slides[0].illustration_prompt, "quiet silver train in soft moonlight watercolor");

  // Missing English in title must be rejected
  const missingEnTitle = JSON.stringify({
    title: { ru: "Только русский", he: "רק עברית" },
    slides: [{ slide_number: 1, text: { en: "A", ru: "Б", he: "В" }, illustration_prompt: "prompt" }],
  });
  assert.throws(() => parseBedtimeStoryJson(missingEnTitle), /English text is required/);

  // Missing Hebrew in slide text must be rejected
  const missingHeSlide = JSON.stringify({
    title: { en: "Title", ru: "Заголовок", he: "כותרת" },
    slides: [{ slide_number: 1, text: { en: "A", ru: "Б" }, illustration_prompt: "prompt" }],
  });
  assert.throws(() => parseBedtimeStoryJson(missingHeSlide), /Hebrew text is required/);

  // Missing illustration_prompt on slide must be rejected for imported JSON
  const missingPrompt = JSON.stringify({
    title: { en: "Title", ru: "Заголовок", he: "כותרת" },
    slides: [{ slide_number: 1, text: { en: "A", ru: "Б", he: "В" }, illustration_prompt: "" }],
  });
  assert.throws(() => parseBedtimeStoryJson(missingPrompt), /illustration_prompt is required/);
});

test("multi-language image isolation: updating images for one language preserves other languages completely", () => {
  const existingStory: BedtimeStoryRecord = {
    id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
    slug: "multilang-test-story",
    status: "draft",
    title: { ru: "Русский", en: "English", he: "עברית" },
    emotional_theme: { ru: "Спокойствие", en: "Calm", he: "רוגע" },
    full_json: {},
    slides: [
      {
        slide_number: 1,
        text: { ru: "RU 1", en: "EN 1", he: "HE 1" },
        illustration_prompt: "prompt 1",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/ru-01.webp",
        layers: [],
      },
      {
        slide_number: 2,
        text: { ru: "RU 2", en: "EN 2", he: "HE 2" },
        illustration_prompt: "prompt 2",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "https://r2/ru-02.webp",
        layers: [],
      },
    ],
    images: { "01": "https://r2/ru-01.webp", "02": "https://r2/ru-02.webp" },
    cover_image_url: "https://r2/ru-01.webp",
    instagram_caption: { ru: "", en: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: {
      "ru-01": "https://r2/ru-01.webp",
      "ru-02": "https://r2/ru-02.webp",
      "en-01": "https://r2/en-01.webp",
      "en-02": "https://r2/en-02.webp",
      "he-01": "https://r2/he-01.webp",
      "he-02": "https://r2/he-02.webp",
    },
    publish_date: null,
    is_published: false,
    created_at: null,
    updated_at: null,
  };

  // 1. Update only Hebrew Page 1
  const hePatch: BedtimeStoryPatch = {
    exported_image_urls: {
      "he-01": "https://r2/new-he-01.webp",
    },
  };
  const mergedHe = mergeBedtimeStoryPatch(existingStory, hePatch);
  assert.equal(mergedHe.exported_image_urls["he-01"], "https://r2/new-he-01.webp");
  assert.equal(mergedHe.exported_image_urls["he-02"], "https://r2/he-02.webp");
  assert.equal(mergedHe.exported_image_urls["ru-01"], "https://r2/ru-01.webp");
  assert.equal(mergedHe.exported_image_urls["ru-02"], "https://r2/ru-02.webp");
  assert.equal(mergedHe.exported_image_urls["en-01"], "https://r2/en-01.webp");
  assert.equal(mergedHe.exported_image_urls["en-02"], "https://r2/en-02.webp");

  // 2. Remove Slide 2 via deleteSlideNumbers
  const deleteSlide2Patch: BedtimeStoryPatch = {
    deleteSlideNumbers: [2],
  };
  const mergedDelete = mergeBedtimeStoryPatch(existingStory, deleteSlide2Patch);
  assert.equal(mergedDelete.slides.length, 1);
  assert.equal(mergedDelete.exported_image_urls["ru-01"], "https://r2/ru-01.webp");
  assert.equal(mergedDelete.exported_image_urls["en-01"], "https://r2/en-01.webp");
  assert.equal(mergedDelete.exported_image_urls["he-01"], "https://r2/he-01.webp");
  assert.equal(mergedDelete.exported_image_urls["ru-02"], undefined);
  assert.equal(mergedDelete.exported_image_urls["en-02"], undefined);
  assert.equal(mergedDelete.exported_image_urls["he-02"], undefined);
});
