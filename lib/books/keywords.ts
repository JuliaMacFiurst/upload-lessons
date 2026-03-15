export function parseKeywords(input: string): string[] {
  return [...new Set(
    input
      .split(/[\s,]+/g)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

export function formatKeywords(keywords: string[]): string {
  return keywords.join(", ");
}
