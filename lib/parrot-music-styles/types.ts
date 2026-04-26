import { z } from "zod";

export const parrotMusicStyleMediaTypeSchema = z.enum(["gif", "image", "video"]);

const optionalAssetPathSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return value ?? null;
  },
  z.union([
    z.string().url("Asset URL must be a valid URL."),
    z.string().regex(/^\/.+/, "Asset path must be a valid URL or root-relative path."),
  ]).nullable(),
);

const optionalUrlSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return value ?? null;
  },
  z.string().url("URL must be a valid URL.").nullable(),
);

export const parrotMusicStyleVariantSchema = z.object({
  id: z.string().uuid().optional(),
  variant_key: z.string().trim().min(1, "Variant key is required."),
  title: z.string().trim().max(160).optional().nullable(),
  audio_url: z.string().trim().url("Audio URL must be a valid URL."),
  sort_order: z.number().int().optional().nullable(),
});

export const parrotMusicStylePresetSchema = z.object({
  id: z.string().uuid().optional(),
  preset_key: z.string().trim().min(1, "Preset key is required."),
  title: z.string().trim().min(1, "Preset title is required.").max(160),
  icon_url: optionalAssetPathSchema.optional(),
  sort_order: z.number().int().optional().nullable(),
  default_on: z.boolean().default(false),
  default_variant_key: z.string().trim().optional().nullable(),
  variants: z.array(parrotMusicStyleVariantSchema).min(1, "Each preset must contain at least one variant."),
});

export const parrotMusicStyleSlideSchema = z.object({
  id: z.string().uuid().optional(),
  slide_order: z.number().int().min(1),
  text: z.string().trim().min(1, "Slide text is required."),
  media_url: optionalUrlSchema.optional(),
  media_type: parrotMusicStyleMediaTypeSchema.optional().nullable(),
});

export const parrotMusicStyleTranslationSlideSchema = z.object({
  order: z.number().int().min(1),
  text: z.string().trim().min(1, "Translated slide text is required."),
});

export const parrotMusicStyleTranslationSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  slides: z.array(parrotMusicStyleTranslationSlideSchema).optional().default([]),
});

export const parrotMusicStyleTranslationsSchema = z.object({
  en: parrotMusicStyleTranslationSchema.optional(),
  he: parrotMusicStyleTranslationSchema.optional(),
});

export const parrotMusicStylePayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase latin letters, numbers, and hyphens."),
  title: z.string().trim().min(1, "Title is required.").max(160),
  description: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
    z.string().trim().max(2000).nullable(),
  ),
  icon_url: optionalAssetPathSchema.optional(),
  search_artist: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
    z.string().trim().max(160).nullable(),
  ),
  search_genre: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
    z.string().trim().max(160).nullable(),
  ),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().optional().nullable(),
  presets: z.array(parrotMusicStylePresetSchema).min(1, "At least one preset is required."),
  slides: z.array(parrotMusicStyleSlideSchema).min(1, "At least one slide is required."),
  translations: parrotMusicStyleTranslationsSchema.default({}),
});

export const parrotMusicStyleRecordSchema = parrotMusicStylePayloadSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export type ParrotMusicStyleMediaType = z.infer<typeof parrotMusicStyleMediaTypeSchema>;
export type ParrotMusicStyleVariantInput = z.infer<typeof parrotMusicStyleVariantSchema>;
export type ParrotMusicStylePresetInput = z.infer<typeof parrotMusicStylePresetSchema>;
export type ParrotMusicStyleSlideInput = z.infer<typeof parrotMusicStyleSlideSchema>;
export type ParrotMusicStyleTranslationPayload = z.infer<typeof parrotMusicStyleTranslationSchema>;
export type ParrotMusicStyleTranslations = z.infer<typeof parrotMusicStyleTranslationsSchema>;
export type ParrotMusicStylePayload = z.infer<typeof parrotMusicStylePayloadSchema>;
export type ParrotMusicStyleRecord = z.infer<typeof parrotMusicStyleRecordSchema>;

export type ParrotMusicStyleListItem = {
  id: string;
  slug: string;
  title: string;
  search_artist: string | null;
  search_genre: string | null;
  is_active: boolean;
  sort_order: number | null;
  preset_count: number;
  slide_count: number;
  created_at: string | null;
};
