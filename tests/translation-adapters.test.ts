import assert from "node:assert/strict";
import test from "node:test";
import { TRANSLATION_CONTENT_TYPES } from "../lib/translations/content-types.ts";
import {
  TRANSLATION_ADAPTERS,
  getTranslationAdapter,
} from "../lib/server/translation-adapters.ts";

test("registry has exactly one adapter for every supported translation content type", () => {
  assert.deepEqual(Object.keys(TRANSLATION_ADAPTERS).sort(), [...TRANSLATION_CONTENT_TYPES].sort());
  for (const contentType of TRANSLATION_CONTENT_TYPES) {
    assert.equal(getTranslationAdapter(contentType).contentType, contentType);
  }
});

test("lesson adapter preserves the source step-key variant and validates step count", () => {
  const adapter = getTranslationAdapter("lesson");
  const source = adapter.buildSourcePayload({ title: "Урок", steps_frank: ["Один", "Два"] });
  const normalized = adapter.normalizeTranslation(source, {
    title: "Lesson",
    steps_texts: ["One", "Two"],
  });
  assert.deepEqual(normalized, { title: "Lesson", steps_frank: ["One", "Two"] });
  assert.doesNotThrow(() => adapter.validateTranslation(source, normalized, "en"));
  assert.throws(
    () => adapter.validateTranslation(source, { title: "Lesson", steps_frank: ["One"] }, "en"),
    /Invalid translation payload/,
  );
});

test("simple adapters preserve payloads and retain existing required-field validation", () => {
  const map = getTranslationAdapter("map_story");
  const mapPayload = { content: "English story" };
  assert.equal(map.normalizeTranslation({ content: "История" }, mapPayload), mapPayload);
  assert.doesNotThrow(() => map.validateTranslation({ content: "История" }, mapPayload, "en"));
  assert.throws(() => map.validateTranslation({ content: "История" }, { content: " " }, "en"));

  const artwork = getTranslationAdapter("artwork");
  assert.doesNotThrow(() => artwork.validateTranslation(
    { title: "Картина", description: "Описание" },
    { title: "Artwork", description: "Description" },
    "en",
  ));
  assert.throws(() => artwork.validateTranslation({}, { title: "Artwork", description: "" }, "en"));
});

test("book adapter validates source section and slide structure", () => {
  const adapter = getTranslationAdapter("book");
  const source = {
    title: "Книга",
    author: "Автор",
    description: "Описание",
    categories: [],
    sections: [{ mode_slug: "quiet", slides: [{ text: "A" }, { text: "B" }] }],
    tests: [],
  };
  const valid = {
    ...source,
    title: "Book",
    author: "Author",
    description: "Description",
    sections: [{ mode_slug: "quiet", slides: [{ text: "One" }, { text: "Two" }] }],
  };
  assert.doesNotThrow(() => adapter.validateTranslation(source, valid, "en"));
  assert.throws(
    () => adapter.validateTranslation(source, { ...valid, sections: [{ mode_slug: "quiet", slides: [] }] }, "en"),
    /Slide count mismatch/,
  );
});

test("story adapters and parrot adapter retain their structural checks", () => {
  const storyPayload = {
    hero_name: "Hero",
    steps: {
      narration: "Narration",
      intro: "Intro",
      journey: "Journey",
      problem: "Problem",
      solution: "Solution",
      ending: "Ending",
    },
    fragments: [],
    assembled_story: "",
  };
  for (const contentType of ["story_template", "story_submission"] as const) {
    assert.doesNotThrow(() => getTranslationAdapter(contentType).validateTranslation(storyPayload, storyPayload, "en"));
    assert.throws(() => getTranslationAdapter(contentType).validateTranslation(storyPayload, { ...storyPayload, fragments: null }, "en"));
  }

  const parrot = getTranslationAdapter("parrot_music_style");
  const source = {
    title: "Стиль",
    description: "Описание",
    presets: [{ preset_key: "soft", title: "Тихо", variants: [{ variant_key: "v1", title: "Один" }] }],
    slides: [{ order: 1, text: "Слайд" }],
  };
  const translated = {
    title: "Style",
    description: "Description",
    presets: [{ preset_key: "soft", title: "Soft", variants: [{ variant_key: "v1", title: "One" }] }],
    slides: [{ order: 1, text: "Slide" }],
  };
  assert.doesNotThrow(() => parrot.validateTranslation(source, translated, "en"));
  assert.throws(() => parrot.validateTranslation(source, { ...translated, slides: [] }, "en"), /Slide count mismatch/);
});
