export type AnalyzeResponse = {
  counts: {
    lessons: number;
    mapStories: number;
    artworks: number;
    books: number;
    stories: number;
    total: number;
  };
  statusCounts: {
    translated: number;
    missing: number;
    outdated: number;
  };
  detailedCounts: {
    lessons: {
      total: number;
      translated: number;
      missing: number;
      outdated: number;
    };
    mapStories: {
      total: number;
      translated: number;
      missing: number;
      outdated: number;
    };
    artworks: {
      total: number;
      translated: number;
      missing: number;
      outdated: number;
    };
    books: {
      total: number;
      translated: number;
      missing: number;
      outdated: number;
    };
    stories: {
      total: number;
      translated: number;
      missing: number;
      outdated: number;
    };
  };
  totalCharacters: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  costModel: string;
  tokenMethod: "gemini_count_tokens" | "chars_div_4";
  batchComplexity: {
    recommendedBatchSize: number;
    estimatedTokensPerItem: number;
    largestItemTokens: number;
    warning: string | null;
  };
  mockModeActive?: boolean;
};

export type TranslationScope =
  | "all"
  | "lessons"
  | "map_stories"
  | "artworks"
  | "books"
  | "stories";

export type RunRequest = {
  lang: string;
  scope: TranslationScope;
  firstN?: number;
  batchSize?: number;
  confirmed: true;
};

export type UntranslatedLesson = {
  id: string;
  title: string | null;
  content_type:
    | "lesson"
    | "map_story"
    | "artwork"
    | "book"
    | "story_template"
    | "story_submission";
  source_tokens?: number;
};

export type ProgressResponse = {
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
