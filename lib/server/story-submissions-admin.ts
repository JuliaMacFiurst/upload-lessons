import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORY_SUBMISSION_STEP_KEYS,
  STORY_SUBMISSION_STEP_LABELS,
  type StorySubmission,
  type StorySubmissionListItem,
  type StorySubmissionPatchInput,
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

function normalizeHero(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function buildEmptyAssembledStory() {
  return {
    steps: STORY_SUBMISSION_STEP_KEYS.map((key) => ({
      key,
      text: "",
      keywords: [],
      preview: null,
      mediaUrl: "",
    })),
  };
}

export function normalizeAssembledStory(value: unknown) {
  const parsed = parseMaybeJson(value);

  if (!isRecord(parsed)) {
    return {
      hero: "",
      ...buildEmptyAssembledStory(),
    };
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

  const stepMap = new Map<StorySubmissionStepKey, {
    text: string;
    keywords: string[];
    preview: string | null;
    mediaUrl: string;
  }>();

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
      mediaUrl:
        typeof step.mediaUrl === "string"
          ? step.mediaUrl
          : typeof step.slideMediaUrl === "string"
            ? step.slideMediaUrl
            : "",
    });
  });

  return {
    hero: normalizeHero(parsed.hero),
    steps: STORY_SUBMISSION_STEP_KEYS.map((key) => ({
      key,
      text: stepMap.get(key)?.text ?? "",
      keywords: stepMap.get(key)?.keywords ?? [],
      preview: stepMap.get(key)?.preview ?? null,
      mediaUrl: stepMap.get(key)?.mediaUrl ?? "",
    })),
  };
}

function buildPersistedAssembledStory(
  currentValue: unknown,
  input: StorySubmissionPatchInput,
) {
  const parsed = parseMaybeJson(currentValue);
  const currentRecord = isRecord(parsed) ? parsed : {};
  const currentSteps = Array.isArray(currentRecord.steps)
    ? currentRecord.steps.filter((step): step is Record<string, unknown> => isRecord(step))
    : [];
  const currentStepMap = new Map(
    currentSteps
      .map((step) => {
        const key = normalizeStepKey(step.key);
        return key ? [key, step] : null;
      })
      .filter((entry): entry is [StorySubmissionStepKey, Record<string, unknown>] => Boolean(entry)),
  );

  return {
    ...currentRecord,
    hero: input.hero_name.trim(),
    steps: input.assembled_story.steps.map((step) => ({
      ...(currentStepMap.get(step.key) ?? {}),
      key: step.key,
      text: step.text,
      keywords: step.keywords,
      preview: step.preview ?? null,
      mediaUrl: step.mediaUrl.trim(),
    })),
  };
}

function resolveStepText(
  stepKey: StorySubmissionStepKey,
  assembledStory: ReturnType<typeof normalizeAssembledStory>,
) {
  return assembledStory.steps.find((step) => step.key === stepKey)?.text.trim() ?? "";
}

function buildSnippetFromAssembledStory(assembledStory: ReturnType<typeof normalizeAssembledStory>) {
  const narration = resolveStepText("narration", assembledStory);
  return narration.length > 160 ? `${narration.slice(0, 157).trim()}...` : narration;
}

function mapSubmissionRow(row: SubmissionRow): StorySubmission {
  const assembledStory = normalizeAssembledStory(row.assembled_story);

  const steps: StorySubmissionStep[] = assembledStory.steps.map((step) => ({
    key: step.key,
    label: STORY_SUBMISSION_STEP_LABELS[step.key],
    text: resolveStepText(step.key, assembledStory),
    keywords: step.keywords,
    preview: step.preview,
    slideMediaUrl: step.mediaUrl,
  }));

  return {
    id: row.id,
    heroName: assembledStory.hero || row.hero_name || "",
    mode: row.mode ?? "",
    status: normalizeStatus(row.status),
    createdAt: row.created_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
    snippet: buildSnippetFromAssembledStory(assembledStory),
    reviewerNotes: row.reviewer_notes ?? "",
    assembledStory: { steps },
  };
}

async function loadSubmissionRow(supabase: SupabaseClient, id: string): Promise<SubmissionRow> {
  const { data: submission, error: submissionError } = await supabase
    .from("user_story_submissions")
    .select("id,hero_name,mode,status,reviewer_notes,assembled_story,created_at,reviewed_at")
    .eq("id", id)
    .single();

  if (submissionError) {
    throw new Error(`Failed to load story submission: ${submissionError.message}`);
  }

  return submission as SubmissionRow;
}

function validateSubmissionForApproval(input: StorySubmissionPatchInput) {
  const missing = input.assembled_story.steps.filter((step) => !step.text.trim());
  if (missing.length > 0) {
    const labels = missing.map((step) => STORY_SUBMISSION_STEP_LABELS[step.key]).join(", ");
    throw new Error(`Перед одобрением заполни все шаги истории: ${labels}.`);
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
    snippet: buildSnippetFromAssembledStory(normalizeAssembledStory(row.assembled_story)),
  }));
}

export async function loadStorySubmissionById(
  supabase: SupabaseClient,
  id: string,
): Promise<StorySubmission> {
  const submission = await loadSubmissionRow(supabase, id);
  return mapSubmissionRow(submission);
}

export async function saveStorySubmissionEdits(
  supabase: SupabaseClient,
  id: string,
  input: unknown,
): Promise<StorySubmission> {
  const parsed = storySubmissionPatchSchema.parse(input);
  const current = await loadSubmissionRow(supabase, id);
  const assembledStory = buildPersistedAssembledStory(current.assembled_story, parsed);

  const { error } = await supabase
    .from("user_story_submissions")
    .update({
      hero_name: parsed.hero_name.trim() || null,
      reviewer_notes: parsed.reviewer_notes.trim() || null,
      assembled_story: assembledStory,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to save story submission: ${error.message}`);
  }

  return loadStorySubmissionById(supabase, id);
}

export async function approveStorySubmission(
  supabase: SupabaseClient,
  id: string,
  input: unknown,
): Promise<StorySubmission> {
  const parsed = storySubmissionPatchSchema.parse(input);
  validateSubmissionForApproval(parsed);
  const current = await loadSubmissionRow(supabase, id);
  const assembledStory = buildPersistedAssembledStory(current.assembled_story, parsed);

  const { error } = await supabase
    .from("user_story_submissions")
    .update({
      hero_name: parsed.hero_name.trim() || null,
      reviewer_notes: parsed.reviewer_notes.trim() || null,
      assembled_story: assembledStory,
      status: "approved",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to approve story submission: ${error.message}`);
  }

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
