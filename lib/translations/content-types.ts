export const TRANSLATION_CONTENT_TYPES = [
  "lesson",
  "map_story",
  "artwork",
  "book",
  "story_template",
  "story_submission",
  "parrot_music_style",
] as const;

export type TranslationContentType = (typeof TRANSLATION_CONTENT_TYPES)[number];

export function isTranslationContentType(value: unknown): value is TranslationContentType {
  return typeof value === "string" && TRANSLATION_CONTENT_TYPES.includes(value as TranslationContentType);
}
