import { z } from "zod";

export const MAP_TRANSLATION_TYPES = [
  "physic",
  "river",
  "sea",
  "animal",
  "country",
  "weather",
  "food",
  "culture",
  "flag",
] as const;

export const MAP_TRANSLATION_LANGUAGES = ["en", "he"] as const;
export const MAX_MAP_TRANSLATION_BATCH = 15;

const sourceSchema = z.object({ content: z.string() }).strict();
const translationValueSchema = z.object({ content: z.string() }).strict();

const translationsSchema = z
  .object({
    en: translationValueSchema.optional(),
    he: translationValueSchema.optional(),
  })
  .strict()
  .refine((value) => value.en !== undefined || value.he !== undefined, {
    message: "At least one en/he translation is required.",
  });

export const mapTranslationV1ItemSchema = z
  .object({
    content_id: z.string().min(1),
    map_type: z.enum(MAP_TRANSLATION_TYPES),
    target_id: z.string().min(1),
    title_ru: z.string().nullable(),
    source_language: z.literal("ru"),
    source_hash: z.string().min(1),
    source: sourceSchema,
    translations: translationsSchema,
  })
  .strict();

export const mapTranslationV1ContractSchema = z
  .object({
    contract_version: z.literal(1),
    content_type: z.literal("map_story"),
    items: z.array(mapTranslationV1ItemSchema).min(1).max(MAX_MAP_TRANSLATION_BATCH),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.content_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "content_id"],
          message: `Duplicate content_id: ${item.content_id}`,
        });
      }
      seen.add(item.content_id);
    });
  });

export const mapTranslationV2ReturnItemSchema = z.object({
  content_id: z.string().min(1),
  source_hash: z.string().min(1),
  translations: translationsSchema,
}).strict();

export const mapTranslationV2ReturnContractSchema = z.object({
  contract_version: z.literal(2),
  content_type: z.literal("map_story"),
  items: z.array(mapTranslationV2ReturnItemSchema).min(1).max(MAX_MAP_TRANSLATION_BATCH),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.content_id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "content_id"],
        message: `Duplicate content_id: ${item.content_id}`,
      });
    }
    seen.add(item.content_id);
  });
});

export const mapTranslationImportContractSchema = z.union([
  mapTranslationV1ContractSchema,
  mapTranslationV2ReturnContractSchema,
]);

// Kept as a named v1 alias for callers that explicitly handle legacy envelopes.
export const mapTranslationContractSchema = mapTranslationV1ContractSchema;

export type MapTranslationContract = z.infer<typeof mapTranslationV1ContractSchema>;
export type MapTranslationContractItem = z.infer<typeof mapTranslationV1ItemSchema>;
export type MapTranslationV2ReturnContract = z.infer<typeof mapTranslationV2ReturnContractSchema>;
export type MapTranslationImportContract = z.infer<typeof mapTranslationImportContractSchema>;
export type MapTranslationExportContract = Omit<MapTranslationContract, "contract_version"> & { contract_version: 2 };
export type MapTranslationLanguage = (typeof MAP_TRANSLATION_LANGUAGES)[number];
export type MapTranslationType = (typeof MAP_TRANSLATION_TYPES)[number];

export function parseMapTranslationContract(input: unknown): MapTranslationContract {
  return mapTranslationV1ContractSchema.parse(input);
}

export function parseMapTranslationJson(input: string): MapTranslationContract {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`INVALID_JSON: ${error instanceof Error ? error.message : "Invalid JSON syntax."}`);
  }
  return parseMapTranslationContract(parsed);
}
