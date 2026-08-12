import { z } from "zod";
import {
  HUMAN_TRANSLATION_CONTRACT_VERSION,
  HUMAN_TRANSLATION_INSTRUCTIONS,
  MAX_HUMAN_TRANSLATION_BATCH,
  humanTranslationImportItemSchema,
  humanTranslationExportItemSchema,
} from "../translations/human-loop-contract.ts";
import type {
  ExistingHumanTranslationRow,
  HumanTranslationSourceItem,
} from "../translations/human-loop-queue.ts";
import { getTranslationAdapter, type TranslationLanguage } from "./translation-adapters.ts";
import type { TranslationContentType } from "../translations/content-types.ts";
import { buildSourceHash } from "./translation-hash.ts";

export type HumanTranslationImportErrorKind =
  | "parse"
  | "envelope"
  | "item_schema"
  | "duplicate"
  | "not_found"
  | "source_mismatch"
  | "outdated_source"
  | "translation";

export type HumanTranslationImportError = {
  kind: HumanTranslationImportErrorKind;
  message: string;
  path?: string;
  language?: TranslationLanguage;
};

export type HumanTranslationImportPreviewItem = {
  index: number;
  content_type: string | null;
  content_id: string | null;
  status: "ready" | "invalid" | "outdated_source" | "not_found";
  errors: HumanTranslationImportError[];
  existing_languages: TranslationLanguage[];
  requires_overwrite_confirmation: boolean;
};

export type HumanTranslationImportPreview = {
  detected: number;
  ready: number;
  invalid: number;
  outdated_source: number;
  not_found: number;
  can_save: boolean;
  overwrite_objects: number;
  errors: HumanTranslationImportError[];
  items: HumanTranslationImportPreviewItem[];
};

export type HumanTranslationSaveRow = {
  content_type: TranslationContentType;
  content_id: string;
  language: TranslationLanguage;
  source_hash: string;
  translation: unknown;
};

export type PreparedHumanTranslationImport = {
  preview: HumanTranslationImportPreview;
  saveRows: HumanTranslationSaveRow[];
  readyIndexes: number[];
};

const envelopeSchema = z.object({
  contract_version: z.literal(HUMAN_TRANSLATION_CONTRACT_VERSION),
  instructions: z.tuple([
    z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[0]),
    z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[1]),
    z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[2]),
    z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[3]),
  ]).optional(),
  source_language: z.literal("ru").optional(),
  requested_languages: z.tuple([z.literal("en"), z.literal("he")]).optional(),
  items: z.array(z.unknown()).min(1).max(MAX_HUMAN_TRANSLATION_BATCH),
}).strict();

const returnedItemSchema = z.union([
  humanTranslationImportItemSchema,
  humanTranslationExportItemSchema,
]);

function identityKey(contentType: string, contentId: string): string {
  return `${contentType}\u0000${contentId}`;
}

function issuePath(index: number, path: PropertyKey[]): string {
  return ["items", index, ...path].map(String).join(".");
}

function readIdentity(value: unknown): { content_type: string | null; content_id: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { content_type: null, content_id: null };
  }
  const record = value as Record<string, unknown>;
  return {
    content_type: typeof record.content_type === "string" ? record.content_type : null,
    content_id: typeof record.content_id === "string" ? record.content_id : null,
  };
}

function emptyPreview(errors: HumanTranslationImportError[]): HumanTranslationImportPreview {
  return {
    detected: 0,
    ready: 0,
    invalid: 0,
    outdated_source: 0,
    not_found: 0,
    can_save: false,
    overwrite_objects: 0,
    errors,
    items: [],
  };
}

function validateTranslationScripts(payload: unknown, language: TranslationLanguage): void {
  const strings: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      strings.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  visit(payload);
  const text = strings.join("\n");
  const cyrillic = text.match(/[\p{Script=Cyrillic}]+/u);
  if (cyrillic) {
    throw new Error(`${language.toUpperCase()} translation contains unexpected Cyrillic text: “${cyrillic[0]}”.`);
  }
  if (language === "en") {
    const hebrew = text.match(/[\p{Script=Hebrew}]+/u);
    if (hebrew) throw new Error(`English translation contains unexpected Hebrew text: “${hebrew[0]}”.`);
    if (!/\p{Script=Latin}/u.test(text)) {
      throw new Error("English translation contains no Latin text.");
    }
  } else if (!/\p{Script=Hebrew}/u.test(text)) {
    throw new Error("Hebrew translation contains no Hebrew text.");
  }
}

export function parseHumanTranslationJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Paste a translation batch first.");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export function prepareHumanTranslationImport(
  input: unknown,
  sourceItems: HumanTranslationSourceItem[],
  existingTranslations: ExistingHumanTranslationRow[] = [],
): PreparedHumanTranslationImport {
  const envelopeResult = envelopeSchema.safeParse(input);
  if (!envelopeResult.success) {
    return {
      preview: emptyPreview(envelopeResult.error.issues.map((issue) => ({
        kind: "envelope",
        message: issue.message,
        path: issue.path.map(String).join("."),
      }))),
      saveRows: [],
      readyIndexes: [],
    };
  }

  const rawItems = envelopeResult.data.items;
  const sourceByIdentity = new Map(
    sourceItems.map((item) => [identityKey(item.contentType, item.contentId), item]),
  );
  const existingLanguagesByIdentity = new Map<string, Set<TranslationLanguage>>();
  for (const row of existingTranslations) {
    const key = identityKey(row.content_type, String(row.content_id));
    const languages = existingLanguagesByIdentity.get(key) ?? new Set<TranslationLanguage>();
    languages.add(row.language);
    existingLanguagesByIdentity.set(key, languages);
  }
  const identityCounts = new Map<string, number>();
  for (const rawItem of rawItems) {
    const identity = readIdentity(rawItem);
    if (identity.content_type && identity.content_id) {
      const key = identityKey(identity.content_type, identity.content_id);
      identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
    }
  }

  const saveRows: HumanTranslationSaveRow[] = [];
  const readyIndexes: number[] = [];
  const items = rawItems.map<HumanTranslationImportPreviewItem>((rawItem, index) => {
    const rawIdentity = readIdentity(rawItem);
    const parsed = returnedItemSchema.safeParse(rawItem);
    if (!parsed.success) {
      return {
        index,
        ...rawIdentity,
        status: "invalid",
        existing_languages: [],
        requires_overwrite_confirmation: false,
        errors: parsed.error.issues.map((issue) => ({
          kind: "item_schema",
          message: issue.message,
          path: issuePath(index, issue.path),
        })),
      };
    }

    const item = parsed.data;
    const key = identityKey(item.content_type, item.content_id);
    if ((identityCounts.get(key) ?? 0) > 1) {
      return {
        index,
        content_type: item.content_type,
        content_id: item.content_id,
        status: "invalid",
        existing_languages: [],
        requires_overwrite_confirmation: false,
        errors: [{ kind: "duplicate", message: "Duplicate object in this batch." }],
      };
    }

    if ("source" in item && buildSourceHash(item.source) !== item.source_hash) {
      return {
        index,
        content_type: item.content_type,
        content_id: item.content_id,
        status: "invalid",
        existing_languages: [],
        requires_overwrite_confirmation: false,
        errors: [{
          kind: "source_mismatch",
          message: "The source payload was modified in the returned batch.",
        }],
      };
    }

    const source = sourceByIdentity.get(key);
    if (!source) {
      return {
        index,
        content_type: item.content_type,
        content_id: item.content_id,
        status: "not_found",
        existing_languages: [],
        requires_overwrite_confirmation: false,
        errors: [{ kind: "not_found", message: "The source object no longer exists." }],
      };
    }
    if (item.source_hash !== source.sourceHash) {
      return {
        index,
        content_type: item.content_type,
        content_id: item.content_id,
        status: "outdated_source",
        existing_languages: [...(existingLanguagesByIdentity.get(key) ?? [])],
        requires_overwrite_confirmation: false,
        errors: [{
          kind: "outdated_source",
          message: "The source changed after this batch was exported. Copy it again before translating.",
        }],
      };
    }

    const adapter = getTranslationAdapter(item.content_type);
    const existingLanguages = [...(existingLanguagesByIdentity.get(key) ?? [])].sort() as TranslationLanguage[];
    const errors: HumanTranslationImportError[] = [];
    const normalizedTranslations: Partial<Record<TranslationLanguage, unknown>> = {};
    for (const language of ["en", "he"] as const) {
      try {
        const normalized = adapter.normalizeTranslation(source.payload, item.translations[language]);
        adapter.validateTranslation(source.payload, normalized, language);
        validateTranslationScripts(normalized, language);
        normalizedTranslations[language] = JSON.parse(JSON.stringify(normalized));
      } catch (error) {
        errors.push({
          kind: "translation",
          language,
          message: error instanceof Error ? error.message : `Invalid ${language} translation.`,
        });
      }
    }
    if (errors.length === 0) {
      readyIndexes.push(index);
      for (const language of ["en", "he"] as const) {
        saveRows.push({
          content_type: item.content_type,
          content_id: item.content_id,
          language,
          source_hash: source.sourceHash,
          translation: normalizedTranslations[language],
        });
      }
    }
    return {
      index,
      content_type: item.content_type,
      content_id: item.content_id,
      status: errors.length ? "invalid" : "ready",
      errors,
      existing_languages: existingLanguages,
      requires_overwrite_confirmation: errors.length === 0 && existingLanguages.length > 0,
    };
  });

  const ready = items.filter((item) => item.status === "ready").length;
  const invalid = items.filter((item) => item.status === "invalid").length;
  const outdatedSource = items.filter((item) => item.status === "outdated_source").length;
  const notFound = items.filter((item) => item.status === "not_found").length;
  const overwriteObjects = items.filter((item) => item.requires_overwrite_confirmation).length;
  return {
    preview: {
      detected: items.length,
      ready,
      invalid,
      outdated_source: outdatedSource,
      not_found: notFound,
      can_save: ready > 0,
      overwrite_objects: overwriteObjects,
      errors: [],
      items,
    },
    saveRows,
    readyIndexes,
  };
}

export function validateHumanTranslationImport(
  input: unknown,
  sourceItems: HumanTranslationSourceItem[],
  existingTranslations: ExistingHumanTranslationRow[] = [],
): HumanTranslationImportPreview {
  return prepareHumanTranslationImport(input, sourceItems, existingTranslations).preview;
}
