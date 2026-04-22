import { z } from "zod";

export const catPresetKindSchema = z.enum(["text", "full"]);
export const catMediaTypeSchema = z.enum(["gif", "video"]);

export const catSlideInputSchema = z.object({
  id: z.string().uuid().optional(),
  order: z.number().int().min(1),
  text: z.string().trim().min(1, "Slide text is required."),
  mediaUrl: z.string().trim().url().optional().nullable(),
  mediaType: catMediaTypeSchema.optional().nullable(),
});

export const catTranslationPayloadSchema = z.object({
  prompt: z.string().trim().min(1),
  slides: z.array(z.object({
    order: z.number().int().min(1),
    text: z.string().trim().min(1),
  })).min(1),
});

export const catQuestionPayloadSchema = z.object({
  legacy_id: z.string().trim().min(1).optional(),
  base_key: z.string().trim().min(1).optional(),
  kind: catPresetKindSchema.default("text"),
  prompt: z.string().trim().min(1, "Question title is required."),
  category: z.string().trim().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().optional().nullable(),
  slides: z.array(catSlideInputSchema).min(1, "At least one slide is required."),
  translations: z.object({
    en: catTranslationPayloadSchema.optional(),
    he: catTranslationPayloadSchema.optional(),
  }).optional().default({}),
});

export type CatPresetKind = z.infer<typeof catPresetKindSchema>;
export type CatMediaType = z.infer<typeof catMediaTypeSchema>;
export type CatSlideInput = z.infer<typeof catSlideInputSchema>;
export type CatTranslationPayload = z.infer<typeof catTranslationPayloadSchema>;
export type CatQuestionPayload = z.infer<typeof catQuestionPayloadSchema>;

export type CatQuestionListItem = {
  id: string;
  legacy_id: string;
  base_key: string;
  kind: CatPresetKind;
  prompt: string;
  category: string | null;
  is_active: boolean;
  slide_count: number;
  created_at: string | null;
  duplicate_warning: string | null;
};

export type CatQuestionEditor = {
  id: string;
  legacy_id: string;
  base_key: string;
  kind: CatPresetKind;
  prompt: string;
  category: string | null;
  is_active: boolean;
  sort_order: number | null;
  slides: Array<CatSlideInput & { id: string }>;
};
