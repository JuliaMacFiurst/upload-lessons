import { z } from "zod";
import { slugifyRu } from "../books/slugify-ru";

export const ARTWORK_CATEGORY_OPTIONS = [
  "cartoon-characters",
  "kawaii",
  "nature-scenes",
  "botanical",
  "desserts",
  "zodiac",
  "faces",
  "outfits",
  "mandala",
  "motion",
  "dinosaurs",
  "animals",
  "memes",
  "anime-faces",
  "hands",
  "cityscapes",
] as const;

export type ArtworkCategory = (typeof ARTWORK_CATEGORY_OPTIONS)[number];

export const artworkEditorSchema = z.object({
  title: z.string().trim().min(1, "Artist name is required.").max(160),
  artist: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain lowercase latin letters, numbers, and hyphens."),
  description: z.string().trim().max(2000).optional().nullable(),
  category_slug: z.enum(ARTWORK_CATEGORY_OPTIONS),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  image_url: z.array(z.string().url()).max(50),
});

export const artworkRecordSchema = artworkEditorSchema.extend({
  id: z.string().uuid(),
});

export type ArtworkEditorInput = z.infer<typeof artworkEditorSchema>;
export type ArtworkRecord = z.infer<typeof artworkRecordSchema>;

export type ArtworkListItem = {
  id: string;
  title: string;
  artist: string;
  description: string | null;
  category_slug: ArtworkCategory;
  tags: string[];
  image_url: string[];
};

export function normalizeArtworkSlug(value: string) {
  const source = value.trim().toLowerCase();
  const transliterated = slugifyRu(source);

  return transliterated
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "artist";
}

export function parseArtworkTags(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
