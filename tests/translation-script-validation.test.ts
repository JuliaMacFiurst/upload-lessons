import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findTranslationScriptIssues,
  validateTranslationScripts,
} from "../lib/translations/script-validation.ts";

test("Translations import and Books importer reuse the same shared validator", () => {
  const translationsSource = readFileSync(new URL("../lib/server/human-translation-import.ts", import.meta.url), "utf8");
  const booksSource = readFileSync(new URL("../lib/books/book-json-import.ts", import.meta.url), "utf8");
  assert.match(translationsSource, /translations\/script-validation\.ts/);
  assert.match(booksSource, /translations\/script-validation\.ts/);
  assert.doesNotMatch(booksSource, /Script=Arabic/);
});

test("valid English and Hebrew are accepted", () => {
  assert.doesNotThrow(() => validateTranslationScripts({ title: "Solaris", description: "A story in 2026!" }, "en"));
  assert.doesNotThrow(() => validateTranslationScripts({ title: "סולאריס", description: "סיפור בשנת 2026! 🦫" }, "he"));
});

test("Hebrew Arabic contamination is blocking and exposes path and fragment", () => {
  const [issue] = findTranslationScriptIssues({ slides: [{ text: "סיפור جميل" }] }, "he", "translations.he");
  assert.equal(issue.path, "translations.he.slides[0].text");
  assert.equal(issue.unexpectedScript, "Arabic");
  assert.equal(issue.fragment, "جميل");
  assert.throws(() => validateTranslationScripts({ text: "סיפור جميل" }, "he"), /Arabic letters/);
});

test("English rejects Cyrillic and Hebrew using existing rules", () => {
  const issues = findTranslationScriptIssues({ title: "Solaris", description: "Описание ציור" }, "en", "translations.en");
  assert.ok(issues.some((issue) => issue.unexpectedScript === "Cyrillic"));
  assert.ok(issues.some((issue) => issue.unexpectedScript === "Hebrew"));
});

test("Hebrew punctuation, numbers and emoji pass while ordinary Latin words retain existing rejection", () => {
  assert.deepEqual(findTranslationScriptIssues({ text: "סיפור 2026 — 10–14?! 🦫", mode_slug: "GPT-AI" }, "he"), []);
  assert.equal(findTranslationScriptIssues({ text: "סיפור GPT" }, "he")[0].unexpectedScript, "Latin");
});
