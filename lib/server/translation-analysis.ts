import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import stringify from "json-stable-stringify";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  extractTranslatableLessonPayload,
  type LessonJson,
} from "../lesson-translation";

export type TranslationScope =
  | "all"
  | "lessons"
  | "map_stories"
  | "artworks";

type TranslationStatus = "translated" | "missing" | "outdated";
type ContentType = "lesson" | "map_story" | "artwork";

type AnalyzeCounts = {
  lessons: number;
  mapStories: number;
  artworks: number;
  total: number;
};

type StatusTotals = {
  translated: number;
  missing: number;
  outdated: number;
};

type AnalyzeByType = {
  lessons: StatusTotals & { total: number };
  mapStories: StatusTotals & { total: number };
  artworks: StatusTotals & { total: number };
};

export type TranslationAnalyzeResult = {
  counts: AnalyzeCounts;
  statusCounts: StatusTotals;
  detailedCounts: AnalyzeByType;
  totalCharacters: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  costModel: string;
  tokenMethod: "gemini_count_tokens" | "chars_div_4";
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

type ContentTranslationRow = {
  content_type: ContentType;
  content_id: string;
  language: string;
  source_hash: string;
};

type AnalyzeItem = {
  contentType: ContentType;
  contentId: string;
  sourceHash: string;
  payload: unknown;
  normalizedSource: string;
  characters: number;
  status: TranslationStatus;
};

type AnalyzeOptions = {
  lang: string;
  scope?: TranslationScope;
  firstN?: number;
};

export type TranslationQueueItem = {
  contentType: ContentType;
  contentId: string;
  sourceHash: string;
  payload: unknown;
  status: TranslationStatus;
  characters: number;
};

const GEMINI_MODEL = "models/gemini-2.5-flash-lite";
const GEMINI_INPUT_COST_PER_1M = 0.1;
const GEMINI_OUTPUT_COST_PER_1M = 0.4;
const OUTPUT_TOKEN_FACTOR = 1.05;

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

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

function toCanonicalJson(value: unknown): string {
  return stringify(value) ?? "null";
}

function buildSourceHash(value: unknown): string {
  return crypto.createHash("sha256").update(toCanonicalJson(value)).digest("hex");
}

function estimateCostUsd(tokens: number): number {
  const inputCost = (tokens / 1_000_000) * GEMINI_INPUT_COST_PER_1M;
  const outputCost =
    ((tokens * OUTPUT_TOKEN_FACTOR) / 1_000_000) * GEMINI_OUTPUT_COST_PER_1M;
  return Number((inputCost + outputCost).toFixed(6));
}

function estimateTokensByChars(characters: number): number {
  return Math.ceil(characters / 4);
}

function toScopeFlags(scope: TranslationScope): {
  lessons: boolean;
  mapStories: boolean;
  artworks: boolean;
} {
  return {
    lessons: scope === "all" || scope === "lessons",
    mapStories: scope === "all" || scope === "map_stories",
    artworks: scope === "all" || scope === "artworks",
  };
}

async function fetchTranslationRows(
  supabase: SupabaseClient,
  lang: string,
): Promise<Map<string, ContentTranslationRow>> {
  const { data, error } = await supabase
    .from("content_translations")
    .select("content_type,content_id,language,source_hash")
    .eq("language", lang);

  if (error) {
    throw new Error(`Failed to load content_translations: ${error.message}`);
  }

  const map = new Map<string, ContentTranslationRow>();
  (data as ContentTranslationRow[] | null)?.forEach((row) => {
    map.set(`${row.content_type}:${row.content_id}`, row);
  });
  return map;
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

function resolveStatus(
  existing: ContentTranslationRow | undefined,
  sourceHash: string,
): TranslationStatus {
  if (!existing) {
    return "missing";
  }
  if (existing.source_hash !== sourceHash) {
    return "outdated";
  }
  return "translated";
}

async function countTokensWithGemini(payloads: string[]): Promise<number | null> {
  const client = getGeminiClient();
  if (!client) {
    return null;
  }

  let total = 0;
  for (const payload of payloads) {
    try {
      const response = await client.models.countTokens({
        model: GEMINI_MODEL,
        contents: payload,
      });
      total += response.totalTokens ?? estimateTokensByChars(payload.length);
    } catch {
      return null;
    }
  }
  return total;
}

function initStatusTotals(): StatusTotals {
  return {
    translated: 0,
    missing: 0,
    outdated: 0,
  };
}

function applyStatusCounter(target: StatusTotals, status: TranslationStatus): void {
  if (status === "translated") {
    target.translated += 1;
    return;
  }
  if (status === "missing") {
    target.missing += 1;
    return;
  }
  target.outdated += 1;
}

export async function analyzeTranslationState(
  options: AnalyzeOptions,
): Promise<TranslationAnalyzeResult> {
  const scope = options.scope ?? "all";
  const firstN =
    typeof options.firstN === "number" && Number.isFinite(options.firstN) && options.firstN > 0
      ? Math.floor(options.firstN)
      : undefined;

  const supabase = getSupabaseServerClient();
  const [lessonsRes, mapStoriesRes, artworksRes, existingMap] = await Promise.all([
    supabase.from("lessons").select("id,title,steps"),
    supabase.from("map_stories").select("id,content"),
    supabase.from("artworks").select("id,title,description"),
    fetchTranslationRows(supabase, options.lang),
  ]);

  if (lessonsRes.error) {
    throw new Error(`Failed to load lessons: ${lessonsRes.error.message}`);
  }
  if (mapStoriesRes.error) {
    throw new Error(`Failed to load map_stories: ${mapStoriesRes.error.message}`);
  }
  if (artworksRes.error) {
    throw new Error(`Failed to load artworks: ${artworksRes.error.message}`);
  }

  const flags = toScopeFlags(scope);
  const queue: AnalyzeItem[] = [];

  if (flags.lessons) {
    ((lessonsRes.data as LessonRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeLessonSource(row);
      const normalizedSource = toCanonicalJson(normalized);
      const sourceHash = buildSourceHash(normalized);
      const contentId = row.id;
      const existing = existingMap.get(`lesson:${contentId}`);
      const status = resolveStatus(existing, sourceHash);

      queue.push({
        contentType: "lesson",
        contentId,
        sourceHash,
        payload: normalized,
        normalizedSource,
        characters: normalizedSource.length,
        status,
      });
    });
  }

  if (flags.mapStories) {
    ((mapStoriesRes.data as MapStoryRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeMapStorySource(row);
      const normalizedSource = toCanonicalJson(normalized);
      const sourceHash = buildSourceHash(normalized);
      const contentId = String(row.id);
      const existing = existingMap.get(`map_story:${contentId}`);
      const status = resolveStatus(existing, sourceHash);

      queue.push({
        contentType: "map_story",
        contentId,
        sourceHash,
        payload: normalized,
        normalizedSource,
        characters: normalizedSource.length,
        status,
      });
    });
  }

  if (flags.artworks) {
    ((artworksRes.data as ArtworkRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeArtworkSource(row);
      const normalizedSource = toCanonicalJson(normalized);
      const sourceHash = buildSourceHash(normalized);
      const contentId = row.id;
      const existing = existingMap.get(`artwork:${contentId}`);
      const status = resolveStatus(existing, sourceHash);

      queue.push({
        contentType: "artwork",
        contentId,
        sourceHash,
        payload: normalized,
        normalizedSource,
        characters: normalizedSource.length,
        status,
      });
    });
  }

  const selected = firstN ? queue.slice(0, firstN) : queue;
  const needsTranslation = selected.filter(
    (item) => item.status === "missing" || item.status === "outdated",
  );

  const detailedCounts: AnalyzeByType = {
    lessons: { total: 0, ...initStatusTotals() },
    mapStories: { total: 0, ...initStatusTotals() },
    artworks: { total: 0, ...initStatusTotals() },
  };
  const statusCounts = initStatusTotals();

  selected.forEach((item) => {
    if (item.contentType === "lesson") {
      detailedCounts.lessons.total += 1;
      applyStatusCounter(detailedCounts.lessons, item.status);
    } else if (item.contentType === "map_story") {
      detailedCounts.mapStories.total += 1;
      applyStatusCounter(detailedCounts.mapStories, item.status);
    } else {
      detailedCounts.artworks.total += 1;
      applyStatusCounter(detailedCounts.artworks, item.status);
    }
    applyStatusCounter(statusCounts, item.status);
  });

  const totalCharacters = needsTranslation.reduce(
    (sum, item) => sum + item.characters,
    0,
  );
  const tokenPayloads = needsTranslation.map((item) => item.normalizedSource);
  const geminiTokens = await countTokensWithGemini(tokenPayloads);
  const estimatedTokens =
    geminiTokens === null ? estimateTokensByChars(totalCharacters) : geminiTokens;

  return {
    counts: {
      lessons: detailedCounts.lessons.total,
      mapStories: detailedCounts.mapStories.total,
      artworks: detailedCounts.artworks.total,
      total: selected.length,
    },
    statusCounts,
    detailedCounts,
    totalCharacters,
    estimatedTokens,
    estimatedCostUsd: estimateCostUsd(estimatedTokens),
    costModel: `${GEMINI_MODEL} (input $${GEMINI_INPUT_COST_PER_1M}/1M, output $${GEMINI_OUTPUT_COST_PER_1M}/1M tokens)`,
    tokenMethod: geminiTokens === null ? "chars_div_4" : "gemini_count_tokens",
  };
}

export async function getTranslationQueue(
  options: AnalyzeOptions & {
    statuses?: TranslationStatus[];
  },
): Promise<TranslationQueueItem[]> {
  const scope = options.scope ?? "all";
  const firstN =
    typeof options.firstN === "number" && Number.isFinite(options.firstN) && options.firstN > 0
      ? Math.floor(options.firstN)
      : undefined;

  const supabase = getSupabaseServerClient();
  const [lessonsRes, mapStoriesRes, artworksRes, existingMap] = await Promise.all([
    supabase.from("lessons").select("id,title,steps"),
    supabase.from("map_stories").select("id,content"),
    supabase.from("artworks").select("id,title,description"),
    fetchTranslationRows(supabase, options.lang),
  ]);

  if (lessonsRes.error) {
    throw new Error(`Failed to load lessons: ${lessonsRes.error.message}`);
  }
  if (mapStoriesRes.error) {
    throw new Error(`Failed to load map_stories: ${mapStoriesRes.error.message}`);
  }
  if (artworksRes.error) {
    throw new Error(`Failed to load artworks: ${artworksRes.error.message}`);
  }

  const flags = toScopeFlags(scope);
  const queue: TranslationQueueItem[] = [];

  if (flags.lessons) {
    ((lessonsRes.data as LessonRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeLessonSource(row);
      const sourceHash = buildSourceHash(normalized);
      const contentId = row.id;
      const existing = existingMap.get(`lesson:${contentId}`);
      const status = resolveStatus(existing, sourceHash);
      queue.push({
        contentType: "lesson",
        contentId,
        sourceHash,
        payload: normalized,
        status,
        characters: toCanonicalJson(normalized).length,
      });
    });
  }

  if (flags.mapStories) {
    ((mapStoriesRes.data as MapStoryRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeMapStorySource(row);
      const sourceHash = buildSourceHash(normalized);
      const contentId = String(row.id);
      const existing = existingMap.get(`map_story:${contentId}`);
      const status = resolveStatus(existing, sourceHash);
      queue.push({
        contentType: "map_story",
        contentId,
        sourceHash,
        payload: normalized,
        status,
        characters: toCanonicalJson(normalized).length,
      });
    });
  }

  if (flags.artworks) {
    ((artworksRes.data as ArtworkRow[] | null) ?? []).forEach((row) => {
      const normalized = normalizeArtworkSource(row);
      const sourceHash = buildSourceHash(normalized);
      const contentId = row.id;
      const existing = existingMap.get(`artwork:${contentId}`);
      const status = resolveStatus(existing, sourceHash);
      queue.push({
        contentType: "artwork",
        contentId,
        sourceHash,
        payload: normalized,
        status,
        characters: toCanonicalJson(normalized).length,
      });
    });
  }

  const filtered =
    options.statuses && options.statuses.length > 0
      ? queue.filter((item) => options.statuses?.includes(item.status))
      : queue;

  return firstN ? filtered.slice(0, firstN) : filtered;
}
