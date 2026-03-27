import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getTranslationQueue,
  type TranslationQueueItem,
  type TranslationScope,
} from "./translation-analysis";

type StartRunOptions = {
  lang: string;
  scope: TranslationScope;
  firstN?: number;
  batchSize?: number;
  onSettled?: () => Promise<void> | void;
};

export type TranslationRunProgress = {
  runId: string | null;
  running: boolean;
  batchSize: number | null;
  processed: number;
  total: number;
  lang: string | null;
  scope: TranslationScope | null;
  startedAt: string | null;
  finishedAt: string | null;
  totalItems: number;
  processedItems: number;
  translatedItems: number;
  skippedItems: number;
  failedItems: number;
  tokensProcessed: number;
  tokenBudget: number;
  currentItem: string | null;
  logs: string[];
  hasMore: boolean;
  errorMessage: string | null;
  cancelRequested: boolean;
};

const MODEL_NAME = "gemini-2.5-flash";
const DEFAULT_BATCH_SIZE = 10;
const INTER_BATCH_DELAY_MS = 400;
const LOG_LIMIT = 300;
const DRY_RUN = process.env.TRANSLATION_DRY_RUN === "true";
const TRANSLATION_DEBUG = process.env.TRANSLATION_DEBUG === "true";
const TRANSLATION_MOCK_MODEL = process.env.TRANSLATION_MOCK_MODEL === "true";

export type LessonTextPayload = {
  title: string;
} & (
  | {
      steps_texts: string[];
      steps_frank?: never;
    }
  | {
      steps_frank: string[];
      steps_texts?: never;
    }
);

type TranslationLimits = {
  maxItems: number | null;
  maxTokens: number | null;
  maxCostUsd: number | null;
};

const GEMINI_INPUT_COST_PER_1M = 0.1;
const GEMINI_OUTPUT_COST_PER_1M = 0.4;
const OUTPUT_TOKEN_FACTOR = 1.05;

const progressState: TranslationRunProgress = {
  runId: null,
  running: false,
  batchSize: null,
  processed: 0,
  total: 0,
  lang: null,
  scope: null,
  startedAt: null,
  finishedAt: null,
  totalItems: 0,
  processedItems: 0,
  translatedItems: 0,
  skippedItems: 0,
  failedItems: 0,
  tokensProcessed: 0,
  tokenBudget: 0,
  currentItem: null,
  logs: [],
  hasMore: false,
  errorMessage: null,
  cancelRequested: false,
};

let activeRun: Promise<void> | null = null;
let cancelRequested = false;

function getSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
}

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  progressState.logs = [...progressState.logs.slice(-(LOG_LIMIT - 1)), line];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureRunNotCancelled(): void {
  if (cancelRequested) {
    throw new Error("Translation run cancelled by admin.");
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseModelJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*[\r\n]/gm, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // handle case where Gemini returns `items: [...]` without braces
    const trimmed = cleaned.trim();
    if (trimmed.startsWith("items:")) {
      const wrapped = `{ ${trimmed} }`;
      try {
        log("Recovered JSON by wrapping items array.");
        return JSON.parse(wrapped);
      } catch {
        log("Failed to recover items array JSON.");
      }
    }
    // attempt to recover JSON block
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
      const jsonSlice = cleaned.slice(start, end + 1);

      try {
        log("Recovered JSON from Gemini response.");
        return JSON.parse(jsonSlice);
      } catch {
        log("Failed to recover JSON from Gemini response.");
      }
    }

    throw new Error("Failed to parse Gemini JSON response.");
  }
}

function buildBatchPrompt(lang: string, payload: string): string {
  return [
    `Translate the following JSON to ${lang}.`,
    "Important rules:",
    "Do NOT change JSON keys.",
    "Translate ALL non-empty string values.",
    "Never replace text with empty strings.",
    "Preserve the number of steps exactly.",
    "Preserve all newline characters such as \\n and \\n\\n exactly as they appear.",
    "Do NOT remove or translate emojis. Keep emojis exactly as they appear.",
    "If translation fails, keep the original text instead of removing it.",
    "If a word looks like a character name, invented word, meme word, or proper noun, transliterate it to English (Latin letters) instead of translating it.",
    "Examples: 'Трипи-Тропи' -> 'Tripi-Tropi', 'Бомбардини' -> 'Bombardini'.",
    "Do NOT shorten the text.",
    "Preserve JSON structure exactly.",
    "Return JSON in EXACTLY the same structure as the input.",
    "Return ONLY valid JSON.",
    "Do NOT add explanations.",
    "Do NOT add markdown.",
    "Do NOT wrap the response in ```json blocks.",
    "Do not write text before or after the JSON.",
    "Each item inside the 'items' array must be translated independently.",
    "Do NOT merge, reorder, or remove items. Return the same items array with the same ids.",
    "",
    payload,
  ].join("\n");
}

function normalizeLessonLikePayload(payload: unknown): LessonTextPayload {
  if (!payload || typeof payload !== "object") {
    return { title: "", steps_texts: [] };
  }

  const record = payload as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";

  if (Array.isArray(record.steps_frank)) {
    return {
      title,
      steps_frank: record.steps_frank.map((value) =>
        typeof value === "string" ? value.trim() : "",
      ),
    };
  }

  // Already in compact format
  if (Array.isArray(record.steps_texts)) {
    return {
      title,
      steps_texts: record.steps_texts.map((value) =>
        typeof value === "string" ? value.trim() : "",
      ),
    };
  }

  // Gemini may return legacy format: steps: [{ text: string }]
  if (Array.isArray(record.steps)) {
    const stepsTexts = record.steps.map((step) => {
      if (step && typeof step === "object" && "text" in step) {
        const text = (step as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    });

    return {
      title,
      steps_texts: stepsTexts,
    };
  }

  return { title, steps_texts: [] };
}

function getInvalidTranslationReason(payload: unknown): string | null {
  if (!payload) return "payload is empty";
  if (typeof payload !== "object") return "payload is not an object";

  const record = payload as {
    title?: unknown;
    steps_texts?: unknown;
    steps_frank?: unknown;
  };

  if (typeof record.title === "string" && record.title.trim() === "") {
    return "title is empty";
  }

  const lessonSteps = Array.isArray(record.steps_frank)
    ? record.steps_frank
    : Array.isArray(record.steps_texts)
      ? record.steps_texts
      : null;

  if (lessonSteps) {
    const validSteps = lessonSteps.filter(
      (text) => typeof text === "string" && text.trim().length > 0,
    );

    if (lessonSteps.length === 0) {
      return "steps array is empty";
    }

    if (validSteps.length === 0) {
      return "all steps are empty";
    }

    if (validSteps.length !== lessonSteps.length) {
      return "some steps are empty";
    }
  }

  return null;
}

function lessonPayloadSteps(payload: LessonTextPayload): string[] {
  if (Array.isArray((payload as { steps_frank?: unknown }).steps_frank)) {
    return (payload as { steps_frank: string[] }).steps_frank;
  }
  if (Array.isArray((payload as { steps_texts?: unknown }).steps_texts)) {
    return (payload as { steps_texts: string[] }).steps_texts;
  }
  return [];
}

export function mockTranslateLesson(payload: LessonTextPayload, lang: string): LessonTextPayload {
  if ("steps_frank" in payload) {
    return {
      title: `[${lang}] ${payload.title}`,
      steps_frank: lessonPayloadSteps(payload).map((s) => `[${lang}] ${s}`),
    };
  }
  return {
    title: `[${lang}] ${payload.title}`,
    steps_texts: lessonPayloadSteps(payload).map((s) => `[${lang}] ${s}`),
  };
}

function mockTranslateGeneric(payload: unknown, lang: string): unknown {
  if (typeof payload === "string") {
    return payload.trim() === "" ? payload : `[${lang}] ${payload}`;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => mockTranslateGeneric(item, lang));
  }
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(payload).forEach(([key, value]) => {
      out[key] = mockTranslateGeneric(value, lang);
    });
    return out;
  }
  return payload;
}

function getLessonSourceStepsCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  const record = payload as { steps_frank?: unknown; steps_texts?: unknown; steps?: unknown };
  if (Array.isArray(record.steps_frank)) {
    return record.steps_frank.length;
  }
  if (Array.isArray(record.steps_texts)) {
    return record.steps_texts.length;
  }
  if (Array.isArray(record.steps)) {
    return record.steps.length;
  }
  return 0;
}

function coerceLessonPayloadToOriginalShape(args: {
  originalPayload: unknown;
  translatedPayload: unknown;
}): LessonTextPayload {
  const original = normalizeLessonLikePayload(args.originalPayload);
  const translated = normalizeLessonLikePayload(args.translatedPayload);
  const sourceSteps = lessonPayloadSteps(translated);

  if ("steps_frank" in original) {
    return {
      title: translated.title,
      steps_frank: [...sourceSteps],
    };
  }

  return {
    title: translated.title,
    steps_texts: [...sourceSteps],
  };
}

export function validateTranslationPayload(args: {
  contentType: TranslationQueueItem["contentType"];
  originalPayload: unknown;
  translatedPayload: unknown;
}): void {
  if (!args.translatedPayload) {
    throw new Error("Invalid translation payload");
  }

  if (args.contentType !== "lesson") {
    return;
  }

  const translated = normalizeLessonLikePayload(args.translatedPayload);
  const originalStepsCount = getLessonSourceStepsCount(args.originalPayload);

  if (translated.title.trim() === "") {
    throw new Error("Invalid translation payload");
  }
  const translatedSteps = "steps_frank" in translated
    ? translated.steps_frank
    : translated.steps_texts;

  if (!Array.isArray(translatedSteps)) {
    throw new Error("Invalid translation payload");
  }
  if (translatedSteps.length === 0) {
    throw new Error("Invalid translation payload");
  }
  if (translatedSteps.some((step) => step.trim() === "")) {
    throw new Error("Invalid translation payload");
  }
  if (translatedSteps.length !== originalStepsCount) {
    throw new Error("Invalid translation payload");
  }
}

function readPositiveNumberEnv(name: string): number | null {
  const raw = process.env[name];
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getTranslationLimits(): TranslationLimits {
  return {
    maxItems: readPositiveNumberEnv("MAX_TRANSLATION_ITEMS"),
    maxTokens: readPositiveNumberEnv("MAX_TRANSLATION_TOKENS"),
    maxCostUsd: readPositiveNumberEnv("MAX_TRANSLATION_COST_USD"),
  };
}

function estimateTokensByChars(characters: number): number {
  return Math.ceil(characters / 4);
}

function estimateCostUsd(tokens: number): number {
  const inputCost = (tokens / 1_000_000) * GEMINI_INPUT_COST_PER_1M;
  const outputCost = ((tokens * OUTPUT_TOKEN_FACTOR) / 1_000_000) * GEMINI_OUTPUT_COST_PER_1M;
  return inputCost + outputCost;
}

function debugPreviewTranslation(args: {
  itemId: string;
  originalPayload: unknown;
  translatedPayload: unknown;
}): void {
  if (!TRANSLATION_DEBUG) {
    return;
  }
  log(
    `[DEBUG] ${args.itemId} original=${JSON.stringify(
      args.originalPayload,
    )} translated=${JSON.stringify(args.translatedPayload)}`,
  );
}

async function requestTranslatedBatch(
  client: GoogleGenAI | null,
  lang: string,
  batch: TranslationQueueItem[],
): Promise<Map<string, unknown>> {
  if (TRANSLATION_MOCK_MODEL) {
    const mocked = new Map<string, unknown>();
    log("[TRANSLATION MOCK] Gemini call skipped, using mock translator.");
    batch.forEach((item) => {
      const id = `${item.contentType}:${item.contentId}`;
      if (item.contentType === "lesson") {
        mocked.set(id, mockTranslateLesson(normalizeLessonLikePayload(item.payload), lang));
        return;
      }
      mocked.set(id, mockTranslateGeneric(item.payload, lang));
    });
    return mocked;
  }
  if (!client) {
    throw new Error("Gemini client is not available.");
  }

  const requestPayload = {
    items: batch.map((item) => ({
      id: `${item.contentType}:${item.contentId}`,
      type: item.contentType,
      payload: item.payload,
    })),
  };
  const prompt = buildBatchPrompt(lang, JSON.stringify(requestPayload));

  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
  });
  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned empty response.");
  }

  const parsed = parseModelJson(text) as {
    items?: Array<{ id?: unknown; payload?: unknown; translation?: unknown }>;
  };
  if (!Array.isArray(parsed.items)) {
    throw new Error("Gemini response must be an object with items array.");
  }

  const translated = new Map<string, unknown>();
  parsed.items.forEach((item) => {
    const id = typeof item.id === "string" ? item.id : null;
    if (!id) {
      return;
    }

    let payload = item.translation ?? item.payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        log(`Failed to parse JSON payload for ${id}, keeping raw string.`);
      }
    }

    if (payload !== undefined) {
      translated.set(id, payload);
    }
  });

  return translated;
}

async function translateBatch(
  client: GoogleGenAI | null,
  lang: string,
  batch: TranslationQueueItem[],
): Promise<Map<string, unknown>> {
  const initialResult = await requestTranslatedBatch(client, lang, batch);
  const accepted = new Map<string, unknown>();

  for (const item of batch) {
    const id = `${item.contentType}:${item.contentId}`;
    const rawPayload = initialResult.get(id);
    const payload =
      item.contentType === "lesson"
        ? coerceLessonPayloadToOriginalShape({
            originalPayload: item.payload,
            translatedPayload: rawPayload,
          })
        : rawPayload;
    if (payload === undefined) {
      continue;
    }
    const invalidReason = getInvalidTranslationReason(payload);
    if (invalidReason) {
      let titleInfo = "";
      if (item.contentType === "lesson" && item.payload && typeof item.payload === "object" && "title" in (item.payload as Record<string, unknown>)) {
        const t = (item.payload as { title?: unknown }).title;
        if (typeof t === "string" && t.trim()) {
          titleInfo = ` (${t})`;
        }
      }
      log(`Invalid translation detected for ${id}${titleInfo}: ${invalidReason}. Item will remain untranslated.`);
      continue;
    }
    debugPreviewTranslation({
      itemId: id,
      originalPayload: item.payload,
      translatedPayload: payload,
    });
    accepted.set(id, payload);
  }
  return accepted;
}

async function upsertTranslationRows(
  supabase: SupabaseClient,
  lang: string,
  batch: TranslationQueueItem[],
  translatedById: Map<string, unknown>,
): Promise<{ translated: number; failed: number }> {
  let translatedCount = 0;
  let failedCount = 0;

  for (const item of batch) {
    const itemId = `${item.contentType}:${item.contentId}`;
    const translatedPayload = translatedById.get(itemId);
    if (translatedPayload === undefined) {
      failedCount += 1;
      let titleInfo = "";
      if (item.contentType === "lesson" && item.payload && typeof item.payload === "object" && "title" in (item.payload as Record<string, unknown>)) {
        const t = (item.payload as { title?: unknown }).title;
        if (typeof t === "string" && t.trim()) {
          titleInfo = ` (${t})`;
        }
      }
      log(`Missing translated payload for ${itemId}${titleInfo}.`);
      continue;
    }

    try {
      validateTranslationPayload({
        contentType: item.contentType,
        originalPayload: item.payload,
        translatedPayload,
      });
      log(`[TRANSLATION VALIDATED] ${itemId}`);
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      let titleInfo2 = "";
      if (item.contentType === "lesson" && item.payload && typeof item.payload === "object" && "title" in (item.payload as Record<string, unknown>)) {
        const t = (item.payload as { title?: unknown }).title;
        if (typeof t === "string" && t.trim()) {
          titleInfo2 = ` (${t})`;
        }
      }
      log(`Invalid translation detected for ${itemId}${titleInfo2}: ${message}`);
      continue;
    }

    let safePayload: unknown;
    try {
      safePayload = JSON.parse(JSON.stringify(translatedPayload));
    } catch {
      failedCount += 1;
      log(`Invalid JSON payload for ${itemId}.`);
      continue;
    }

    if (DRY_RUN) {
      log(`DRY RUN: skipping DB save for ${itemId}`);
      translatedCount += 1;
      continue;
    }

    const { error } = await supabase.from("content_translations").upsert(
      {
        content_type: item.contentType,
        content_id: item.contentId,
        language: lang,
        source_hash: item.sourceHash,
        translation: safePayload,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "content_type,content_id,language",
      },
    );

    if (error) {
      failedCount += 1;
      log(`DB upsert failed for ${itemId}: ${error.message}`);
      continue;
    }

    translatedCount += 1;
    log(`[TRANSLATION SAVED] ${itemId}`);
  }

  return { translated: translatedCount, failed: failedCount };
}

async function runJob(options: StartRunOptions): Promise<void> {
  if (DRY_RUN) {
    log("DRY RUN mode enabled. DB writes are disabled.");
  }
  if (TRANSLATION_MOCK_MODEL) {
    log("[TRANSLATION MOCK] MODE ACTIVE (no Gemini calls).");
  }

  ensureRunNotCancelled();

  const queue =
    options.scope === "books"
      ? await translateBooks(options)
      : options.scope === "stories"
        ? await translateStories(options)
        : await getTranslationQueue({
            lang: options.lang,
            scope: options.scope,
            firstN: options.firstN,
            statuses: ["missing", "outdated"],
          });

  progressState.totalItems = queue.length;
  progressState.total = queue.length;
  log(`Run started. Queue size: ${queue.length}.`);

  const limits = getTranslationLimits();
  if (limits.maxItems !== null && queue.length > limits.maxItems) {
    log(
      `Translation limit exceeded: items ${queue.length} > ${limits.maxItems}.`,
    );
    throw new Error("Translation limit exceeded");
  }

  if (queue.length === 0) {
    log("No records require translation.");
    return;
  }

  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  const batches = chunk(queue, batchSize);
  const supabase = getSupabaseServerClient();
  const gemini = TRANSLATION_MOCK_MODEL ? null : getGeminiClient();

  for (let index = 0; index < batches.length; index += 1) {
    ensureRunNotCancelled();
    const batch = batches[index];
    const batchTokens = batch.reduce(
      (sum, item) => sum + estimateTokensByChars(item.characters),
      0,
    );
    const nextTokens = progressState.tokensProcessed + batchTokens;
    const nextCostUsd = estimateCostUsd(nextTokens);

    if (
      (limits.maxTokens !== null && nextTokens > limits.maxTokens) ||
      (limits.maxCostUsd !== null && nextCostUsd > limits.maxCostUsd)
    ) {
      log(
        `Translation limit exceeded: tokens=${nextTokens}, cost=${nextCostUsd.toFixed(6)}.`,
      );
      throw new Error("Translation limit exceeded");
    }

    progressState.currentItem = `Batch ${index + 1}/${batches.length}`;
    log(
      `Processing batch ${index + 1}/${batches.length} (${batch.length} items).`,
    );

    try {
      ensureRunNotCancelled();
      const translatedById = await translateBatch(gemini, options.lang, batch);
      ensureRunNotCancelled();
      const saveResult = await upsertTranslationRows(
        supabase,
        options.lang,
        batch,
        translatedById,
      );
      progressState.tokensProcessed = nextTokens;
      progressState.translatedItems += saveResult.translated;
      progressState.failedItems += saveResult.failed;
      progressState.processedItems += batch.length;
      progressState.processed = progressState.processedItems;
      log(
        `Batch ${index + 1} complete. translated=${saveResult.translated}, failed=${saveResult.failed}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progressState.failedItems += batch.length;
      progressState.processedItems += batch.length;
      progressState.processed = progressState.processedItems;
      log(`Batch ${index + 1} failed and skipped: ${message}`);
    }

    progressState.skippedItems = progressState.totalItems - progressState.processedItems;

    if (index < batches.length - 1) {
      ensureRunNotCancelled();
      await sleep(INTER_BATCH_DELAY_MS);
    }
  }
}

async function translateBooks(options: StartRunOptions): Promise<TranslationQueueItem[]> {
  return getTranslationQueue({
    lang: options.lang,
    scope: "books",
    firstN: options.firstN,
    statuses: ["missing", "outdated"],
  });
}

async function translateStories(options: StartRunOptions): Promise<TranslationQueueItem[]> {
  return getTranslationQueue({
    lang: options.lang,
    scope: "stories",
    firstN: options.firstN,
    statuses: ["missing", "outdated"],
  });
}

function resetProgress(runId: string, options: StartRunOptions): void {
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  progressState.runId = runId;
  progressState.running = true;
  progressState.batchSize = batchSize;
  progressState.processed = 0;
  progressState.total = 0;
  progressState.lang = options.lang;
  progressState.scope = options.scope;
  progressState.startedAt = new Date().toISOString();
  progressState.finishedAt = null;
  progressState.totalItems = 0;
  progressState.processedItems = 0;
  progressState.translatedItems = 0;
  progressState.skippedItems = 0;
  progressState.failedItems = 0;
  progressState.tokensProcessed = 0;
  progressState.tokenBudget = 0;
  progressState.currentItem = null;
  progressState.logs = [];
  progressState.hasMore = false;
  progressState.errorMessage = null;
  progressState.cancelRequested = false;
  cancelRequested = false;
}

function completeProgress(): void {
  progressState.running = false;
  progressState.currentItem = null;
  progressState.finishedAt = new Date().toISOString();
}

export function canStartTranslationRun(): boolean {
  return !progressState.running && !activeRun;
}

export function getTranslationRunProgress(): TranslationRunProgress {
  return {
    ...progressState,
    logs: [...progressState.logs],
  };
}

export function requestTranslationRunCancel(): boolean {
  if (!progressState.running || !activeRun) {
    return false;
  }

  cancelRequested = true;
  progressState.cancelRequested = true;
  log("Cancellation requested by admin.");
  return true;
}

export function startTranslationRun(options: StartRunOptions): { runId: string } {
  if (!canStartTranslationRun()) {
    throw new Error("A translation run is already in progress.");
  }

  const runId = crypto.randomUUID();
  resetProgress(runId, options);

  activeRun = runJob(options)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      progressState.errorMessage = message;
      log(`Run failed: ${message}`);
    })
    .finally(() => {
      completeProgress();
      log("Run finished.");
      activeRun = null;
    });

  if (options.onSettled) {
    activeRun = activeRun.finally(async () => {
      await options.onSettled?.();
    });
  }

  return { runId };
}
