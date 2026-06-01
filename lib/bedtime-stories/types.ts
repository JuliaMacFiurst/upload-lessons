import { z } from "zod";

export const bedtimeStoryLanguageSchema = z.enum(["en", "ru", "he"]);
export type BedtimeStoryLanguage = z.infer<typeof bedtimeStoryLanguageSchema>;

const localizedTextSchema = z.object({
  en: z.string().trim().min(1, "English text is required."),
  ru: z.string().trim().min(1, "Russian text is required."),
  he: z.string().trim().min(1, "Hebrew text is required."),
});

const optionalLocalizedTextSchema = z.object({
  en: z.string().trim().optional().default(""),
  ru: z.string().trim().optional().default(""),
  he: z.string().trim().optional().default(""),
});

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

const nullableUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value ?? null),
  z.string().trim().url("URL must be valid.").nullable(),
);

export const bedtimeStoryStatusSchema = z.enum([
  "draft",
  "ready",
  "exported",
  "scheduled",
  "published",
  "archived",
]);

export const bedtimeStorySlideSchema = z.object({
  slide_number: z.number().int().min(1).max(99),
  text: localizedTextSchema,
  illustration_prompt: z.string().trim().min(1, "illustration_prompt is required."),
  stamp_prompt: z.string().trim().optional().default(""),
  marker_prompt: z.string().trim().optional().default(""),
  image_url: z.string().trim().optional().default(""),
  layers: z.array(z.record(z.string(), z.unknown())).default([]),
});

export const bedtimeStoryAssetSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.enum(["stamp", "marker"]),
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  path: z.string().trim().min(1),
  created_at: z.string().trim().min(1),
});

export const bedtimeStoryPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase latin letters, numbers, and hyphens."),
  status: bedtimeStoryStatusSchema.default("draft"),
  title: localizedTextSchema,
  emotional_theme: optionalLocalizedTextSchema.default({ en: "", ru: "", he: "" }),
  full_json: z.record(z.string(), z.unknown()).default({}),
  slides: z
    .array(bedtimeStorySlideSchema)
    .min(1, "Bedtime story must contain at least 1 slide.")
    .max(10, "Instagram carousel supports up to 10 slides."),
  images: z.record(z.string(), z.string()).default({}),
  cover_image_url: nullableUrlSchema,
  instagram_caption: optionalLocalizedTextSchema.default({ en: "", ru: "", he: "" }),
  instagram_hashtags: stringArraySchema,
  collection_tags: stringArraySchema,
  visual_tags: stringArraySchema,
  stamp_assets: z.array(bedtimeStoryAssetSchema).default([]),
  marker_assets: z.array(bedtimeStoryAssetSchema).default([]),
  exported_image_urls: z.record(z.string(), z.string()).default({}),
  publish_date: z.string().trim().nullable().optional().default(null),
  is_published: z.boolean().default(false),
});

export const bedtimeStoryRecordSchema = bedtimeStoryPayloadSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export type BedtimeStoryStatus = z.infer<typeof bedtimeStoryStatusSchema>;
export type BedtimeStorySlide = z.infer<typeof bedtimeStorySlideSchema>;
export type BedtimeStoryAsset = z.infer<typeof bedtimeStoryAssetSchema>;
export type BedtimeStoryPayload = z.infer<typeof bedtimeStoryPayloadSchema>;
export type BedtimeStoryRecord = z.infer<typeof bedtimeStoryRecordSchema>;

export type BedtimeStoryListItem = {
  id: string;
  slug: string;
  status: BedtimeStoryStatus;
  title: Record<BedtimeStoryLanguage, string>;
  publish_date: string | null;
  is_published: boolean;
  slides: BedtimeStorySlide[];
  created_at: string | null;
  updated_at: string | null;
};
