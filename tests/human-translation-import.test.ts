import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceHash } from "../lib/server/translation-hash.ts";
import {
  parseHumanTranslationJson,
  prepareHumanTranslationImport,
  validateHumanTranslationImport,
} from "../lib/server/human-translation-import.ts";
import type { HumanTranslationSourceItem } from "../lib/translations/human-loop-queue.ts";
import { HUMAN_TRANSLATION_INSTRUCTIONS } from "../lib/translations/human-loop-contract.ts";

function sourceItem(
  contentType: HumanTranslationSourceItem["contentType"],
  contentId: string,
  payload: Record<string, unknown>,
): HumanTranslationSourceItem {
  return {
    contentType,
    contentId,
    payload,
    sourceHash: buildSourceHash(payload),
    characters: JSON.stringify(payload).length,
  };
}

const mapSource = sourceItem("map_story", "26", { content: "Русская история" });
const artworkSource = sourceItem("artwork", "art-3", { title: "Картина", description: "Описание" });

function item(source: HumanTranslationSourceItem, translations: { en: unknown; he: unknown }) {
  return {
    content_type: source.contentType,
    content_id: source.contentId,
    source_hash: source.sourceHash,
    translations,
  };
}

test("parser accepts plain and fenced JSON", () => {
  assert.deepEqual(parseHumanTranslationJson('{"contract_version":1,"items":[]}'), {
    contract_version: 1,
    items: [],
  });
  assert.deepEqual(parseHumanTranslationJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => parseHumanTranslationJson(""), /Paste/);
});

test("preview validates a heterogeneous EN+HE batch", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [
      item(mapSource, { en: { content: "English story" }, he: { content: "סיפור" } }),
      item(artworkSource, {
        en: { title: "Painting", description: "Description" },
        he: { title: "ציור", description: "תיאור" },
      }),
    ],
  }, [mapSource, artworkSource]);
  assert.equal(preview.detected, 2);
  assert.equal(preview.ready, 2);
  assert.equal(preview.can_save, true);
  assert.deepEqual(preview.items.map((result) => result.status), ["ready", "ready"]);
});

test("preview accepts the filled export envelope returned unchanged by the LLM", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    instructions: HUMAN_TRANSLATION_INSTRUCTIONS,
    source_language: "ru",
    requested_languages: ["en", "he"],
    items: [{
      ...item(mapSource, { en: { content: "English story" }, he: { content: "סיפור" } }),
      source: mapSource.payload,
    }],
  }, [mapSource]);
  assert.equal(preview.ready, 1);
  assert.equal(preview.invalid, 0);
});

test("preview rejects a modified source inside a returned export envelope", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    instructions: HUMAN_TRANSLATION_INSTRUCTIONS,
    source_language: "ru",
    requested_languages: ["en", "he"],
    items: [{
      ...item(mapSource, { en: { content: "English story" }, he: { content: "סיפור" } }),
      source: { content: "Измененный источник" },
    }],
  }, [mapSource]);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.items[0].errors[0].kind, "source_mismatch");
});

test("partial validation keeps ready items when another translation is invalid", () => {
  const input = {
    contract_version: 1,
    items: [
      item(mapSource, { en: { content: "English story" }, he: { content: "סיפור" } }),
      item(artworkSource, {
        en: { title: "Painting", description: "Description" },
        he: { title: "", description: "תיאור" },
      }),
    ],
  };
  const prepared = prepareHumanTranslationImport(input, [mapSource, artworkSource]);
  const preview = prepared.preview;
  assert.equal(preview.ready, 1);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.can_save, true);
  assert.equal(preview.items[1].errors[0].language, "he");
  assert.deepEqual(prepared.readyIndexes, [0]);
  assert.equal(prepared.saveRows.length, 2);
  assert.deepEqual(prepared.saveRows.map((row) => row.language), ["en", "he"]);
  assert.ok(prepared.saveRows.every((row) => row.content_id === "26" && row.source_hash === mapSource.sourceHash));
});

test("existing translations require explicit overwrite confirmation metadata", () => {
  const prepared = prepareHumanTranslationImport({
    contract_version: 1,
    items: [item(mapSource, { en: { content: "Updated English" }, he: { content: "סיפור מעודכן" } })],
  }, [mapSource], [
    { content_type: "map_story", content_id: "26", language: "en", source_hash: mapSource.sourceHash },
    { content_type: "map_story", content_id: "26", language: "he", source_hash: mapSource.sourceHash },
  ]);
  assert.equal(prepared.preview.ready, 1);
  assert.equal(prepared.preview.overwrite_objects, 1);
  assert.equal(prepared.preview.items[0].requires_overwrite_confirmation, true);
  assert.deepEqual(prepared.preview.items[0].existing_languages, ["en", "he"]);
  assert.equal(prepared.saveRows.length, 2);
});

test("semantic language guard rejects unchanged Russian templates and Hebrew inside English", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [
      item(mapSource, { en: { content: "Русская история" }, he: { content: "Русская история" } }),
      item(artworkSource, {
        en: { title: "ציור", description: "Description" },
        he: { title: "ציור", description: "תיאור" },
      }),
    ],
  }, [mapSource, artworkSource]);
  assert.equal(preview.ready, 0);
  assert.equal(preview.invalid, 2);
  assert.deepEqual(preview.items[0].errors.map((error) => error.language), ["en", "he"]);
  assert.match(preview.items[0].errors[0].message, /Cyrillic/);
  assert.match(preview.items[1].errors[0].message, /Hebrew/);
});

test("semantic language guard rejects an English-only Hebrew translation", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [item(mapSource, {
      en: { content: "English story" },
      he: { content: "English story" },
    })],
  }, [mapSource]);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.items[0].errors[0].language, "he");
  assert.match(preview.items[0].errors[0].message, /no Hebrew text/);
});

test("semantic language guard rejects Arabic letters inside Hebrew", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [item(mapSource, {
      en: { content: "English story" },
      he: { content: "סיפור יפה هي מאוד" },
    })],
  }, [mapSource]);
  assert.equal(preview.invalid, 1);
  assert.equal(preview.items[0].errors[0].language, "he");
  assert.match(preview.items[0].errors[0].message, /Arabic letters/);
  assert.match(preview.items[0].errors[0].message, /هي/);
});

test("Hebrew allows punctuation, numbers, emoji and Latin technical identifiers", () => {
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [item(mapSource, {
      en: { content: "English story", mode_slug: "intro-v2" },
      he: { content: "סיפור יפה — פרק 2! 🦫", mode_slug: "intro-v2" },
    })],
  }, [mapSource]);
  assert.equal(preview.ready, 1);
  assert.equal(preview.invalid, 0);
});

test("preview separates outdated, missing, duplicate and item schema errors", () => {
  const outdated = item(mapSource, { en: { content: "English" }, he: { content: "עברית" } });
  outdated.source_hash = "0".repeat(64);
  const missing = { ...item(mapSource, { en: { content: "English" }, he: { content: "עברית" } }), content_id: "gone" };
  const duplicate = item(artworkSource, {
    en: { title: "Painting", description: "Description" },
    he: { title: "ציור", description: "תיאור" },
  });
  const preview = validateHumanTranslationImport({
    contract_version: 1,
    items: [outdated, missing, duplicate, structuredClone(duplicate), { content_type: "map_story" }],
  }, [mapSource, artworkSource]);
  assert.deepEqual(preview.items.map((result) => result.status), [
    "outdated_source",
    "not_found",
    "invalid",
    "invalid",
    "invalid",
  ]);
  assert.equal(preview.outdated_source, 1);
  assert.equal(preview.not_found, 1);
  assert.equal(preview.invalid, 3);
  assert.equal(preview.items[2].errors[0].kind, "duplicate");
  assert.equal(preview.items[4].errors[0].kind, "item_schema");
});

test("invalid envelope reports global errors and does not inspect items", () => {
  const preview = validateHumanTranslationImport({ contract_version: 2, items: [] }, [mapSource]);
  assert.equal(preview.detected, 0);
  assert.equal(preview.items.length, 0);
  assert.equal(preview.errors[0].kind, "envelope");
  assert.equal(preview.can_save, false);
});
