import type { BookEditorPayload, BookEditorResponse, CategoryOption } from "./types";
import { slugifyRu } from "./slugify-ru";

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

type SectionSlug = keyof typeof SECTION_IMPORT_KEYS;

type LooseRecord = Record<string, unknown>;

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

export function buildBookPayloadFromImportedJson(
  current: BookEditorResponse,
  rawJson: string,
): BookEditorPayload {
  const raw = parseImportedBookJson(rawJson);

  const importedTitle = readOptionalString(raw, "title");
  const importedAuthor = readOptionalString(raw, "author");
  const importedDescription = readOptionalString(raw, "description");
  const importedAge = readOptionalString(raw, "age");
  const importedKeywords = hasOwn(raw, "keywords")
    ? parseKeywords(readOptionalString(raw, "keywords"))
    : undefined;
  const importedCategories = readStringArray(raw, "categories");
  const importedTest = mapImportedTest(current.tests, raw.test);
  const importedYear = readOptionalNumber(raw, "year");
  const importedReadingTime = parseReadingTime(raw.reading_time);

  const nextTitle = importedTitle || current.book.title;
  const nextSlug = current.book.slug || slugifyRu(nextTitle) || "book";

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
    },
    categoryIds: importedCategories ? resolveCategoryIds(importedCategories, current.categories) : current.categoryIds,
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
  };
}
