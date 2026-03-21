import type { NextApiRequest, NextApiResponse } from "next";
import slugify from "slugify";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import {
  detectFormatViolations,
  logGenerationEvent,
  logGenerationOk,
  logZodError,
  validateQuizDeep,
  validateWithDiagnostics,
} from "../ai/generationDiagnostics";
import { normalizeSlides } from "../ai/normalizeSlides";
import {
  canonicalExplanationSectionSchema,
  canonicalFullBookSchema,
  canonicalQuizSchema,
  canonicalStoryPartStepSchema,
  canonicalStoryPartTextSchema,
} from "../books/contracts";
import {
  buildExplanationPrompt as buildExplanationPromptText,
  buildFullExplanationPrompt as buildFullExplanationPromptText,
  buildStoryPartPrompt as buildStoryPartPromptText,
  buildStoryTemplatePrompt as buildStoryTemplatePromptText,
  buildTestPrompt as buildTestPromptText,
  generateWholeBookPrompt,
} from "../ai/prompts";
import { SLIDE_TARGETS } from "../ai/slideTargets";
import {
  DEFAULT_EXPLANATION_MODE_SLUGS,
  STORY_ROLE_KEYS,
  bookEditorPayloadSchema,
  bookExplanationSchema,
  bookMetaSchema,
  bookTestQuestionSchema,
  bookTestSchema,
  storyFragmentSchema,
  storyStepSchema,
  storyTwistSchema,
  type BookEditorPayload,
  type BookEditorResponse,
  type BookExplanationInput,
  type BookListItem,
  type CategoryOption,
  type ExplanationMode,
  type StoryRoleKey,
  type StoryBuilderResponse,
  type StoryBuilderTemplate,
  type StoryTemplateInput,
} from "../books/types";
import { z } from "zod";

type BookTableRow = {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  year: number | null;
  description: string | null;
  keywords: string[] | null;
  age_group: string | null;
  reading_time: number | null;
  is_published: boolean | null;
  created_at: string | null;
};

type BookExplanationRow = {
  id: string;
  book_id: string;
  mode_id: string;
  slides: unknown;
  is_published: boolean | null;
};

type BookTestRow = {
  id: string;
  book_id: string;
  title: string;
  description: string | null;
  quiz: unknown;
  is_published: boolean | null;
  sort_order: number | null;
};

type BookCompletionOverviewRow = {
  id: string;
  progress_percent: number | null;
};

type BookMissingSectionRow = {
  book_id: string;
  section: string;
  is_filled: boolean | null;
};

type StoryTemplateRow = {
  id: string;
  name: string;
  slug: string;
  is_published: boolean | null;
};

type StoryStepRow = {
  id: string;
  template_id: string;
  step_key: string;
  question: string;
  short_text: string | null;
  narration: string | null;
  sort_order: number | null;
};

type StoryChoiceRow = {
  id: string;
  step_id: string;
  text: string;
  short_text: string | null;
  keywords?: string[] | null;
  sort_order: number | null;
};

type StoryFragmentRow = {
  id: string;
  template_id: string;
  step_key: string;
  choice_id: string | null;
  text: string;
  short_text: string | null;
  sort_order: number | null;
};

type StoryTwistRow = {
  id: string;
  text: string;
  keywords?: string[] | null;
  age_group: string | null;
  is_published: boolean | null;
};

type QuizDbAnswer = {
  text?: unknown;
  correct?: unknown;
};

const STORY_ROLE_QUESTIONS: Record<StoryRoleKey, string> = {
  narration: "Как начинается история?",
  intro: "С чего началось приключение?",
  journey: "Куда герой отправится дальше?",
  problem: "Что пошло не так в пути?",
  solution: "Как герой справится с проблемой?",
  ending: "Чем закончится эта история?",
};

export function isStoryRoleKey(value: string): value is StoryRoleKey {
  return STORY_ROLE_KEYS.includes(value as StoryRoleKey);
}

export function normalizeStoryRole(value: string | null | undefined, fallbackIndex = 0): StoryRoleKey {
  if (value && isStoryRoleKey(value)) {
    return value;
  }
  return STORY_ROLE_KEYS[Math.max(0, Math.min(fallbackIndex, STORY_ROLE_KEYS.length - 1))];
}

export function getStoryRoleQuestion(role: StoryRoleKey): string {
  return STORY_ROLE_QUESTIONS[role];
}

export function createDefaultStorySteps() {
  return STORY_ROLE_KEYS.map((role, index) => ({
    step_key: role,
    question: role === "narration" ? "" : STORY_ROLE_QUESTIONS[role],
    short_text: null,
    narration: role === "narration" ? "" : null,
    sort_order: index,
    choices: [],
  }));
}

function getServiceSupabaseClient(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function requireAdminSession(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<SupabaseClient> {
  const sessionClient = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await sessionClient.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return getServiceSupabaseClient();
}

export function normalizeKeywords(value: string[] | null | undefined): string[] {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

export function parseCommaSeparatedKeywords(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildChoiceTextFromFragment(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Новый вариант сюжета";
  }

  const words = trimmed.split(/\s+/).slice(0, 8).join(" ");
  return words.slice(0, 120).trim() || "Новый вариант сюжета";
}

async function repairStoryTemplateData(
  supabase: SupabaseClient,
  templateId: string,
): Promise<void> {
  console.log("REPAIRING TEMPLATE", templateId);

  const [stepsRes, choicesRes, fragmentsRes] = await Promise.all([
    supabase.from("story_steps").select("*").eq("template_id", templateId).order("sort_order", { ascending: true }),
    supabase
      .from("story_choices")
      .select("id,step_id,text,short_text,sort_order,story_steps!inner(template_id,step_key)")
      .eq("story_steps.template_id", templateId)
      .order("sort_order", { ascending: true }),
    supabase.from("story_fragments").select("*").eq("template_id", templateId).order("sort_order", { ascending: true }),
  ]);

  if (stepsRes.error || choicesRes.error || fragmentsRes.error) {
    throw new Error(
      stepsRes.error?.message ??
      choicesRes.error?.message ??
      fragmentsRes.error?.message ??
      "Failed to repair story template.",
    );
  }

  const steps = (stepsRes.data as StoryStepRow[] | null) ?? [];
  const choices = (choicesRes.data as Array<StoryChoiceRow & { story_steps?: { step_key?: string } | null }> | null) ?? [];
  const fragments = (fragmentsRes.data as StoryFragmentRow[] | null) ?? [];

  const stepByRole = new Map(steps.map((step) => [normalizeStoryRole(step.step_key), step]));
  const choiceById = new Map(choices.map((choice) => [choice.id, choice]));
  const choicesByRole = new Map<StoryRoleKey, StoryChoiceRow[]>();

  steps.forEach((step) => {
    if (step.step_key === "narration") {
      console.log("NARRATION SKIPPED IN REPAIR", step.narration);
    }
  });

  choices.forEach((choice) => {
    const role = normalizeStoryRole(choice.story_steps?.step_key);
    const bucket = choicesByRole.get(role) ?? [];
    bucket.push(choice);
    choicesByRole.set(role, bucket);
  });

  for (const fragment of fragments) {
    const role = normalizeStoryRole(fragment.step_key);
    const hasValidChoice = fragment.choice_id && choiceById.has(fragment.choice_id);
    if (role === "narration") {
      continue;
    }
    if (role === "intro" && !fragment.choice_id) {
      continue;
    }
    if (hasValidChoice) {
      continue;
    }

    const roleChoices = choicesByRole.get(role) ?? [];
    let targetChoice =
      roleChoices.find((choice) => (choice.sort_order ?? 0) === (fragment.sort_order ?? 0)) ??
      roleChoices[0] ??
      null;

    if (!targetChoice) {
      const step = stepByRole.get(role);
      if (!step) {
        continue;
      }
      const { data: insertedChoice, error: insertedChoiceError } = await supabase
        .from("story_choices")
        .insert({
          step_id: step.id,
          text: buildChoiceTextFromFragment(fragment.text),
          short_text: null,
          sort_order: roleChoices.length,
        })
        .select("*")
        .single();
      if (insertedChoiceError || !insertedChoice) {
        throw new Error(insertedChoiceError?.message ?? "Failed to create repair choice.");
      }
      targetChoice = insertedChoice as StoryChoiceRow;
      roleChoices.push(targetChoice);
      choicesByRole.set(role, roleChoices);
      choiceById.set(targetChoice.id, targetChoice);
      console.log("REPAIR_CREATED_CHOICE", {
        template_id: templateId,
        step_key: role,
        fragment_id: fragment.id,
        choice_id: targetChoice.id,
      });
    }

    const { error: updateFragmentError } = await supabase
      .from("story_fragments")
      .update({ choice_id: targetChoice.id })
      .eq("id", fragment.id);
    if (updateFragmentError) {
      throw new Error(`Failed to reassign orphan fragment: ${updateFragmentError.message}`);
    }
    console.log("REPAIR_REASSIGNED_FRAGMENT", {
      template_id: templateId,
      fragment_id: fragment.id,
      choice_id: targetChoice.id,
    });
  }
}

export async function repairStoryTemplates(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.from("story_templates").select("id");
  if (error) {
    throw new Error(`Failed to load story templates for repair: ${error.message}`);
  }

  for (const template of ((data as Array<{ id: string }> | null) ?? [])) {
    await repairStoryTemplateData(supabase, template.id);
  }
}

export function safeSlug(input: string): string {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true,
  });
}

function logGenerationDebug(stage: string, payload: unknown) {
  logGenerationEvent(stage, payload, {
    valid: true,
    level: "success",
  });
}

export async function createUniqueBookSlug(
  supabase: SupabaseClient,
  title: string,
  excludeBookId?: string,
): Promise<string> {
  const base = safeSlug(title) || "book";
  let candidate = base;
  let attempt = 1;

  while (true) {
    let query = supabase.from("books").select("id").eq("slug", candidate).limit(1);
    if (excludeBookId) {
      query = query.neq("id", excludeBookId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to check existing slug: ${error.message}`);
    }
    if (!data?.id) {
      return candidate;
    }
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function findBookByExactTitle(
  supabase: SupabaseClient,
  title: string,
): Promise<BookListItem | null> {
  const normalized = title.trim().toLowerCase();
  const { data, error } = await supabase
    .from("books")
    .select("id,title,slug,author,year,is_published,created_at")
    .ilike("title", title.trim())
    .limit(20);

  if (error) {
    throw new Error(`Failed to search books: ${error.message}`);
  }

  const match = ((data as BookListItem[] | null) ?? []).find(
    (item) => item.title.trim().toLowerCase() === normalized,
  );

  return match ?? null;
}

export async function listBooks(
  supabase: SupabaseClient,
  search: string,
): Promise<BookListItem[]> {
  let query = supabase
    .from("books")
    .select("id,title,slug,author,year,is_published,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const trimmed = search.trim();
  if (trimmed) {
    query = query.or(`title.ilike.%${trimmed}%,author.ilike.%${trimmed}%,slug.ilike.%${trimmed}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load books: ${error.message}`);
  }

  const books = (data as BookListItem[] | null) ?? [];
  if (books.length === 0) {
    return [];
  }

  const bookIds = books.map((book) => book.id);
  const [progressRes, missingRes] = await Promise.all([
    supabase.from("books_completion_overview").select("id,progress_percent").in("id", bookIds),
    supabase.from("books_missing_sections").select("book_id,section,is_filled").in("book_id", bookIds),
  ]);

  if (progressRes.error) {
    throw new Error(`Failed to load book progress: ${progressRes.error.message}`);
  }

  if (missingRes.error) {
    throw new Error(`Failed to load missing book sections: ${missingRes.error.message}`);
  }

  const progressByBookId = new Map(
    (((progressRes.data as BookCompletionOverviewRow[] | null) ?? []).map((row) => [
      row.id,
      typeof row.progress_percent === "number" ? row.progress_percent : 0,
    ])),
  );

  const missingByBookId = new Map<string, string[]>();
  (((missingRes.data as BookMissingSectionRow[] | null) ?? [])).forEach((row) => {
    if (row.is_filled) {
      return;
    }
    const list = missingByBookId.get(row.book_id) ?? [];
    list.push(row.section);
    missingByBookId.set(row.book_id, list);
  });

  return books
    .map((book) => ({
      ...book,
      progress_percent: progressByBookId.get(book.id) ?? 0,
      missing_sections: missingByBookId.get(book.id) ?? [],
    }))
    .sort((left, right) => {
      const progressDelta = (left.progress_percent ?? 0) - (right.progress_percent ?? 0);
      if (progressDelta !== 0) {
        return progressDelta;
      }
      return (right.created_at ?? "").localeCompare(left.created_at ?? "");
    });
}

export async function loadCategoryOptions(supabase: SupabaseClient): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,icon,sort_order,is_published")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  return (data as CategoryOption[] | null) ?? [];
}

export async function loadExplanationModes(
  supabase: SupabaseClient,
): Promise<ExplanationMode[]> {
  const { data, error } = await supabase
    .from("explanation_modes")
    .select("id,name,slug,description,icon,sort_order,is_published")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load explanation modes: ${error.message}`);
  }

  const modes = (data as ExplanationMode[] | null) ?? [];
  if (modes.length > 0) {
    return modes;
  }

  return DEFAULT_EXPLANATION_MODE_SLUGS.map((slug, index) => ({
    id: `fallback-${slug}`,
    slug,
    name: slug.replace(/_/g, " "),
    description: null,
    icon: null,
    sort_order: index + 1,
    is_published: true,
  }));
}

function coerceSlides(value: unknown): BookExplanationInput["slides"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) {
          return { text: text.trim() };
        }
      }
      if (typeof item === "string" && item.trim()) {
        return { text: item.trim() };
      }
      return null;
    })
    .filter((item): item is { text: string } => item !== null);
}

export function normalizeGeneratedExplanationPayload(value: unknown) {
  const record = value && typeof value === "object" ? (value as { slides?: unknown }) : {};
  detectFormatViolations(record, "normalizeGeneratedExplanationPayload");
  const normalized = {
    slides: coerceSlides(record.slides),
  };
  logGenerationEvent("normalized.explanation", normalized, {
    valid: true,
    level: "success",
    summary: { slides: normalized.slides.length },
  });
  return validateWithDiagnostics(canonicalExplanationSectionSchema, normalized, "canonical.explanation", {
    slides: normalized.slides.length,
  });
}

type LooseGeneratedQuizQuestion = {
  question: string;
  options: string[];
  correctAnswerIndex: number;
};

function normalizeLooseGeneratedQuizQuestions(value: unknown): LooseGeneratedQuizQuestion[] {
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
          ? record.options.map((option) => (typeof option === "string" ? option.trim() : "")).filter(Boolean)
          : [];

        const answers = Array.isArray(record.answers) ? (record.answers as QuizDbAnswer[]) : [];
        const answerOptions = answers
          .map((answer) => (typeof answer.text === "string" ? answer.text.trim() : ""))
          .filter(Boolean);
        const answerCorrectIndex = answers.findIndex((answer) => answer.correct === true);

        const options = directOptions.length > 0 ? directOptions : answerOptions;
        if (options.length === 0) {
          return null;
        }

        const rawCorrectIndex =
          typeof record.correctAnswerIndex === "number" && Number.isInteger(record.correctAnswerIndex)
            ? record.correctAnswerIndex
            : answerCorrectIndex >= 0
              ? answerCorrectIndex
              : 0;

        return {
          question,
          options,
          correctAnswerIndex: rawCorrectIndex,
        };
      })
      .filter((item): item is LooseGeneratedQuizQuestion => item !== null);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as { questions?: unknown; quiz?: unknown };
  if (record.questions !== undefined) {
    return normalizeLooseGeneratedQuizQuestions(record.questions);
  }
  if (record.quiz !== undefined) {
    return normalizeLooseGeneratedQuizQuestions(record.quiz);
  }
  return [];
}

export function normalizeGeneratedQuizPayload(value: unknown) {
  detectFormatViolations(value, "normalizeGeneratedQuizPayload");
  const normalized = normalizeLooseGeneratedQuizQuestions(value)
    .map((question) => {
      const options = question.options.length > 4
        ? question.options.slice(0, 4)
        : question.options.length < 3
          ? [
              ...question.options,
              ...Array.from(
                { length: 3 - question.options.length },
                () => question.options[question.options.length - 1] ?? "Ответ",
              ),
            ]
          : question.options;

      const normalizedCorrectIndex = Math.max(0, Math.min(question.correctAnswerIndex, options.length - 1));

      try {
        return bookTestQuestionSchema.parse({
          question: question.question,
          options,
          correctAnswerIndex: normalizedCorrectIndex,
        });
      } catch {
        return null;
      }
    })
    .filter((item): item is BookEditorResponse["tests"][number]["quiz"][number] => item !== null);

  logGenerationEvent("normalized.quiz", normalized, {
    valid: true,
    level: "success",
    summary: { questions: normalized.length },
  });
  const parsed = validateWithDiagnostics(canonicalQuizSchema.shape.quiz, normalized, "canonical.quiz", {
    questions: normalized.length,
  });
  validateQuizDeep(parsed);
  return parsed;
}

export function quizDbToEditor(value: unknown): BookEditorResponse["tests"][number]["quiz"] {
  return normalizeGeneratedQuizPayload(value);
}

export function quizEditorToDb(value: BookEditorResponse["tests"][number]["quiz"]): {
  questions: Array<{
    question: string;
    answers: Array<{ text: string; correct: boolean }>;
  }>;
} {
  return {
    questions: value.map((question) => ({
      question: question.question.trim(),
      answers: question.options.map((option, optionIndex) => ({
        text: option.trim(),
        correct: optionIndex === question.correctAnswerIndex,
      })),
    })),
  };
}

function defaultStoryTemplate(book: BookTableRow): StoryTemplateInput {
  const baseSlug = safeSlug(book.slug || book.title || "book-story") || "book-story";
  return {
    name: `${book.title} Story`,
    slug: `${baseSlug}-story`,
    is_published: true,
    steps: createDefaultStorySteps(),
    fragments: [],
    twists: [],
  };
}

export async function loadBookEditorData(
  supabase: SupabaseClient,
  bookId: string,
): Promise<BookEditorResponse> {
  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();

  if (bookError || !book) {
    throw new Error(bookError?.message ?? "Book not found.");
  }

  const typedBook = book as BookTableRow;
  const [categories, modes, bookCategoriesRes, explanationsRes, testsRes] = await Promise.all([
    loadCategoryOptions(supabase),
    loadExplanationModes(supabase),
    supabase.from("book_categories").select("category_id").eq("book_id", bookId),
    supabase.from("book_explanations").select("*").eq("book_id", bookId),
    supabase.from("book_tests").select("*").eq("book_id", bookId).order("sort_order", { ascending: true }),
  ]);

  if (bookCategoriesRes.error) {
    throw new Error(`Failed to load book categories: ${bookCategoriesRes.error.message}`);
  }
  if (explanationsRes.error) {
    throw new Error(`Failed to load explanations: ${explanationsRes.error.message}`);
  }
  if (testsRes.error) {
    throw new Error(`Failed to load book tests: ${testsRes.error.message}`);
  }

  const templateSlugCandidates = [`${typedBook.slug}-story`, typedBook.slug];
  const { data: templates, error: templateError } = await supabase
    .from("story_templates")
    .select("*")
    .in("slug", templateSlugCandidates)
    .order("created_at", { ascending: false })
    .limit(1);

  if (templateError) {
    throw new Error(`Failed to load story template: ${templateError.message}`);
  }

  const template = ((templates as StoryTemplateRow[] | null) ?? [])[0] ?? null;
  let storyTemplate: StoryTemplateInput | null = null;

  if (template) {
    await repairStoryTemplateData(supabase, template.id);
    const [stepsRes, choicesRes, fragmentsRes, twistsRes] = await Promise.all([
      supabase.from("story_steps").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
      supabase
        .from("story_choices")
        .select("id,step_id,text,short_text,sort_order,story_steps!inner(template_id)")
        .eq("story_steps.template_id", template.id)
        .order("sort_order", { ascending: true }),
      supabase.from("story_fragments").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
      supabase
        .from("story_twists")
        .select("*")
        .or(`age_group.eq.${typedBook.age_group ?? ""},age_group.is.null`)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    if (stepsRes.error) {
      throw new Error(`Failed to load story steps: ${stepsRes.error.message}`);
    }
    if (choicesRes.error) {
      throw new Error(`Failed to load story choices: ${choicesRes.error.message}`);
    }
    if (fragmentsRes.error) {
      throw new Error(`Failed to load story fragments: ${fragmentsRes.error.message}`);
    }
    if (twistsRes.error) {
      throw new Error(`Failed to load story twists: ${twistsRes.error.message}`);
    }

    const existingStepMap = new Map(
      (((stepsRes.data as StoryStepRow[] | null) ?? []).map((step) => [
        normalizeStoryRole(step.step_key),
        step,
      ])),
    );
    const steps = STORY_ROLE_KEYS.map((role, index) => {
      const step = existingStepMap.get(role);
      return {
        id: step?.id,
        step_key: role,
        question: role === "narration" ? (step?.question ?? "") : (step?.question ?? STORY_ROLE_QUESTIONS[role]),
        short_text: role === "narration" ? null : (step?.short_text ?? null),
        narration: step?.narration ?? (role === "narration" ? "" : null),
        sort_order: index,
        choices: [] as StoryTemplateInput["steps"][number]["choices"],
      };
    });

    const stepMap = new Map(steps.map((step) => [step.id, step]));
    const choiceSortOrderById = new Map<string, number>();
    ((choicesRes.data as Array<StoryChoiceRow & { story_steps?: unknown }> | null) ?? []).forEach(
      (choice) => {
      const parent = stepMap.get(choice.step_id);
        if (!parent) {
          return;
        }
        const sortOrder = choice.sort_order ?? parent.choices.length;
        parent.choices.push({
          id: choice.id,
          text: choice.text,
          short_text: choice.short_text ?? "",
          sort_order: sortOrder,
        });
        choiceSortOrderById.set(choice.id, sortOrder);
      },
    );

    storyTemplate = {
      id: template.id,
      name: template.name,
      slug: template.slug,
      is_published: template.is_published ?? true,
      steps,
      fragments: ((fragmentsRes.data as StoryFragmentRow[] | null) ?? []).map((fragment) => ({
        id: fragment.id,
        step_key: normalizeStoryRole(fragment.step_key),
        choice_id: fragment.choice_id,
        choice_temp_key:
          fragment.choice_id && choiceSortOrderById.has(fragment.choice_id)
            ? String(choiceSortOrderById.get(fragment.choice_id))
            : null,
        text: fragment.text,
        sort_order: fragment.sort_order ?? 0,
      })),
      twists: ((twistsRes.data as StoryTwistRow[] | null) ?? []).map((twist) => ({
        id: twist.id,
        text: twist.text,
        age_group: twist.age_group,
        is_published: twist.is_published ?? true,
      })),
    };
  }

  const explanationMap = new Map(
    ((explanationsRes.data as BookExplanationRow[] | null) ?? []).map((item) => [item.mode_id, item]),
  );

  return {
    book: {
      id: typedBook.id,
      title: typedBook.title,
      slug: typedBook.slug,
      author: typedBook.author,
      year: typedBook.year,
      description: typedBook.description,
      keywords: normalizeKeywords(typedBook.keywords),
      age_group: typedBook.age_group,
      reading_time: typedBook.reading_time,
      is_published: typedBook.is_published ?? false,
      created_at: typedBook.created_at,
    },
    categoryIds: ((bookCategoriesRes.data as Array<{ category_id: string }> | null) ?? []).map(
      (item) => item.category_id,
    ),
    categories,
    explanationModes: modes,
    explanations: modes.map((mode) => {
      const existing = explanationMap.get(mode.id);
      return {
        id: existing?.id,
        mode_id: mode.id,
        mode_slug: mode.slug,
        mode_name: mode.name,
        is_published: existing?.is_published ?? false,
        slides: coerceSlides(existing?.slides),
      };
    }),
    tests: ((testsRes.data as BookTestRow[] | null) ?? []).map((test) => ({
      id: test.id,
      title: test.title,
      description: test.description,
      is_published: test.is_published ?? false,
      sort_order: test.sort_order ?? 0,
      quiz: quizDbToEditor(test.quiz),
    })),
    storyTemplate: storyTemplate ?? defaultStoryTemplate(typedBook),
  };
}

export async function saveBookEditorData(
  supabase: SupabaseClient,
  bookId: string,
  payload: BookEditorPayload,
): Promise<void> {
  const parsed = bookEditorPayloadSchema.parse(payload);
  const slug = await createUniqueBookSlug(supabase, parsed.book.slug, bookId);

  const { error: bookError } = await supabase
    .from("books")
    .update({
      title: parsed.book.title,
      slug,
      author: parsed.book.author || null,
      year: parsed.book.year ?? null,
      description: parsed.book.description || null,
      keywords: parsed.book.keywords,
      age_group: parsed.book.age_group || null,
      reading_time: parsed.book.reading_time ?? null,
      is_published: parsed.book.is_published,
    })
    .eq("id", bookId);

  if (bookError) {
    throw new Error(`Failed to save book: ${bookError.message}`);
  }

  const { error: deleteCategoryError } = await supabase
    .from("book_categories")
    .delete()
    .eq("book_id", bookId);

  if (deleteCategoryError) {
    throw new Error(`Failed to reset book categories: ${deleteCategoryError.message}`);
  }

  if (parsed.categoryIds.length > 0) {
    const { error: insertCategoryError } = await supabase
      .from("book_categories")
      .insert(parsed.categoryIds.map((categoryId) => ({ book_id: bookId, category_id: categoryId })));

    if (insertCategoryError) {
      throw new Error(`Failed to save book categories: ${insertCategoryError.message}`);
    }
  }

  const { data: existingExplanations, error: existingExplanationError } = await supabase
    .from("book_explanations")
    .select("id,mode_id")
    .eq("book_id", bookId);

  if (existingExplanationError) {
    throw new Error(`Failed to load existing explanations: ${existingExplanationError.message}`);
  }

  const existingExplanationMap = new Map(
    (((existingExplanations as Array<{ id: string; mode_id: string }> | null) ?? []).map((item) => [
      item.mode_id,
      item.id,
    ])),
  );

  const explanationDeletes: string[] = [];
  const explanationUpserts = parsed.explanations.flatMap((explanation) => {
    if (explanation.slides.length === 0) {
      const existingId = existingExplanationMap.get(explanation.mode_id);
      if (existingId) {
        explanationDeletes.push(existingId);
      }
      return [];
    }

    return [
      {
        id: explanation.id ?? existingExplanationMap.get(explanation.mode_id),
        book_id: bookId,
        mode_id: explanation.mode_id,
        slides: explanation.slides,
        is_published: explanation.is_published,
      },
    ];
  });

  if (explanationDeletes.length > 0) {
    const { error } = await supabase.from("book_explanations").delete().in("id", explanationDeletes);
    if (error) {
      throw new Error(`Failed to delete cleared explanations: ${error.message}`);
    }
  }

  if (explanationUpserts.length > 0) {
    const { error } = await supabase.from("book_explanations").upsert(explanationUpserts);
    if (error) {
      throw new Error(`Failed to save explanations: ${error.message}`);
    }
  }

  const { data: existingTests, error: existingTestsError } = await supabase
    .from("book_tests")
    .select("id")
    .eq("book_id", bookId);

  if (existingTestsError) {
    throw new Error(`Failed to load existing tests: ${existingTestsError.message}`);
  }

  const incomingTestIds = new Set(parsed.tests.map((test) => test.id).filter(Boolean) as string[]);
  const existingTestIds = ((existingTests as Array<{ id: string }> | null) ?? []).map((item) => item.id);
  const removedTestIds = existingTestIds.filter((id) => !incomingTestIds.has(id));

  if (removedTestIds.length > 0) {
    const { error } = await supabase.from("book_tests").delete().in("id", removedTestIds);
    if (error) {
      throw new Error(`Failed to delete removed tests: ${error.message}`);
    }
  }

  if (parsed.tests.length > 0) {
    const { error } = await supabase.from("book_tests").upsert(
      parsed.tests.map((test, index) => ({
        id: test.id,
        book_id: bookId,
        title: test.title,
        description: test.description || null,
        quiz: quizEditorToDb(test.quiz),
        is_published: test.is_published,
        sort_order: test.sort_order ?? index,
      })),
    );
    if (error) {
      throw new Error(`Failed to save tests: ${error.message}`);
    }
  }

  if (parsed.storyTemplate) {
    const templateSlug = safeSlug(parsed.storyTemplate.slug) || `${slug}-story`;
    const { data: templateRow, error: templateError } = await supabase
      .from("story_templates")
      .upsert({
        id: parsed.storyTemplate.id,
        name: parsed.storyTemplate.name,
        slug: templateSlug,
        is_published: parsed.storyTemplate.is_published,
      })
      .select("*")
      .single();

    if (templateError || !templateRow) {
      throw new Error(`Failed to save story template: ${templateError?.message ?? "Unknown error."}`);
    }

    const templateId = (templateRow as StoryTemplateRow).id;

    const { error: deleteFragmentsError } = await supabase
      .from("story_fragments")
      .delete()
      .eq("template_id", templateId);
    if (deleteFragmentsError) {
      throw new Error(`Failed to reset story fragments: ${deleteFragmentsError.message}`);
    }

    const { error: deleteChoicesError } = await supabase
      .from("story_choices")
      .delete()
      .in(
        "step_id",
        parsed.storyTemplate.steps
          .map((step) => step.id)
          .filter((value): value is string => Boolean(value)),
      );
    if (deleteChoicesError && !deleteChoicesError.message.includes("invalid input syntax")) {
      throw new Error(`Failed to reset story choices: ${deleteChoicesError.message}`);
    }

    const { error: deleteStepsError } = await supabase
      .from("story_steps")
      .delete()
      .eq("template_id", templateId);
    if (deleteStepsError) {
      throw new Error(`Failed to reset story steps: ${deleteStepsError.message}`);
    }

    const { data: insertedSteps, error: insertedStepsError } = await supabase
      .from("story_steps")
      .insert(
        parsed.storyTemplate.steps.map((step, index) => ({
          template_id: templateId,
          step_key: step.step_key,
          question: step.question,
          short_text: step.short_text?.trim() || null,
          narration: step.narration?.trim() || null,
          sort_order: step.sort_order ?? index,
        })),
      )
      .select("*");

    if (insertedStepsError) {
      throw new Error(`Failed to save story steps: ${insertedStepsError.message}`);
    }

    const insertedStepRows = (insertedSteps as StoryStepRow[] | null) ?? [];
    const insertedStepMap = new Map(insertedStepRows.map((step) => [step.step_key, step.id]));
    const choiceIdMap = new Map<string, string>();

    for (const step of parsed.storyTemplate.steps) {
      const persistedStepId = insertedStepMap.get(step.step_key);
      if (!persistedStepId || step.choices.length === 0) {
        continue;
      }

      const { data: insertedChoices, error: insertedChoicesError } = await supabase
        .from("story_choices")
        .insert(
          step.choices.map((choice, index) => ({
            step_id: persistedStepId,
            text: choice.text,
            sort_order: choice.sort_order ?? index,
          })),
        )
        .select("*");

      if (insertedChoicesError) {
        throw new Error(`Failed to save story choices: ${insertedChoicesError.message}`);
      }

      ((insertedChoices as StoryChoiceRow[] | null) ?? []).forEach((choice, index) => {
        choiceIdMap.set(`${step.step_key}:${choice.sort_order ?? index}`, choice.id);
      });
    }

    if (parsed.storyTemplate.fragments.length > 0) {
      const { error: fragmentInsertError } = await supabase.from("story_fragments").insert(
        parsed.storyTemplate.fragments
          .map((fragment, index) => {
            const choiceId =
              (fragment.choice_temp_key && choiceIdMap.get(`${fragment.step_key}:${fragment.choice_temp_key}`)) ??
              null;
            if (!choiceId) {
              return null;
            }
            return {
              template_id: templateId,
              step_key: fragment.step_key,
              choice_id: choiceId,
              text: fragment.text,
              sort_order: fragment.sort_order ?? index,
            };
          })
          .filter((fragment): fragment is NonNullable<typeof fragment> => fragment !== null),
      );

      if (fragmentInsertError) {
        throw new Error(`Failed to save story fragments: ${fragmentInsertError.message}`);
      }
    }

    if (parsed.storyTemplate.twists.length > 0) {
      const { error: twistsError } = await supabase.from("story_twists").upsert(
        parsed.storyTemplate.twists.map((twist) => ({
          id: twist.id,
          text: twist.text,
          age_group: twist.age_group || parsed.book.age_group || null,
          is_published: twist.is_published,
        })),
      );

      if (twistsError) {
        throw new Error(`Failed to save story twists: ${twistsError.message}`);
      }
    }
  }
}

export async function saveBookMeta(
  supabase: SupabaseClient,
  bookId: string,
  payload: BookEditorResponse["book"],
): Promise<BookEditorResponse["book"]> {
  const parsed = bookMetaSchema.parse(payload);
  const slug = await createUniqueBookSlug(supabase, parsed.slug || parsed.title, bookId);
  const { data, error } = await supabase
    .from("books")
    .update({
      title: parsed.title,
      slug,
      author: parsed.author || null,
      year: parsed.year ?? null,
      description: parsed.description || null,
      keywords: parsed.keywords,
      age_group: parsed.age_group || null,
      reading_time: parsed.reading_time ?? null,
      is_published: parsed.is_published,
    })
    .eq("id", bookId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save book meta.");
  }

  const book = data as BookTableRow;
  return {
    id: book.id,
    title: book.title,
    slug: book.slug,
    author: book.author,
    year: book.year,
    description: book.description,
    keywords: normalizeKeywords(book.keywords),
    age_group: book.age_group,
    reading_time: book.reading_time,
    is_published: book.is_published ?? false,
    created_at: book.created_at,
  };
}

export async function saveBookCategories(
  supabase: SupabaseClient,
  bookId: string,
  categoryIds: string[],
): Promise<string[]> {
  const uniqueIds = [...new Set(categoryIds)];
  const { error: deleteError } = await supabase.from("book_categories").delete().eq("book_id", bookId);
  if (deleteError) {
    throw new Error(`Failed to reset book categories: ${deleteError.message}`);
  }

  if (uniqueIds.length > 0) {
    const { error: insertError } = await supabase
      .from("book_categories")
      .insert(uniqueIds.map((categoryId) => ({ book_id: bookId, category_id: categoryId })));
    if (insertError) {
      throw new Error(`Failed to save book categories: ${insertError.message}`);
    }
  }

  return uniqueIds;
}

export async function saveBookExplanation(
  supabase: SupabaseClient,
  bookId: string,
  explanation: BookExplanationInput,
): Promise<BookExplanationInput> {
  const parsed = bookExplanationSchema.parse(explanation);

  if (parsed.slides.length === 0) {
    let query = supabase.from("book_explanations").delete().eq("book_id", bookId).eq("mode_id", parsed.mode_id);
    if (parsed.id) {
      query = query.eq("id", parsed.id);
    }
    const { error } = await query;
    if (error) {
      throw new Error(`Failed to clear explanation: ${error.message}`);
    }
    return { ...parsed, id: undefined };
  }

  const { data, error } = await supabase
    .from("book_explanations")
    .upsert({
      id: parsed.id,
      book_id: bookId,
      mode_id: parsed.mode_id,
      slides: parsed.slides,
      is_published: parsed.is_published,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save explanation.");
  }

  const saved = data as BookExplanationRow;
  return {
    ...parsed,
    id: saved.id,
    slides: coerceSlides(saved.slides),
    is_published: saved.is_published ?? false,
  };
}

export async function saveBookTest(
  supabase: SupabaseClient,
  bookId: string,
  test: BookEditorResponse["tests"][number],
): Promise<BookEditorResponse["tests"][number]> {
  const parsed = bookTestSchema.parse(test);
  const { data, error } = await supabase
    .from("book_tests")
    .upsert({
      id: parsed.id,
      book_id: bookId,
      title: parsed.title,
      description: parsed.description || null,
      quiz: quizEditorToDb(parsed.quiz),
      is_published: parsed.is_published,
      sort_order: parsed.sort_order,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save test.");
  }

  const saved = data as BookTestRow;
  return {
    id: saved.id,
    title: saved.title,
    description: saved.description,
    quiz: quizDbToEditor(saved.quiz),
    is_published: saved.is_published ?? false,
    sort_order: saved.sort_order ?? 0,
  };
}

export async function deleteBookTest(
  supabase: SupabaseClient,
  bookId: string,
  testId: string,
): Promise<void> {
  const { error } = await supabase.from("book_tests").delete().eq("book_id", bookId).eq("id", testId);
  if (error) {
    throw new Error(`Failed to delete test: ${error.message}`);
  }
}

export async function approveBook(
  supabase: SupabaseClient,
  bookId: string,
): Promise<void> {
  const { error } = await supabase.from("books").update({ is_published: true }).eq("id", bookId);
  if (error) {
    throw new Error(`Failed to approve book: ${error.message}`);
  }
}

export async function deleteBook(
  supabase: SupabaseClient,
  bookId: string,
): Promise<void> {
  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) {
    throw new Error(`Failed to delete book: ${error.message}`);
  }
}

const fullBookSectionSchema = z.object({
  slides: z.unknown(),
});

const fullBookGenerationSchema = z.object({
  description: z.string().trim().min(10).max(300).optional(),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).optional(),
  plot: fullBookSectionSchema.optional(),
  characters: fullBookSectionSchema.optional(),
  main_idea: fullBookSectionSchema.optional(),
  philosophy: fullBookSectionSchema.optional(),
  conflicts: fullBookSectionSchema.optional(),
  author_message: fullBookSectionSchema.optional(),
  ending_meaning: fullBookSectionSchema.optional(),
  twenty_seconds: fullBookSectionSchema.optional(),
  test: z
    .object({
      title: z.string().trim().min(1),
      description: z.string().trim().optional().nullable(),
      quiz: z.unknown(),
    })
    .optional(),
});

function normalizeQuizQuestions(quiz: unknown) {
  const sourceQuiz =
    normalizeGeneratedQuizPayload(quiz).length > 0
      ? normalizeGeneratedQuizPayload(quiz)
      : [
          {
            question: "О чём эта книга?",
            options: ["О приключении", "О погоде", "О машине"],
            correctAnswerIndex: 0,
          },
        ];

  const normalizedQuiz = sourceQuiz.slice(0, 5);

  while (normalizedQuiz.length < 5) {
    normalizedQuiz.push(normalizedQuiz[normalizedQuiz.length - 1]);
  }

  return normalizedQuiz;
}

function normalizeGeneratedFullBookPayload(
  parsed: z.infer<typeof fullBookGenerationSchema>,
  input: {
    title: string;
    description?: string | null;
  },
) {
  return canonicalFullBookSchema.parse({
    description: parsed.description?.trim() || input.description?.trim() || `Описание книги «${input.title}».`,
    keywords: normalizeGeneratedKeywords(parsed.keywords, input.title),
    plot: { slides: normalizeSlides(coerceSlides(parsed.plot?.slides), SLIDE_TARGETS.plot) },
    characters: { slides: normalizeSlides(coerceSlides(parsed.characters?.slides), SLIDE_TARGETS.characters) },
    main_idea: { slides: normalizeSlides(coerceSlides(parsed.main_idea?.slides), SLIDE_TARGETS.main_idea) },
    philosophy: { slides: normalizeSlides(coerceSlides(parsed.philosophy?.slides), SLIDE_TARGETS.philosophy) },
    conflicts: { slides: normalizeSlides(coerceSlides(parsed.conflicts?.slides), SLIDE_TARGETS.conflicts) },
    author_message: { slides: normalizeSlides(coerceSlides(parsed.author_message?.slides), SLIDE_TARGETS.author_message) },
    ending_meaning: { slides: normalizeSlides(coerceSlides(parsed.ending_meaning?.slides), SLIDE_TARGETS.ending_meaning) },
    twenty_seconds: { slides: normalizeSlides(coerceSlides(parsed.twenty_seconds?.slides), SLIDE_TARGETS.twenty_seconds) },
    test: canonicalQuizSchema.parse({
      title: parsed.test?.title ?? `Тест по книге «${input.title}»`,
      description: parsed.test?.description ?? "Ответь на вопросы по книге.",
      quiz: normalizeQuizQuestions(parsed.test?.quiz ?? []),
    }),
  });
}

function normalizeGeneratedKeywords(keywords: string[] | undefined, title: string) {
  const normalized = [...new Set((keywords ?? []).map((keyword) => keyword.trim().toLowerCase()).filter(Boolean))]
    .slice(0, 5);

  if (normalized.length >= 3) {
    return normalized;
  }

  const fallback = [title.trim().toLowerCase(), "детская книга", "книга для детей"];
  return [...new Set([...normalized, ...fallback])].slice(0, 5);
}

export async function createOrGetBook(
  supabase: SupabaseClient,
  input: {
    title: string;
    author?: string | null;
    ageGroup?: string | null;
  },
): Promise<BookTableRow> {
  const existing = await findBookByExactTitle(supabase, input.title);
  if (existing) {
    const { data, error } = await supabase.from("books").select("*").eq("id", existing.id).single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to load existing book.");
    }
    return data as BookTableRow;
  }

  const slug = await createUniqueBookSlug(supabase, input.title);
  const { data, error } = await supabase
    .from("books")
    .insert({
      title: input.title.trim(),
      author: input.author?.trim() || null,
      age_group: input.ageGroup?.trim() || null,
      slug,
      is_published: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create book.");
  }

  return data as BookTableRow;
}

export async function generateAndSaveFullBookContent(
  supabase: SupabaseClient,
  input: {
    bookId: string;
    title: string;
    author?: string | null;
    description?: string | null;
    ageGroup?: string | null;
  },
) {
  const generated = await runGeminiJsonPrompt<unknown>(
    generateWholeBookPrompt({
      title: input.title,
      author: input.author,
      description: input.description,
      ageGroup: input.ageGroup,
    }),
  );
  logGenerationDebug("full-book.raw", generated);
  detectFormatViolations(generated, "generateAndSaveFullBookContent.raw");

  let parsed: z.infer<typeof fullBookGenerationSchema>;
  try {
    parsed = validateWithDiagnostics(fullBookGenerationSchema, generated, "validation.full-book.parsed", {
      book: input.title,
    });
  } catch (error) {
    logZodError("validation.full-book.parsed.error", error, generated, {
      book: input.title,
    });
    throw new GeminiPipelineError(
      error instanceof Error ? error.message : "Full book validation failed.",
      "validation",
      JSON.stringify(generated),
    );
  }
  const originalSlideLengths = {
    keywords: parsed.keywords?.length ?? 0,
    plot: coerceSlides(parsed.plot?.slides).length,
    characters: coerceSlides(parsed.characters?.slides).length,
    main_idea: coerceSlides(parsed.main_idea?.slides).length,
    philosophy: coerceSlides(parsed.philosophy?.slides).length,
    conflicts: coerceSlides(parsed.conflicts?.slides).length,
    author_message: coerceSlides(parsed.author_message?.slides).length,
    ending_meaning: coerceSlides(parsed.ending_meaning?.slides).length,
    twenty_seconds: coerceSlides(parsed.twenty_seconds?.slides).length,
    quiz: normalizeGeneratedQuizPayload(parsed.test?.quiz).length,
  };
  let normalized;
  try {
    normalized = normalizeGeneratedFullBookPayload(parsed, input);
  } catch (error) {
    logZodError("validation.full-book.canonical.error", error, parsed, {
      book: input.title,
    });
    throw error;
  }
  logGenerationDebug("full-book.normalized", {
    original: originalSlideLengths,
    normalized: {
      keywords: normalized.keywords.length,
      plot: normalized.plot.slides.length,
      characters: normalized.characters.slides.length,
      main_idea: normalized.main_idea.slides.length,
      philosophy: normalized.philosophy.slides.length,
      conflicts: normalized.conflicts.slides.length,
      author_message: normalized.author_message.slides.length,
      ending_meaning: normalized.ending_meaning.slides.length,
      twenty_seconds: normalized.twenty_seconds.slides.length,
      quiz: normalized.test.quiz.length,
    },
  });
  validateQuizDeep(normalized.test.quiz);
  const [modes, testsRes] = await Promise.all([
    loadExplanationModes(supabase),
    supabase.from("book_tests").select("*").eq("book_id", input.bookId).order("sort_order", { ascending: true }).limit(1),
  ]);

  if (testsRes.error) {
    throw new Error(`Failed to load existing tests: ${testsRes.error.message}`);
  }

  const { error: bookUpdateError } = await supabase
    .from("books")
    .update({
      description: normalized.description,
      keywords: normalized.keywords,
    })
    .eq("id", input.bookId);

  if (bookUpdateError) {
    throw new Error(`Failed to save generated book fields: ${bookUpdateError.message}`);
  }

  const modeBySlug = new Map(modes.map((mode) => [mode.slug, mode]));
  const explanationSections = [
    "plot",
    "characters",
    "main_idea",
    "philosophy",
    "conflicts",
    "author_message",
    "ending_meaning",
    "twenty_seconds",
  ] as const;

  const explanations = await Promise.all(
    explanationSections.map(async (section) => {
      const mode = modeBySlug.get(section);
      if (!mode) {
        return null;
      }
      return saveBookExplanation(supabase, input.bookId, {
        mode_id: mode.id,
        mode_slug: mode.slug,
        mode_name: mode.name,
        is_published: false,
        slides: normalized[section].slides,
      });
    }),
  );

  const existingTest = ((testsRes.data as BookTestRow[] | null) ?? [])[0];
  logGenerationEvent("final.full-book.payload", {
    description: normalized.description,
    keywords: normalized.keywords,
    slides: {
      plot: normalized.plot.slides.length,
      characters: normalized.characters.slides.length,
      main_idea: normalized.main_idea.slides.length,
      philosophy: normalized.philosophy.slides.length,
      conflicts: normalized.conflicts.slides.length,
      author_message: normalized.author_message.slides.length,
      ending_meaning: normalized.ending_meaning.slides.length,
      twenty_seconds: normalized.twenty_seconds.slides.length,
    },
    test: {
      title: normalized.test.title,
      quizQuestions: normalized.test.quiz.length,
    },
  }, {
    valid: true,
    level: "success",
    summary: { book: input.title },
  });
  const test = await saveBookTest(supabase, input.bookId, {
    id: existingTest?.id,
    title: normalized.test.title,
    description: normalized.test.description ?? "Ответь на вопросы по книге.",
    is_published: false,
    sort_order: existingTest?.sort_order ?? 0,
    quiz: normalized.test.quiz,
  });

  logGenerationDebug("full-book.db-save", {
    bookId: input.bookId,
    description: normalized.description,
    keywords: normalized.keywords,
    explanations: explanations
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({
        mode_id: item.mode_id,
        slides: item.slides.length,
      })),
    test: {
      id: test.id,
      title: test.title,
      quiz: test.quiz.length,
    },
  });
  logGenerationOk({
    book: input.title,
    slides: {
      plot: normalized.plot.slides.length,
      characters: normalized.characters.slides.length,
      main_idea: normalized.main_idea.slides.length,
      philosophy: normalized.philosophy.slides.length,
      conflicts: normalized.conflicts.slides.length,
      author_message: normalized.author_message.slides.length,
      ending_meaning: normalized.ending_meaning.slides.length,
      twenty_seconds: normalized.twenty_seconds.slides.length,
    },
    quizQuestions: normalized.test.quiz.length,
    keywords: normalized.keywords.length,
  });

  return {
    explanations: explanations.filter((item): item is NonNullable<typeof item> => item !== null),
    test,
  };
}

async function loadStoryTemplateDetails(
  supabase: SupabaseClient,
  template: StoryTemplateRow,
): Promise<StoryBuilderTemplate> {
  await repairStoryTemplateData(supabase, template.id);
  const [stepsRes, choicesRes, fragmentsRes] = await Promise.all([
    supabase.from("story_steps").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
    supabase
      .from("story_choices")
      .select("id,step_id,text,short_text,sort_order,story_steps!inner(template_id)")
      .eq("story_steps.template_id", template.id)
      .order("sort_order", { ascending: true }),
    supabase.from("story_fragments").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
  ]);

  if (stepsRes.error) {
    throw new Error(`Failed to load story steps: ${stepsRes.error.message}`);
  }
  if (choicesRes.error) {
    throw new Error(`Failed to load story choices: ${choicesRes.error.message}`);
  }
  if (fragmentsRes.error) {
    throw new Error(`Failed to load story fragments: ${fragmentsRes.error.message}`);
  }

  const existingStepMap = new Map(
    (((stepsRes.data as StoryStepRow[] | null) ?? []).map((step) => [normalizeStoryRole(step.step_key), step])),
  );
  const steps = STORY_ROLE_KEYS.map((role, index) => {
    const step = existingStepMap.get(role);
    return {
      id: step?.id,
      step_key: role,
      question: role === "narration" ? (step?.question ?? "") : (step?.question ?? STORY_ROLE_QUESTIONS[role]),
      short_text: role === "narration" ? null : (step?.short_text ?? null),
      narration: step?.narration ?? (role === "narration" ? "" : null),
      sort_order: index,
      choices: [] as StoryTemplateInput["steps"][number]["choices"],
    };
  });

  const stepMap = new Map(steps.map((step) => [step.id, step]));
  const choiceSortOrderById = new Map<string, number>();
  ((choicesRes.data as Array<StoryChoiceRow & { story_steps?: unknown }> | null) ?? []).forEach((choice) => {
    const parent = stepMap.get(choice.step_id);
    if (!parent) {
      return;
    }
    const sortOrder = choice.sort_order ?? parent.choices.length;
    parent.choices.push({
      id: choice.id,
      text: choice.text,
      short_text: choice.short_text ?? "",
      sort_order: sortOrder,
    });
    choiceSortOrderById.set(choice.id, sortOrder);
  });

  return {
    id: template.id,
    name: template.name,
    slug: template.slug,
    is_published: template.is_published ?? true,
    steps,
    fragments: ((fragmentsRes.data as StoryFragmentRow[] | null) ?? []).map((fragment) => ({
      id: fragment.id,
      step_key: normalizeStoryRole(fragment.step_key),
      choice_id: fragment.choice_id,
      choice_temp_key:
        fragment.choice_id && choiceSortOrderById.has(fragment.choice_id)
          ? String(choiceSortOrderById.get(fragment.choice_id))
          : null,
      text: fragment.text,
      sort_order: fragment.sort_order ?? 0,
    })),
    twists: [],
  };
}

export async function loadStoryTemplateById(
  supabase: SupabaseClient,
  templateId: string,
): Promise<StoryBuilderTemplate> {
  const { data, error } = await supabase.from("story_templates").select("*").eq("id", templateId).single();
  if (error || !data) {
    throw new Error(error?.message ?? "Story template not found.");
  }
  return loadStoryTemplateDetails(supabase, data as StoryTemplateRow);
}

export async function loadStoryBuilderData(supabase: SupabaseClient): Promise<StoryBuilderResponse> {
  await repairStoryTemplates(supabase);
  const [templatesRes, twistsRes] = await Promise.all([
    supabase.from("story_templates").select("*").order("created_at", { ascending: false }),
    supabase.from("story_twists").select("*").order("created_at", { ascending: false }),
  ]);

  if (templatesRes.error) {
    throw new Error(`Failed to load story templates: ${templatesRes.error.message}`);
  }
  if (twistsRes.error) {
    throw new Error(`Failed to load story twists: ${twistsRes.error.message}`);
  }

  const templates = await Promise.all(
    (((templatesRes.data as StoryTemplateRow[] | null) ?? []).map((template) =>
      loadStoryTemplateDetails(supabase, template))),
  );

  return {
    templates,
    twists: ((twistsRes.data as StoryTwistRow[] | null) ?? []).map((twist) => ({
      id: twist.id,
      text: twist.text,
      age_group: twist.age_group,
      is_published: twist.is_published ?? true,
    })),
  };
}

export async function saveStoryTemplateMeta(
  supabase: SupabaseClient,
  template: StoryBuilderTemplate,
): Promise<StoryBuilderTemplate> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, "Template name is required.").max(160),
      slug: z.string().trim().min(1, "Template slug is required."),
      is_published: z.boolean().default(true),
    })
    .parse(template);
  const { data, error } = await supabase
    .from("story_templates")
    .upsert({
      id: parsed.id,
      name: parsed.name,
      slug: safeSlug(parsed.slug) || "story-template",
      is_published: parsed.is_published,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save story template.");
  }

  return {
    ...parsed,
    id: (data as StoryTemplateRow).id,
    steps: createDefaultStorySteps(),
    fragments: [],
    twists: [],
  };
}

export async function saveStoryStepBlock(
  supabase: SupabaseClient,
  templateId: string,
  step: StoryBuilderTemplate["steps"][number],
): Promise<StoryBuilderTemplate["steps"][number]> {
  const parsedStep = storyStepSchema.parse(step);
  const role = normalizeStoryRole(parsedStep.step_key);
  await repairStoryTemplateData(supabase, templateId);
  const { data: savedStepData, error: stepError } = await supabase
    .from("story_steps")
    .upsert({
      id: parsedStep.id,
      template_id: templateId,
      step_key: role,
      question: parsedStep.question,
      short_text: parsedStep.short_text?.trim() || null,
      narration: parsedStep.narration?.trim() || null,
      sort_order: parsedStep.sort_order,
    })
    .select("*")
    .single();

  if (stepError || !savedStepData) {
    throw new Error(stepError?.message ?? "Failed to save story step.");
  }

  const savedStep = savedStepData as StoryStepRow;
  const { data: existingChoices, error: existingChoicesError } = await supabase
    .from("story_choices")
    .select("id")
    .eq("step_id", savedStep.id);

  if (existingChoicesError) {
    throw new Error(`Failed to load existing story choices: ${existingChoicesError.message}`);
  }

  const existingChoiceIds = ((existingChoices as Array<{ id: string }> | null) ?? []).map((choice) => choice.id);
  if (existingChoiceIds.length > 0) {
    const { error: unlinkFragmentsError } = await supabase
      .from("story_fragments")
      .update({ choice_id: null })
      .eq("template_id", templateId)
      .eq("step_key", role)
      .in("choice_id", existingChoiceIds);

    if (unlinkFragmentsError) {
      throw new Error(`Failed to unlink story fragments from old choices: ${unlinkFragmentsError.message}`);
    }
  }

  const { error: deleteChoicesError } = await supabase.from("story_choices").delete().eq("step_id", savedStep.id);
  if (deleteChoicesError) {
    throw new Error(`Failed to reset story choices: ${deleteChoicesError.message}`);
  }

  let choices: StoryBuilderTemplate["steps"][number]["choices"] = [];
  if (parsedStep.choices.length > 0) {
    const { data: insertedChoices, error: choiceError } = await supabase
      .from("story_choices")
      .insert(
        parsedStep.choices.map((choice, index) => ({
          step_id: savedStep.id,
          text: choice.text,
          short_text: choice.short_text?.trim() || null,
          sort_order: choice.sort_order ?? index,
        })),
      )
      .select("*");
    if (choiceError) {
      throw new Error(`Failed to save story choices: ${choiceError.message}`);
    }
    choices = ((insertedChoices as StoryChoiceRow[] | null) ?? []).map((choice) => ({
      id: choice.id,
      text: choice.text,
      short_text: choice.short_text ?? "",
      sort_order: choice.sort_order ?? 0,
    }));
  }

  return {
    id: savedStep.id,
    step_key: role,
    question: role === "narration" ? savedStep.question : savedStep.question,
    short_text: role === "narration" ? null : (savedStep.short_text ?? null),
    narration: savedStep.narration ?? (role === "narration" ? "" : null),
    sort_order: savedStep.sort_order ?? 0,
    choices,
  };
}

export async function saveStoryFragmentsBlock(
  supabase: SupabaseClient,
  templateId: string,
  role: StoryRoleKey,
  fragments: StoryBuilderTemplate["fragments"],
  steps: StoryBuilderTemplate["steps"],
): Promise<StoryBuilderTemplate["fragments"]> {
  await repairStoryTemplateData(supabase, templateId);
  const parsedSteps = z.array(storyStepSchema).parse(steps);
  const parsedFragments = z.array(storyFragmentSchema).parse(fragments);
  const choiceIdsByRoleAndIndex = new Map<string, string>();
  const validChoiceIds = new Set<string>();
  parsedSteps.forEach((step) => {
    step.choices.forEach((choice, index) => {
      if (choice.id) {
        validChoiceIds.add(choice.id);
        choiceIdsByRoleAndIndex.set(`${step.step_key}:${choice.sort_order ?? index}`, choice.id);
      }
    });
  });

  const { error: deleteError } = await supabase
    .from("story_fragments")
    .delete()
    .eq("template_id", templateId)
    .eq("step_key", role);
  if (deleteError) {
    throw new Error(`Failed to reset story fragments: ${deleteError.message}`);
  }

  if (parsedFragments.length === 0) {
    return [];
  }

  const fragmentsToInsert = parsedFragments.flatMap((fragment, index) => {
    const mappedChoiceId =
      fragment.choice_temp_key !== null && fragment.choice_temp_key !== undefined && fragment.choice_temp_key !== ""
        ? choiceIdsByRoleAndIndex.get(`${normalizeStoryRole(fragment.step_key)}:${fragment.choice_temp_key}`) ?? null
        : null;
    const fallbackChoiceId =
      fragment.choice_id && validChoiceIds.has(fragment.choice_id) ? fragment.choice_id : null;
    const choiceId = mappedChoiceId ?? fallbackChoiceId;

    console.log("FRAGMENT SAVE", {
      fragment,
      choice_id: choiceId,
      mapped_choice_id: mappedChoiceId,
      fallback_choice_id: fallbackChoiceId,
    });

    if (!choiceId) {
      console.warn("Skipping story fragment without valid choice_id", {
        templateId,
        role,
        fragment,
      });
      return [];
    }

    return [{
      template_id: templateId,
      step_key: normalizeStoryRole(fragment.step_key),
      choice_id: choiceId,
      text: fragment.text,
      sort_order: fragment.sort_order ?? index,
    }];
  });

  if (fragmentsToInsert.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("story_fragments")
    .insert(fragmentsToInsert)
    .select("*");

  if (error) {
    throw new Error(`Failed to save story fragments: ${error.message}`);
  }

  return ((data as StoryFragmentRow[] | null) ?? []).map((fragment) => {
    const role = normalizeStoryRole(fragment.step_key);
    const step = parsedSteps.find((item) => item.step_key === role);
    const matchedChoice =
      fragment.choice_id && step
        ? step.choices.find((choice) => choice.id === fragment.choice_id)
        : undefined;
    return {
      id: fragment.id,
      step_key: role,
      choice_id: fragment.choice_id,
      choice_temp_key:
        matchedChoice && typeof matchedChoice.sort_order === "number"
          ? String(matchedChoice.sort_order)
          : null,
      text: fragment.text,
      sort_order: fragment.sort_order ?? 0,
    };
  });
}

export async function saveStoryTwists(
  supabase: SupabaseClient,
  twists: StoryBuilderResponse["twists"],
): Promise<StoryBuilderResponse["twists"]> {
  const parsedTwists = z.array(storyTwistSchema).parse(twists);
  logGenerationEvent("twists.save.payload", parsedTwists, {
    valid: true,
    level: "success",
    summary: {
      total: parsedTwists.length,
      inserts: parsedTwists.filter((twist) => !twist.id).length,
      updates: parsedTwists.filter((twist) => Boolean(twist.id)).length,
    },
    payloadPreview: {
      twists: parsedTwists.slice(0, 5).map((twist) => ({
        id: twist.id ?? null,
        operation: twist.id ? "update" : "insert",
        textLength: twist.text.length,
      })),
    },
  });
  const existingIds = parsedTwists.map((twist) => twist.id).filter(Boolean) as string[];
  const { data: allExisting, error: loadError } = await supabase.from("story_twists").select("id");
  if (loadError) {
    throw new Error(`Failed to load existing twists: ${loadError.message}`);
  }
  const staleIds = ((allExisting as Array<{ id: string }> | null) ?? [])
    .map((item) => item.id)
    .filter((id) => !existingIds.includes(id));
  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from("story_twists").delete().in("id", staleIds);
    if (deleteError) {
      throw new Error(`Failed to delete twists: ${deleteError.message}`);
    }
  }

  if (parsedTwists.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("story_twists")
    .upsert(
      parsedTwists.map((twist) => ({
        ...(twist.id ? { id: twist.id } : {}),
        text: twist.text,
        age_group: twist.age_group || null,
        is_published: twist.is_published,
      })),
    )
    .select("*");

  if (error) {
    throw new Error(`Failed to save twists: ${error.message}`);
  }

  return ((data as StoryTwistRow[] | null) ?? []).map((twist) => ({
    id: twist.id,
    text: twist.text,
    age_group: twist.age_group,
    is_published: twist.is_published ?? true,
  }));
}

function cleanGeminiJson(raw: string): string {
  return raw
    .trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

export class GeminiPipelineError extends Error {
  stage: string;
  rawResponse?: string;

  constructor(message: string, stage: string, rawResponse?: string) {
    super(message);
    this.name = "GeminiPipelineError";
    this.stage = stage;
    this.rawResponse = rawResponse;
  }
}

export function parseGeminiJson(raw: string): unknown {
  const cleaned = cleanGeminiJson(raw);
  logGenerationEvent("parsed.json.input", raw, {
    valid: true,
    level: "success",
    summary: { rawLength: raw.length, cleanedLength: cleaned.length },
    payloadPreview: { rawPreview: cleaned.slice(0, 180) },
  });
  try {
    const parsed = JSON.parse(cleaned);
    detectFormatViolations(parsed, "parseGeminiJson");
    logGenerationEvent("parsed.json", parsed, {
      valid: true,
      level: "success",
    });
    return parsed;
  } catch (firstError) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const recovered = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        detectFormatViolations(recovered, "parseGeminiJson.recovered");
        logGenerationEvent("parsed.json.recovered", recovered, {
          valid: true,
          level: "warning",
          summary: { recovered: true },
        });
        return recovered;
      } catch (secondError) {
        logGenerationEvent("parsed.json.error", raw, {
          valid: false,
          level: "error",
          errors: [
            firstError instanceof Error ? firstError.message : "Initial JSON parse failed.",
            secondError instanceof Error ? secondError.message : "Recovery JSON parse failed.",
          ],
          payloadPreview: { rawPreview: cleaned.slice(0, 180) },
        });
        throw new GeminiPipelineError("Failed to parse Gemini JSON response.", "parse", raw);
      }
    }
    logGenerationEvent("parsed.json.error", raw, {
      valid: false,
      level: "error",
      errors: [firstError instanceof Error ? firstError.message : "JSON parse failed."],
      payloadPreview: { rawPreview: cleaned.slice(0, 180) },
    });
    throw new GeminiPipelineError("Failed to parse Gemini JSON response.", "parse", raw);
  }
}

export async function runGeminiJsonPrompt<T>(prompt: string): Promise<T> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  let response;
  try {
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
  } catch (error) {
    throw new GeminiPipelineError(
      error instanceof Error ? error.message : "Gemini generation failed.",
      "generation",
    );
  }

  if (!response.text) {
    throw new GeminiPipelineError("Gemini returned an empty response.", "generation");
  }

  logGenerationEvent("raw.llm.response", response.text, {
    valid: true,
    level: "success",
    summary: { chars: response.text.length },
    payloadPreview: { rawPreview: response.text.slice(0, 180) },
  });

  return parseGeminiJson(response.text) as T;
}

export function buildExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  mode: string;
}): string {
  return buildExplanationPromptText(input);
}

export function buildFullExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  modes: Array<{ slug: string; name: string }>;
}): string {
  return buildFullExplanationPromptText(input);
}

export function buildTestPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  ageGroup?: string | null;
}): string {
  return buildTestPromptText(input);
}

export function buildStoryPartPrompt(input: {
  title: string;
  description?: string | null;
  ageGroup?: string | null;
  templateName?: string | null;
  kind: "step" | "choice" | "fragment" | "twist";
  storyRole?: StoryRoleKey;
  previousRole?: StoryRoleKey | null;
  context?: string;
}): string {
  return buildStoryPartPromptText(input);
}

export function validateCanonicalStoryPartStep(value: unknown) {
  return canonicalStoryPartStepSchema.parse(value);
}

export function validateCanonicalStoryPartText(value: unknown) {
  return canonicalStoryPartTextSchema.parse(value);
}

export function buildStoryTemplatePrompt(input: {
  title: string;
  description?: string | null;
  ageGroup?: string | null;
  templateName: string;
  templateSlug: string;
}): string {
  return buildStoryTemplatePromptText(input);
}
