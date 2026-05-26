import { z } from "zod";

const optionalTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
  z.string().trim().max(4000).nullable(),
);

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
  z.string().trim().url("URL must be valid.").nullable(),
);

const stringArraySchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value;
  },
  z.array(z.string().trim().min(1)).default([]),
);

export const recipePinterestStatusSchema = z.enum([
  "draft",
  "exported",
  "scheduled",
  "uploaded",
  "published",
]);

export const recipeStepSchema = z.object({
  order: z.number().int().min(1),
  text: z.string().trim().min(1),
});

export const recipeTranslationSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  ingredients: stringArraySchema.optional(),
  fact: z.string().trim().min(1).optional(),
  raccoon_caption: z.string().trim().min(1).optional(),
  cooking_time: z.string().trim().min(1).optional(),
  cooking_steps: z.array(recipeStepSchema).optional(),
  raccoon_advice: z.string().trim().min(1).optional(),
  serving_instructions: z.string().trim().min(1).optional(),
  laplapla_interaction_caption: z.string().trim().min(1).optional(),
  pinterest_description: z.string().trim().min(1).optional(),
  hashtags: stringArraySchema.optional(),
});

export const recipeTranslationsSchema = z.object({
  en: recipeTranslationSchema.optional(),
  he: recipeTranslationSchema.optional(),
});

export const recipePayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase latin letters, numbers, and hyphens."),
  title: z.string().trim().min(1, "Title is required.").max(180),
  description: optionalTextSchema,
  image_url: optionalUrlSchema,
  country: optionalTextSchema,
  ingredients: stringArraySchema,
  fact: optionalTextSchema,
  raccoon_caption: optionalTextSchema,
  cooking_time: optionalTextSchema,
  cooking_steps: z.array(recipeStepSchema).default([]),
  raccoon_advice: optionalTextSchema,
  serving_instructions: optionalTextSchema,
  laplapla_interaction_caption: optionalTextSchema,
  hashtags: stringArraySchema,
  publish_date: optionalTextSchema,
  pinterest_status: recipePinterestStatusSchema.default("draft"),
  pinterest_description: optionalTextSchema,
  exported_image_urls: z.record(z.string(), z.string().url()).default({}),
  asset_set_key: optionalTextSchema,
  sticker_set_key: optionalTextSchema,
  layout_json: z.record(z.string(), z.unknown()).default({}),
  gradient_from: optionalTextSchema,
  gradient_to: optionalTextSchema,
  is_active: z.boolean().default(true),
  translations: recipeTranslationsSchema.default({}),
});

export const recipeRecordSchema = recipePayloadSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().optional().nullable(),
  updated_at: z.string().optional().nullable(),
});

export type RecipePinterestStatus = z.infer<typeof recipePinterestStatusSchema>;
export type RecipeStep = z.infer<typeof recipeStepSchema>;
export type RecipeTranslation = z.infer<typeof recipeTranslationSchema>;
export type RecipeTranslations = z.infer<typeof recipeTranslationsSchema>;
export type RecipePayload = z.infer<typeof recipePayloadSchema>;
export type RecipeRecord = z.infer<typeof recipeRecordSchema>;

export type RecipeListItem = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  publish_date: string | null;
  pinterest_status: RecipePinterestStatus;
  is_active: boolean;
  created_at: string | null;
};

export type RecipeLayoutTemplate = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  updated_at: string | null;
  gradient_from: string | null;
  gradient_to: string | null;
  layout_json: Record<string, unknown>;
  preview_url: string | null;
};
