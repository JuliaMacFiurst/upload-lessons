import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMapTranslationTextareaHeight,
  canUploadMapTranslations,
  findMapTranslationIssueSelection,
  getMapTranslationImportState,
  MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT,
  MAP_TRANSLATION_TEXTAREA_MIN_HEIGHT,
} from "../lib/map-translations/import-ui.ts";

test("empty input is waiting and cannot upload", () => {
  const state = getMapTranslationImportState({ jsonInput: "", validating: false, validationValid: null, validatedJson: null });
  assert.equal(state, "empty");
  assert.equal(canUploadMapTranslations(state, false), false);
});

test("pasted JSON is dirty until the exact content validates", () => {
  const json = '{"contract_version":1}';
  assert.equal(getMapTranslationImportState({ jsonInput: json, validating: false, validationValid: null, validatedJson: null }), "dirty");
  const valid = getMapTranslationImportState({ jsonInput: json, validating: false, validationValid: true, validatedJson: json });
  assert.equal(valid, "valid");
  assert.equal(canUploadMapTranslations(valid, false), true);
});

test("editing after validation invalidates upload eligibility", () => {
  const state = getMapTranslationImportState({
    jsonInput: '{"contract_version":1,"edited":true}',
    validating: false,
    validationValid: true,
    validatedJson: '{"contract_version":1}',
  });
  assert.equal(state, "dirty");
  assert.equal(canUploadMapTranslations(state, false), false);
});

test("invalid validation state remains readable and cannot upload", () => {
  const json = "not-json";
  const state = getMapTranslationImportState({ jsonInput: json, validating: false, validationValid: false, validatedJson: json });
  assert.equal(state, "invalid");
  assert.equal(canUploadMapTranslations(state, false), false);
});

test("upload is disabled while a valid batch is already uploading", () => {
  assert.equal(canUploadMapTranslations("valid", true), false);
});

test("textarea auto-resize respects minimum, content height, and maximum", () => {
  assert.equal(calculateMapTranslationTextareaHeight(20), MAP_TRANSLATION_TEXTAREA_MIN_HEIGHT);
  assert.equal(calculateMapTranslationTextareaHeight(360), 360);
  assert.equal(calculateMapTranslationTextareaHeight(2_000), MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT);
});

test("script issue locator returns the exact textarea selection for jump-to-error", () => {
  const json = JSON.stringify({
    contract_version: 2,
    content_type: "map_story",
    items: [{
      content_id: "9",
      source_hash: "hash",
      translations: { en: { content: "Mali" }, he: { content: 'כמו המילה "малыш" (פעוט), רק' } },
    }],
  }, null, 2);
  const selection = findMapTranslationIssueSelection({ json, contentId: "9", language: "he", fragment: "малыш" });
  assert.ok(selection);
  assert.equal(json.slice(selection.start, selection.end), "малыш");
  assert.equal(findMapTranslationIssueSelection({ json, contentId: "missing", language: "he", fragment: "малыш" }), null);
});
