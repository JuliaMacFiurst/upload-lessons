import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_MAP_TRANSLATION_BATCH,
  mapTranslationContractSchema,
  mapTranslationV2ReturnContractSchema,
  type MapTranslationContract,
  type MapTranslationV2ReturnContract,
} from "../lib/map-translations/contract.ts";
import {
  buildMapTranslationExport,
  buildMapTranslationPopulation,
  filterAndPaginateMapTranslationRows,
  insertValidatedMapTranslations,
  validateMapTranslationContract,
  validateAndPrepareMapTranslationJson,
  validateMapTranslationJson,
  type MapTranslationDataStore,
  type MapTranslationQueueRow,
  type MapTranslationValidationReport,
} from "../lib/server/map-translations.ts";
import { buildSourceHash } from "../lib/server/translation-hash.ts";

function contractItem(id: number, overrides: Record<string, unknown> = {}) {
  const content = `Русская история ${id}`;
  return {
    content_id: String(id),
    map_type: "physic" as const,
    target_id: `target-${id}`,
    title_ru: `Название ${id}`,
    source_language: "ru" as const,
    source_hash: buildSourceHash({ content }),
    source: { content },
    translations: {
      en: { content: `English ${id}` },
      he: { content: `עברית ${id}` },
    },
    ...overrides,
  };
}

function contract(count = 1): MapTranslationContract {
  return {
    contract_version: 1,
    content_type: "map_story",
    items: Array.from({ length: count }, (_, index) => contractItem(index + 1)),
  };
}

function v2Contract(count = 1): MapTranslationV2ReturnContract {
  const legacy = contract(count);
  return {
    contract_version: 2,
    content_type: "map_story",
    items: legacy.items.map((item) => ({
      content_id: item.content_id,
      source_hash: item.source_hash,
      translations: item.translations,
    })),
  };
}

function storeFor(payload: MapTranslationContract, options?: {
  missing?: string;
  unapproved?: string;
  existing?: Array<{ content_id: string; language: string; source_hash: string }>;
  onInsert?: (rows: MapTranslationValidationReport["rows"]) => void;
}): MapTranslationDataStore {
  return {
    async loadStoriesByIds() {
      return payload.items
        .filter((item) => item.content_id !== options?.missing)
        .map((item) => ({
          id: item.content_id,
          type: item.map_type,
          target_id: item.target_id,
          language: "ru",
          content: item.source.content,
          is_approved: item.content_id === options?.unapproved ? false : true,
        }));
    },
    async loadExistingTranslations() {
      return options?.existing ?? [];
    },
    async insertTranslations(rows) {
      options?.onInsert?.(rows);
    },
  };
}

test("contract accepts valid 1-item and 15-item payloads", () => {
  assert.equal(mapTranslationContractSchema.safeParse(contract(1)).success, true);
  assert.equal(mapTranslationContractSchema.safeParse(contract(MAX_MAP_TRANSLATION_BATCH)).success, true);
});

test("valid compact v2 payload with EN and HE passes contract validation", () => {
  assert.equal(mapTranslationV2ReturnContractSchema.safeParse(v2Contract(1)).success, true);
});

test("contract rejects more than 15 and duplicate content_id", () => {
  assert.equal(mapTranslationContractSchema.safeParse(contract(16)).success, false);
  const duplicated = contract(2);
  duplicated.items[1].content_id = duplicated.items[0].content_id;
  assert.equal(mapTranslationContractSchema.safeParse(duplicated).success, false);
});

test("contract rejects invalid languages and strict unknown fields", () => {
  const value = contract(1) as unknown as Record<string, unknown>;
  const item = (value.items as Array<Record<string, unknown>>)[0];
  item.translations = { fr: { content: "Bonjour" } };
  assert.equal(mapTranslationContractSchema.safeParse(value).success, false);
});

test("validator rejects blank EN and blank HE", async () => {
  for (const language of ["en", "he"] as const) {
    const value = contract(1);
    value.items[0].translations[language] = { content: "   " };
    const report = await validateMapTranslationContract(value, storeFor(value));
    assert.equal(report.valid, false);
    assert.ok(report.problems.some((problem) => problem.code === "EMPTY_TRANSLATION" && problem.language === language));
  }
});

test("validator detects modified target, source and source hash", async () => {
  const original = contract(1);
  const changed = structuredClone(original);
  changed.items[0].target_id = "modified";
  changed.items[0].source.content = "modified source";
  changed.items[0].source_hash = "modified hash";
  const report = await validateMapTranslationContract(changed, storeFor(original));
  assert.deepEqual(
    new Set(report.problems.map((problem) => problem.code)),
    new Set(["TARGET_ID_MISMATCH", "SOURCE_CHANGED", "SOURCE_HASH_MISMATCH"]),
  );
});

test("validator reports missing/unapproved sources and existing languages", async () => {
  const value = contract(2);
  const missing = await validateMapTranslationContract(value, storeFor(value, { missing: "1" }));
  assert.ok(missing.problems.some((problem) => problem.code === "SOURCE_NOT_FOUND"));
  const unapproved = await validateMapTranslationContract(value, storeFor(value, { unapproved: "1" }));
  assert.ok(unapproved.problems.some((problem) => problem.code === "SOURCE_NOT_APPROVED"));
  const existing = await validateMapTranslationContract(value, storeFor(value, {
    existing: [
      { content_id: "1", language: "en", source_hash: "x" },
      { content_id: "2", language: "he", source_hash: "x" },
    ],
  }));
  assert.ok(existing.problems.some((problem) => problem.code === "ALREADY_EXISTS" && problem.language === "en"));
  assert.ok(existing.problems.some((problem) => problem.code === "ALREADY_EXISTS" && problem.language === "he"));
});

test("one invalid item produces no writable rows", async () => {
  const value = contract(2);
  value.items[1].source.content = "changed";
  const report = await validateMapTranslationContract(value, storeFor(contract(2)));
  assert.equal(report.valid, false);
  assert.equal(report.rows.length, 0);
  assert.equal(report.ready_rows, 0);
});

test("successful validation preserves exact IDs and creates EN+HE insert rows", async () => {
  const value = contract(1);
  value.items[0].target_id = "Isthmus|CENTRAL AMERICA";
  const report = await validateMapTranslationContract(value, storeFor(value));
  assert.equal(report.valid, true);
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].content_id, "1");
  assert.equal(value.items[0].target_id, "Isthmus|CENTRAL AMERICA");
});

test("successful import performs one batch insert containing EN and HE", async () => {
  const value = contract(1);
  const report = await validateMapTranslationContract(value, storeFor(value));
  const inserted: typeof report.rows[] = [];
  const result = await insertValidatedMapTranslations(report, storeFor(value, {
    onInsert(rows) {
      inserted.push(rows);
    },
  }));
  assert.equal(result, 2);
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0].map((row) => row.language).sort(), ["en", "he"]);
});

test("unique conflict is propagated and never converted into an overwrite", async () => {
  const value = contract(1);
  const report = await validateMapTranslationContract(value, storeFor(value));
  let insertCalls = 0;
  const conflictStore = storeFor(value, {
    onInsert() {
      insertCalls += 1;
      const error = new Error("DB_CONFLICT");
      (error as Error & { code?: string }).code = "23505";
      throw error;
    },
  });
  await assert.rejects(() => insertValidatedMapTranslations(report, conflictStore), /DB_CONFLICT/);
  assert.equal(insertCalls, 1);
});

test("export rejects >15 and exports only missing languages", () => {
  const row = queueRow();
  row.source_content = 'Строка с "кавычками", \\ и\nновой строкой\tЮникод';
  row.en_status = "translated";
  const exported = buildMapTranslationExport([row], [row.content_id]);
  assert.equal(exported.contract_version, 2);
  assert.equal(exported.items[0].translations.en, undefined);
  assert.deepEqual(exported.items[0].translations.he, { content: "" });
  const serialized = JSON.stringify(exported, null, 2);
  assert.equal(JSON.parse(serialized).items[0].source.content, row.source_content);
  assert.throws(
    () => buildMapTranslationExport(Array.from({ length: 16 }, (_, index) => queueRow(String(index))), Array.from({ length: 16 }, (_, index) => String(index))),
    /Maximum translation batch/,
  );
});

function queueRow(id = "1"): MapTranslationQueueRow {
  return {
    content_id: id,
    map_type: "physic",
    target_id: `target-${id}`,
    title_ru: `Title ${id}`,
    source_content: `Story ${id}`,
    source_hash: "hash",
    is_approved: true,
    target_metadata_missing: false,
    selectable: true,
    en_status: "missing",
    he_status: "missing",
  };
}

test("population includes only non-empty RU stories and marks missing metadata non-selectable", () => {
  const result = buildMapTranslationPopulation(
    [
      { id: 1, type: "physic", target_id: "known", language: "ru", content: "Story", is_approved: true },
      { id: 2, type: "physic", target_id: "blank", language: "ru", content: "  ", is_approved: true },
      { id: 3, type: "physic", target_id: "en", language: "en", content: "Story", is_approved: true },
      { id: 4, type: "physic", target_id: "orphan", language: "ru", content: "Story", is_approved: true },
    ],
    [{ map_type: "physic", target_id: "known", title_ru: "Known" }],
    [],
  );
  assert.deepEqual(result.rows.map((row) => row.content_id), ["1", "4"]);
  assert.equal(result.rows[1].target_metadata_missing, true);
  assert.equal(result.rows[1].selectable, false);
});

test("queue status/filter and server pagination operate on the full population", () => {
  const rows = Array.from({ length: 120 }, (_, index) => queueRow(String(index + 1)));
  rows[119].map_type = "river";
  rows[0].en_status = "translated";
  rows[0].he_status = "translated";
  rows[1].en_status = "translated";
  const page = filterAndPaginateMapTranslationRows(rows, {
    page: 2,
    pageSize: 50,
    mapType: "physic",
    status: "missing_any",
    approval: "approved",
  });
  assert.equal(page.total, 118);
  assert.equal(page.items.length, 50);
  const complete = filterAndPaginateMapTranslationRows(rows, {
    page: 1,
    pageSize: 25,
    status: "complete",
    approval: "all",
  });
  assert.equal(complete.total, 1);
  const river = filterAndPaginateMapTranslationRows(rows, {
    page: 1,
    pageSize: 25,
    mapType: "river",
    status: "all",
    approval: "all",
  });
  assert.equal(river.total, 1);
  assert.equal(river.items[0].map_type, "river");
});

test("escaped quotation marks in valid v2 translation JSON parse successfully", async () => {
  const source = contract(1);
  const value = v2Contract(1);
  value.items[0].translations.en = { content: 'lots of "o" and "a" sounds' };
  const report = await validateMapTranslationJson(JSON.stringify(value, null, 2), storeFor(source));
  assert.equal(report.valid, true);
  assert.equal(report.rows.find((row) => row.language === "en")?.translation.content, 'lots of "o" and "a" sounds');
});

test("unescaped quotation marks are repaired before strict database validation", async () => {
  const malformed = `{
  "contract_version": 2,
  "content_type": "map_story",
  "items": [{"content_id":"1","source_hash":"hash","translations":{"en":{"content":"lots of "o" and "a" sounds"}}}]
}`;
  const report = await validateMapTranslationJson(malformed, storeFor(contract(1)));
  assert.equal(report.valid, false);
  assert.equal(report.problems.some((problem) => problem.code === "INVALID_JSON"), false);
  assert.ok(report.problems.some((problem) => problem.code === "SOURCE_HASH_MISMATCH"));
});

test("v2 source hash mismatch, unknown source and existing languages remain blocking", async () => {
  const source = contract(2);
  const changedHash = v2Contract(1);
  changedHash.items[0].source_hash = "changed";
  const mismatch = await validateMapTranslationContract(changedHash, storeFor(source));
  assert.ok(mismatch.problems.some((problem) => problem.code === "SOURCE_HASH_MISMATCH"));

  const unknown = v2Contract(1);
  unknown.items[0].content_id = "999999";
  const missing = await validateMapTranslationContract(unknown, storeFor(source));
  assert.ok(missing.problems.some((problem) => problem.code === "SOURCE_NOT_FOUND"));

  const existing = await validateMapTranslationContract(v2Contract(1), storeFor(source, {
    existing: [
      { content_id: "1", language: "en", source_hash: "x" },
      { content_id: "1", language: "he", source_hash: "x" },
    ],
  }));
  assert.equal(existing.valid, false);
  assert.equal(existing.problems.filter((problem) => problem.code === "ALREADY_EXISTS").length, 2);
});

test("one invalid v2 item causes zero insert rows", async () => {
  const source = contract(2);
  const value = v2Contract(2);
  value.items[1].source_hash = "changed";
  const report = await validateMapTranslationContract(value, storeFor(source));
  assert.equal(report.valid, false);
  assert.equal(report.ready_rows, 0);
  assert.deepEqual(report.rows, []);
});

test("Cyrillic inside Hebrew returns UNEXPECTED_SCRIPT_HE", async () => {
  const source = contract(1);
  const value = v2Contract(1);
  const suspicious = "\u043cалыш";
  value.items[0].translations.he = { content: `המילה ${suspicious} אינה תקינה` };
  const report = await validateMapTranslationContract(value, storeFor(source));
  const problem = report.problems.find((entry) => entry.code === "UNEXPECTED_SCRIPT_HE");
  assert.equal(report.valid, false);
  assert.equal(problem?.content_id, "1");
  assert.equal(problem?.language, "he");
  assert.equal(problem?.fragment, suspicious);
  assert.equal(problem?.character_index, 6);
  assert.ok(problem?.context?.includes(suspicious));
  assert.match(problem?.message ?? "", /unexpected Cyrillic characters/i);
});

test("repaired input returns canonical JSON.stringify output before upload", async () => {
  const source = contract(1);
  const value = JSON.stringify(v2Contract(1), null, 2).replace('English 1', 'word "mali" and "i"');
  const prepared = await validateAndPrepareMapTranslationJson(value, storeFor(source));
  assert.equal(prepared.repaired, true);
  assert.equal(prepared.report.valid, true);
  assert.ok(prepared.canonicalJson);
  assert.equal(prepared.canonicalJson, JSON.stringify(JSON.parse(prepared.canonicalJson ?? ""), null, 2));
});

test("structural JSON errors outside translation content remain INVALID_JSON", async () => {
  const malformed = '{"contract_version":2 "content_type":"map_story","items":[]}';
  const prepared = await validateAndPrepareMapTranslationJson(malformed, storeFor(contract(1)));
  assert.equal(prepared.repaired, false);
  assert.equal(prepared.report.valid, false);
  assert.equal(prepared.report.problems[0].code, "INVALID_JSON");
  assert.match(prepared.report.problems[0].message, /Invalid JSON syntax\./);
  assert.match(prepared.report.problems[0].message, /(position\s+\d+|Line:\s*\d+)/i);
});
