export type ScriptValidationLanguage = "en" | "he";

export type TranslationScriptIssue = {
  language: ScriptValidationLanguage;
  path: string;
  message: string;
  fragment?: string;
  unexpectedScript?: "Cyrillic" | "Hebrew" | "Arabic" | "Latin" | "non-Hebrew";
};

type TextEntry = { path: string; value: string };

function isTechnicalKey(key: string): boolean {
  return key === "id" ||
    key === "slug" ||
    key === "content_type" ||
    key === "language" ||
    key === "source_hash" ||
    key === "mode_slug" ||
    key.endsWith("_id") ||
    key.endsWith("_key");
}

function joinPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return parent ? `${parent}.${key}` : key;
}

function collectTextEntries(value: unknown, path: string, entries: TextEntry[]): void {
  if (typeof value === "string") {
    entries.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectTextEntries(child, joinPath(path, index), entries));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    if (!isTechnicalKey(key)) collectTextEntries(child, joinPath(path, key), entries);
  });
}

function issueForMatch(
  language: ScriptValidationLanguage,
  entry: TextEntry,
  match: RegExpMatchArray,
  unexpectedScript: TranslationScriptIssue["unexpectedScript"],
  message: string,
): TranslationScriptIssue {
  return { language, path: entry.path, fragment: match[0], unexpectedScript, message };
}

export function findTranslationScriptIssues(
  payload: unknown,
  language: ScriptValidationLanguage,
  rootPath = "",
): TranslationScriptIssue[] {
  const entries: TextEntry[] = [];
  collectTextEntries(payload, rootPath, entries);
  const text = entries.map((entry) => entry.value).join("\n");
  const cyrillicIssues = entries.flatMap((entry) => {
    const match = entry.value.match(/[\p{Script=Cyrillic}]+/u);
    return match
      ? [issueForMatch(language, entry, match, "Cyrillic", `${language.toUpperCase()} translation contains unexpected Cyrillic text: “${match[0]}”.`)]
      : [];
  });

  if (language === "en") {
    const issues: TranslationScriptIssue[] = [...cyrillicIssues];
    for (const entry of entries) {
      const hebrew = entry.value.match(/[\p{Script=Hebrew}]+/u);
      if (hebrew) issues.push(issueForMatch(language, entry, hebrew, "Hebrew", `English translation contains unexpected Hebrew text: “${hebrew[0]}”.`));
    }
    if (!/\p{Script=Latin}/u.test(text)) {
      issues.push({ language, path: rootPath, message: "English translation contains no Latin text." });
    }
    return issues;
  }

  if (cyrillicIssues.length > 0) return cyrillicIssues;
  if (!/\p{Script=Hebrew}/u.test(text)) {
    return [{ language, path: rootPath, message: "Hebrew translation contains no Hebrew text." }];
  }

  const issues: TranslationScriptIssue[] = [];
  for (const entry of entries) {
    const words = entry.value.match(/[\p{Letter}]+/gu) ?? [];
    for (const word of words) {
      if (!Array.from(word).some((character) => /\p{Letter}/u.test(character) && !/\p{Script=Hebrew}/u.test(character))) continue;
      const script = /\p{Script=Arabic}/u.test(word)
        ? "Arabic"
        : /\p{Script=Latin}/u.test(word)
          ? "Latin"
          : /\p{Script=Cyrillic}/u.test(word)
            ? "Cyrillic"
            : "non-Hebrew";
      issues.push({
        language,
        path: entry.path,
        fragment: word,
        unexpectedScript: script,
        message: `Hebrew translation contains unexpected ${script} letters: “${word}”. Only Hebrew letters are allowed.`,
      });
    }
  }
  return issues;
}

export function validateTranslationScripts(payload: unknown, language: ScriptValidationLanguage): void {
  const issue = findTranslationScriptIssues(payload, language)[0];
  if (issue) throw new Error(issue.message);
}
