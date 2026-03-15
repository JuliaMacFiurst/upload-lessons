import type { NextApiRequest, NextApiResponse } from "next";
import slugify from "slugify";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import {
  DEFAULT_EXPLANATION_MODE_SLUGS,
  STORY_ROLE_KEYS,
  bookEditorPayloadSchema,
  bookExplanationSchema,
  bookMetaSchema,
  bookTestSchema,
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
  sort_order: number | null;
};

type StoryChoiceRow = {
  id: string;
  step_id: string;
  text: string;
  keywords: string[] | null;
  sort_order: number | null;
};

type StoryFragmentRow = {
  id: string;
  template_id: string;
  step_key: string;
  choice_id: string | null;
  text: string;
  keywords: string[] | null;
  sort_order: number | null;
};

type StoryTwistRow = {
  id: string;
  text: string;
  keywords: string[] | null;
  age_group: string | null;
  is_published: boolean | null;
};

type QuizDbAnswer = {
  text?: unknown;
  correct?: unknown;
};

type QuizDbQuestion = {
  question?: unknown;
  answers?: unknown;
};

type QuizDbPayload = {
  questions?: unknown;
};

const STORY_ROLE_DESCRIPTIONS: Record<StoryRoleKey, string> = {
  intro: "Start the story. Introduce the capybara, a discovery, or a playful invitation to adventure.",
  journey: "Move the story forward. Show the capybara traveling, exploring, or beginning the adventure.",
  problem: "Introduce the obstacle. Something difficult, surprising, or blocking must happen.",
  solution: "Resolve the obstacle. The capybara uses a clever, kind, or funny solution.",
  ending: "Close the story. Show the result, lesson, or happy ending after the solution.",
};

const STORY_ROLE_QUESTIONS: Record<StoryRoleKey, string> = {
  intro: "How does the capybara's adventure begin?",
  journey: "Where does the capybara go next?",
  problem: "What problem appears during the adventure?",
  solution: "How does the capybara solve the problem?",
  ending: "How does the story end?",
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
    question: STORY_ROLE_QUESTIONS[role],
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

export function safeSlug(input: string): string {
  return slugify(input, {
    lower: true,
    strict: true,
    trim: true,
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
    .limit(50);

  const trimmed = search.trim();
  if (trimmed) {
    query = query.or(`title.ilike.%${trimmed}%,author.ilike.%${trimmed}%,slug.ilike.%${trimmed}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load books: ${error.message}`);
  }
  return (data as BookListItem[] | null) ?? [];
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

export function quizDbToEditor(value: unknown): BookEditorResponse["tests"][number]["quiz"] {
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
        };

        const question = typeof record.question === "string" ? record.question.trim() : "";
        const options = Array.isArray(record.options)
          ? record.options
              .map((option) => (typeof option === "string" ? option.trim() : ""))
              .filter(Boolean)
          : [];
        const correctAnswerIndex =
          typeof record.correctAnswerIndex === "number" && Number.isInteger(record.correctAnswerIndex)
            ? record.correctAnswerIndex
            : 0;

        if (!question || options.length < 3) {
          return null;
        }

        return {
          question,
          options,
          correctAnswerIndex,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const questions = (value as QuizDbPayload).questions;
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as QuizDbQuestion;
      const question = typeof record.question === "string" ? record.question.trim() : "";
      const answers = Array.isArray(record.answers) ? (record.answers as QuizDbAnswer[]) : [];
      const options = answers
        .map((answer) => (typeof answer.text === "string" ? answer.text.trim() : ""))
        .filter(Boolean);
      const correctAnswerIndex = answers.findIndex((answer) => answer.correct === true);

      if (!question || options.length < 3) {
        return null;
      }

      return {
        question,
        options,
        correctAnswerIndex: correctAnswerIndex >= 0 ? correctAnswerIndex : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
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
    name: `${book.title} Capybara Story`,
    slug: `${baseSlug}-capybara`,
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

  const templateSlugCandidates = [`${typedBook.slug}-capybara`, typedBook.slug];
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
    const [stepsRes, choicesRes, fragmentsRes, twistsRes] = await Promise.all([
      supabase.from("story_steps").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
      supabase
        .from("story_choices")
        .select("id,step_id,text,keywords,sort_order,story_steps!inner(template_id)")
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
        question: step?.question ?? STORY_ROLE_QUESTIONS[role],
        sort_order: index,
        choices: [] as StoryTemplateInput["steps"][number]["choices"],
      };
    });

    const stepMap = new Map(steps.map((step) => [step.id, step]));
    ((choicesRes.data as Array<StoryChoiceRow & { story_steps?: unknown }> | null) ?? []).forEach(
      (choice) => {
      const parent = stepMap.get(choice.step_id);
        if (!parent) {
          return;
        }
        parent.choices.push({
          id: choice.id,
          text: choice.text,
          keywords: normalizeKeywords(choice.keywords),
          sort_order: choice.sort_order ?? parent.choices.length,
        });
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
        choice_temp_key: null,
        text: fragment.text,
        keywords: normalizeKeywords(fragment.keywords),
        sort_order: fragment.sort_order ?? 0,
      })),
      twists: ((twistsRes.data as StoryTwistRow[] | null) ?? []).map((twist) => ({
        id: twist.id,
        text: twist.text,
        keywords: normalizeKeywords(twist.keywords),
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
    const templateSlug = safeSlug(parsed.storyTemplate.slug) || `${slug}-capybara`;
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
            keywords: choice.keywords,
            sort_order: choice.sort_order ?? index,
          })),
        )
        .select("*");

      if (insertedChoicesError) {
        throw new Error(`Failed to save story choices: ${insertedChoicesError.message}`);
      }

      ((insertedChoices as StoryChoiceRow[] | null) ?? []).forEach((choice, index) => {
        choiceIdMap.set(`${step.step_key}:${index}`, choice.id);
      });
    }

    if (parsed.storyTemplate.fragments.length > 0) {
      const { error: fragmentInsertError } = await supabase.from("story_fragments").insert(
        parsed.storyTemplate.fragments.map((fragment, index) => {
          const choiceId =
            fragment.choice_id ??
            (fragment.choice_temp_key && choiceIdMap.get(`${fragment.step_key}:${fragment.choice_temp_key}`)) ??
            null;
          return {
            template_id: templateId,
            step_key: fragment.step_key,
            choice_id: choiceId,
            text: fragment.text,
            keywords: fragment.keywords,
            sort_order: fragment.sort_order ?? index,
          };
        }),
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
          keywords: twist.keywords,
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

async function loadStoryTemplateDetails(
  supabase: SupabaseClient,
  template: StoryTemplateRow,
): Promise<StoryBuilderTemplate> {
  const [stepsRes, choicesRes, fragmentsRes] = await Promise.all([
    supabase.from("story_steps").select("*").eq("template_id", template.id).order("sort_order", { ascending: true }),
    supabase
      .from("story_choices")
      .select("id,step_id,text,keywords,sort_order,story_steps!inner(template_id)")
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
      question: step?.question ?? STORY_ROLE_QUESTIONS[role],
      sort_order: index,
      choices: [] as StoryTemplateInput["steps"][number]["choices"],
    };
  });

  const stepMap = new Map(steps.map((step) => [step.id, step]));
  ((choicesRes.data as Array<StoryChoiceRow & { story_steps?: unknown }> | null) ?? []).forEach((choice) => {
    const parent = stepMap.get(choice.step_id);
    if (!parent) {
      return;
    }
    parent.choices.push({
      id: choice.id,
      text: choice.text,
      keywords: normalizeKeywords(choice.keywords),
      sort_order: choice.sort_order ?? parent.choices.length,
    });
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
      choice_temp_key: null,
      text: fragment.text,
      keywords: normalizeKeywords(fragment.keywords),
      sort_order: fragment.sort_order ?? 0,
    })),
    twists: [],
  };
}

export async function loadStoryBuilderData(supabase: SupabaseClient): Promise<StoryBuilderResponse> {
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
      keywords: normalizeKeywords(twist.keywords),
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
  const role = normalizeStoryRole(step.step_key);
  const { data: savedStepData, error: stepError } = await supabase
    .from("story_steps")
    .upsert({
      id: step.id,
      template_id: templateId,
      step_key: role,
      question: step.question,
      sort_order: step.sort_order,
    })
    .select("*")
    .single();

  if (stepError || !savedStepData) {
    throw new Error(stepError?.message ?? "Failed to save story step.");
  }

  const savedStep = savedStepData as StoryStepRow;
  const { error: deleteChoicesError } = await supabase.from("story_choices").delete().eq("step_id", savedStep.id);
  if (deleteChoicesError) {
    throw new Error(`Failed to reset story choices: ${deleteChoicesError.message}`);
  }

  let choices: StoryBuilderTemplate["steps"][number]["choices"] = [];
  if (step.choices.length > 0) {
    const { data: insertedChoices, error: choiceError } = await supabase
      .from("story_choices")
      .insert(
        step.choices.map((choice, index) => ({
          step_id: savedStep.id,
          text: choice.text,
          keywords: choice.keywords,
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
      keywords: normalizeKeywords(choice.keywords),
      sort_order: choice.sort_order ?? 0,
    }));
  }

  return {
    id: savedStep.id,
    step_key: role,
    question: savedStep.question,
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
  const choiceIdsByRoleAndIndex = new Map<string, string>();
  steps.forEach((step) => {
    step.choices.forEach((choice, index) => {
      if (choice.id) {
        choiceIdsByRoleAndIndex.set(`${step.step_key}:${index}`, choice.id);
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

  if (fragments.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("story_fragments")
    .insert(
      fragments.map((fragment, index) => ({
        template_id: templateId,
        step_key: normalizeStoryRole(fragment.step_key),
        choice_id:
          fragment.choice_id ??
          (fragment.choice_temp_key
            ? choiceIdsByRoleAndIndex.get(`${normalizeStoryRole(fragment.step_key)}:${fragment.choice_temp_key}`)
            : null) ??
          null,
        text: fragment.text,
        keywords: fragment.keywords,
        sort_order: fragment.sort_order ?? index,
      })),
    )
    .select("*");

  if (error) {
    throw new Error(`Failed to save story fragments: ${error.message}`);
  }

  return ((data as StoryFragmentRow[] | null) ?? []).map((fragment) => {
    const role = normalizeStoryRole(fragment.step_key);
    const step = steps.find((item) => item.step_key === role);
    const choiceIndex =
      fragment.choice_id && step
        ? step.choices.findIndex((choice) => choice.id === fragment.choice_id)
        : -1;
    return {
      id: fragment.id,
      step_key: role,
      choice_id: fragment.choice_id,
      choice_temp_key: choiceIndex >= 0 ? String(choiceIndex) : null,
      text: fragment.text,
      keywords: normalizeKeywords(fragment.keywords),
      sort_order: fragment.sort_order ?? 0,
    };
  });
}

export async function saveStoryTwists(
  supabase: SupabaseClient,
  twists: StoryBuilderResponse["twists"],
): Promise<StoryBuilderResponse["twists"]> {
  const existingIds = twists.map((twist) => twist.id).filter(Boolean) as string[];
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

  if (twists.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("story_twists")
    .upsert(
      twists.map((twist) => ({
        id: twist.id,
        text: twist.text,
        keywords: twist.keywords,
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
    keywords: normalizeKeywords(twist.keywords),
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

export function parseGeminiJson(raw: string): unknown {
  const cleaned = cleanGeminiJson(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("Failed to parse Gemini JSON response.");
  }
}

export async function runGeminiJsonPrompt<T>(prompt: string): Promise<T> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parseGeminiJson(response.text) as T;
}

export function buildExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  mode: string;
}): string {
  return [
    "You write educational book explanations for children.",
    "Return valid JSON only.",
    "Output format:",
    '{"slides":[{"text":"..."},{"text":"..."}]}',
    "Rules:",
    "- 3 to 4 slides.",
    "- Each slide must be 1 short child-friendly sentence.",
    "- Keep language simple and concrete.",
    "- Focus only on the requested mode.",
    "- No markdown.",
    "- No numbering.",
    "",
    `Book title: ${input.title}`,
    `Author: ${input.author ?? "Unknown"}`,
    `Description: ${input.description ?? "No description provided."}`,
    `Mode: ${input.mode}`,
  ].join("\n");
}

export function buildFullExplanationPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  modes: Array<{ slug: string; name: string }>;
}): string {
  return [
    "You write educational book explanations for children.",
    "Return valid JSON only.",
    'Output format: {"items":[{"mode":"plot","slides":[{"text":"..."}]}]}',
    "Rules:",
    "- Generate only for the listed modes.",
    "- 3 to 4 slides per mode.",
    "- Each slide must be 1 short child-friendly sentence.",
    "- No markdown.",
    "",
    `Book title: ${input.title}`,
    `Author: ${input.author ?? "Unknown"}`,
    `Description: ${input.description ?? "No description provided."}`,
    `Modes: ${input.modes.map((mode) => `${mode.slug} (${mode.name})`).join(", ")}`,
  ].join("\n");
}

export function buildTestPrompt(input: {
  title: string;
  author?: string | null;
  description?: string | null;
  ageGroup?: string | null;
}): string {
  return [
    "You write reading comprehension quizzes for children.",
    "Return valid JSON only.",
    'Output format: {"title":"...","description":"...","quiz":[{"question":"...","options":["...","...","..."],"correctAnswerIndex":0}]}',
    "Rules:",
    "- Create 5 questions.",
    "- Each question must have 3 or 4 answer options.",
    "- Exactly one correct answer.",
    "- Keep questions clear for children.",
    "- No markdown.",
    "",
    `Book title: ${input.title}`,
    `Author: ${input.author ?? "Unknown"}`,
    `Description: ${input.description ?? "No description provided."}`,
    `Age group: ${input.ageGroup ?? "Unknown"}`,
  ].join("\n");
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
  const storyRole = input.storyRole ?? "intro";
  const previousRole = input.previousRole ?? null;
  const roleDescription = STORY_ROLE_DESCRIPTIONS[storyRole];
  return [
    "You are writing a children's capybara story fragment.",
    "Return valid JSON only.",
    "Style rules:",
    "- one short sentence",
    "- playful capybara tone",
    "- child-friendly wording",
    "- no violence or scary details",
    "- the sentence must match the story role exactly",
    "- the sentence must logically follow the previous role in the story sequence",
    "- every fragment must still fit with any other fragment from the same role",
    "",
    `Book title: ${input.title}`,
    `Book description: ${input.description ?? "No description provided."}`,
    `Age group: ${input.ageGroup ?? "Unknown"}`,
    `Template name: ${input.templateName ?? "Capybara Story"}`,
    `Content kind: ${input.kind}`,
    `Story role: ${storyRole.toUpperCase()}`,
    `Role instruction: ${roleDescription}`,
    previousRole
      ? `Previous story role: ${previousRole.toUpperCase()}`
      : "Previous story role: none, this is the beginning of the story",
    `Context: ${input.context ?? "No extra context."}`,
    "",
    input.kind === "step"
      ? `Output format: {"question":"${STORY_ROLE_QUESTIONS[storyRole]}","step_key":"${storyRole}"}`
      : input.kind === "choice"
        ? 'Output format: {"text":"...","keywords":["...","..."]}'
        : input.kind === "fragment"
          ? 'Output format: {"text":"...","keywords":["...","..."]}'
          : 'Output format: {"text":"...","keywords":["...","..."]}',
    "",
    "Narrative rules by role:",
    "- INTRO: begin the adventure with a discovery, invitation, or curious start.",
    "- JOURNEY: continue from the intro by moving toward the adventure.",
    "- PROBLEM: introduce a clear obstacle that interrupts the journey.",
    "- SOLUTION: resolve the obstacle with a clever or kind action.",
    "- ENDING: close the story after the solution with a lesson or happy result.",
  ].join("\n");
}

export function buildStoryTemplatePrompt(input: {
  title: string;
  description?: string | null;
  ageGroup?: string | null;
  templateName: string;
  templateSlug: string;
}): string {
  return [
    "You write interactive capybara story templates for children.",
    "Return valid JSON only.",
    'Output format: {"steps":[{"step_key":"...","question":"...","choices":[{"text":"...","keywords":["..."]}]}],"fragments":[{"step_key":"...","choice_index":0,"text":"...","keywords":["..."]}],"twists":[{"text":"...","keywords":["..."]}]}',
    "Rules:",
    "- Use exactly 5 steps in this exact order: intro, journey, problem, solution, ending.",
    "- 3 choices per step.",
    "- 1 or 2 fragments per choice.",
    "- 3 twists.",
    "- All text must be short, funny, and child-friendly.",
    "- Every fragment must match its narrative role and connect logically to the previous role.",
    "- The full story must always read coherently in this order: intro -> journey -> problem -> solution -> ending.",
    "- step_key values must be exactly: intro, journey, problem, solution, ending.",
    "- No markdown.",
    "",
    `Book title: ${input.title}`,
    `Book description: ${input.description ?? "No description provided."}`,
    `Age group: ${input.ageGroup ?? "Unknown"}`,
    `Template name: ${input.templateName}`,
    `Template slug: ${input.templateSlug}`,
    "",
    "Required step meanings:",
    "- intro: start the adventure",
    "- journey: begin moving toward the goal",
    "- problem: introduce the obstacle",
    "- solution: solve the obstacle",
    "- ending: close the story after the solution",
    "",
    "Question guidance:",
    `- intro: ${STORY_ROLE_QUESTIONS.intro}`,
    `- journey: ${STORY_ROLE_QUESTIONS.journey}`,
    `- problem: ${STORY_ROLE_QUESTIONS.problem}`,
    `- solution: ${STORY_ROLE_QUESTIONS.solution}`,
    `- ending: ${STORY_ROLE_QUESTIONS.ending}`,
  ].join("\n");
}
