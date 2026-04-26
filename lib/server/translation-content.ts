import crypto from "crypto";
import stringify from "json-stable-stringify";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractTranslatableLessonPayload,
  type LessonJson,
} from "../lesson-translation";
import { loadExplanationModes } from "./book-admin";
import { normalizeAssembledStory } from "./story-submissions-admin";

export type TranslationScope =
  | "all"
  | "lessons"
  | "map_stories"
  | "artworks"
  | "books"
  | "stories"
  | "parrot_music_styles";

export type TranslationContentType =
  | "lesson"
  | "map_story"
  | "artwork"
  | "book"
  | "story_template"
  | "story_submission"
  | "parrot_music_style";

export type LoadedTranslationItem = {
  contentType: TranslationContentType;
  contentId: string;
  payload: unknown;
  sourceHash: string;
  normalizedSource: string;
  characters: number;
};

type LessonRow = {
  id: string;
  title: string | null;
  steps: unknown;
};

type MapStoryRow = {
  id: number;
  content: string | null;
};

type ArtworkRow = {
  id: string;
  title: string | null;
  description: string | null;
};

type BookRow = {
  id: string;
  title: string | null;
  author: string | null;
  description: string | null;
};

type BookCategoryRow = {
  book_id: string;
  category_id: string;
};

type CategoryRow = {
  id: string;
  name: string | null;
};

type BookExplanationRow = {
  book_id: string;
  mode_id: string;
  slides: unknown;
};

type BookTestRow = {
  book_id: string;
  title: string | null;
  quiz: unknown;
  sort_order: number | null;
};

type StoryTemplateRow = {
  id: string;
  hero_name: string | null;
};

type StoryStepRow = {
  id: string;
  template_id: string;
  step_key: string | null;
  question: string | null;
  narration: string | null;
  sort_order: number | null;
};

type StoryChoiceRow = {
  id: string;
  step_id: string;
  text: string | null;
  short_text: string | null;
  sort_order: number | null;
};

type StoryFragmentRow = {
  id: string;
  template_id: string;
  step_key: string | null;
  choice_id: string | null;
  text: string | null;
  sort_order: number | null;
};

type StorySubmissionRow = {
  id: string;
  hero_name: string | null;
  assembled_story: unknown;
};

type ParrotMusicStyleRow = {
  id: string;
  title: string | null;
  description: string | null;
};

type ParrotMusicStyleSlideRow = {
  style_id: string;
  slide_order: number | null;
  text: string | null;
};

const STORY_STEP_KEYS = [
  "narration",
  "intro",
  "journey",
  "problem",
  "solution",
  "ending",
] as const;

function coerceSlides(value: unknown): Array<{ text: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        if (typeof text === "string") {
          return { text };
        }
      }
      if (typeof item === "string") {
        return { text: item };
      }
      return null;
    })
    .filter((item): item is { text: string } => item !== null);
}

type QuietQuizQuestion = {
  question: string;
  options: string[];
  correctAnswerIndex: number;
};

function normalizeQuietQuiz(value: unknown): QuietQuizQuestion[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as {
          question?: unknown;
          options?: unknown;
          correctAnswerIndex?: unknown;
          answers?: unknown;
        };

        const question = typeof record.question === "string" ? record.question.trim() : "";
        if (!question) {
          return null;
        }

        const directOptions = Array.isArray(record.options)
          ? record.options
              .map((option) => (typeof option === "string" ? option.trim() : ""))
              .filter(Boolean)
          : [];

        const answers = Array.isArray(record.answers)
          ? record.answers
              .map((answer) => {
                if (!answer || typeof answer !== "object") {
                  return null;
                }
                const answerRecord = answer as { text?: unknown; correct?: unknown };
                return {
                  text: typeof answerRecord.text === "string" ? answerRecord.text.trim() : "",
                  correct: answerRecord.correct === true,
                };
              })
              .filter(
                (answer): answer is {
                  text: string;
                  correct: boolean;
                } => answer !== null && answer.text.length > 0,
              )
          : [];

        const options =
          directOptions.length > 0 ? directOptions : answers.map((answer) => answer.text);
        if (options.length === 0) {
          return null;
        }

        const answerCorrectIndex = answers.findIndex((answer) => answer.correct);
        const rawCorrectIndex =
          typeof record.correctAnswerIndex === "number" && Number.isInteger(record.correctAnswerIndex)
            ? record.correctAnswerIndex
            : answerCorrectIndex >= 0
              ? answerCorrectIndex
              : 0;

        return {
          question,
          options,
          correctAnswerIndex: Math.max(0, Math.min(rawCorrectIndex, options.length - 1)),
        };
      })
      .filter((item): item is QuietQuizQuestion => item !== null);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as { questions?: unknown; quiz?: unknown };
  if (record.questions !== undefined) {
    return normalizeQuietQuiz(record.questions);
  }
  if (record.quiz !== undefined) {
    return normalizeQuietQuiz(record.quiz);
  }
  return [];
}

export function toCanonicalJson(value: unknown): string {
  return stringify(value) ?? "null";
}

export function buildSourceHash(value: unknown): string {
  return crypto.createHash("sha256").update(toCanonicalJson(value)).digest("hex");
}

function createLoadedTranslationItem(
  contentType: TranslationContentType,
  contentId: string,
  payload: unknown,
): LoadedTranslationItem {
  const normalizedSource = toCanonicalJson(payload);
  return {
    contentType,
    contentId,
    payload,
    sourceHash: buildSourceHash(payload),
    normalizedSource,
    characters: normalizedSource.length,
  };
}

function normalizeLessonSource(row: LessonRow): unknown {
  const lesson: LessonJson = {
    title: row.title ?? "",
    steps: Array.isArray(row.steps) ? (row.steps as LessonJson["steps"]) : [],
  } as LessonJson;
  return extractTranslatableLessonPayload({ lesson });
}

function normalizeMapStorySource(row: MapStoryRow): unknown {
  return { content: row.content ?? "" };
}

function normalizeArtworkSource(row: ArtworkRow): unknown {
  return {
    title: row.title ?? "",
    description: row.description ?? "",
  };
}

function normalizeParrotMusicStyleSource(
  row: ParrotMusicStyleRow,
  slides: ParrotMusicStyleSlideRow[],
): unknown {
  return {
    title: row.title ?? "",
    description: row.description ?? "",
    slides: slides
      .filter((slide) => typeof slide.text === "string" && slide.text.trim().length > 0)
      .sort((left, right) => (left.slide_order ?? 0) - (right.slide_order ?? 0))
      .map((slide, index) => ({
        order: slide.slide_order ?? index + 1,
        text: slide.text ?? "",
      })),
  };
}

function getStepText(step: StoryStepRow | undefined): string {
  if (!step) {
    return "";
  }
  if (step.step_key === "narration") {
    return step.narration ?? "";
  }
  return step.question ?? "";
}

export async function analyzeLessons(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const { data, error } = await supabase.from("lessons").select("id,title,steps");

  if (error) {
    throw new Error(`Failed to load lessons: ${error.message}`);
  }

  return ((data as LessonRow[] | null) ?? []).map((row) =>
    createLoadedTranslationItem("lesson", row.id, normalizeLessonSource(row)),
  );
}

export async function analyzeMapStories(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const { data, error } = await supabase.from("map_stories").select("id,content");

  if (error) {
    throw new Error(`Failed to load map_stories: ${error.message}`);
  }

  return ((data as MapStoryRow[] | null) ?? []).map((row) =>
    createLoadedTranslationItem("map_story", String(row.id), normalizeMapStorySource(row)),
  );
}

export async function analyzeArtworks(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const { data, error } = await supabase.from("artworks").select("id,title,description");

  if (error) {
    throw new Error(`Failed to load artworks: ${error.message}`);
  }

  return ((data as ArtworkRow[] | null) ?? []).map((row) =>
    createLoadedTranslationItem("artwork", row.id, normalizeArtworkSource(row)),
  );
}

export async function analyzeBooks(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const [booksRes, linksRes, categoriesRes, explanationsRes, testsRes, modes] =
    await Promise.all([
      supabase.from("books").select("id,title,author,description"),
      supabase.from("book_categories").select("book_id,category_id"),
      supabase.from("categories").select("id,name"),
      supabase.from("book_explanations").select("book_id,mode_id,slides"),
      supabase.from("book_tests").select("book_id,title,quiz,sort_order").order("sort_order", {
        ascending: true,
      }),
      loadExplanationModes(supabase),
    ]);

  if (booksRes.error) {
    throw new Error(`Failed to load books: ${booksRes.error.message}`);
  }
  if (linksRes.error) {
    throw new Error(`Failed to load book categories: ${linksRes.error.message}`);
  }
  if (categoriesRes.error) {
    throw new Error(`Failed to load categories: ${categoriesRes.error.message}`);
  }
  if (explanationsRes.error) {
    throw new Error(`Failed to load book explanations: ${explanationsRes.error.message}`);
  }
  if (testsRes.error) {
    throw new Error(`Failed to load book tests: ${testsRes.error.message}`);
  }

  const categoryNameById = new Map(
    (((categoriesRes.data as CategoryRow[] | null) ?? []).map((row) => [
      row.id,
      row.name ?? "",
    ])),
  );
  const categoryNamesByBookId = new Map<string, string[]>();
  (((linksRes.data as BookCategoryRow[] | null) ?? [])).forEach((row) => {
    const categoryName = categoryNameById.get(row.category_id)?.trim();
    if (!categoryName) {
      return;
    }
    const bucket = categoryNamesByBookId.get(row.book_id) ?? [];
    bucket.push(categoryName);
    categoryNamesByBookId.set(row.book_id, bucket);
  });

  const explanationsByBookId = new Map<
    string,
    Array<{ mode_slug: string; mode_name: string; slides: Array<{ text: string }> }>
  >();
  (((explanationsRes.data as BookExplanationRow[] | null) ?? [])).forEach((row) => {
    const mode = modes.find((item) => item.id === row.mode_id);
    const bucket = explanationsByBookId.get(row.book_id) ?? [];
    bucket.push({
      mode_slug: mode?.slug ?? row.mode_id,
      mode_name: mode?.name ?? row.mode_id,
      slides: coerceSlides(row.slides),
    });
    explanationsByBookId.set(row.book_id, bucket);
  });
  explanationsByBookId.forEach((items) => {
    items.sort((left, right) => left.mode_slug.localeCompare(right.mode_slug));
  });

  const testsByBookId = new Map<
    string,
    Array<{
      title: string;
      questions: Array<{
        question: string;
        answers: Array<{ text: string; correct: boolean }>;
      }>;
    }>
  >();
  (((testsRes.data as BookTestRow[] | null) ?? [])).forEach((row) => {
    const quiz = normalizeQuietQuiz(row.quiz);
    const bucket = testsByBookId.get(row.book_id) ?? [];
    bucket.push({
      title: row.title ?? "",
      questions: quiz.map((question) => ({
        question: question.question,
        answers: question.options.map((option, optionIndex) => ({
          text: option,
          correct: optionIndex === question.correctAnswerIndex,
        })),
      })),
    });
    testsByBookId.set(row.book_id, bucket);
  });

  return ((booksRes.data as BookRow[] | null) ?? []).map((row) =>
    createLoadedTranslationItem("book", row.id, {
      title: row.title ?? "",
      author: row.author ?? "",
      description: row.description ?? "",
      categories: categoryNamesByBookId.get(row.id) ?? [],
      sections: explanationsByBookId.get(row.id) ?? [],
      tests: testsByBookId.get(row.id) ?? [],
    }),
  );
}

export async function analyzeStories(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const [templatesRes, stepsRes, choicesRes, fragmentsRes, submissionsRes] = await Promise.all([
    supabase.from("story_templates").select("id,hero_name"),
    supabase
      .from("story_steps")
      .select("id,template_id,step_key,question,narration,sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("story_choices")
      .select("id,step_id,text,short_text,sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("story_fragments")
      .select("id,template_id,step_key,choice_id,text,sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_story_submissions")
      .select("id,hero_name,assembled_story")
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
  ]);

  if (templatesRes.error) {
    throw new Error(`Failed to load story templates: ${templatesRes.error.message}`);
  }
  if (stepsRes.error) {
    throw new Error(`Failed to load story steps: ${stepsRes.error.message}`);
  }
  if (choicesRes.error) {
    throw new Error(`Failed to load story choices: ${choicesRes.error.message}`);
  }
  if (fragmentsRes.error) {
    throw new Error(`Failed to load story fragments: ${fragmentsRes.error.message}`);
  }
  if (submissionsRes.error) {
    throw new Error(`Failed to load story submissions: ${submissionsRes.error.message}`);
  }

  const stepsByTemplateId = new Map<string, StoryStepRow[]>();
  (((stepsRes.data as StoryStepRow[] | null) ?? [])).forEach((row) => {
    const bucket = stepsByTemplateId.get(row.template_id) ?? [];
    bucket.push(row);
    stepsByTemplateId.set(row.template_id, bucket);
  });

  const stepById = new Map(
    (((stepsRes.data as StoryStepRow[] | null) ?? []).map((row) => [row.id, row])),
  );
  const choicesByTemplateId = new Map<
    string,
    Array<{
      step_key: string;
      kind: "choice";
      text: string;
      short_text: string;
    }>
  >();
  (((choicesRes.data as StoryChoiceRow[] | null) ?? [])).forEach((row) => {
    const step = stepById.get(row.step_id);
    if (!step?.template_id) {
      return;
    }
    const bucket = choicesByTemplateId.get(step.template_id) ?? [];
    bucket.push({
      step_key: step.step_key ?? "",
      kind: "choice",
      text: row.text ?? "",
      short_text: row.short_text ?? "",
    });
    choicesByTemplateId.set(step.template_id, bucket);
  });

  const fragmentsByTemplateId = new Map<
    string,
    Array<{
      step_key: string;
      kind: "fragment";
      text: string;
    }>
  >();
  (((fragmentsRes.data as StoryFragmentRow[] | null) ?? [])).forEach((row) => {
    const bucket = fragmentsByTemplateId.get(row.template_id) ?? [];
    bucket.push({
      step_key: row.step_key ?? "",
      kind: "fragment",
      text: row.text ?? "",
    });
    fragmentsByTemplateId.set(row.template_id, bucket);
  });

  const templateItems = ((templatesRes.data as StoryTemplateRow[] | null) ?? []).map((row) => {
    const templateSteps = stepsByTemplateId.get(row.id) ?? [];
    const stepMap = new Map(
      templateSteps.map((step) => [step.step_key ?? "", step]),
    );

    return createLoadedTranslationItem("story_template", row.id, {
      hero_name: row.hero_name ?? "",
      steps: {
        narration: getStepText(stepMap.get("narration")),
        intro: getStepText(stepMap.get("intro")),
        journey: getStepText(stepMap.get("journey")),
        problem: getStepText(stepMap.get("problem")),
        solution: getStepText(stepMap.get("solution")),
        ending: getStepText(stepMap.get("ending")),
      },
      fragments: [
        ...(choicesByTemplateId.get(row.id) ?? []),
        ...(fragmentsByTemplateId.get(row.id) ?? []),
      ],
      assembled_story: "",
    });
  });

  const submissionItems = ((submissionsRes.data as StorySubmissionRow[] | null) ?? []).map((row) => {
    const assembledStory = normalizeAssembledStory(row.assembled_story);
    const steps = Object.fromEntries(
      STORY_STEP_KEYS.map((key) => [
        key,
        assembledStory.steps.find((step) => step.key === key)?.text ?? "",
      ]),
    ) as Record<(typeof STORY_STEP_KEYS)[number], string>;

    return createLoadedTranslationItem("story_submission", row.id, {
      hero_name: assembledStory.hero || row.hero_name || "",
      steps,
      fragments: [],
      assembled_story: assembledStory,
    });
  });

  return [...templateItems, ...submissionItems];
}

export async function analyzeParrotMusicStyles(supabase: SupabaseClient): Promise<LoadedTranslationItem[]> {
  const [stylesRes, slidesRes] = await Promise.all([
    supabase.from("parrot_music_styles").select("id,title,description"),
    supabase
      .from("parrot_music_style_slides")
      .select("style_id,slide_order,text")
      .order("slide_order", { ascending: true }),
  ]);

  if (stylesRes.error) {
    throw new Error(`Failed to load parrot music styles: ${stylesRes.error.message}`);
  }
  if (slidesRes.error) {
    throw new Error(`Failed to load parrot music style slides: ${slidesRes.error.message}`);
  }

  const slidesByStyleId = new Map<string, ParrotMusicStyleSlideRow[]>();
  (((slidesRes.data as ParrotMusicStyleSlideRow[] | null) ?? [])).forEach((row) => {
    const bucket = slidesByStyleId.get(row.style_id) ?? [];
    bucket.push(row);
    slidesByStyleId.set(row.style_id, bucket);
  });

  return ((stylesRes.data as ParrotMusicStyleRow[] | null) ?? []).map((row) =>
    createLoadedTranslationItem(
      "parrot_music_style",
      row.id,
      normalizeParrotMusicStyleSource(row, slidesByStyleId.get(row.id) ?? []),
    ),
  );
}

export async function loadTranslationItemsByScope(
  supabase: SupabaseClient,
  scope: TranslationScope,
): Promise<LoadedTranslationItem[]> {
  const items: LoadedTranslationItem[] = [];

  if (scope === "all" || scope === "lessons") {
    items.push(...(await analyzeLessons(supabase)));
  }
  if (scope === "all" || scope === "map_stories") {
    items.push(...(await analyzeMapStories(supabase)));
  }
  if (scope === "all" || scope === "artworks") {
    items.push(...(await analyzeArtworks(supabase)));
  }
  if (scope === "all" || scope === "books") {
    items.push(...(await analyzeBooks(supabase)));
  }
  if (scope === "all" || scope === "stories") {
    items.push(...(await analyzeStories(supabase)));
  }
  if (scope === "all" || scope === "parrot_music_styles") {
    items.push(...(await analyzeParrotMusicStyles(supabase)));
  }

  return items;
}

export async function loadTranslationItemByContent(
  supabase: SupabaseClient,
  contentType: TranslationContentType,
  contentId: string,
): Promise<LoadedTranslationItem> {
  const items =
    contentType === "lesson"
      ? await analyzeLessons(supabase)
      : contentType === "map_story"
        ? await analyzeMapStories(supabase)
        : contentType === "artwork"
          ? await analyzeArtworks(supabase)
          : contentType === "book"
            ? await analyzeBooks(supabase)
            : contentType === "story_template"
            ? (await analyzeStories(supabase)).filter((item) => item.contentType === "story_template")
              : contentType === "story_submission"
                ? (await analyzeStories(supabase)).filter((item) => item.contentType === "story_submission")
                : await analyzeParrotMusicStyles(supabase);

  const found = items.find((item) => item.contentId === contentId);
  if (!found) {
    throw new Error(`${contentType} not found.`);
  }
  return found;
}
