import assert from "node:assert/strict";
import test from "node:test";
import {
  HUMAN_TRANSLATION_CONTRACT_VERSION,
  HUMAN_TRANSLATION_INSTRUCTIONS,
  MAX_HUMAN_TRANSLATION_BATCH,
  humanTranslationExportContractSchema,
  humanTranslationImportContractSchema,
} from "../lib/translations/human-loop-contract.ts";
import { buildSourceHash } from "../lib/server/translation-hash.ts";

function importItem(contentType: "map_story" | "book", contentId: string) {
  const source = contentType === "map_story"
    ? { content: `Источник ${contentId}` }
    : { title: `Книга ${contentId}` };
  return {
    content_type: contentType,
    content_id: contentId,
    source_hash: buildSourceHash(source),
    translations: {
      en: contentType === "map_story" ? { content: "English" } : { title: "Book" },
      he: contentType === "map_story" ? { content: "עברית" } : { title: "ספר" },
    },
  };
}

test("compact import accepts a heterogeneous EN+HE batch", () => {
  const result = humanTranslationImportContractSchema.safeParse({
    contract_version: HUMAN_TRANSLATION_CONTRACT_VERSION,
    items: [importItem("map_story", "26"), importItem("book", "book-52")],
  });
  assert.equal(result.success, true);
});

test("export requires canonical source metadata and both requested languages", () => {
  const item = importItem("map_story", "26");
  const result = humanTranslationExportContractSchema.safeParse({
    contract_version: HUMAN_TRANSLATION_CONTRACT_VERSION,
    instructions: HUMAN_TRANSLATION_INSTRUCTIONS,
    source_language: "ru",
    requested_languages: ["en", "he"],
    items: [{ ...item, source: { content: "Источник 26" } }],
  });
  assert.equal(result.success, true);

  const wrongOrder = humanTranslationExportContractSchema.safeParse({
    contract_version: HUMAN_TRANSLATION_CONTRACT_VERSION,
    instructions: HUMAN_TRANSLATION_INSTRUCTIONS,
    source_language: "ru",
    requested_languages: ["he", "en"],
    items: [{ ...item, source: { content: "Источник 26" } }],
  });
  assert.equal(wrongOrder.success, false);
});

test("contract rejects missing language, malformed hash and unknown envelope fields", () => {
  const item = importItem("map_story", "26");
  const missingHebrew = structuredClone(item) as Record<string, unknown>;
  missingHebrew.translations = { en: { content: "English" } };
  assert.equal(humanTranslationImportContractSchema.safeParse({ contract_version: 1, items: [missingHebrew] }).success, false);

  assert.equal(humanTranslationImportContractSchema.safeParse({
    contract_version: 1,
    items: [{ ...item, source_hash: "not-a-sha256" }],
  }).success, false);

  assert.equal(humanTranslationImportContractSchema.safeParse({
    contract_version: 1,
    items: [item],
    unexpected: true,
  }).success, false);
});

test("contract rejects duplicate composite identities and batches over the limit", () => {
  const duplicate = importItem("map_story", "26");
  assert.equal(humanTranslationImportContractSchema.safeParse({
    contract_version: 1,
    items: [duplicate, structuredClone(duplicate)],
  }).success, false);

  const items = Array.from({ length: MAX_HUMAN_TRANSLATION_BATCH + 1 }, (_, index) =>
    importItem("map_story", String(index + 1)),
  );
  assert.equal(humanTranslationImportContractSchema.safeParse({ contract_version: 1, items }).success, false);
});
