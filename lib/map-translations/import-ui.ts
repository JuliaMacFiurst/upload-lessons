export const MAP_TRANSLATION_TEXTAREA_MIN_HEIGHT = 140;
export const MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT = 620;

export type MapTranslationImportState = "empty" | "dirty" | "validating" | "valid" | "invalid";

export function calculateMapTranslationTextareaHeight(
  scrollHeight: number,
  minHeight = MAP_TRANSLATION_TEXTAREA_MIN_HEIGHT,
  maxHeight = MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT,
): number {
  return Math.min(Math.max(scrollHeight, minHeight), maxHeight);
}

export function getMapTranslationImportState(params: {
  jsonInput: string;
  validating: boolean;
  validationValid: boolean | null;
  validatedJson: string | null;
}): MapTranslationImportState {
  if (!params.jsonInput) return "empty";
  if (params.validating) return "validating";
  if (params.validatedJson !== params.jsonInput || params.validationValid === null) return "dirty";
  return params.validationValid ? "valid" : "invalid";
}

export function canUploadMapTranslations(state: MapTranslationImportState, uploading: boolean): boolean {
  return state === "valid" && !uploading;
}

export function findMapTranslationIssueSelection(params: {
  json: string;
  contentId: string | null;
  language?: "en" | "he";
  fragment?: string;
}): { start: number; end: number } | null {
  if (!params.contentId || !params.language || !params.fragment) return null;
  const contentIdToken = `"content_id": ${JSON.stringify(params.contentId)}`;
  const itemStart = params.json.indexOf(contentIdToken);
  if (itemStart < 0) return null;
  const nextItem = params.json.indexOf('"content_id":', itemStart + contentIdToken.length);
  const itemEnd = nextItem < 0 ? params.json.length : nextItem;
  const languageStart = params.json.indexOf(`"${params.language}"`, itemStart);
  if (languageStart < 0 || languageStart >= itemEnd) return null;
  const contentStart = params.json.indexOf('"content"', languageStart);
  if (contentStart < 0 || contentStart >= itemEnd) return null;
  const escapedFragment = JSON.stringify(params.fragment).slice(1, -1);
  const fragmentStart = params.json.indexOf(escapedFragment, contentStart);
  if (fragmentStart < 0 || fragmentStart >= itemEnd) return null;
  return { start: fragmentStart, end: fragmentStart + escapedFragment.length };
}
