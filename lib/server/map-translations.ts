import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  MAP_TRANSLATION_LANGUAGES,
  MAP_TRANSLATION_TYPES,
  MAX_MAP_TRANSLATION_BATCH,
  mapTranslationImportContractSchema,
  type MapTranslationExportContract,
  type MapTranslationLanguage,
  type MapTranslationType,
} from "../map-translations/contract.ts";
import { buildSourceHash } from "./translation-hash.ts";
import { repairTranslationJsonInput } from "../map-translations/repair.ts";

const DB_PAGE_SIZE = 1000;

export type TranslationState = "missing" | "translated" | "stale";
export type TranslationStatusFilter =
  | "all"
  | "missing_any"
  | "missing_en"
  | "missing_he"
  | "missing_both"
  | "complete";
export type ApprovalFilter = "approved" | "all";

export type MapStorySourceRow = {
  id: string | number;
  type: string | null;
  target_id: string | null;
  language: string | null;
  content: string | null;
  is_approved: boolean | null;
};

export type MapTargetMetadataRow = {
  map_type: string;
  target_id: string;
  title_ru: string | null;
};

export type ExistingMapTranslationRow = {
  content_id: string;
  language: string;
  source_hash: string;
};

export type MapTranslationQueueRow = {
  content_id: string;
  map_type: MapTranslationType;
  target_id: string;
  title_ru: string | null;
  source_content: string;
  source_hash: string;
  is_approved: boolean;
  target_metadata_missing: boolean;
  selectable: boolean;
  en_status: TranslationState;
  he_status: TranslationState;
};

export type MapTranslationSummaryBucket = {
  map_type: MapTranslationType;
  russian_stories: number;
  approved_russian_stories: number;
  en_translated: number;
  he_translated: number;
  both_complete: number;
  still_requiring_translation: number;
};

export type MapTranslationSummary = {
  russian_stories: number;
  approved_russian_stories: number;
  en_translated: number;
  he_translated: number;
  both_complete: number;
  still_requiring_translation: number;
  by_map_type: MapTranslationSummaryBucket[];
};

export type QueueParams = {
  page: number;
  pageSize: 25 | 50 | 100;
  mapType?: MapTranslationType;
  status: TranslationStatusFilter;
  approval: ApprovalFilter;
  search?: string;
};

export type ValidationProblem = {
  content_id: string | null;
  map_type: string | null;
  target_id: string | null;
  code: string;
  message: string;
  language?: MapTranslationLanguage;
  fragment?: string;
  character_index?: number;
  context?: string;
  unexpected_script?: "Cyrillic" | "Hebrew" | "Arabic" | "mixed-script";
};

export type MapTranslationValidationReport = {
  valid: boolean;
  stories_detected: number;
  english_translations: number;
  hebrew_translations: number;
  ready_rows: number;
  problems: ValidationProblem[];
  rows: Array<{
    content_type: "map_story";
    content_id: string;
    language: MapTranslationLanguage;
    source_hash: string;
    translation: { content: string };
  }>;
};

export type MapTranslationDataStore = {
  loadStoriesByIds(ids: string[]): Promise<MapStorySourceRow[]>;
  loadExistingTranslations(ids: string[]): Promise<ExistingMapTranslationRow[]>;
  insertTranslations(rows: MapTranslationValidationReport["rows"]): Promise<void>;
};

function exactTargetKey(mapType: string, targetId: string): string {
  return `${mapType}\u0000${targetId}`;
}

function translationKey(contentId: string, language: string): string {
  return `${contentId}\u0000${language}`;
}

async function loadAllRows<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${label}: ${error.message}`);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < DB_PAGE_SIZE) break;
  }
  return rows;
}

export async function loadMapTranslationPopulation(supabase: SupabaseClient): Promise<{
  rows: MapTranslationQueueRow[];
  summary: MapTranslationSummary;
}> {
  const [stories, targets, translations] = await Promise.all([
    loadAllRows<MapStorySourceRow>(
      async (from, to) => {
        const result = await supabase
          .from("map_stories")
          .select("id,type,target_id,language,content,is_approved")
          .eq("language", "ru")
          .not("content", "is", null)
          .order("id", { ascending: true })
          .range(from, to);
        return { data: result.data as MapStorySourceRow[] | null, error: result.error };
      },
      "Russian map stories",
    ),
    loadAllRows<MapTargetMetadataRow>(
      async (from, to) => {
        const result = await supabase
          .from("map_targets")
          .select("map_type,target_id,title_ru")
          .order("map_type", { ascending: true })
          .order("target_id", { ascending: true })
          .range(from, to);
        return { data: result.data as MapTargetMetadataRow[] | null, error: result.error };
      },
      "map target metadata",
    ),
    loadAllRows<ExistingMapTranslationRow>(
      async (from, to) => {
        const result = await supabase
          .from("content_translations")
          .select("content_id,language,source_hash")
          .eq("content_type", "map_story")
          .in("language", [...MAP_TRANSLATION_LANGUAGES])
          .order("content_id", { ascending: true })
          .range(from, to);
        return { data: result.data as ExistingMapTranslationRow[] | null, error: result.error };
      },
      "map translations",
    ),
  ]);

  return buildMapTranslationPopulation(stories, targets, translations);
}

export function buildMapTranslationPopulation(
  stories: MapStorySourceRow[],
  targets: MapTargetMetadataRow[],
  translations: ExistingMapTranslationRow[],
): { rows: MapTranslationQueueRow[]; summary: MapTranslationSummary } {
  const targetByKey = new Map(targets.map((row) => [exactTargetKey(row.map_type, row.target_id), row]));
  const translationByKey = new Map(
    translations.map((row) => [translationKey(String(row.content_id), row.language), row]),
  );

  const rows = stories.flatMap<MapTranslationQueueRow>((story) => {
    if (
      !story.type ||
      !MAP_TRANSLATION_TYPES.includes(story.type as MapTranslationType) ||
      story.language !== "ru" ||
      story.target_id === null ||
      typeof story.content !== "string" ||
      story.content.trim().length === 0
    ) {
      return [];
    }
    const contentId = String(story.id);
    const sourceHash = buildSourceHash({ content: story.content });
    const target = targetByKey.get(exactTargetKey(story.type, story.target_id));
    const en = translationByKey.get(translationKey(contentId, "en"));
    const he = translationByKey.get(translationKey(contentId, "he"));
    const state = (translation: ExistingMapTranslationRow | undefined): TranslationState =>
      !translation ? "missing" : translation.source_hash === sourceHash ? "translated" : "stale";

    return [{
      content_id: contentId,
      map_type: story.type as MapTranslationType,
      target_id: story.target_id,
      title_ru: target?.title_ru ?? null,
      source_content: story.content,
      source_hash: sourceHash,
      is_approved: story.is_approved === true,
      target_metadata_missing: !target,
      selectable: story.is_approved === true && Boolean(target) && (!en || !he),
      en_status: state(en),
      he_status: state(he),
    }];
  });

  const summarize = (scope: MapTranslationQueueRow[]) => ({
    russian_stories: scope.length,
    approved_russian_stories: scope.filter((row) => row.is_approved).length,
    en_translated: scope.filter((row) => row.en_status === "translated").length,
    he_translated: scope.filter((row) => row.he_status === "translated").length,
    both_complete: scope.filter(
      (row) => row.en_status === "translated" && row.he_status === "translated",
    ).length,
    still_requiring_translation: scope.filter(
      (row) => row.is_approved && (row.en_status === "missing" || row.he_status === "missing"),
    ).length,
  });
  const overall = summarize(rows);
  const summary: MapTranslationSummary = {
    ...overall,
    by_map_type: MAP_TRANSLATION_TYPES.map((mapType) => ({
      map_type: mapType,
      ...summarize(rows.filter((row) => row.map_type === mapType)),
    })),
  };

  return { rows, summary };
}

function matchesStatus(row: MapTranslationQueueRow, status: TranslationStatusFilter): boolean {
  const missingEn = row.en_status === "missing";
  const missingHe = row.he_status === "missing";
  if (status === "missing_any") return missingEn || missingHe;
  if (status === "missing_en") return missingEn;
  if (status === "missing_he") return missingHe;
  if (status === "missing_both") return missingEn && missingHe;
  if (status === "complete") return row.en_status === "translated" && row.he_status === "translated";
  return true;
}

export function filterAndPaginateMapTranslationRows(
  rows: MapTranslationQueueRow[],
  params: QueueParams,
): { items: MapTranslationQueueRow[]; total: number; page: number; pageSize: number; totalPages: number } {
  const query = params.search?.toLocaleLowerCase("ru-RU") ?? "";
  const filtered = rows.filter((row) => {
    if (params.approval === "approved" && !row.is_approved) return false;
    if (params.mapType && row.map_type !== params.mapType) return false;
    if (!matchesStatus(row, params.status)) return false;
    if (query) {
      const haystack = `${row.target_id}\n${row.title_ru ?? ""}\n${row.source_content}`.toLocaleLowerCase("ru-RU");
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / params.pageSize));
  const page = Math.min(Math.max(1, params.page), totalPages);
  const start = (page - 1) * params.pageSize;
  return {
    items: filtered.slice(start, start + params.pageSize),
    total: filtered.length,
    page,
    pageSize: params.pageSize,
    totalPages,
  };
}

export function buildMapTranslationExport(
  rows: MapTranslationQueueRow[],
  requestedIds: string[],
): MapTranslationExportContract {
  if (requestedIds.length < 1) throw new Error("Select at least one story.");
  if (requestedIds.length > MAX_MAP_TRANSLATION_BATCH) {
    throw new Error(`Maximum translation batch is ${MAX_MAP_TRANSLATION_BATCH} stories.`);
  }
  if (new Set(requestedIds).size !== requestedIds.length) throw new Error("Duplicate story selection.");
  const byId = new Map(rows.map((row) => [row.content_id, row]));
  const items = requestedIds.map((contentId) => {
    const row = byId.get(contentId);
    if (!row) throw new Error(`Unknown map story: ${contentId}`);
    if (!row.is_approved) throw new Error(`Story ${contentId} is not approved.`);
    if (row.target_metadata_missing) throw new Error(`Target metadata missing for story ${contentId}.`);
    const translations: { en?: { content: string }; he?: { content: string } } = {};
    if (row.en_status === "missing") translations.en = { content: "" };
    if (row.he_status === "missing") translations.he = { content: "" };
    if (!translations.en && !translations.he) throw new Error(`Story ${contentId} has no missing translations.`);
    return {
      content_id: row.content_id,
      map_type: row.map_type,
      target_id: row.target_id,
      title_ru: row.title_ru,
      source_language: "ru" as const,
      source_hash: row.source_hash,
      source: { content: row.source_content },
      translations,
    };
  });
  return { contract_version: 2, content_type: "map_story", items };
}

function schemaProblems(error: z.ZodError): ValidationProblem[] {
  return error.issues.map((issue) => ({
    content_id: null,
    map_type: null,
    target_id: null,
    code: "INVALID_SCHEMA",
    message: `${issue.path.join(".") || "payload"}: ${issue.message}`,
  }));
}

function unexpectedScriptProblem(language: MapTranslationLanguage, content: string): Pick<ValidationProblem, "code" | "message" | "fragment" | "character_index" | "context" | "unexpected_script"> | null {
  const pattern = language === "en"
    ? /[\p{Letter}]*[\p{Script=Cyrillic}\p{Script=Hebrew}\p{Script=Arabic}][\p{Letter}]*/u
    : /[\p{Letter}]*[\p{Script=Cyrillic}\p{Script=Arabic}][\p{Letter}]*|\p{Script=Hebrew}\p{Script=Latin}|\p{Script=Latin}\p{Script=Hebrew}/u;
  const match = pattern.exec(content);
  if (!match) return null;
  const start = Math.max(0, match.index - 12);
  const end = Math.min(content.length, match.index + match[0].length + 12);
  const fragment = content.slice(start, end).replace(/\s+/g, " ");
  const unexpectedScript = /\p{Script=Cyrillic}/u.test(match[0]) ? "Cyrillic"
    : /\p{Script=Arabic}/u.test(match[0]) ? "Arabic"
      : /\p{Script=Hebrew}/u.test(match[0]) && language === "en" ? "Hebrew"
        : "mixed-script";
  return {
    code: language === "en" ? "UNEXPECTED_SCRIPT_EN" : "UNEXPECTED_SCRIPT_HE",
    message: `${language === "en" ? "English" : "Hebrew"} translation contains unexpected ${unexpectedScript} characters: “${match[0]}”.`,
    fragment: match[0],
    character_index: match.index,
    context: fragment,
    unexpected_script: unexpectedScript,
  };
}

export async function validateMapTranslationContract(
  input: unknown,
  store: MapTranslationDataStore,
): Promise<MapTranslationValidationReport> {
  const parsed = mapTranslationImportContractSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, stories_detected: 0, english_translations: 0, hebrew_translations: 0, ready_rows: 0, problems: schemaProblems(parsed.error), rows: [] };
  }
  const contract = parsed.data;
  const ids = contract.items.map((item) => item.content_id);
  const [stories, existing] = await Promise.all([
    store.loadStoriesByIds(ids),
    store.loadExistingTranslations(ids),
  ]);
  const storyById = new Map(stories.map((story) => [String(story.id), story]));
  const existingKeys = new Set(existing.map((row) => translationKey(String(row.content_id), row.language)));
  const problems: ValidationProblem[] = [];
  const rows: MapTranslationValidationReport["rows"] = [];
  let english = 0;
  let hebrew = 0;

  for (const item of contract.items) {
    const legacyItem = "map_type" in item ? item : null;
    const story = storyById.get(item.content_id);
    const base = {
      content_id: item.content_id,
      map_type: story?.type ?? legacyItem?.map_type ?? null,
      target_id: story?.target_id ?? legacyItem?.target_id ?? null,
    };
    if (!story) {
      problems.push({ ...base, code: "SOURCE_NOT_FOUND", message: "Russian map story does not exist." });
      continue;
    }
    if (story.language !== "ru") problems.push({ ...base, code: "SOURCE_NOT_RUSSIAN", message: "Source story is not Russian." });
    if (story.is_approved !== true) problems.push({ ...base, code: "SOURCE_NOT_APPROVED", message: "Russian story is not approved." });
    if (legacyItem) {
      if (story.type !== legacyItem.map_type) problems.push({ ...base, code: "MAP_TYPE_MISMATCH", message: "map_type no longer matches the database." });
      if (story.target_id !== legacyItem.target_id) problems.push({ ...base, code: "TARGET_ID_MISMATCH", message: "target_id does not exactly match the database." });
      if (story.content !== legacyItem.source.content) problems.push({ ...base, code: "SOURCE_CHANGED", message: "Russian source content changed after export." });
    }
    const currentHash = buildSourceHash({ content: story.content ?? "" });
    if (currentHash !== item.source_hash) problems.push({ ...base, code: "SOURCE_HASH_MISMATCH", message: "source_hash does not match the current canonical source." });

    for (const language of MAP_TRANSLATION_LANGUAGES) {
      const translated = item.translations[language];
      if (!translated) continue;
      if (!translated.content.trim()) {
        problems.push({ ...base, language, code: "EMPTY_TRANSLATION", message: `${language.toUpperCase()} translation is empty.` });
        continue;
      }
      const scriptProblem = unexpectedScriptProblem(language, translated.content);
      if (scriptProblem) problems.push({ ...base, language, ...scriptProblem });
      if (existingKeys.has(translationKey(item.content_id, language))) {
        problems.push({ ...base, language, code: "ALREADY_EXISTS", message: `A ${language.toUpperCase()} translation already exists.` });
        continue;
      }
      if (language === "en") english += 1;
      if (language === "he") hebrew += 1;
      rows.push({
        content_type: "map_story",
        content_id: item.content_id,
        language,
        source_hash: currentHash,
        translation: { content: translated.content },
      });
    }
  }

  return {
    valid: problems.length === 0,
    stories_detected: contract.items.length,
    english_translations: english,
    hebrew_translations: hebrew,
    ready_rows: problems.length === 0 ? rows.length : 0,
    problems,
    rows: problems.length === 0 ? rows : [],
  };
}

export async function createMapTranslationExport(
  supabase: SupabaseClient,
  requestedIds: string[],
): Promise<MapTranslationExportContract> {
  const population = await loadMapTranslationPopulation(supabase);
  return buildMapTranslationExport(population.rows, requestedIds);
}

export function createSupabaseMapTranslationStore(supabase: SupabaseClient): MapTranslationDataStore {
  return {
    async loadStoriesByIds(ids) {
      const { data, error } = await supabase
        .from("map_stories")
        .select("id,type,target_id,language,content,is_approved")
        .in("id", ids);
      if (error) throw new Error(`Failed to load source stories: ${error.message}`);
      return (data ?? []) as MapStorySourceRow[];
    },
    async loadExistingTranslations(ids) {
      const { data, error } = await supabase
        .from("content_translations")
        .select("content_id,language,source_hash")
        .eq("content_type", "map_story")
        .in("content_id", ids)
        .in("language", [...MAP_TRANSLATION_LANGUAGES]);
      if (error) throw new Error(`Failed to load existing translations: ${error.message}`);
      return (data ?? []) as ExistingMapTranslationRow[];
    },
    async insertTranslations(rows) {
      const { error } = await supabase.from("content_translations").insert(rows);
      if (error) {
        const wrapped = new Error(error.code === "23505" ? "DB_CONFLICT: A translation was inserted concurrently." : error.message);
        (wrapped as Error & { code?: string }).code = error.code;
        throw wrapped;
      }
    },
  };
}

export async function validateMapTranslationJson(
  json: string,
  store: MapTranslationDataStore,
): Promise<MapTranslationValidationReport> {
  return (await validateAndPrepareMapTranslationJson(json, store)).report;
}

export type PreparedMapTranslationJson = {
  report: MapTranslationValidationReport;
  repaired: boolean;
  canonicalJson: string | null;
};

function invalidJsonReport(json: string, error: unknown): MapTranslationValidationReport {
  return {
    valid: false,
    stories_detected: 0,
    english_translations: 0,
    hebrew_translations: 0,
    ready_rows: 0,
    problems: [{ content_id: null, map_type: null, target_id: null, code: "INVALID_JSON", message: describeJsonSyntaxError(json, error) }],
    rows: [],
  };
}

export async function validateAndPrepareMapTranslationJson(
  json: string,
  store: MapTranslationDataStore,
): Promise<PreparedMapTranslationJson> {
  let input: unknown;
  try {
    input = JSON.parse(json);
    return { report: await validateMapTranslationContract(input, store), repaired: false, canonicalJson: null };
  } catch (initialError) {
    const repaired = repairTranslationJsonInput(json);
    if (!repaired.ok) return { report: invalidJsonReport(json, initialError), repaired: false, canonicalJson: null };
    try {
      input = JSON.parse(repaired.text);
    } catch (repairError) {
      return { report: invalidJsonReport(repaired.text, repairError), repaired: false, canonicalJson: null };
    }
    return {
      report: await validateMapTranslationContract(input, store),
      repaired: repaired.changed,
      canonicalJson: repaired.changed ? JSON.stringify(input, null, 2) : null,
    };
  }
}

export function describeJsonSyntaxError(json: string, error: unknown): string {
  const nativeMessage = error instanceof SyntaxError ? error.message : "Unable to parse JSON.";
  const positionMatch = nativeMessage.match(/position\s+(\d+)/i);
  const nativeLineMatch = nativeMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  let location = "";
  if (positionMatch) {
    const position = Number(positionMatch[1]);
    const before = json.slice(0, position);
    const line = before.split("\n").length;
    const lastNewline = before.lastIndexOf("\n");
    const column = position - lastNewline;
    location = ` Line: ${line}. Column: ${column}.`;
  } else if (nativeLineMatch) {
    location = ` Line: ${nativeLineMatch[1]}. Column: ${nativeLineMatch[2]}.`;
  }
  return `Invalid JSON syntax. ${nativeMessage}${location}`;
}

export async function insertValidatedMapTranslations(
  report: MapTranslationValidationReport,
  store: MapTranslationDataStore,
): Promise<number> {
  if (!report.valid || report.rows.length === 0) {
    throw new Error("VALIDATION_REQUIRED: The complete batch must be valid before upload.");
  }
  await store.insertTranslations(report.rows);
  return report.rows.length;
}
