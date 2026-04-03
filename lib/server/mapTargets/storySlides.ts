import {
  sanitizeMapStoryContent,
  sanitizeMapStoryText,
} from "@/lib/server/mapTargets/sanitizeMapStoryContent";

function splitIntoSentences(content: string): string[] {
  return content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function splitMapStoryIntoSlideTexts(content: string): string[] {
  const sanitizedContent = sanitizeMapStoryContent(content);

  if (!sanitizedContent) {
    return [];
  }

  const lines = sanitizedContent
    .split("\n")
    .map((line) => sanitizeMapStoryText(line))
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  const sentences = splitIntoSentences(sanitizedContent);
  const slides: string[] = [];

  for (let index = 0; index < sentences.length; index += 2) {
    const text = sentences.slice(index, index + 2).join(" ").trim();
    if (text) {
      slides.push(sanitizeMapStoryText(text));
    }
  }

  return slides;
}

export function countMapStorySlides(content: string | null | undefined): number {
  return typeof content === "string" ? splitMapStoryIntoSlideTexts(content).length : 0;
}
