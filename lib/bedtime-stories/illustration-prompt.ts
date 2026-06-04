export const BEDTIME_STORY_ILLUSTRATION_TECHNICAL_SUFFIX =
  "asymmetrical composition, illustration occupies only the left side, large untouched blank watercolor paper space on the right side for text, vertical 4:5 aspect ratio";

export function withBedtimeStoryIllustrationTechnicalSuffix(prompt: string): string {
  const normalizedPrompt = prompt.trim().replace(/[\s,.;:]+$/, "");

  if (normalizedPrompt.toLowerCase().endsWith(BEDTIME_STORY_ILLUSTRATION_TECHNICAL_SUFFIX.toLowerCase())) {
    return normalizedPrompt;
  }

  return `${normalizedPrompt}, ${BEDTIME_STORY_ILLUSTRATION_TECHNICAL_SUFFIX}`;
}
