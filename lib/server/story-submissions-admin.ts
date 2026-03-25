import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORY_SUBMISSION_STEP_KEYS,
  STORY_SUBMISSION_STEP_LABELS,
  type StorySubmission,
  type StorySubmissionListItem,
  type StorySubmissionPatchInput,
  type StorySubmissionSlide,
  type StorySubmissionStatus,
  type StorySubmissionStep,
  type StorySubmissionStepKey,
  storySubmissionPatchSchema,
  storySubmissionRejectSchema,
} from "../story-submissions/types";

type SubmissionRow = {
  id: string;
  hero_name: string | null;
  mode: string | null;
  status: string | null;
  reviewer_notes: string | null;
  assembled_story: unknown;
  created_at: string | null;
  reviewed_at?: string | null;
};

type SlideRow = Record<string, unknown> & {
  id?: string;
  submission_id?: string;
  step_key?: string;
  media_url?: string | null;
  text?: string | null;
  slide_index?: number | null;
  sort_order?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeStatus(value: unknown): StorySubmissionStatus {
  if (value === "approved" || value === "rejected") {
    return value;
  }
  return "pending";
}

function normalizeKeywords(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

function normalizeStepKey(value: unknown): StorySubmissionStepKey | null {
  return STORY_SUBMISSION_STEP_KEYS.find((key) => key === value) ?? null;
}

function buildEmptyAssembledStory() {
  return {
    steps: STORY_SUBMISSION_STEP_KEYS.map((key) => ({
      key,
      text: "",
      keywords: [],
      preview: null,
    })),
  };
}

function normalizeAssembledStory(value: unknown) {
  const parsed = parseMaybeJson(value);

  if (!isRecord(parsed)) {
    return buildEmptyAssembledStory();
  }

  const stepsSource = Array.isArray(parsed.steps)
    ? parsed.steps
    : STORY_SUBMISSION_STEP_KEYS.map((key) => {
        const direct = parsed[key];
        if (isRecord(direct)) {
          return { key, ...direct };
        }
        return { key, text: typeof direct === "string" ? direct : "", keywords: [] };
      });

  const stepMap = new Map<StorySubmissionStepKey, { text: string; keywords: string[]; preview: string | null }>();

  stepsSource.forEach((step) => {
    if (!isRecord(step)) {
      return;
    }

    const key = normalizeStepKey(step.key);
    if (!key) {
      return;
    }

    const text = typeof step.text === "string"
      ? step.text
      : typeof step.content === "string"
        ? step.content
        : "";

    stepMap.set(key, {
      text,
      keywords: normalizeKeywords(step.keywords),
      preview: typeof step.preview === "string" ? step.preview : null,
    });
  });

  return {
    steps: STORY_SUBMISSION_STEP_KEYS.map((key) => ({
      key,
      text: stepMap.get(key)?.text ?? "",
      keywords: stepMap.get(key)?.keywords ?? [],
      preview: stepMap.get(key)?.preview ?? null,
    })),
  };
}

function mapSlideRow(row: SlideRow): StorySubmissionSlide | null {
  const stepKey = normalizeStepKey(row.step_key ?? row.stepKey);
  if (!stepKey) {
    return null;
  }

  return {
    id: typeof row.id === "string" ? row.id : undefined,
    stepKey,
    text:
      typeof row.text === "string"
        ? row.text
        : typeof row.content === "string"
          ? row.content
          : "",
    mediaUrl:
      typeof row.media_url === "string"
        ? row.media_url
        : typeof row.mediaUrl === "string"
          ? row.mediaUrl
          : "",
    sortOrder:
      typeof row.sort_order === "number"
        ? row.sort_order
        : typeof row.sortOrder === "number"
          ? row.sortOrder
          : undefined,
  };
}

function getPrimarySlide(slides: StorySubmissionSlide[], stepKey: StorySubmissionStepKey) {
  const slidesForStep = slides.filter((slide) => slide.stepKey === stepKey);

  if (slidesForStep.length === 0) {
    return null;
  }

  return slidesForStep
    .slice()
    .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))[0] ?? null;
}

function resolveStepText(
  stepKey: StorySubmissionStepKey,
  assembledStory: ReturnType<typeof normalizeAssembledStory>,
  slides: StorySubmissionSlide[],
) {
  const primarySlideText = getPrimarySlide(slides, stepKey)?.text?.trim() ?? "";

  if (primarySlideText) {
    return primarySlideText;
  }

  return assembledStory.steps.find((step) => step.key === stepKey)?.text.trim() ?? "";
}

function buildSnippetFromAssembledStory(
  assembledStory: ReturnType<typeof normalizeAssembledStory>,
  slides: StorySubmissionSlide[],
) {
  const narration = resolveStepText("narration", assembledStory, slides);
  return narration.length > 160 ? `${narration.slice(0, 157).trim()}...` : narration;
}

function mapSubmissionRow(row: SubmissionRow, slideRows: SlideRow[]): StorySubmission {
  const assembledStory = normalizeAssembledStory(row.assembled_story);
  const slides = slideRows
    .map((slide) => mapSlideRow(slide))
    .filter((slide): slide is StorySubmissionSlide => Boolean(slide));
  const slideMap = new Map(slides.map((slide) => [slide.stepKey, slide.mediaUrl]));

  const steps: StorySubmissionStep[] = assembledStory.steps.map((step) => ({
    key: step.key,
    label: STORY_SUBMISSION_STEP_LABELS[step.key],
    text: resolveStepText(step.key, assembledStory, slides),
    keywords: step.keywords,
    preview: step.preview,
    slideMediaUrl: slideMap.get(step.key) ?? "",
  }));

  return {
    id: row.id,
    heroName: row.hero_name ?? "",
    mode: row.mode ?? "",
    status: normalizeStatus(row.status),
    createdAt: row.created_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    snippet: buildSnippetFromAssembledStory(assembledStory, slides),
    reviewerNotes: row.reviewer_notes ?? "",
    assembledStory: { steps },
    slides,
  };
}

async function loadSubmissionRow(
  supabase: SupabaseClient,
  id: string,
): Promise<{ submission: SubmissionRow; slides: SlideRow[] }> {
  const [{ data: submission, error: submissionError }, { data: slides, error: slidesError }] = await Promise.all([
    supabase
      .from("user_story_submissions")
      .select("id,hero_name,mode,status,reviewer_notes,assembled_story,created_at,reviewed_at")
      .eq("id", id)
      .single(),
    supabase
      .from("user_story_slides")
      .select("*")
      .eq("submission_id", id)
      .order("sort_order", { ascending: true })
      .order("slide_index", { ascending: true }),
  ]);

  if (submissionError) {
    throw new Error(`Failed to load story submission: ${submissionError.message}`);
  }

  if (slidesError) {
    throw new Error(`Failed to load story slides: ${slidesError.message}`);
  }

  return {
    submission: submission as SubmissionRow,
    slides: (slides as SlideRow[] | null) ?? [],
  };
}

function buildSlidesPayload(input: StorySubmissionPatchInput): SlideRow[] {
  return input.slides.map((slide, index) => ({
    ...(slide.id ? { id: slide.id } : {}),
    step_key: slide.step_key,
    media_url: slide.media_url.trim() || null,
    slide_index: index,
  }));
}

function validateSubmissionForApproval(input: StorySubmissionPatchInput) {
  const missing = input.assembled_story.steps.filter((step) => !step.text.trim());
  if (missing.length > 0) {
    const labels = missing.map((step) => STORY_SUBMISSION_STEP_LABELS[step.key]).join(", ");
    throw new Error(`Перед одобрением заполни все шаги истории: ${labels}.`);
  }
}

async function persistSlides(
  supabase: SupabaseClient,
  submissionId: string,
  input: StorySubmissionPatchInput,
): Promise<void> {
  const { data: existingSlides, error: existingSlidesError } = await supabase
    .from("user_story_slides")
    .select("id")
    .eq("submission_id", submissionId);

  if (existingSlidesError) {
    throw new Error(`Failed to inspect story slides: ${existingSlidesError.message}`);
  }

  const existingIds = new Set(((existingSlides as Array<{ id: string }> | null) ?? []).map((slide) => slide.id));
  const slidesPayload = buildSlidesPayload(input);
  const slidesWithId = slidesPayload.filter((slide) => typeof slide.id === "string" && existingIds.has(slide.id));
  const slidesWithoutId = slidesPayload
    .filter((slide) => !slide.id || !existingIds.has(String(slide.id)))
    .map((slide) => ({
      submission_id: submissionId,
      step_key: slide.step_key,
      media_url: slide.media_url,
      slide_index: slide.slide_index,
    }));

  const removeIds = ((existingSlides as Array<{ id: string }> | null) ?? [])
    .map((slide) => slide.id)
    .filter((id) => !input.slides.some((slide) => slide.id === id));

  if (removeIds.length > 0) {
    const { error } = await supabase.from("user_story_slides").delete().in("id", removeIds);
    if (error) {
      throw new Error(`Failed to delete old story slides: ${error.message}`);
    }
  }

  if (slidesWithId.length > 0) {
    const { error } = await supabase.from("user_story_slides").upsert(slidesWithId);
    if (error) {
      throw new Error(`Failed to update story slides: ${error.message}`);
    }
  }

  if (slidesWithoutId.length > 0) {
    const { error } = await supabase.from("user_story_slides").insert(slidesWithoutId);
    if (error) {
      throw new Error(`Failed to create story slides: ${error.message}`);
    }
  }
}

export async function listStorySubmissions(
  supabase: SupabaseClient,
): Promise<StorySubmissionListItem[]> {
  const { data, error } = await supabase
    .from("user_story_submissions")
    .select("id,hero_name,mode,status,reviewer_notes,assembled_story,created_at,reviewed_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load story submissions: ${error.message}`);
  }

  return ((data as SubmissionRow[] | null) ?? []).map((row) => ({
    id: row.id,
    heroName: row.hero_name ?? "",
    mode: row.mode ?? "",
    status: normalizeStatus(row.status),
    createdAt: row.created_at ?? null,
    snippet: buildSnippetFromAssembledStory(normalizeAssembledStory(row.assembled_story), []),
  }));
}

export async function loadStorySubmissionById(
  supabase: SupabaseClient,
  id: string,
): Promise<StorySubmission> {
  const { submission, slides } = await loadSubmissionRow(supabase, id);
  return mapSubmissionRow(submission, slides);
}

export async function saveStorySubmissionEdits(
  supabase: SupabaseClient,
  id: string,
  input: unknown,
): Promise<StorySubmission> {
  const parsed = storySubmissionPatchSchema.parse(input);

  const { error } = await supabase
    .from("user_story_submissions")
    .update({
      hero_name: parsed.hero_name.trim() || null,
      reviewer_notes: parsed.reviewer_notes.trim() || null,
      assembled_story: parsed.assembled_story,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to save story submission: ${error.message}`);
  }

  await persistSlides(supabase, id, parsed);
  return loadStorySubmissionById(supabase, id);
}

export async function approveStorySubmission(
  supabase: SupabaseClient,
  id: string,
  input: unknown,
): Promise<StorySubmission> {
  const parsed = storySubmissionPatchSchema.parse(input);
  validateSubmissionForApproval(parsed);

  const { error } = await supabase
    .from("user_story_submissions")
    .update({
      hero_name: parsed.hero_name.trim() || null,
      reviewer_notes: parsed.reviewer_notes.trim() || null,
      assembled_story: parsed.assembled_story,
      status: "approved",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to approve story submission: ${error.message}`);
  }

  await persistSlides(supabase, id, parsed);
  return loadStorySubmissionById(supabase, id);
}

export async function rejectStorySubmission(
  supabase: SupabaseClient,
  id: string,
  input: unknown,
): Promise<StorySubmission> {
  const parsed = storySubmissionRejectSchema.parse(input ?? {});
  const { error } = await supabase
    .from("user_story_submissions")
    .update({
      status: "rejected",
      reviewer_notes: parsed.reviewerNotes.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to reject story submission: ${error.message}`);
  }

  return loadStorySubmissionById(supabase, id);
}
