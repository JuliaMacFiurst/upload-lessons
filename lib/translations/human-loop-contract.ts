import { z } from "zod";
import { TRANSLATION_CONTENT_TYPES } from "./content-types.ts";

export const HUMAN_TRANSLATION_CONTRACT_VERSION = 1 as const;
export const HUMAN_TRANSLATION_LANGUAGES = ["en", "he"] as const;
export const MAX_HUMAN_TRANSLATION_BATCH = 30;
export const HUMAN_TRANSLATION_INSTRUCTIONS = [
  "Translate translations.en into English and translations.he into Hebrew for every item.",
  "Do not change contract metadata, content_type, content_id, source_hash, source, JSON keys, identifiers, array lengths, or object structure.",
  "Translate only human-readable string values. Never leave Russian text in either translation.",
  "Return JSON only, without markdown fences or explanations.",
] as const;

const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "source_hash must be a lowercase SHA-256 hex digest.");

const payloadSchema = z.record(z.unknown());

const translationsSchema = z
  .object({
    en: payloadSchema,
    he: payloadSchema,
  })
  .strict();

const identityShape = {
  content_type: z.enum(TRANSLATION_CONTENT_TYPES),
  content_id: z.string().min(1),
  source_hash: sha256Schema,
};

export const humanTranslationExportItemSchema = z
  .object({
    ...identityShape,
    source: payloadSchema,
    translations: translationsSchema,
  })
  .strict();

export const humanTranslationImportItemSchema = z
  .object({
    ...identityShape,
    translations: translationsSchema,
  })
  .strict();

function addDuplicateIdentityIssues(
  items: Array<{ content_type: string; content_id: string }>,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const identity = `${item.content_type}\u0000${item.content_id}`;
    if (seen.has(identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", index, "content_id"],
        message: `Duplicate translation item: ${item.content_type}:${item.content_id}`,
      });
    }
    seen.add(identity);
  });
}

export const humanTranslationExportContractSchema = z
  .object({
    contract_version: z.literal(HUMAN_TRANSLATION_CONTRACT_VERSION),
    instructions: z.tuple([
      z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[0]),
      z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[1]),
      z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[2]),
      z.literal(HUMAN_TRANSLATION_INSTRUCTIONS[3]),
    ]),
    source_language: z.literal("ru"),
    requested_languages: z.tuple([z.literal("en"), z.literal("he")]),
    items: z.array(humanTranslationExportItemSchema).min(1).max(MAX_HUMAN_TRANSLATION_BATCH),
  })
  .strict()
  .superRefine((value, context) => addDuplicateIdentityIssues(value.items, context));

export const humanTranslationImportContractSchema = z
  .object({
    contract_version: z.literal(HUMAN_TRANSLATION_CONTRACT_VERSION),
    items: z.array(humanTranslationImportItemSchema).min(1).max(MAX_HUMAN_TRANSLATION_BATCH),
  })
  .strict()
  .superRefine((value, context) => addDuplicateIdentityIssues(value.items, context));

export type HumanTranslationExportContract = z.infer<typeof humanTranslationExportContractSchema>;
export type HumanTranslationImportContract = z.infer<typeof humanTranslationImportContractSchema>;
export type HumanTranslationExportItem = z.infer<typeof humanTranslationExportItemSchema>;
export type HumanTranslationImportItem = z.infer<typeof humanTranslationImportItemSchema>;

export function parseHumanTranslationExportContract(input: unknown): HumanTranslationExportContract {
  return humanTranslationExportContractSchema.parse(input);
}

export function parseHumanTranslationImportContract(input: unknown): HumanTranslationImportContract {
  return humanTranslationImportContractSchema.parse(input);
}
