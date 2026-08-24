import assert from "node:assert/strict";
import test from "node:test";
import {
  extractBookSeedFromImportedJson,
  extractImportedBookCategories,
  extractImportedBookTranslations,
  mergeCategoryTranslations,
  previewImportedBookJson,
  validateImportedBookScripts,
} from "../lib/books/book-json-import.ts";

const multilingualBook = JSON.stringify({
  title: "Солярис",
  slug: "solaris",
  author: "Станислав Лем",
  description: "Роман о контакте.",
  categories: [{
    slug: "science-fiction",
    name: "Научная фантастика",
    translations: { ru: "Научная фантастика", en: "Science fiction", he: "מדע בדיוני" },
    group_key: "speculative",
  }],
  plot_slides: ["Океан отвечает людям."],
  characters_slides: ["Крис Кельвин."],
  idea_slides: ["Границы понимания."],
  philosophy_slides: ["Что значит иной разум?"],
  conflicts_slides: ["Человек против неизвестного."],
  author_message_slides: ["Не всё можно понять."],
  ending_meaning_slides: ["Контакт остаётся открытым."],
  book_in_20_sec_slides: ["Зеркало человечества."],
  test: { title: "Тест", questions: [{ question: "Где действие?", options: ["Солярис", "Земля", "Марс"], correct_answer: 1 }] },
  translations: {
    en: {
      title: "Solaris", description: "A novel about contact.",
      plot_slides: ["The ocean responds."], characters_slides: ["Kris Kelvin."], idea_slides: ["Limits of understanding."],
      philosophy_slides: ["What is alien intelligence?"], conflicts_slides: ["Humanity versus the unknown."],
      author_message_slides: ["Not everything can be understood."], ending_meaning_slides: ["Contact remains open."],
      book_in_20_sec_slides: ["A mirror for humanity."],
      tests: [{ title: "Quiz", questions: [{ question: "Where?", answers: [{ text: "Solaris", correct: true }] }] }],
    },
    he: {
      title: "סולאריס", description: "רומן על מפגש.",
      plot_slides: ["האוקיינוס משיב."], characters_slides: ["קריס קלווין."], idea_slides: ["גבולות ההבנה."],
      philosophy_slides: ["מהי תבונה זרה?"], conflicts_slides: ["האדם מול הלא נודע."],
      author_message_slides: ["לא הכול ניתן להבנה."], ending_meaning_slides: ["המפגש נשאר פתוח."],
      book_in_20_sec_slides: ["מראה לאנושות."],
      tests: [{ title: "מבחן", questions: [{ question: "איפה?", answers: [{ text: "סולאריס", correct: true }] }] }],
    },
  },
});

test("valid multilingual JSON exposes one canonical book and complete RU/EN/HE preview", () => {
  assert.deepEqual(extractBookSeedFromImportedJson(multilingualBook), { title: "Солярис", author: "Станислав Лем", slug: "solaris" });
  const preview = previewImportedBookJson(multilingualBook);
  assert.equal(preview.languages.ru.complete, true);
  assert.equal(preview.languages.en.complete, true);
  assert.equal(preview.languages.he.complete, true);
  assert.equal(preview.categories[0].translations.he, "מדע בדיוני");
  assert.equal(preview.canSubmit, true);
  assert.deepEqual(preview.scriptIssues, []);
});

test("Books script validation reports exact nested paths and blocks preview", () => {
  const broken = JSON.parse(multilingualBook);
  broken.translations.he.plot_slides[0] = "האוקיינוס هي משיב";
  broken.translations.en.tests[0].questions[0].answers[0].text = "Солярис";
  broken.categories[0].translations.he = "ספרות فנטזיה";
  const preview = previewImportedBookJson(JSON.stringify(broken));
  assert.equal(preview.canSubmit, false);
  assert.ok(preview.scriptIssues.some((issue) => issue.path === "translations.he.plot_slides[0]" && issue.unexpectedScript === "Arabic"));
  assert.ok(preview.scriptIssues.some((issue) => issue.path === "translations.en.tests[0].questions[0].answers[0].text" && issue.unexpectedScript === "Cyrillic"));
  assert.ok(preview.scriptIssues.some((issue) => issue.path === "categories[0].translations.he" && issue.unexpectedScript === "Arabic"));
});

test("nested Hebrew question and answer contamination keep their precise paths", () => {
  const broken = JSON.parse(multilingualBook);
  broken.translations.he.tests[0].questions[0].question = "איפה يكون?";
  broken.translations.he.tests[0].questions[0].answers[0].text = "סולאריס هنا";
  const paths = validateImportedBookScripts(JSON.stringify(broken)).map((issue) => issue.path);
  assert.ok(paths.includes("translations.he.tests[0].questions[0].question"));
  assert.ok(paths.includes("translations.he.tests[0].questions[0].answers[0].text"));
});

test("punctuation, numbers and emoji remain allowed; technical identifiers retain shared behavior", () => {
  const valid = JSON.parse(multilingualBook);
  valid.translations.he.description = "סיפור 2026 — גיל 10–14! 🦫 (100%)";
  valid.translations.he.mode_slug = "GPT-AI-v2";
  assert.deepEqual(validateImportedBookScripts(JSON.stringify(valid)), []);
});

test("completeness preview names missing translated sections and tests", () => {
  const incomplete = JSON.parse(multilingualBook);
  delete incomplete.translations.he.philosophy_slides;
  delete incomplete.translations.en.tests;
  const preview = previewImportedBookJson(JSON.stringify(incomplete));
  assert.equal(preview.languages.he.complete, false);
  assert.ok(preview.languages.he.missing.includes("philosophy_slides"));
  assert.ok(preview.languages.en.missing.includes("tests"));
});

test("canonical Russian stays backward compatible because shared Translations validation has no RU policy", () => {
  const legacy = JSON.stringify({ title: "Русская книга", description: "Текст 2026!", categories: ["Фэнтези"] });
  const preview = previewImportedBookJson(legacy);
  assert.equal(preview.canSubmit, true);
  assert.deepEqual(preview.scriptIssues, []);
});

test("category taxonomy fields and translated book content are preserved", () => {
  const category = extractImportedBookCategories(multilingualBook)[0];
  assert.equal(category.slug, "science-fiction");
  assert.equal(category.group_key, "speculative");
  assert.equal(category.translations.en, "Science fiction");
  assert.equal(extractImportedBookTranslations(multilingualBook).he?.title, "סולאריס");
  assert.equal(extractImportedBookTranslations(multilingualBook).he?.sections?.[0].slides[0].text, "האוקיינוס משיב.");
});

test("missing group defaults to other and legacy category strings remain accepted", () => {
  const [category] = extractImportedBookCategories(JSON.stringify({ title: "X", categories: ["Фэнтези"] }));
  assert.equal(category.group_key, "other");
  assert.deepEqual(category.translations, { ru: "Фэнтези" });
});

test("existing non-empty translations win while missing values are backfilled", () => {
  assert.deepEqual(
    mergeCategoryTranslations({ ru: "Фантастика", en: "Existing English" }, { ru: "Плохая замена", en: "New", he: "מדע בדיוני" }),
    { ru: "Фантастика", en: "Existing English", he: "מדע בדיוני" },
  );
});

test("malformed translations, malformed category, invalid group and duplicate slugs are rejected", () => {
  assert.throws(() => previewImportedBookJson(JSON.stringify({ title: "X", categories: [{ name: "A", translations: [] }] })), /translations/);
  assert.throws(() => previewImportedBookJson(JSON.stringify({ title: "X", categories: [42] })), /строкой или объектом/);
  assert.throws(() => previewImportedBookJson(JSON.stringify({ title: "X", categories: [{ name: "A", group_key: "bad" }] })), /group_key/);
  assert.throws(() => previewImportedBookJson(JSON.stringify({ title: "X", categories: [{ name: "A", slug: "same" }, { name: "B", slug: "same" }] })), /повторяющиеся/);
});
