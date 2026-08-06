export type PreWriteValidationResult = {
  isValid: boolean;
  stopId?: "STOP-LANG-01";
  offendingTokens: string[];
  excerpts: string[];
  message?: string;
};

/**
 * Standard default allowlist for Latin tokens in Russian content.
 * Can be extended explicitly per contract/type rules.
 */
export const DEFAULT_LATIN_ALLOWLIST: string[] = [
  "GPS",
  "UNESCO",
  "UTC",
  "UNESCO-MAB",
  "km",
  "m",
  "cm",
  "mm",
];

/**
 * Checks Russian content for unauthorized Latin tokens (STOP-LANG-01).
 * Supports explicit allowlist.
 */
export function validateRussianLanguagePurity(
  content: string,
  customAllowlist: string[] = []
): PreWriteValidationResult {
  const allowlistSet = new Set(
    [...DEFAULT_LATIN_ALLOWLIST, ...customAllowlist].map((t) => t.toLowerCase())
  );

  // Extract words containing at least one Latin character [a-zA-Z]
  // Handles punctuation surrounding words cleanly
  const latinWordRegex = /[a-zA-Zа-яА-ЯёЁ]*[a-zA-Z]+[a-zA-Zа-яА-ЯёЁ]*/gu;
  const matches = Array.from(content.matchAll(latinWordRegex));

  const offendingTokens: string[] = [];
  const excerpts: string[] = [];

  for (const match of matches) {
    const rawToken = match[0];
    const index = match.index ?? 0;

    // Clean leading/trailing non-alphanumeric punctuation
    const cleanedToken = rawToken.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!cleanedToken) continue;

    if (!allowlistSet.has(cleanedToken.toLowerCase())) {
      offendingTokens.push(cleanedToken);

      // Extract 25-char context snippet around the token
      const start = Math.max(0, index - 15);
      const end = Math.min(content.length, index + rawToken.length + 15);
      const snippet = content.slice(start, end).replace(/\n/g, " ");
      excerpts.push(`"...${snippet}..."`);
    }
  }

  if (offendingTokens.length > 0) {
    const uniqueTokens = Array.from(new Set(offendingTokens));
    return {
      isValid: false,
      stopId: "STOP-LANG-01",
      offendingTokens: uniqueTokens,
      excerpts,
      message: `[STOP-LANG-01] Russian content contains unauthorized Latin tokens: ${uniqueTokens
        .map((t) => `"${t}"`)
        .join(", ")}. Context snippets: ${excerpts.join("; ")}`,
    };
  }

  return {
    isValid: true,
    offendingTokens: [],
    excerpts: [],
  };
}
