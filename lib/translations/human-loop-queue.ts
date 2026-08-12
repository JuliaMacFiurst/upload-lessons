import {
  HUMAN_TRANSLATION_CONTRACT_VERSION,
  HUMAN_TRANSLATION_INSTRUCTIONS,
  MAX_HUMAN_TRANSLATION_BATCH,
  humanTranslationExportContractSchema,
  type HumanTranslationExportContract,
} from "./human-loop-contract.ts";
import type { TranslationContentType } from "./content-types.ts";

export type HumanTranslationLanguageStatus = "missing" | "current" | "outdated";
export type HumanTranslationStatusFilter =
  | "needs_translation"
  | "missing_any"
  | "outdated_any"
  | "missing_both"
  | "complete"
  | "all";

export type HumanTranslationSourceItem = {
  contentType: TranslationContentType;
  contentId: string;
  payload: unknown;
  sourceHash: string;
  characters: number;
};

export type HumanTranslationRow = {
  content_type: TranslationContentType;
  content_id: string;
  title: string;
  source_hash: string;
  source_characters: number;
  en_status: HumanTranslationLanguageStatus;
  he_status: HumanTranslationLanguageStatus;
  selectable: boolean;
};

export type HumanTranslationSummary = {
  total: number;
  needs_translation: number;
  missing_any: number;
  outdated_any: number;
  complete: number;
};

export type HumanTranslationIdentity = {
  content_type: TranslationContentType;
  content_id: string;
};

export type ExistingHumanTranslationRow = {
  content_type: TranslationContentType;
  content_id: string;
  language: "en" | "he";
  source_hash: string;
};

function identityKey(contentType: string, contentId: string): string {
  return `${contentType}\u0000${contentId}`;
}

function translationKey(contentType: string, contentId: string, language: string): string {
  return `${identityKey(contentType, contentId)}\u0000${language}`;
}

function getDisplayTitle(item: HumanTranslationSourceItem): string {
  if (!item.payload || typeof item.payload !== "object" || Array.isArray(item.payload)) {
    return `${item.contentType}:${item.contentId}`;
  }
  const payload = item.payload as Record<string, unknown>;
  for (const key of ["title", "hero_name", "name", "content"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/\s+/g, " ").slice(0, 100);
    }
  }
  return `${item.contentType}:${item.contentId}`;
}

function resolveLanguageStatus(
  existing: ExistingHumanTranslationRow | undefined,
  sourceHash: string,
): HumanTranslationLanguageStatus {
  if (!existing) return "missing";
  return existing.source_hash === sourceHash ? "current" : "outdated";
}

export function buildHumanTranslationPopulation(
  sourceItems: HumanTranslationSourceItem[],
  translations: ExistingHumanTranslationRow[],
): { rows: HumanTranslationRow[]; summary: HumanTranslationSummary } {
  const translationsByKey = new Map(
    translations.map((row) => [
      translationKey(row.content_type, String(row.content_id), row.language),
      row,
    ]),
  );
  const rows = sourceItems.map((item) => {
    const enStatus = resolveLanguageStatus(
      translationsByKey.get(translationKey(item.contentType, item.contentId, "en")),
      item.sourceHash,
    );
    const heStatus = resolveLanguageStatus(
      translationsByKey.get(translationKey(item.contentType, item.contentId, "he")),
      item.sourceHash,
    );
    return {
      content_type: item.contentType,
      content_id: item.contentId,
      title: getDisplayTitle(item),
      source_hash: item.sourceHash,
      source_characters: item.characters,
      en_status: enStatus,
      he_status: heStatus,
      selectable: enStatus !== "current" || heStatus !== "current",
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      needs_translation: rows.filter((row) => row.selectable).length,
      missing_any: rows.filter((row) => row.en_status === "missing" || row.he_status === "missing").length,
      outdated_any: rows.filter((row) => row.en_status === "outdated" || row.he_status === "outdated").length,
      complete: rows.filter((row) => !row.selectable).length,
    },
  };
}

function matchesStatus(row: HumanTranslationRow, status: HumanTranslationStatusFilter): boolean {
  if (status === "needs_translation") return row.selectable;
  if (status === "missing_any") return row.en_status === "missing" || row.he_status === "missing";
  if (status === "outdated_any") return row.en_status === "outdated" || row.he_status === "outdated";
  if (status === "missing_both") return row.en_status === "missing" && row.he_status === "missing";
  if (status === "complete") return !row.selectable;
  return true;
}

export function filterAndPaginateHumanTranslationRows(
  rows: HumanTranslationRow[],
  params: {
    page: number;
    pageSize: 25 | 50 | 100;
    status: HumanTranslationStatusFilter;
    contentType?: TranslationContentType;
    search?: string;
  },
): {
  items: HumanTranslationRow[];
  selectionItems: HumanTranslationIdentity[];
  selectableTotal: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const search = params.search?.trim().toLocaleLowerCase() ?? "";
  const filtered = rows.filter((row) => {
    if (params.contentType && row.content_type !== params.contentType) return false;
    if (!matchesStatus(row, params.status)) return false;
    if (!search) return true;
    return `${row.content_type}\n${row.content_id}\n${row.title}`.toLocaleLowerCase().includes(search);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / params.pageSize));
  const page = Math.min(Math.max(1, params.page), totalPages);
  const start = (page - 1) * params.pageSize;
  const selectable = filtered.filter((row) => row.selectable);
  return {
    items: filtered.slice(start, start + params.pageSize),
    selectionItems: selectable
      .slice(0, MAX_HUMAN_TRANSLATION_BATCH)
      .map((row) => ({ content_type: row.content_type, content_id: row.content_id })),
    selectableTotal: selectable.length,
    total: filtered.length,
    page,
    pageSize: params.pageSize,
    totalPages,
  };
}

function clonePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Translation source payload must be an object.");
  }
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

export function buildHumanTranslationExport(
  sourceItems: HumanTranslationSourceItem[],
  queueRows: HumanTranslationRow[],
  requestedItems: HumanTranslationIdentity[],
): HumanTranslationExportContract {
  if (requestedItems.length < 1) throw new Error("Select at least one object.");
  if (requestedItems.length > MAX_HUMAN_TRANSLATION_BATCH) {
    throw new Error(`Maximum human translation batch is ${MAX_HUMAN_TRANSLATION_BATCH} objects.`);
  }
  const requestedKeys = requestedItems.map((item) => identityKey(item.content_type, item.content_id));
  if (new Set(requestedKeys).size !== requestedKeys.length) throw new Error("Duplicate object selection.");

  const sourceByKey = new Map(sourceItems.map((item) => [identityKey(item.contentType, item.contentId), item]));
  const queueByKey = new Map(queueRows.map((row) => [identityKey(row.content_type, row.content_id), row]));
  const items = requestedItems.map((requested) => {
    const key = identityKey(requested.content_type, requested.content_id);
    const source = sourceByKey.get(key);
    const queueRow = queueByKey.get(key);
    if (!source || !queueRow) throw new Error(`Unknown translation object: ${requested.content_type}:${requested.content_id}`);
    if (!queueRow.selectable) throw new Error(`Translation object is already current: ${requested.content_type}:${requested.content_id}`);
    const sourcePayload = clonePayload(source.payload);
    return {
      content_type: requested.content_type,
      content_id: requested.content_id,
      source_hash: source.sourceHash,
      source: sourcePayload,
      translations: { en: clonePayload(sourcePayload), he: clonePayload(sourcePayload) },
    };
  });

  return humanTranslationExportContractSchema.parse({
    contract_version: HUMAN_TRANSLATION_CONTRACT_VERSION,
    instructions: HUMAN_TRANSLATION_INSTRUCTIONS,
    source_language: "ru",
    requested_languages: ["en", "he"],
    items,
  });
}
