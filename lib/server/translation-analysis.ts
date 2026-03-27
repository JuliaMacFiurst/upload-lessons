import { GoogleGenAI } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  type LoadedTranslationItem,
  loadTranslationItemsByScope,
  type TranslationContentType,
  type TranslationScope,
} from "./translation-content";

type TranslationStatus = "translated" | "missing" | "outdated";

type AnalyzeCounts = {
  lessons: number;
  mapStories: number;
  artworks: number;
  books: number;
  stories: number;
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
  books: StatusTotals & { total: number };
  stories: StatusTotals & { total: number };
};

type BatchComplexity = {
  recommendedBatchSize: number;
  estimatedTokensPerItem: number;
  largestItemTokens: number;
  warning: string | null;
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
  batchComplexity: BatchComplexity;
};

type ContentTranslationRow = {
  content_type: TranslationContentType;
  content_id: string;
  language: string;
  source_hash: string;
};

type AnalyzeItem = LoadedTranslationItem & {
  status: TranslationStatus;
};

type AnalyzeOptions = {
  lang: string;
  scope?: TranslationScope;
  firstN?: number;
};

export type TranslationQueueItem = {
  contentType: TranslationContentType;
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

function estimateCostUsd(tokens: number): number {
  const inputCost = (tokens / 1_000_000) * GEMINI_INPUT_COST_PER_1M;
  const outputCost =
    ((tokens * OUTPUT_TOKEN_FACTOR) / 1_000_000) * GEMINI_OUTPUT_COST_PER_1M;
  return Number((inputCost + outputCost).toFixed(6));
}

function estimateTokensByChars(characters: number): number {
  return Math.ceil(characters / 4);
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

function mapContentTypeToBucket(
  contentType: TranslationContentType,
): keyof AnalyzeByType {
  if (contentType === "lesson") {
    return "lessons";
  }
  if (contentType === "map_story") {
    return "mapStories";
  }
  if (contentType === "artwork") {
    return "artworks";
  }
  if (contentType === "book") {
    return "books";
  }
  return "stories";
}

function buildBatchComplexity(items: AnalyzeItem[]): BatchComplexity {
  if (items.length === 0) {
    return {
      recommendedBatchSize: 10,
      estimatedTokensPerItem: 0,
      largestItemTokens: 0,
      warning: null,
    };
  }

  const itemTokens = items.map((item) => estimateTokensByChars(item.characters));
  const totalTokens = itemTokens.reduce((sum, value) => sum + value, 0);
  const estimatedTokensPerItem = Math.max(1, Math.round(totalTokens / items.length));
  const largestItemTokens = Math.max(...itemTokens);
  const containsComplexContent = items.some(
    (item) => item.contentType === "book" || item.contentType === "story_template" || item.contentType === "story_submission",
  );

  const targetBatchTokens = containsComplexContent ? 6000 : 12000;
  const recommendedBatchSize = Math.max(
    1,
    Math.min(10, Math.floor(targetBatchTokens / Math.max(estimatedTokensPerItem, 1))),
  );

  let warning: string | null = null;
  if (largestItemTokens > 5000) {
    warning =
      "At least one item is very large. Send books/stories in very small batches, ideally 1 item at a time.";
  } else if (containsComplexContent && recommendedBatchSize <= 3 && items.length > 3) {
    warning =
      `This batch is likely too complex for a large Gemini request. Recommended batch size: ${recommendedBatchSize} or less.`;
  } else if (estimatedTokensPerItem > 2000 && items.length > recommendedBatchSize) {
    warning =
      `Items are relatively heavy. Recommended batch size: ${recommendedBatchSize} or less to reduce JSON parse failures.`;
  }

  return {
    recommendedBatchSize,
    estimatedTokensPerItem,
    largestItemTokens,
    warning,
  };
}

async function loadAnalyzedItems(options: AnalyzeOptions): Promise<AnalyzeItem[]> {
  const supabase = getSupabaseServerClient();
  const [loadedItems, existingMap] = await Promise.all([
    loadTranslationItemsByScope(supabase, options.scope ?? "all"),
    fetchTranslationRows(supabase, options.lang),
  ]);

  return loadedItems.map((item) => ({
    ...item,
    status: resolveStatus(
      existingMap.get(`${item.contentType}:${item.contentId}`),
      item.sourceHash,
    ),
  }));
}

export async function analyzeTranslationState(
  options: AnalyzeOptions,
): Promise<TranslationAnalyzeResult> {
  const firstN =
    typeof options.firstN === "number" && Number.isFinite(options.firstN) && options.firstN > 0
      ? Math.floor(options.firstN)
      : undefined;
  const queue = await loadAnalyzedItems(options);
  const selected = firstN ? queue.slice(0, firstN) : queue;
  const needsTranslation = selected.filter(
    (item) => item.status === "missing" || item.status === "outdated",
  );

  const detailedCounts: AnalyzeByType = {
    lessons: { total: 0, ...initStatusTotals() },
    mapStories: { total: 0, ...initStatusTotals() },
    artworks: { total: 0, ...initStatusTotals() },
    books: { total: 0, ...initStatusTotals() },
    stories: { total: 0, ...initStatusTotals() },
  };
  const statusCounts = initStatusTotals();

  selected.forEach((item) => {
    const bucket = mapContentTypeToBucket(item.contentType);
    detailedCounts[bucket].total += 1;
    applyStatusCounter(detailedCounts[bucket], item.status);
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
      books: detailedCounts.books.total,
      stories: detailedCounts.stories.total,
      total: selected.length,
    },
    statusCounts,
    detailedCounts,
    totalCharacters,
    estimatedTokens,
    estimatedCostUsd: estimateCostUsd(estimatedTokens),
    costModel: `${GEMINI_MODEL} (input $${GEMINI_INPUT_COST_PER_1M}/1M, output $${GEMINI_OUTPUT_COST_PER_1M}/1M tokens)`,
    tokenMethod: geminiTokens === null ? "chars_div_4" : "gemini_count_tokens",
    batchComplexity: buildBatchComplexity(needsTranslation),
  };
}

export async function getTranslationQueue(
  options: AnalyzeOptions & {
    statuses?: TranslationStatus[];
  },
): Promise<TranslationQueueItem[]> {
  const firstN =
    typeof options.firstN === "number" && Number.isFinite(options.firstN) && options.firstN > 0
      ? Math.floor(options.firstN)
      : undefined;
  const queue = await loadAnalyzedItems(options);

  const filtered =
    options.statuses && options.statuses.length > 0
      ? queue.filter((item) => options.statuses?.includes(item.status))
      : queue;

  const mapped = filtered.map((item) => ({
    contentType: item.contentType,
    contentId: item.contentId,
    sourceHash: item.sourceHash,
    payload: item.payload,
    status: item.status,
    characters: item.characters,
  }));

  return firstN ? mapped.slice(0, firstN) : mapped;
}

export type { TranslationScope };
