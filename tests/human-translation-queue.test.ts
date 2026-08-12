import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceHash } from "../lib/server/translation-hash.ts";
import {
  buildHumanTranslationExport,
  buildHumanTranslationPopulation,
  filterAndPaginateHumanTranslationRows,
  type ExistingHumanTranslationRow,
  type HumanTranslationSourceItem,
} from "../lib/translations/human-loop-queue.ts";

function sourceItem(
  contentType: HumanTranslationSourceItem["contentType"],
  contentId: string,
  payload: Record<string, unknown>,
): HumanTranslationSourceItem {
  const source = JSON.stringify(payload);
  return {
    contentType,
    contentId,
    payload,
    sourceHash: buildSourceHash(payload),
    characters: source.length,
  };
}

const sources = [
  sourceItem("map_story", "26", { content: "Русская история" }),
  sourceItem("book", "book-52", {
    title: "Книга",
    author: "Автор",
    description: "Описание",
    categories: [],
    sections: [],
    tests: [],
  }),
  sourceItem("artwork", "art-3", { title: "Картина", description: "Описание" }),
];

test("population computes independent EN/HE missing, current and outdated states", () => {
  const translations: ExistingHumanTranslationRow[] = [
    { content_type: "map_story", content_id: "26", language: "en", source_hash: sources[0].sourceHash },
    { content_type: "map_story", content_id: "26", language: "he", source_hash: "old" },
    { content_type: "artwork", content_id: "art-3", language: "en", source_hash: sources[2].sourceHash },
    { content_type: "artwork", content_id: "art-3", language: "he", source_hash: sources[2].sourceHash },
  ];
  const population = buildHumanTranslationPopulation(sources, translations);
  assert.deepEqual(
    population.rows.map((row) => [row.content_type, row.en_status, row.he_status, row.selectable]),
    [
      ["map_story", "current", "outdated", true],
      ["book", "missing", "missing", true],
      ["artwork", "current", "current", false],
    ],
  );
  assert.deepEqual(population.summary, {
    total: 3,
    needs_translation: 2,
    missing_any: 1,
    outdated_any: 1,
    complete: 1,
  });
});

test("filtering is server-side and select-all candidates respect the batch limit", () => {
  const manySources = Array.from({ length: 35 }, (_, index) =>
    sourceItem("map_story", String(index + 1), { content: `История ${index + 1}` }),
  );
  const population = buildHumanTranslationPopulation(manySources, []);
  const page = filterAndPaginateHumanTranslationRows(population.rows, {
    page: 1,
    pageSize: 25,
    status: "missing_both",
    contentType: "map_story",
    search: "история",
  });
  assert.equal(page.total, 35);
  assert.equal(page.items.length, 25);
  assert.equal(page.selectionItems.length, 30);
  assert.equal(page.selectableTotal, 35);
  assert.deepEqual(page.selectionItems[0], { content_type: "map_story", content_id: "1" });
});

test("export builds one heterogeneous source-hashed EN+HE contract", () => {
  const population = buildHumanTranslationPopulation(sources, []);
  const contract = buildHumanTranslationExport(sources, population.rows, [
    { content_type: "map_story", content_id: "26" },
    { content_type: "book", content_id: "book-52" },
  ]);
  assert.equal(contract.contract_version, 1);
  assert.match(contract.instructions[0], /English/);
  assert.deepEqual(contract.requested_languages, ["en", "he"]);
  assert.equal(contract.items[0].source_hash, sources[0].sourceHash);
  assert.deepEqual(contract.items[0].translations.en, sources[0].payload);
  assert.deepEqual(contract.items[1].translations.he, sources[1].payload);
});

test("export rejects duplicate, unknown and already-current objects", () => {
  const missingPopulation = buildHumanTranslationPopulation(sources, []);
  assert.throws(() => buildHumanTranslationExport(sources, missingPopulation.rows, [
    { content_type: "map_story", content_id: "26" },
    { content_type: "map_story", content_id: "26" },
  ]), /Duplicate/);
  assert.throws(() => buildHumanTranslationExport(sources, missingPopulation.rows, [
    { content_type: "map_story", content_id: "unknown" },
  ]), /Unknown/);

  const currentRows: ExistingHumanTranslationRow[] = ["en", "he"].map((language) => ({
    content_type: "artwork" as const,
    content_id: "art-3",
    language: language as "en" | "he",
    source_hash: sources[2].sourceHash,
  }));
  const currentPopulation = buildHumanTranslationPopulation(sources, currentRows);
  assert.throws(() => buildHumanTranslationExport(sources, currentPopulation.rows, [
    { content_type: "artwork", content_id: "art-3" },
  ]), /already current/);
});
