import type {
  BookCategoryGroupKey,
  BookEditorPayload,
  BookEditorResponse,
  CategoryOption,
} from "./types.ts";
import { slugifyRu } from "./slugify-ru.ts";
import {
  findTranslationScriptIssues,
  type TranslationScriptIssue,
} from "../translations/script-validation.ts";

const SECTION_IMPORT_KEYS = {
  plot: "plot_slides",
  characters: "characters_slides",
  main_idea: "idea_slides",
  philosophy: "philosophy_slides",
  conflicts: "conflicts_slides",
  author_message: "author_message_slides",
  ending_meaning: "ending_meaning_slides",
  twenty_seconds: "book_in_20_sec_slides",
} as const;

const BOOK_CATEGORY_GROUP_KEYS: readonly BookCategoryGroupKey[] = [
  "literature", "speculative", "mystery", "classic-history", "ideas", "audience", "other",
];

type SectionSlug = keyof typeof SECTION_IMPORT_KEYS;

type LooseRecord = Record<string, unknown>;
export type ImportedCategory = {
  name: string;
  slug?: string;
  translations: Partial<Record<"ru" | "en" | "he", string>>;
  group_key: BookCategoryGroupKey;
  sort_order?: number;
  is_published?: boolean;
};

export type ImportedBookPreview = {
  title: string;
  slug: string;
  languages: Record<"ru" | "en" | "he", { complete: boolean; missing: string[] }>;
  categories: ImportedCategory[];
  warnings: string[];
  scriptIssues: TranslationScriptIssue[];
  canSubmit: boolean;
};

export function mergeCategoryTranslations(
  existing: Partial<Record<"ru" | "en" | "he", string>> | null | undefined,
  incoming: Partial<Record<"ru" | "en" | "he", string>>,
) {
  return Object.fromEntries(
    Object.entries({ ...incoming, ...(existing ?? {}) })
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && Boolean(entry[1].trim()))
      .map(([language, label]) => [language, label.trim()]),
  ) as Partial<Record<"ru" | "en" | "he", string>>;
}
export type ImportedBookTranslationPayload = {
  title?: string;
  author?: string | null;
  description?: string | null;
  categories?: string[];
  sections?: Array<{
    mode_slug: string;
    slides: Array<{ text: string }>;
  }>;
  tests?: Array<{
    title: string;
    questions: Array<{
      question: string;
      answers: Array<{ text: string; correct: boolean }>;
    }>;
  }>;
};

const IGNORED_CATEGORY_LABELS = new Set([
  "детская",
  "детская литература",
  "детские книги",
  "книга для детей",
  "книги для детей",
]);

const CATEGORY_STEM_ALIASES: Record<string, string[]> = {
  приключения: ["приключ"],
  приключенческая: ["приключ"],
  фэнтези: ["фэнт", "fantasy"],
  фантастика: ["фантаст", "sci-fi", "scifi"],
  классика: ["классик"],
  философия: ["философ"],
  детектив: ["детектив"],
  сказка: ["сказ"],
  драма: ["драм"],
  роман: ["роман"],
};

function asRecord(value: unknown, label: string): LooseRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} должен быть объектом.`);
  }
  return value as LooseRecord;
}

function hasOwn(record: LooseRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readOptionalString(record: LooseRecord, key: string): string | null | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }

  const value = record[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`Поле \`${key}\` должно быть строкой.`);
  }
  return value.trim();
}

function readOptionalNumber(record: LooseRecord, key: string): number | null | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }

  const value = record[key];
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  throw new Error(`Поле \`${key}\` должно быть числом.`);
}

function readStringArray(record: LooseRecord, key: string): string[] | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }

  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Поле \`${key}\` должно быть массивом строк.`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`Элемент \`${key}[${index}]\` должен быть непустой строкой.`);
    }
    return item.trim();
  });
}

function readImportedCategories(record: LooseRecord, key: string): ImportedCategory[] | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }

  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Поле \`${key}\` должно быть массивом строк или объектов категорий.`);
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name) {
        throw new Error(`Элемент \`${key}[${index}]\` должен быть непустой строкой.`);
      }
      return { name, translations: { ru: name }, group_key: "other" };
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Элемент \`${key}[${index}]\` должен быть строкой или объектом.`);
    }

    const categoryRecord = item as LooseRecord;
    const name =
      readOptionalString(categoryRecord, "name") ??
      readOptionalString(categoryRecord, "label") ??
      readOptionalString(categoryRecord, "title") ??
      readOptionalString(categoryRecord, "ru");

    if (!name) {
      throw new Error(`Поле \`${key}[${index}].name\` обязательно.`);
    }

    let translationsRecord: LooseRecord | undefined;
    if (hasOwn(categoryRecord, "translations")) {
      if (!categoryRecord.translations || typeof categoryRecord.translations !== "object" || Array.isArray(categoryRecord.translations)) {
        throw new Error(`Поле \`${key}[${index}].translations\` должно быть объектом { ru, en, he }.`);
      }
      translationsRecord = categoryRecord.translations as LooseRecord;
      const unknownLanguages = Object.keys(translationsRecord).filter((language) => !["ru", "en", "he"].includes(language));
      if (unknownLanguages.length > 0) {
        throw new Error(`Поле \`${key}[${index}].translations\` содержит неподдерживаемые языки: ${unknownLanguages.join(", ")}.`);
      }
    }

    const ru = (translationsRecord ? readOptionalString(translationsRecord, "ru") : undefined) ?? name;
    const en =
      (translationsRecord ? readOptionalString(translationsRecord, "en") : undefined) ??
      readOptionalString(categoryRecord, "en") ??
      undefined;
    const he =
      (translationsRecord ? readOptionalString(translationsRecord, "he") : undefined) ??
      readOptionalString(categoryRecord, "he") ??
      undefined;

    const rawSlug = readOptionalString(categoryRecord, "slug");
    const slug = rawSlug ? slugifyRu(rawSlug) : undefined;
    if (rawSlug && !slug) {
      throw new Error(`Поле \`${key}[${index}].slug\` должно содержать допустимый canonical slug.`);
    }

    const rawGroupKey = readOptionalString(categoryRecord, "group_key") ?? "other";
    if (!BOOK_CATEGORY_GROUP_KEYS.includes(rawGroupKey as BookCategoryGroupKey)) {
      throw new Error(`Поле \`${key}[${index}].group_key\` должно быть одним из: ${BOOK_CATEGORY_GROUP_KEYS.join(", ")}.`);
    }

    const sortOrder = readOptionalNumber(categoryRecord, "sort_order");
    const rawPublished = categoryRecord.is_published;
    if (rawPublished !== undefined && typeof rawPublished !== "boolean") {
      throw new Error(`Поле \`${key}[${index}].is_published\` должно быть boolean.`);
    }

    return {
      name,
      ...(slug ? { slug } : {}),
      translations: { ru, ...(en ? { en } : {}), ...(he ? { he } : {}) },
      group_key: rawGroupKey as BookCategoryGroupKey,
      ...(sortOrder !== undefined && sortOrder !== null ? { sort_order: sortOrder } : {}),
      ...(typeof rawPublished === "boolean" ? { is_published: rawPublished } : {}),
    };
  });
}

function parseKeywords(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return [...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function readImportedKeywords(record: LooseRecord) {
  if (!hasOwn(record, "keywords")) return undefined;
  if (Array.isArray(record.keywords)) return readStringArray(record, "keywords");
  return parseKeywords(readOptionalString(record, "keywords"));
}

function normalizeLookupValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function parseReadingTime(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== "string") {
    throw new Error("Поле `reading_time` должно быть строкой или числом.");
  }

  const normalized = value.trim().toLowerCase().replace(/[–—]/g, "-").replace(",", ".");
  if (!normalized) {
    return null;
  }

  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((item) => Number(item[0]));
  if (numbers.length === 0) {
    throw new Error("Не удалось распознать `reading_time`.");
  }

  const baseValue =
    numbers.length >= 2 && normalized.includes("-")
      ? (numbers[0] + numbers[1]) / 2
      : numbers[0];

  if (normalized.includes("час")) {
    return Math.round(baseValue * 60);
  }
  if (normalized.includes("мин")) {
    return Math.round(baseValue);
  }

  return Math.round(baseValue);
}

function resolveCategoryIds(categoryLabels: string[], categories: CategoryOption[]) {
  const categoryLookup = new Map<string, string>();
  const categoryEntries: Array<{ id: string; haystacks: string[] }> = [];

  categories.forEach((category) => {
    const normalizedName = normalizeLookupValue(category.name);
    const normalizedSlug = normalizeLookupValue(category.slug);
    const normalizedRuSlug = normalizeLookupValue(slugifyRu(category.name));

    categoryLookup.set(normalizedName, category.id);
    categoryLookup.set(normalizedSlug, category.id);
    categoryLookup.set(normalizedRuSlug, category.id);
    categoryEntries.push({
      id: category.id,
      haystacks: [normalizedName, normalizedSlug, normalizedRuSlug],
    });
  });

  const normalizedLabels = categoryLabels
    .map((label) => ({ original: label, normalized: normalizeLookupValue(label) }))
    .filter((item) => !IGNORED_CATEGORY_LABELS.has(item.normalized));

  const ids = normalizedLabels.map(({ original, normalized }) => {
    const directMatch = (
      categoryLookup.get(normalized) ??
      categoryLookup.get(normalizeLookupValue(slugifyRu(original)))
    );
    if (directMatch) {
      return directMatch;
    }

    const stems = CATEGORY_STEM_ALIASES[normalized] ?? [];
    if (stems.length === 0) {
      return undefined;
    }

    return categoryEntries.find((entry) => stems.some((stem) => entry.haystacks.some((haystack) => haystack.includes(stem))))?.id;
  });

  return [...new Set(ids.filter((item): item is string => Boolean(item)))];
}

function mapImportedSlides(raw: LooseRecord, key: string) {
  const slides = readStringArray(raw, key);
  if (slides === undefined) {
    return undefined;
  }

  return slides.map((text) => ({ text }));
}

function readImportedTranslationRecord(record: LooseRecord, language: "en" | "he"): LooseRecord | null {
  const translations = record.translations;
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    return null;
  }

  const translation = (translations as LooseRecord)[language];
  if (!translation || typeof translation !== "object" || Array.isArray(translation)) {
    return null;
  }

  return translation as LooseRecord;
}

function mapImportedTest(current: BookEditorResponse["tests"], value: unknown): BookEditorPayload["tests"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return [];
  }

  const record = asRecord(value, "Поле `test`");
  const title = readOptionalString(record, "title");
  if (!title) {
    throw new Error("Поле `test.title` обязательно.");
  }

  const description = readOptionalString(record, "description");
  const questions = record.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Поле `test.questions` должно содержать хотя бы один вопрос.");
  }

  const firstExistingTest = current[0];
  const quiz = questions.map((item, questionIndex) => {
    const questionRecord = asRecord(item, `Вопрос test.questions[${questionIndex}]`);
    const question = readOptionalString(questionRecord, "question");
    if (!question) {
      throw new Error(`Поле \`test.questions[${questionIndex}].question\` обязательно.`);
    }

    const options = readStringArray(questionRecord, "options");
    if (!options || options.length < 3 || options.length > 4) {
      throw new Error(`Вопрос \`${question}\` должен иметь от 3 до 4 вариантов ответа.`);
    }

    const rawCorrectAnswer = questionRecord.correct_answer ?? questionRecord.correctAnswerIndex;
    if (typeof rawCorrectAnswer !== "number" || !Number.isInteger(rawCorrectAnswer)) {
      throw new Error(`Поле \`test.questions[${questionIndex}].correct_answer\` должно быть целым числом.`);
    }

    const normalizedIndex =
      questionRecord.correct_answer !== undefined
        ? rawCorrectAnswer - 1
        : rawCorrectAnswer;

    if (normalizedIndex < 0 || normalizedIndex >= options.length) {
      throw new Error(`Неверный правильный ответ в вопросе \`${question}\`.`);
    }

    return {
      question,
      options,
      correctAnswerIndex: normalizedIndex,
    };
  });

  return [
    {
      id: firstExistingTest?.id,
      title,
      description: description ?? "",
      is_published: firstExistingTest?.is_published ?? false,
      sort_order: 0,
      quiz,
    },
  ];
}

function readTranslatedTests(value: unknown): ImportedBookTranslationPayload["tests"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return [];
  }

  const rawTests = Array.isArray(value) ? value : [value];

  return rawTests.map((item, testIndex) => {
    const testRecord = asRecord(item, `Поле tests[${testIndex}]`);
    const title = readOptionalString(testRecord, "title");
    if (!title) {
      throw new Error(`Поле \`tests[${testIndex}].title\` обязательно.`);
    }

    const rawQuestions = testRecord.questions;
    if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
      throw new Error(`Поле \`tests[${testIndex}].questions\` должно содержать хотя бы один вопрос.`);
    }

    return {
      title,
      questions: rawQuestions.map((questionItem, questionIndex) => {
        const questionRecord = asRecord(questionItem, `Поле tests[${testIndex}].questions[${questionIndex}]`);
        const question = readOptionalString(questionRecord, "question");
        if (!question) {
          throw new Error(`Поле \`tests[${testIndex}].questions[${questionIndex}].question\` обязательно.`);
        }

        const rawAnswers = questionRecord.answers;
        if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
          throw new Error(`Поле \`tests[${testIndex}].questions[${questionIndex}].answers\` должно содержать варианты ответов.`);
        }

        return {
          question,
          answers: rawAnswers.map((answerItem, answerIndex) => {
            const answerRecord = asRecord(
              answerItem,
              `Поле tests[${testIndex}].questions[${questionIndex}].answers[${answerIndex}]`,
            );
            const text = readOptionalString(answerRecord, "text");
            if (!text) {
              throw new Error(
                `Поле \`tests[${testIndex}].questions[${questionIndex}].answers[${answerIndex}].text\` обязательно.`,
              );
            }
            if (typeof answerRecord.correct !== "boolean") {
              throw new Error(
                `Поле \`tests[${testIndex}].questions[${questionIndex}].answers[${answerIndex}].correct\` должно быть boolean.`,
              );
            }

            return {
              text,
              correct: answerRecord.correct,
            };
          }),
        };
      }),
    };
  });
}

export function buildBookPayloadFromImportedJson(
  current: BookEditorResponse,
  rawJson: string,
): BookEditorPayload {
  const raw = parseImportedBookJson(rawJson);

  const importedTitle = readOptionalString(raw, "title");
  const importedSlug = readOptionalString(raw, "slug");
  const importedAuthor = readOptionalString(raw, "author");
  const importedDescription = readOptionalString(raw, "description");
  const importedAge = readOptionalString(raw, "age_group") ?? readOptionalString(raw, "age");
  const importedKeywords = readImportedKeywords(raw);
  const importedCategories = readImportedCategories(raw, "categories");
  const importedTest = mapImportedTest(current.tests, raw.test);
  const importedYear = readOptionalNumber(raw, "year");
  const importedReadingTime = parseReadingTime(raw.reading_time);
  const importedPublished = raw.is_published;
  if (importedPublished !== undefined && typeof importedPublished !== "boolean") {
    throw new Error("Поле `is_published` должно быть boolean.");
  }

  const nextTitle = importedTitle || current.book.title;
  const nextSlug = importedSlug ? slugifyRu(importedSlug) : current.book.slug || slugifyRu(nextTitle) || "book";

  return {
    book: {
      ...current.book,
      title: nextTitle,
      slug: nextSlug,
      author: importedAuthor !== undefined ? importedAuthor : current.book.author,
      year: importedYear !== undefined ? importedYear : current.book.year,
      description: importedDescription !== undefined ? importedDescription : current.book.description,
      keywords: importedKeywords ?? current.book.keywords,
      age_group: importedAge !== undefined ? importedAge : current.book.age_group,
      reading_time: importedReadingTime !== undefined ? importedReadingTime : current.book.reading_time,
      is_published: typeof importedPublished === "boolean" ? importedPublished : current.book.is_published,
    },
    categoryIds: importedCategories ? resolveCategoryIds(importedCategories.map((item) => item.name), current.categories) : current.categoryIds,
    explanations: current.explanations.map((explanation) => {
      const importKey = SECTION_IMPORT_KEYS[explanation.mode_slug as SectionSlug];
      if (!importKey) {
        return explanation;
      }

      const slides = mapImportedSlides(raw, importKey);
      return slides === undefined ? explanation : { ...explanation, slides };
    }),
    tests: importedTest ?? current.tests,
    storyTemplate: null,
  };
}

export function extractImportedBookCategories(rawJson: string): ImportedCategory[] {
  const raw = parseImportedBookJson(rawJson);
  return readImportedCategories(raw, "categories") ?? [];
}

export function extractImportedBookTranslations(rawJson: string): Partial<Record<"en" | "he", ImportedBookTranslationPayload>> {
  const raw = parseImportedBookJson(rawJson);
  const importedCategories = readImportedCategories(raw, "categories") ?? [];
  const byLanguage: Partial<Record<"en" | "he", ImportedBookTranslationPayload>> = {};

  for (const language of ["en", "he"] as const) {
    const translationRecord = readImportedTranslationRecord(raw, language);
    const categoryNames = importedCategories
      .map((category) => category.translations[language]?.trim() ?? "")
      .filter(Boolean);

    if (!translationRecord && categoryNames.length === 0) {
      continue;
    }

    const title = translationRecord ? readOptionalString(translationRecord, "title") : undefined;
    const author = translationRecord ? readOptionalString(translationRecord, "author") : undefined;
    const description = translationRecord ? readOptionalString(translationRecord, "description") : undefined;
    const explicitCategories = translationRecord ? readImportedCategories(translationRecord, "categories") : undefined;
    const translatedTests = translationRecord ? readTranslatedTests(translationRecord.tests) : undefined;
    const sections = translationRecord
      ? Object.entries(SECTION_IMPORT_KEYS).flatMap(([modeSlug, importKey]) => {
          const slides = mapImportedSlides(translationRecord, importKey);
          if (slides === undefined) {
            return [];
          }
          return [{ mode_slug: modeSlug, slides }];
        })
      : [];

    const payload: ImportedBookTranslationPayload = {};
    if (title !== undefined && title !== null) {
      payload.title = title;
    }
    if (author !== undefined) {
      payload.author = author;
    }
    if (description !== undefined) {
      payload.description = description;
    }

    const normalizedCategories = explicitCategories
      ? explicitCategories.map((category) => category.name)
      : categoryNames;
    if (normalizedCategories.length > 0) {
      payload.categories = normalizedCategories;
    }
    if (sections.length > 0) {
      payload.sections = sections;
    }
    if (translatedTests !== undefined) {
      payload.tests = translatedTests;
    }

    if (Object.keys(payload).length > 0) {
      byLanguage[language] = payload;
    }
  }

  return byLanguage;
}

function supportedTranslationForScriptValidation(
  record: LooseRecord,
  language: "en" | "he",
): LooseRecord {
  const supported: LooseRecord = {};
  for (const key of ["title", "author", "description"] as const) {
    const value = readOptionalString(record, key);
    if (value !== undefined && value !== null) supported[key] = value;
  }
  const categories = readImportedCategories(record, "categories");
  if (categories) supported.categories = categories.map((category) => category.name);
  for (const key of Object.values(SECTION_IMPORT_KEYS)) {
    const slides = readStringArray(record, key);
    if (slides) supported[key] = slides;
  }
  const tests = readTranslatedTests(record.tests);
  if (tests !== undefined) supported.tests = tests;
  return { translations: { [language]: supported } };
}

export function validateImportedBookScripts(rawJson: string): TranslationScriptIssue[] {
  const raw = parseImportedBookJson(rawJson);
  const categories = readImportedCategories(raw, "categories") ?? [];
  const issues: TranslationScriptIssue[] = [];

  for (const language of ["en", "he"] as const) {
    const translation = readImportedTranslationRecord(raw, language);
    const payload: LooseRecord = translation
      ? supportedTranslationForScriptValidation(translation, language)
      : { translations: { [language]: {} } };
    payload.categories = categories.map((category) => ({
      translations: { [language]: category.translations[language] },
    }));

    const hasLocalizedText = translation || categories.some((category) => Boolean(category.translations[language]));
    if (hasLocalizedText) issues.push(...findTranslationScriptIssues(payload, language));
  }
  return issues;
}

export function previewImportedBookJson(rawJson: string): ImportedBookPreview {
  const raw = parseImportedBookJson(rawJson);
  const title = readOptionalString(raw, "title");
  if (!title) throw new Error("Поле `title` обязательно для импорта книги.");
  const requestedSlug = readOptionalString(raw, "slug");
  const slug = requestedSlug ? slugifyRu(requestedSlug) : slugifyRu(title);
  if (!slug) throw new Error("Не удалось получить canonical `slug` книги.");

  const categories = readImportedCategories(raw, "categories") ?? [];
  const duplicateSlugs = categories
    .map((category) => category.slug ?? slugifyRu(category.name))
    .filter((value, index, values) => values.indexOf(value) !== index);
  if (duplicateSlugs.length > 0) {
    throw new Error(`Категории содержат повторяющиеся canonical slug: ${[...new Set(duplicateSlugs)].join(", ")}.`);
  }

  const warnings: string[] = [];
  const knownKeys = new Set([
    "title", "slug", "author", "year", "description", "keywords", "age", "age_group", "reading_time",
    "is_published", "categories", "translations", "test", ...Object.values(SECTION_IMPORT_KEYS),
  ]);
  const unknownKeys = Object.keys(raw).filter((key) => !knownKeys.has(key));
  if (unknownKeys.length > 0) warnings.push(`Неизвестные поля не будут сохранены: ${unknownKeys.join(", ")}.`);
  const languageStatus = (language: "ru" | "en" | "he") => {
    const source = language === "ru" ? raw : readImportedTranslationRecord(raw, language);
    const missing: string[] = [];
    if (!source || !readOptionalString(source, "title")) missing.push("title");
    if (!source || !readOptionalString(source, "description")) missing.push("description");
    for (const key of Object.values(SECTION_IMPORT_KEYS)) {
      if (!source || !readStringArray(source, key)?.length) missing.push(key);
    }
    const testValue = language === "ru" ? raw.test : source?.tests;
    if (testValue === undefined || testValue === null) missing.push("tests");
    return { complete: missing.length === 0, missing };
  };

  for (const [index, category] of categories.entries()) {
    for (const language of ["ru", "en", "he"] as const) {
      if (!category.translations[language]?.trim()) {
        warnings.push(`categories[${index}]: отсутствует перевод ${language.toUpperCase()}.`);
      }
    }
  }

  const languages = { ru: languageStatus("ru"), en: languageStatus("en"), he: languageStatus("he") };
  for (const language of ["ru", "en", "he"] as const) {
    if (!languages[language].complete) warnings.push(`${language.toUpperCase()}: отсутствуют ${languages[language].missing.join(", ")}.`);
  }
  const scriptIssues = validateImportedBookScripts(rawJson);
  return { title, slug, languages, categories, warnings, scriptIssues, canSubmit: scriptIssues.length === 0 };
}

export function parseImportedBookJson(rawJson: string): LooseRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("JSON не распарсился. Проверьте формат.");
  }

  return asRecord(parsed, "JSON");
}

export function extractBookSeedFromImportedJson(rawJson: string) {
  const raw = parseImportedBookJson(rawJson);
  const title = readOptionalString(raw, "title");
  if (!title) {
    throw new Error("Поле `title` обязательно для импорта книги.");
  }

  return {
    title,
    author: readOptionalString(raw, "author") ?? "",
    slug: readOptionalString(raw, "slug") ?? undefined,
  };
}
