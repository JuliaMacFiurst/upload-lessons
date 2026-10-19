import type { SupabaseClient } from "@supabase/supabase-js";

type AnalyticsRawRow = Record<string, unknown>;

type NormalizedEvent = {
  id: string;
  eventName: string;
  originalEventName: string;
  section: string | null;
  contentId: string | null;
  contentSlug: string | null;
  contentTitle: string | null;
  pageTitle: string | null;
  language: string | null;
  sessionId: string | null;
  userId: string | null;
  currentPage: string | null;
  sourcePage: string | null;
  referrer: string | null;
  durationSeconds: number | null;
  completionPercent: number | null;
  stepIndex: number | null;
  totalSteps: number | null;
  errorMessage: string | null;
  exportFormat: string | null;
  exportMethod: string | null;
  deviceType: string | null;
  viewportWidth: number | null;
  properties: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  createdMs: number;
};

type LoadedAnalyticsRows = {
  rows: NormalizedEvent[];
  source: "analytics_events";
};

export type AnalyticsPeriodKey = "24h" | "7d" | "14d";

export type AnalyticsMetricCard = {
  key: string;
  label: string;
  value: number;
  valueText?: string;
  suffix?: string;
  changePercent: number | null;
  explanation: string;
  formula: string;
  events: string[];
  confidence: "высокая" | "средняя" | "низкая";
  reliability: string;
};

export type AnalyticsContentRow = {
  key: string;
  title: string;
  type: string;
  opens: number;
  completions: number;
  progress: number;
  hasProgressData: boolean;
  exits: number;
  shares: number;
  hasShareData: boolean;
  errors: number;
  completionRate: number | null;
  completionStatus: string;
  growthPercent: number | null;
};

export type AnalyticsLanguageRow = {
  lang: string;
  events: number;
  opens: number;
  completions: number;
  exits: number;
  completionRate: number | null;
  completionStatus: string;
  growthPercent: number | null;
};

export type AnalyticsPageRow = {
  page: string;
  title: string;
  views: number;
  visitors: number;
  exits: number;
  exitRate: number;
  averageDurationSeconds: number | null;
  hasExplicitDuration: boolean;
  durationStatus: "нет данных" | "0 секунд" | "короткое время" | "нормальное" | "подозрительно долго";
  averageEvents: number;
};

export type AnalyticsFunnel = {
  key: string;
  title: string;
  explanation: string;
  steps: Array<{ step: string; count: number; conversionPercent: number | null; note: string }>;
  confidence: "высокая" | "средняя" | "низкая";
};

export type AnalyticsOpportunity = {
  title: string;
  description: string;
  tone: "good" | "warning" | "growth" | "idea";
  confidence: "высокая" | "средняя" | "низкая";
  category: "technical" | "product";
};

export type AnalyticsQualityIssue = {
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  count?: number;
};

export type AnalyticsAdminPayload = {
  generatedAt: string;
  period: AnalyticsPeriodKey;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  today: {
    date: string;
    visitors: number;
    sessions: number;
    events: number;
    projectsCreated: number;
  };
  rollingActivity: {
    last12Hours: { visitors: number; sessions: number };
    last24Hours: { visitors: number; sessions: number };
  };
  availableDays: number;
  periods: Record<AnalyticsPeriodKey, AnalyticsMetricCard[]>;
  growth: Array<{ date: string; visitors: number; sessions: number; events: number }>;
  content: {
    rows: AnalyticsContentRow[];
    best: AnalyticsContentRow[];
    openedNotFinished: AnalyticsContentRow[];
    highCompletion: AnalyticsContentRow[];
    lowCompletion: AnalyticsContentRow[];
    developFurther: AnalyticsContentRow[];
  };
  funnels: AnalyticsFunnel[];
  languages: AnalyticsLanguageRow[];
  pages: {
    topPages: AnalyticsPageRow[];
    highExitPages: AnalyticsPageRow[];
    lowDurationPages: AnalyticsPageRow[];
    transitions: Array<{ from: string; to: string; count: number }>;
  };
  studio: {
    opened: number;
    projectsCreated: number;
    mediaAdded: number;
    stickersAdded: number;
    exportStarted: number;
    exportCompleted: number;
    exportFailed: number;
    recordingStarted: number;
    recordingCompleted: number;
    recordingFailed: number;
    realOpened: number;
    approximateOpened: number;
    openedIsApproximate: boolean;
    successfulExports: number;
    funnelBlockedReason: string | null;
    exportMethods: Array<{ method: string; started: number; completed: number; failed: number }>;
    breakpoints: Array<{ step: string; count: number; conversionPercent: number | null; note: string }>;
    funnels: AnalyticsFunnel[];
  };
  opportunities: AnalyticsOpportunity[];
  dataQuality: {
    summaryWarnings: AnalyticsQualityIssue[];
    missingEverEvents: AnalyticsQualityIssue[];
    missingExpectedEvents: string[];
    optionalEventNotes: AnalyticsQualityIssue[];
    propertyIssues: AnalyticsQualityIssue[];
    duplicateIssues: AnalyticsQualityIssue[];
    dailyDrops: AnalyticsQualityIssue[];
    unavailableMetrics: AnalyticsQualityIssue[];
  };
  availablePeriods: AnalyticsPeriodKey[];
  unavailablePeriodReasons: Partial<Record<"30d" | "90d", string>>;
  exportSummary: string;
};

type CanonicalAnalyticsReport = {
  version: 2;
  period: { from: string; to: string; timezone: "UTC" };
  audience: { unique_visitors: number; sessions: number; page_views: number; events: number; average_session_duration_seconds: number | null; bounce_rate: number | null };
  engagement: { content_opened: number; content_completed: number; completion_rate: number | null };
  studio: { opened: number; projects_created: number; successful_exports: number; failed_exports: number; successful_recordings: number; failed_recordings: number };
  pages: Array<{ page: string; title: string; views: number; visitors: number }>;
  content: Array<{ key: string; title: string; section: string; opens: number; completions: number; completion_rate: number | null }>;
  sections: Record<string, number>;
  languages: Record<string, number>;
  event_counts: Record<string, number>;
  data_quality: { status: "data ok" | "data incomplete"; truncated: boolean; events_without_session_id: number; events_without_user_id: number; events_without_event_id: number; missing_expected_events?: string[]; skipped_events_observable: false; note: string };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 50000;
const QUERY_PAGE_SIZE = 1000;
const PERIOD_DAYS: Record<AnalyticsPeriodKey, number> = { "24h": 1, "7d": 7, "14d": 14 };
const PERIOD_LABELS: Record<AnalyticsPeriodKey, string> = {
  "24h": "последние 24 часа",
  "7d": "последние 7 дней",
  "14d": "последние 14 дней",
};

const EVENT_EXPECTATIONS: Record<string, string> = {
  page_view: "Каждая загрузка страницы в `_app`.",
  session_start: "Первое событие новой browser session.",
  content_open: "Универсальное открытие контента.",
  content_start: "Начало чтения/прохождения контента.",
  content_progress: "Продвижение по шагам или экрану контента.",
  content_complete: "Пользователь дошёл до конца контента.",
  content_exit: "Пользователь ушёл со страницы контента, желательно с duration_seconds.",
  language_changed: "Language switcher.",
  external_link_clicked: "Клик по внешней ссылке.",
  error_seen: "Показанная пользователю ошибка.",
  studio_open: "Открытие cats/parrots/studio.",
  studio_project_created: "Создание проекта в студии.",
  studio_media_added: "Добавление медиа в студии, optional.",
  studio_sticker_added: "Добавление стикера в студии, optional.",
  studio_export_started: "Старт любого export flow.",
  studio_export_completed: "Успешное завершение export flow.",
  studio_export_failed: "Ошибка export flow.",
  studio_recording_started: "Старт screen/canvas recording flow.",
  studio_recording_completed: "Успешное завершение recording flow.",
  studio_recording_failed: "Ошибка recording flow.",
  cat_question_opened: "Открытие вопроса в cats.",
  cat_question_completed: "Завершение вопроса в cats.",
  raccoon_map_opened: "Открытие карты raccoons.",
  country_opened: "Открытие страны на SEO/entity page.",
  recipe_opened: "Открытие рецепта.",
  dog_lesson_opened: "Открытие dog lesson.",
  dog_lesson_completed: "Завершение dog lesson.",
  parrot_music_opened: "Открытие parrot music.",
  parrot_audio_created: "Создание parrot audio.",
  bedtime_story_opened: "Открытие bedtime story.",
  bedtime_story_completed: "Завершение bedtime story.",
};

const OPTIONAL_EVENTS = [
  "share_clicked",
  "external_link_clicked",
  "error_seen",
  "studio_sticker_added",
  "recipe_steps_viewed",
];

const LEGACY_EVENT_MAP: Record<string, string> = {
  page_viewed: "page_view",
  recipe_opened: "content_open",
  project_created: "studio_project_created",
};

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function formatDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function canonicalEventName(eventName: string) {
  return LEGACY_EVENT_MAP[eventName] || eventName;
}

function normalizeSection(value: string | null) {
  return value ? value.replace(/_/g, "-") : null;
}

function inferSection(row: AnalyticsRawRow, props: Record<string, unknown>, metadata: Record<string, unknown>, eventName: string) {
  const explicit = stringValue(row.section, props.section, metadata.section, row.entity_type, props.entity_type, metadata.entity_type);
  if (explicit) {
    return normalizeSection(explicit);
  }
  if (eventName.includes("cat")) return "cats";
  if (eventName.includes("raccoon") || eventName === "map_opened") return "raccoons";
  if (eventName.includes("recipe")) return "recipes";
  if (eventName.includes("dog")) return "dog-lessons";
  if (eventName.includes("parrot")) return "parrot-music";
  if (eventName.includes("bedtime") || eventName.startsWith("story_")) return "bedtime-stories";
  if (eventName.startsWith("studio_") || eventName === "project_created" || eventName === "video_exported") return "studio";
  return null;
}

function normalizePage(value: string | null) {
  if (!value) {
    return "Неизвестная страница";
  }
  return value.split("?")[0] || "/";
}

function normalizeLanguage(value: string | null) {
  if (!value) {
    return "unknown";
  }
  const lowered = value.toLowerCase();
  if (lowered.startsWith("ru")) return "ru";
  if (lowered.startsWith("en")) return "en";
  if (lowered.startsWith("he") || lowered.startsWith("iw")) return "he";
  return lowered;
}

export function normalizeEvent(row: AnalyticsRawRow): NormalizedEvent {
  const metadata = asObject(row.metadata);
  const properties = asObject(row.properties);
  const originalEventName = stringValue(row.raw_event_name, row.event_name) || "unknown";
  const eventName = stringValue(row.canonical_event_name) || canonicalEventName(originalEventName);
  const createdAt = stringValue(row.created_at) || new Date(0).toISOString();
  const section = normalizeSection(stringValue(row.canonical_section)) || inferSection(row, properties, metadata, originalEventName);
  const currentPage = stringValue(row.canonical_current_page, row.current_page, properties.current_page, properties.page, metadata.current_page, metadata.page, row.page);

  return {
    id: stringValue(row.id) || `${originalEventName}-${createdAt}-${Math.random()}`,
    eventName,
    originalEventName,
    section,
    contentId: stringValue(row.canonical_content_id, row.content_id, properties.content_id, metadata.content_id, row.entity_id),
    contentSlug: stringValue(row.canonical_content_slug, row.content_slug, properties.content_slug, metadata.content_slug, properties.slug, metadata.slug),
    contentTitle: stringValue(row.canonical_content_title, row.content_title, properties.content_title, properties.readable_title, properties.page_title, metadata.content_title, metadata.readable_title, metadata.page_title, row.entity_title, properties.title, metadata.title),
    pageTitle: stringValue(row.page_title, properties.page_title, properties.readable_title, metadata.page_title, metadata.readable_title, row.entity_title),
    language: normalizeLanguage(stringValue(row.canonical_language, row.language, properties.language, metadata.language, row.lang, properties.lang, metadata.lang)),
    sessionId: stringValue(row.canonical_session_id, row.session_id, properties.session_id, metadata.session_id),
    userId: stringValue(row.canonical_anonymous_user_id, row.anonymous_user_id, properties.anonymous_user_id, metadata.anonymous_user_id, row.visitor_id, properties.visitor_id, metadata.visitor_id),
    currentPage,
    sourcePage: stringValue(row.source_page, properties.source_page, metadata.source_page),
    referrer: stringValue(row.referrer, properties.referrer, metadata.referrer),
    durationSeconds: numberValue(row.canonical_duration_seconds, row.duration_seconds, properties.duration_seconds, metadata.duration_seconds, metadata.durationSeconds, properties.duration),
    completionPercent: numberValue(row.canonical_completion_percent, row.completion_percent, properties.completion_percent, metadata.completion_percent, metadata.completionPercent),
    stepIndex: numberValue(row.step_index, properties.step_index, metadata.step_index, metadata.stepIndex),
    totalSteps: numberValue(row.total_steps, properties.total_steps, metadata.total_steps, metadata.totalSteps),
    errorMessage: stringValue(row.error_message, properties.error_message, metadata.error_message, metadata.errorMessage),
    exportFormat: stringValue(row.canonical_export_format, row.export_format, properties.export_format, metadata.export_format, metadata.exportFormat, metadata.format),
    exportMethod: stringValue(row.canonical_export_method, properties.export_method, metadata.export_method, metadata.exportMethod),
    deviceType: stringValue(row.canonical_device_type, row.device_type, properties.device_type, metadata.device_type, metadata.deviceType),
    viewportWidth: numberValue(row.viewport_width, properties.viewport_width, metadata.viewport_width, metadata.viewportWidth),
    properties,
    metadata,
    createdAt,
    createdMs: Date.parse(createdAt),
  };
}

export function rowsInRange(rows: NormalizedEvent[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return rows.filter((row) => row.createdMs >= startMs && row.createdMs < endMs);
}

export function analyticsPeriodRanges(days: number, now: Date) {
  const currentStart = new Date(now.getTime() - days * DAY_MS);
  const currentEnd = new Date(now);
  return {
    currentStart,
    currentEnd,
    previousStart: addDays(currentStart, -days),
    previousEnd: addDays(currentEnd, -days),
  };
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function durationStatus(value: number | null): AnalyticsPageRow["durationStatus"] {
  if (value == null) return "нет данных";
  if (value === 0) return "0 секунд";
  if (value < 10) return "короткое время";
  if (value > 60 * 60) return "подозрительно долго";
  return "нормальное";
}

function uniqueCount(rows: NormalizedEvent[], key: "userId" | "sessionId") {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function isContentOpen(row: NormalizedEvent) {
  return row.eventName === "content_open";
}

function isContentComplete(row: NormalizedEvent) {
  return row.eventName === "content_complete";
}

function isStudioExportCompleted(row: NormalizedEvent) {
  return row.eventName === "studio_export_completed";
}

function isStudioRecordingCompleted(row: NormalizedEvent) {
  return row.eventName === "studio_recording_completed";
}

function isSuccessfulStudioOutput(row: NormalizedEvent) {
  return isStudioExportCompleted(row) || isStudioRecordingCompleted(row);
}

function isStudioPageView(row: NormalizedEvent) {
  const page = normalizePage(row.currentPage).toLowerCase();
  return row.eventName === "page_view" && page.includes("/studio");
}

function isStudioOpenSignal(row: NormalizedEvent) {
  return row.eventName === "studio_open" || isStudioPageView(row);
}

function contentKey(row: NormalizedEvent) {
  return row.contentId || row.contentSlug || row.contentTitle || row.currentPage || `${row.section || "content"}:${row.originalEventName}`;
}

function contentTitle(row: NormalizedEvent) {
  return row.contentTitle || row.contentSlug || row.contentId || row.currentPage || "Без названия";
}

function contentType(row: NormalizedEvent) {
  if (row.section) return row.section;
  if (row.originalEventName === "recipe_opened") return "recipes";
  return "content";
}

function topMapEntries(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sessionGroups(rows: NormalizedEvent[]) {
  const bySession = new Map<string, NormalizedEvent[]>();
  for (const row of rows) {
    if (!row.sessionId) continue;
    const current = bySession.get(row.sessionId) || [];
    current.push(row);
    bySession.set(row.sessionId, current);
  }
  bySession.forEach((sessionRows) => sessionRows.sort((a, b) => a.createdMs - b.createdMs));
  return bySession;
}

function sessionDurationSeconds(sessionRows: NormalizedEvent[]) {
  const exitDuration = sessionRows.find((row) => row.eventName === "content_exit" && row.durationSeconds != null)?.durationSeconds;
  if (exitDuration != null) {
    return exitDuration;
  }
  const first = sessionRows[0]?.createdMs;
  const last = sessionRows[sessionRows.length - 1]?.createdMs;
  if (first == null || last == null || last < first) {
    return null;
  }
  return Math.round((last - first) / 1000);
}

function buildGrowth(rows: NormalizedEvent[], start: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const dayRows = rowsInRange(rows, dayStart, dayEnd);
    return {
      date: formatDay(dayStart),
      visitors: uniqueCount(dayRows, "userId"),
      sessions: uniqueCount(dayRows, "sessionId"),
      events: dayRows.length,
    };
  });
}

function buildContentRows(rows: NormalizedEvent[], previousRows: NormalizedEvent[]) {
  const previousOpens = new Map<string, number>();
  const completionSections = new Set(rows.filter(isContentComplete).map((row) => contentType(row)));
  const hasProgressData = rows.some((row) => row.eventName === "content_progress");
  const hasShareData = rows.some((row) => row.eventName === "share_clicked");
  for (const row of previousRows) {
    if (isContentOpen(row)) {
      const key = contentKey(row);
      previousOpens.set(key, (previousOpens.get(key) || 0) + 1);
    }
  }

  const content = new Map<string, AnalyticsContentRow>();
  for (const row of rows) {
    if (!isContentOpen(row) && row.eventName !== "content_progress" && !isContentComplete(row) && row.eventName !== "content_exit" && row.eventName !== "share_clicked" && row.eventName !== "error_seen") {
      continue;
    }
    const key = contentKey(row);
    const current = content.get(key) || {
      key,
      title: contentTitle(row),
      type: contentType(row),
      opens: 0,
      completions: 0,
      progress: 0,
      hasProgressData,
      exits: 0,
      shares: 0,
      hasShareData,
      errors: 0,
      completionRate: null,
      completionStatus: "N/A",
      growthPercent: 0,
    };
    if (isContentOpen(row)) current.opens += 1;
    if (isContentComplete(row)) current.completions += 1;
    if (row.eventName === "content_progress") current.progress += 1;
    if (row.eventName === "content_exit") current.exits += 1;
    if (row.eventName === "share_clicked") current.shares += 1;
    if (row.eventName === "error_seen") current.errors += 1;
    content.set(key, current);
  }

  return Array.from(content.values())
    .map((item) => {
      const completionAvailable = completionSections.has(item.type) || item.completions > 0;
      return {
        ...item,
        completionRate: completionAvailable ? percent(item.completions, item.opens) : null,
        completionStatus: completionAvailable ? `${percent(item.completions, item.opens)}%` : "N/A",
        growthPercent: percentChange(item.opens, previousOpens.get(item.key) || 0),
      };
    })
    .sort((a, b) => b.opens - a.opens || (b.completionRate ?? -1) - (a.completionRate ?? -1));
}

function funnelStep(rows: NormalizedEvent[], label: string, predicate: (row: NormalizedEvent) => boolean, previousCount: number | null, confidence: AnalyticsFunnel["confidence"]) {
  const matched = rows.filter(predicate);
  const userCount = uniqueCount(matched, "userId") || matched.length;
  const conversionPercent = previousCount == null || previousCount === 0 ? null : percent(userCount, previousCount);
  const conversionValue = conversionPercent ?? 0;
  const note = previousCount == null
    ? "Первый шаг воронки."
    : previousCount === 0
      ? "Невозможно посчитать: нет данных предыдущего шага. Если следующий шаг больше 0, воронка повреждена."
    : confidence === "низкая"
      ? "Низкая уверенность: не делаем вывод о просадке."
    : conversionValue >= 70
      ? "Переход выглядит здоровым."
      : conversionValue >= 35
        ? "Есть заметная просадка, стоит проверить экран перед этим шагом."
        : "Сильная просадка: этот переход стоит разобрать первым.";
  return { step: label, count: userCount, conversionPercent, note };
}

function buildFunnel(rows: NormalizedEvent[], key: string, title: string, explanation: string, steps: Array<[string, (row: NormalizedEvent) => boolean]>, confidence: AnalyticsFunnel["confidence"] = "средняя"): AnalyticsFunnel {
  let previous: number | null = null;
  return {
    key,
    title,
    explanation,
    confidence,
    steps: steps.map(([label, predicate]) => {
      const step = funnelStep(rows, label, predicate, previous, confidence);
      previous = step.count;
      return step;
    }),
  };
}

function buildLanguages(rows: NormalizedEvent[], previousRows: NormalizedEvent[]): AnalyticsLanguageRow[] {
  const previousCounts = new Map<string, number>();
  for (const row of previousRows) {
    previousCounts.set(row.language || "unknown", (previousCounts.get(row.language || "unknown") || 0) + 1);
  }
  const byLang = new Map<string, NormalizedEvent[]>();
  for (const row of rows) {
    const lang = row.language || "unknown";
    const current = byLang.get(lang) || [];
    current.push(row);
    byLang.set(lang, current);
  }
  return Array.from(byLang.entries())
    .map(([lang, langRows]) => {
      const opens = langRows.filter(isContentOpen).length;
      const completions = langRows.filter(isContentComplete).length;
      const hasCompletionData = completions > 0 || rows.some(isContentComplete);
      const completionRate = hasCompletionData ? percent(completions, opens) : null;
      return {
        lang,
        events: langRows.length,
        opens,
        completions,
        exits: langRows.filter((row) => row.eventName === "content_exit").length,
        completionRate,
        completionStatus: completionRate == null ? "N/A" : `${completionRate}%`,
        growthPercent: percentChange(langRows.length, previousCounts.get(lang) || 0),
      };
    })
    .sort((a, b) => b.events - a.events || a.lang.localeCompare(b.lang));
}

function buildTransitions(rows: NormalizedEvent[]) {
  const transitions = new Map<string, number>();
  sessionGroups(rows).forEach((sessionRows) => {
    const pages = sessionRows.map((row) => normalizePage(row.currentPage)).filter((page) => page !== "Неизвестная страница");
    for (let index = 0; index < pages.length - 1; index += 1) {
      if (pages[index] === pages[index + 1]) continue;
      const key = `${pages[index]} -> ${pages[index + 1]}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
  });
  return Array.from(transitions.entries())
    .map(([key, count]) => {
      const [from, to] = key.split(" -> ");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
}

function buildPageRows(rows: NormalizedEvent[], pages: string[]): AnalyticsPageRow[] {
  const sessions = sessionGroups(rows);
  const lastPages = new Map<string, number>();
  const sessionDurationsByPage = new Map<string, number[]>();
  sessions.forEach((sessionRows) => {
    const last = normalizePage(sessionRows[sessionRows.length - 1]?.currentPage || null);
    lastPages.set(last, (lastPages.get(last) || 0) + 1);
    const duration = sessionDurationSeconds(sessionRows);
    const firstPage = normalizePage(sessionRows[0]?.currentPage || null);
    if (duration != null && firstPage !== "Неизвестная страница") {
      const current = sessionDurationsByPage.get(firstPage) || [];
      current.push(duration);
      sessionDurationsByPage.set(firstPage, current);
    }
  });

  return pages.map((page) => {
    const pageRows = rows.filter((row) => normalizePage(row.currentPage) === page);
    const pageViewRows = pageRows.filter((row) => row.eventName === "page_view");
    const views = pageViewRows.length || pageRows.length;
    const exits = (lastPages.get(page) || 0) + pageRows.filter((row) => row.eventName === "content_exit").length;
    const visitors = uniqueCount(pageRows, "userId");
    const explicitDurations = pageRows.map((row) => row.durationSeconds).filter((value): value is number => value != null);
    const computedDurations = sessionDurationsByPage.get(page) || [];
    const title = pageRows.map((row) => row.contentTitle || row.pageTitle).find(Boolean) || page;
    const averageDurationSeconds = average(explicitDurations.length > 0 ? explicitDurations : computedDurations);
    const hasExplicitDuration = explicitDurations.length > 0;
    return {
      page,
      title,
      views,
      visitors,
      exits,
      exitRate: percent(exits, views),
      averageDurationSeconds,
      hasExplicitDuration,
      durationStatus: durationStatus(averageDurationSeconds),
      averageEvents: visitors > 0 ? Math.round((pageRows.length / visitors) * 10) / 10 : 0,
    };
  });
}

function buildPages(rows: NormalizedEvent[]) {
  const views = new Map<string, number>();
  for (const row of rows) {
    const page = normalizePage(row.currentPage);
    if (page === "Неизвестная страница") continue;
    views.set(page, (views.get(page) || 0) + (row.eventName === "page_view" ? 1 : 0.2));
  }
  const pages = topMapEntries(views, 30).map((item) => item.label);
  const pageRows = buildPageRows(rows, pages);
  return {
    topPages: [...pageRows].sort((a, b) => b.views - a.views).slice(0, 12),
    highExitPages: [...pageRows].filter((row) => row.views >= 3).sort((a, b) => b.exitRate - a.exitRate || b.exits - a.exits).slice(0, 12),
    lowDurationPages: [...pageRows].filter((row) => row.hasExplicitDuration && row.averageDurationSeconds != null).sort((a, b) => (a.averageDurationSeconds || 0) - (b.averageDurationSeconds || 0)).slice(0, 12),
    transitions: buildTransitions(rows),
  };
}

function buildStudio(rows: NormalizedEvent[]) {
  const flowPredicate = (flow: string) => (row: NormalizedEvent) => {
    if (flow === "mobile_recording") return row.deviceType === "mobile" || row.exportFormat === "mobile_recording" || row.exportMethod === "mobile_recording";
    if (flow === "tablet_recording") return row.deviceType === "tablet" || row.exportFormat === "tablet_recording" || row.exportMethod === "tablet_recording";
    if (flow === "desktop_recording") return row.deviceType === "desktop" || row.exportFormat === "desktop_recording" || row.exportFormat === "screen_recording" || row.exportMethod === "desktop_recording" || row.exportMethod === "screen_recording";
    if (flow === "direct_canvas_recording") return row.exportMethod === "direct_canvas_recording" || row.exportMethod === "direct_canvas_export";
    if (flow === "guided_screen_recording") return row.exportMethod === "guided_screen_recording" || row.exportFormat === "screen_recording";
    if (flow === "offline_audio_render") return row.exportMethod === "offline_audio_render";
    return false;
  };
  const recordingFlow = (key: string, title: string, predicate: (row: NormalizedEvent) => boolean) => buildFunnel(rows, key, title, "Recording и export считаются отдельно. Conversion нельзя считать надёжной, если нет studio_open.", [
    ["Studio opened", (row) => isStudioOpenSignal(row) && (predicate(row) || !row.exportMethod)],
    ["Project created", (row) => row.eventName === "studio_project_created" && (predicate(row) || !row.exportMethod)],
    ["Recording started", (row) => row.eventName === "studio_recording_started" && predicate(row)],
    ["Recording completed", (row) => row.eventName === "studio_recording_completed" && predicate(row)],
    ["Recording failed", (row) => row.eventName === "studio_recording_failed" && predicate(row)],
  ], rows.some((row) => row.eventName === "studio_recording_started" && predicate(row)) ? "средняя" : "низкая");
  const exportFlow = (key: string, title: string, predicate: (row: NormalizedEvent) => boolean) => buildFunnel(rows, key, title, "Реальный экспортный путь. Media/sticker не считаются обязательными шагами.", [
    ["Studio opened", (row) => isStudioOpenSignal(row) && (predicate(row) || !row.exportMethod)],
    ["Project created", (row) => row.eventName === "studio_project_created" && (predicate(row) || !row.exportMethod)],
    ["Export started", (row) => row.eventName === "studio_export_started" && predicate(row)],
    ["Export completed", (row) => row.eventName === "studio_export_completed" && predicate(row)],
    ["Export failed", (row) => row.eventName === "studio_export_failed" && predicate(row)],
  ], rows.some((row) => row.eventName === "studio_export_started" && predicate(row)) ? "средняя" : "низкая");

  const realStudioOpened = rows.filter((row) => row.eventName === "studio_open").length;
  const approximateStudioOpened = realStudioOpened > 0 ? 0 : rows.filter(isStudioPageView).length;
  const opened = realStudioOpened || approximateStudioOpened;
  const steps = [
    ["Studio opened", opened],
    ["Project created", rows.filter((row) => row.eventName === "studio_project_created").length],
    ["Media added", rows.filter((row) => row.eventName === "studio_media_added").length],
    ["Sticker added", rows.filter((row) => row.eventName === "studio_sticker_added").length],
    ["Export started", rows.filter((row) => row.eventName === "studio_export_started").length],
    ["Successful output", rows.filter(isSuccessfulStudioOutput).length],
  ] as const;
  let previous: number | null = null;
  const breakpoints = steps.map(([step, count]) => {
    const conversionPercent = previous == null || previous === 0 ? null : percent(count, previous);
    const note = previous == null
      ? "Старт пути."
      : previous === 0
        ? "Невозможно посчитать: нет данных предыдущего шага."
        : (conversionPercent ?? 0) >= 60
          ? "Переход нормальный."
          : "Здесь заметная потеря пользователей или не хватает событий.";
    previous = count;
    return { step, count, conversionPercent, note };
  });
  const exportMethodMap = new Map<string, { method: string; started: number; completed: number; failed: number }>();
  for (const row of rows) {
    if (!row.eventName.startsWith("studio_export") && !row.eventName.startsWith("studio_recording")) {
      continue;
    }
    const method = row.exportMethod || row.exportFormat || "unknown";
    const current = exportMethodMap.get(method) || { method, started: 0, completed: 0, failed: 0 };
    if (row.eventName.endsWith("_started")) current.started += 1;
    if (row.eventName.endsWith("_completed")) current.completed += 1;
    if (row.eventName.endsWith("_failed")) current.failed += 1;
    exportMethodMap.set(method, current);
  }
  const exportMethods = Array.from(exportMethodMap.values()).sort((a, b) => b.started - a.started || b.completed - a.completed || a.method.localeCompare(b.method));
  const studioActivity = rows.filter((row) => row.eventName.startsWith("studio_")).length;
  return {
    opened,
    projectsCreated: steps[1][1],
    mediaAdded: steps[2][1],
    stickersAdded: steps[3][1],
    exportStarted: steps[4][1],
    exportCompleted: rows.filter((row) => row.eventName === "studio_export_completed").length,
    exportFailed: rows.filter((row) => row.eventName === "studio_export_failed").length,
    recordingStarted: rows.filter((row) => row.eventName === "studio_recording_started").length,
    recordingCompleted: rows.filter((row) => row.eventName === "studio_recording_completed").length,
    recordingFailed: rows.filter((row) => row.eventName === "studio_recording_failed").length,
    realOpened: realStudioOpened,
    approximateOpened: approximateStudioOpened,
    openedIsApproximate: realStudioOpened === 0 && approximateStudioOpened > 0,
    successfulExports: steps[5][1],
    funnelBlockedReason: opened === 0 && studioActivity > 0 ? "Сначала подключить `studio_open`: есть studio-события, но нет стартового шага, поэтому conversion в Studio считать нельзя." : null,
    exportMethods,
    breakpoints,
    funnels: [
      recordingFlow("mobile-recording", "Mobile recording", flowPredicate("mobile_recording")),
      recordingFlow("tablet-recording", "Tablet recording", flowPredicate("tablet_recording")),
      recordingFlow("desktop-recording", "Desktop recording", flowPredicate("desktop_recording")),
      exportFlow("direct-canvas", "Desktop / direct canvas export", flowPredicate("direct_canvas_recording")),
      exportFlow("parrot-audio", "Parrot offline audio export", flowPredicate("offline_audio_render")),
    ],
  };
}

function buildOpportunities(rows: NormalizedEvent[], contentRows: AnalyticsContentRow[], pages: ReturnType<typeof buildPages>, languages: AnalyticsLanguageRow[], studio: ReturnType<typeof buildStudio>) {
  const opportunities: AnalyticsOpportunity[] = [];
  const hasCompletionData = rows.some(isContentComplete);
  const hasIdentityData = rows.some((row) => row.userId && row.sessionId);
  if (!hasIdentityData || !hasCompletionData) {
    opportunities.push({
      title: "Сначала проверить качество данных",
      description: `${!hasIdentityData ? "Не хватает user/session id. " : ""}${!hasCompletionData ? "Не хватает completion-событий. " : ""}Продуктовые выводы ниже имеют пониженную уверенность.`,
      tone: "warning",
      confidence: "высокая",
      category: "technical",
    });
  }
  const bySection = new Map<string, { opens: number; completes: number }>();
  for (const row of rows) {
    const section = row.section || "unknown";
    const current = bySection.get(section) || { opens: 0, completes: 0 };
    if (isContentOpen(row)) current.opens += 1;
    if (isContentComplete(row)) current.completes += 1;
    bySection.set(section, current);
  }
  const strongSection = Array.from(bySection.entries())
    .map(([section, stats]) => ({ section, ...stats, completionRate: percent(stats.completes, stats.opens) }))
    .filter((item) => item.opens >= 5 && hasCompletionData && item.completionRate >= 55)
    .sort((a, b) => b.opens - a.opens)[0];
  const weakContent = contentRows.filter((row) => row.opens >= 5 && row.completionRate != null && row.completionRate < 35).sort((a, b) => b.opens - a.opens)[0];
  const exitPage = pages.highExitPages.find((row) => row.views >= 3 && row.exitRate >= 60);
  const bestLang = languages.filter((row) => row.opens >= 3 && row.completionRate != null).sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1) || b.events - a.events)[0];

  if (strongSection) {
    opportunities.push({ title: `Развивать раздел ${strongSection.section}`, description: `В этом разделе много открытий и completion ${strongSection.completionRate}%. Стоит добавить похожий контент или вывести раздел выше.`, tone: "growth", confidence: hasIdentityData ? "средняя" : "низкая", category: "product" });
  }
  if (exitPage) {
    opportunities.push({ title: "Проверить страницу с высоким выходом", description: `${exitPage.page}: exit rate ${exitPage.exitRate}%. Проверь, понятно ли пользователю, куда идти дальше.`, tone: "warning", confidence: hasIdentityData ? "средняя" : "низкая", category: hasIdentityData ? "product" : "technical" });
  }
  if (weakContent) {
    opportunities.push({ title: "Контент открывают, но не досматривают", description: `${weakContent.title}: ${weakContent.opens} открытий и completion ${weakContent.completionRate}%. Проверь длину, первый экран и момент, где пользователь теряет интерес.`, tone: "warning", confidence: hasCompletionData ? "средняя" : "низкая", category: hasCompletionData ? "product" : "technical" });
  }
  if (studio.funnelBlockedReason) {
    opportunities.push({ title: "Починить старт Studio funnel", description: studio.funnelBlockedReason, tone: "warning", confidence: "высокая", category: "technical" });
  } else if (studio.exportStarted > 0 && percent(studio.successfulExports, studio.exportStarted) < 60) {
    opportunities.push({ title: "Проверить UX экспорта или событие", description: `Экспорт начали ${studio.exportStarted} раз, успешно завершили export/recording ${studio.successfulExports}. Нужно проверить ошибки, ожидание и отправку события завершения.`, tone: "warning", confidence: "средняя", category: "product" });
  }
  if (bestLang && (bestLang.completionRate ?? 0) >= 50) {
    opportunities.push({ title: `Хорошее удержание на языке ${bestLang.lang}`, description: `На этом языке completion ${bestLang.completionRate}%. Можно проверить, какой контент там работает, и повторить подход в других языках.`, tone: "good", confidence: hasCompletionData ? "средняя" : "низкая", category: "product" });
  }
  if (opportunities.length === 0) {
    opportunities.push({ title: "Пока мало сильных сигналов", description: "Когда накопится больше открытий, завершений, выходов и экспортов, здесь появятся более точные рекомендации.", tone: "idea", confidence: "низкая", category: "technical" });
  }
  return opportunities;
}

function countMissing(rows: NormalizedEvent[], predicate: (row: NormalizedEvent) => boolean) {
  return rows.filter(predicate).length;
}

function buildDataQuality(rows: NormalizedEvent[], allRows: NormalizedEvent[], growth: AnalyticsAdminPayload["growth"], today: string, summaryWarnings: AnalyticsQualityIssue[], studio: ReturnType<typeof buildStudio>) {
  const presentEvents = new Set(rows.map((row) => row.eventName));
  const requiredChecks: Array<{ key: string; expectation: string; affects: string; predicate: (row: NormalizedEvent) => boolean }> = [
    { key: "page_view", expectation: EVENT_EXPECTATIONS.page_view, affects: "посещения страниц, переходы, bounce rate", predicate: (row) => row.eventName === "page_view" },
    { key: "session_start", expectation: EVENT_EXPECTATIONS.session_start, affects: "качество session tracking", predicate: (row) => row.eventName === "session_start" },
    { key: "content_open", expectation: "Canonical content_open из normalized view. Specific события вроде cat_question_opened не суммируются, чтобы не было дублей.", affects: "Content, Funnels, completion denominator", predicate: isContentOpen },
    { key: "content_complete", expectation: "Canonical content_complete из normalized view.", affects: "Completion rate, Languages, Content conclusions", predicate: isContentComplete },
    { key: "studio_open", expectation: EVENT_EXPECTATIONS.studio_open, affects: "Studio opened count", predicate: (row) => row.eventName === "studio_open" },
    { key: "studio_export_started", expectation: EVENT_EXPECTATIONS.studio_export_started, affects: "export funnel start", predicate: (row) => row.eventName === "studio_export_started" },
    { key: "studio_export_completed", expectation: EVENT_EXPECTATIONS.studio_export_completed, affects: "successful export count", predicate: isStudioExportCompleted },
    { key: "studio_export_failed", expectation: EVENT_EXPECTATIONS.studio_export_failed, affects: "export failure diagnostics", predicate: (row) => row.eventName === "studio_export_failed" },
    { key: "studio_recording_started", expectation: EVENT_EXPECTATIONS.studio_recording_started, affects: "recording funnel start", predicate: (row) => row.eventName === "studio_recording_started" },
    { key: "studio_recording_completed", expectation: EVENT_EXPECTATIONS.studio_recording_completed, affects: "successful recording count", predicate: isStudioRecordingCompleted },
    { key: "studio_recording_failed", expectation: EVENT_EXPECTATIONS.studio_recording_failed, affects: "recording failure diagnostics", predicate: (row) => row.eventName === "studio_recording_failed" },
    { key: "duration_seconds", expectation: "Поле duration_seconds в content_exit или других событиях с длительностью.", affects: "Pages duration, average session duration, short visits", predicate: (row) => row.durationSeconds != null },
  ];
  const missingExpectedEvents = requiredChecks.filter((check) => !rows.some(check.predicate)).map((check) => check.key);
  const missingEverEvents = requiredChecks
    .filter((check) => !allRows.some(check.predicate))
    .map((check) => ({
      title: check.key,
      description: `Во всём загруженном окне сигнал не встречался. Где ожидается: ${check.expectation}. Влияет на: ${check.affects}.`,
      severity: "info" as const,
    }));
  const optionalEventNotes = OPTIONAL_EVENTS.map((eventName) => ({
    title: eventName,
    description: presentEvents.has(eventName)
      ? "Optional-событие приходило за период. Его можно использовать как дополнительный сигнал."
      : "Optional-событие не приходило за период. Это не ошибка, если на экране нет соответствующего UI или это legacy event.",
    severity: "info" as const,
    count: rows.filter((row) => row.eventName === eventName).length,
  }));
  const propertyChecks: Array<[string, (row: NormalizedEvent) => boolean]> = [
    ["page_view без current_page", (row) => row.eventName === "page_view" && !row.currentPage],
    ["content events без content_id/content_title", (row) => (isContentOpen(row) || row.eventName === "content_progress" || isContentComplete(row)) && !row.contentId && !row.contentTitle],
    ["content_progress без completion_percent", (row) => row.eventName === "content_progress" && row.completionPercent == null],
    ["studio export без export_format", (row) => row.eventName.startsWith("studio_export") && !row.exportFormat],
    ["events без session_id", (row) => !row.sessionId],
    ["events без anonymous_user_id/visitor_id", (row) => !row.userId],
  ];
  const propertyIssues: AnalyticsQualityIssue[] = propertyChecks
    .map(([title, predicate]) => ({ title, count: countMissing(rows, predicate), description: "Такие строки ухудшают точность продуктовых метрик. Проверка сгруппирована по типам событий.", severity: "warning" as const }))
    .filter((issue) => issue.count > 0);
  const legacyAliases = Object.entries(LEGACY_EVENT_MAP);
  for (const [legacyName, canonicalName] of legacyAliases) {
    const legacyCount = rows.filter((row) => row.originalEventName === legacyName).length;
    const canonicalRawCount = rows.filter((row) => row.originalEventName === canonicalName).length;
    if (legacyCount > 0 && canonicalRawCount === 0) {
      propertyIssues.push({
        title: `${canonicalName} есть только как legacy alias`,
        description: `${legacyName} нормализуется в ${canonicalName}. Метрики считаются, но источник старый; проверь, что новый сайт уже отправляет canonical event.`,
        count: legacyCount,
        severity: "info",
      });
    }
  }
  if (studio.openedIsApproximate) {
    propertyIssues.push({
      title: "studio_open есть только как approximate signal",
      description: "Исторически studio_open не собирался. Для старых данных открытия студии приблизительно считаются по page_view на /studio. Conversion ненадежна.",
      count: studio.approximateOpened,
      severity: "warning",
    });
  }
  if (studio.projectsCreated > studio.opened) {
    propertyIssues.push({
      title: "Project Created > Studio Opened",
      description: `Созданий проектов ${studio.projectsCreated}, открытий студии ${studio.opened}. Вероятно, часть flow не отправляет studio_open или project_created приходит из другого экрана.`,
      count: studio.projectsCreated - studio.opened,
      severity: "warning",
    });
  }
  if (studio.realOpened === 0 && studio.approximateOpened === 0 && (studio.projectsCreated > 0 || studio.exportStarted > 0 || studio.recordingStarted > 0)) {
    propertyIssues.push({
      title: "Studio activity без studio_open",
      description: "За период есть studio project/export/recording события, но нет studio_open и нет page_view на /studio. Conversion в studio funnels нельзя считать.",
      count: studio.projectsCreated + studio.exportStarted + studio.recordingStarted,
      severity: "critical",
    });
  }
  if (studio.recordingStarted > 0 && studio.recordingCompleted === 0) {
    propertyIssues.push({
      title: "Recording started есть, completed нет",
      description: "Возможно пользователь не завершил запись или событие studio_recording_completed не отправляется. Не делаем вывод о провале без проверки flow.",
      count: studio.recordingStarted,
      severity: "warning",
    });
  }
  if (studio.exportStarted > 0 && studio.exportCompleted === 0) {
    propertyIssues.push({
      title: "Export started есть, completed нет",
      description: "Возможно пользователь не завершил экспорт или событие studio_export_completed не отправляется. Не делаем вывод о провале без проверки flow.",
      count: studio.exportStarted,
      severity: "warning",
    });
  }

  const duplicateCounts = new Map<string, number>();
  const sorted = [...rows].sort((a, b) => a.createdMs - b.createdMs);
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const row = sorted[index];
    const key = `${row.eventName}:${row.sessionId || "no-session"}:${row.currentPage || ""}:${row.contentId || row.contentSlug || ""}`;
    const prevKey = `${prev.eventName}:${prev.sessionId || "no-session"}:${prev.currentPage || ""}:${prev.contentId || prev.contentSlug || ""}`;
    if (key === prevKey && row.createdMs - prev.createdMs <= 3000) {
      duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
    }
  }
  const duplicateIssues = topMapEntries(duplicateCounts, 8).map((item) => ({
    title: "Подозрительные дубликаты",
    description: `${item.label}. Масштаб: ${item.count} быстрых повторов в пределах 3 секунд.`,
    count: item.count,
    severity: "warning" as const,
  }));

  const averageEvents = average(growth.map((row) => row.events)) || 0;
  const dailyDrops = growth
    .filter((row) => row.date !== today && averageEvents >= 10 && row.events < averageEvents * 0.35)
    .map((row) => ({
      title: "Резкий провал по дням",
      description: `${row.date}: ${row.events} событий при среднем ${Math.round(averageEvents)}.`,
      count: row.events,
      severity: "critical" as const,
    }));

  const unavailableMetrics: AnalyticsQualityIssue[] = [];
  if (rows.every((row) => !row.sessionId)) unavailableMetrics.push({ title: "Нельзя точно считать сессии", description: "Во всех событиях пустой `session_id`.", severity: "critical" });
  if (rows.every((row) => !row.userId)) unavailableMetrics.push({ title: "Нельзя точно считать посетителей", description: "Во всех событиях пустой `anonymous_user_id` и нет fallback `visitor_id`.", severity: "critical" });
  for (const check of requiredChecks) {
    if (!rows.some(check.predicate)) {
      unavailableMetrics.push({ title: `Недостаточно данных: ${check.key}`, description: `Влияет на: ${check.affects}.`, severity: check.key === "duration_seconds" ? "info" : "warning" });
    }
  }

  return { summaryWarnings, missingEverEvents, missingExpectedEvents, optionalEventNotes, propertyIssues, duplicateIssues, dailyDrops, unavailableMetrics };
}

function buildExportSummary(payload: Omit<AnalyticsAdminPayload, "exportSummary">) {
  const metric = (key: string) => {
    const card = payload.periods[payload.period].find((item) => item.key === key);
    return card?.valueText || `${card?.value ?? 0}${card?.suffix || ""}`;
  };
  const reliableMetrics = payload.periods[payload.period].filter((card) => card.confidence === "высокая").map((card) => card.label);
  const incompleteMetrics = payload.periods[payload.period].filter((card) => card.confidence !== "высокая").map((card) => `${card.label} (${card.confidence})`);
  const dataIncomplete = payload.dataQuality.unavailableMetrics.length > 0 || payload.dataQuality.missingExpectedEvents.length > 0;
  const lines = [
    `status: ${dataIncomplete ? "data incomplete" : "data ok"}`,
    `Период: ${payload.periodLabel} (${payload.periodStart} — ${payload.periodEnd}, UTC rolling window)`,
    "",
    "Audience:",
    `- Unique visitors: ${metric("visitors")}`,
    `- Сессии: ${metric("sessions")}`,
    `- Page views: ${metric("pageViews")}`,
    "",
    "Engagement:",
    `- Content opened: ${payload.content.rows.reduce((sum, row) => sum + row.opens, 0)}`,
    `- Content completed: ${payload.content.rows.reduce((sum, row) => sum + row.completions, 0)}`,
    `- Completion rate: ${metric("completionRate")}`,
    "",
    "Studio:",
    `- Studio opened: ${payload.studio.opened}`,
    `- Projects created: ${metric("createdProjects")}`,
    `- Successful exports: ${metric("successfulExports")}`,
    `- Failed exports: ${payload.studio.exportFailed}`,
    "",
    "Лучшие страницы:",
    ...payload.pages.topPages.slice(0, 5).map((row) => `- ${row.page}: ${row.views} просмотров, ${row.visitors} посетителей`),
    "",
    "Лучшие разделы и контент:",
    ...payload.content.highCompletion.slice(0, 5).map((row) => `- ${row.title}: opens ${row.opens}, completion ${row.completionStatus}`),
    "",
    "Слабые места:",
    ...payload.content.lowCompletion.slice(0, 5).map((row) => `- ${row.title}: opens ${row.opens}, completion ${row.completionStatus}`),
    "",
    "Выводы:",
    ...payload.opportunities.map((item) => `- ${item.title}: ${item.description}`),
    "",
    "Качество данных:",
    `- Достоверные метрики: ${reliableMetrics.join(", ") || "нет"}`,
    `- Недостоверные/с оговорками: ${incompleteMetrics.join(", ") || "нет"}`,
    `- Отсутствующие события за период: ${payload.dataQuality.missingExpectedEvents.slice(0, 12).join(", ") || "нет"}`,
    ...payload.dataQuality.unavailableMetrics.map((item) => `- ${item.title}: ${item.description}`),
    ...payload.dataQuality.summaryWarnings.map((item) => `- ${item.title}: ${item.description}`),
    "",
    "Вопросы для анализа:",
    "- Какие страницы стоит улучшить первыми?",
    "- Какой контент лучше развивать в серию?",
    "- Какие cohort-связи нужны для следующей версии воронок?",
    "- Какие события нужно починить, чтобы метрики стали точнее?",
  ];
  return lines.join("\n");
}

async function queryAnalyticsRows(supabase: SupabaseClient, start: Date, end: Date) {
  const data: AnalyticsRawRow[] = [];

  for (let from = 0; from < MAX_ROWS; from += QUERY_PAGE_SIZE) {
    const to = Math.min(from + QUERY_PAGE_SIZE, MAX_ROWS) - 1;
    const page = await supabase
      .from("analytics_events")
      .select("*")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .order("created_at", { ascending: true })
      .range(from, to);

    if (page.error) {
      return { data: null, error: page.error };
    }

    const pageRows = (page.data || []) as AnalyticsRawRow[];
    data.push(...pageRows);
    if (pageRows.length < to - from + 1) {
      break;
    }
  }

  return { data, error: null };
}

async function loadRows(supabase: SupabaseClient, start: Date, end: Date): Promise<LoadedAnalyticsRows> {
  const raw = await queryAnalyticsRows(supabase, start, end);
  if (raw.error) {
    throw raw.error;
  }

  const rows = ((raw.data || []) as AnalyticsRawRow[])
    .map(normalizeEvent)
    .filter((row) => Number.isFinite(row.createdMs));
  if (process.env.NODE_ENV === "development") {
    console.info("[admin-analytics] safe query breakdown", {
      source: "analytics_events",
      rangeStart: start.toISOString(),
      rangeEndExclusive: end.toISOString(),
      rowsAfterDateFilter: raw.data?.length || 0,
      rowsAfterHostnameFilter: raw.data?.length || 0,
      rowsAfterBotAdminFilter: raw.data?.length || 0,
      rowsAfterParsing: rows.length,
      hostnameFilterApplied: false,
      botAdminFilterApplied: false,
    });
  }

  return {
    rows,
    source: "analytics_events",
  };
}

async function loadCanonicalReport(supabase: SupabaseClient, period: AnalyticsPeriodKey, now: Date) {
  const range = analyticsPeriodRanges(PERIOD_DAYS[period], now);
  const { data, error } = await supabase.rpc("analytics_report_v2", {
    p_from: range.currentStart.toISOString(),
    p_to: range.currentEnd.toISOString(),
  });
  if (error) throw error;
  return data as CanonicalAnalyticsReport;
}

function canonicalMetricCards(report: CanonicalAnalyticsReport): AnalyticsMetricCard[] {
  const quality = report.data_quality.status === "data ok" ? "высокая" : "средняя";
  const values: Array<Omit<AnalyticsMetricCard, "changePercent">> = [
    { key: "visitors", label: "Уникальные посетители", value: report.audience.unique_visitors, explanation: "Anonymous browser visitors за rolling window.", formula: "count distinct anonymous_user_id", events: ["analytics_events"], confidence: quality, reliability: report.data_quality.status },
    { key: "sessions", label: "Сессии", value: report.audience.sessions, explanation: "30-minute inactivity sessions.", formula: "count distinct session_id", events: ["session_id"], confidence: quality, reliability: report.data_quality.status },
    { key: "pageViews", label: "Просмотры страниц", value: report.audience.page_views, explanation: "Реальные route visits.", formula: "count page_view", events: ["page_view"], confidence: "высокая", reliability: "Canonical Analytics v2 event." },
    { key: "events", label: "События", value: report.audience.events, explanation: "Все сохранённые строки периода.", formula: "count(*)", events: ["analytics_events"], confidence: "высокая", reliability: "Не включает skipped/invalid delivery." },
    { key: "averageSessionDuration", label: "Средняя длительность сессии", value: report.audience.average_session_duration_seconds || 0, valueText: report.audience.average_session_duration_seconds == null ? "N/A" : undefined, suffix: " сек.", explanation: "Разница первого и последнего события сессии.", formula: "avg(max(created_at)-min(created_at)) by session_id", events: ["session_id"], confidence: "средняя", reliability: "Однособытийные сессии дают 0 секунд." },
    { key: "completionRate", label: "Completion rate", value: report.engagement.completion_rate || 0, valueText: report.engagement.completion_rate == null ? "N/A" : undefined, suffix: "%", explanation: "Доля уникальных session+content открытий с completion.", formula: "matched completed session-content attempts / opened session-content attempts", events: ["content_open", "content_complete"], confidence: quality, reliability: "Числитель является подмножеством denominator; >100% невозможно." },
    { key: "bounceRate", label: "Bounce rate", value: report.audience.bounce_rate || 0, valueText: report.audience.bounce_rate == null ? "N/A" : undefined, suffix: "%", explanation: "Сессии с одной page view и без meaningful interaction.", formula: "single-page non-interacting sessions / sessions with page views", events: ["page_view", "session_id"], confidence: quality, reliability: "Canonical Analytics v2 definition." },
    { key: "createdProjects", label: "Созданные проекты", value: report.studio.projects_created, explanation: "Созданные Studio projects.", formula: "count studio_project_created", events: ["studio_project_created"], confidence: "высокая", reliability: "Event count." },
    { key: "successfulExports", label: "Успешные экспорты", value: report.studio.successful_exports, explanation: "Завершённые exports, отдельно от recordings.", formula: "count studio_export_completed", events: ["studio_export_completed"], confidence: "высокая", reliability: "Event count." },
  ];
  return values.map((value) => ({ ...value, changePercent: null }));
}

function canonicalContentRows(report: CanonicalAnalyticsReport): AnalyticsContentRow[] {
  return report.content.map((row) => ({
    key: row.key,
    title: row.title,
    type: row.section,
    opens: row.opens,
    completions: row.completions,
    progress: 0,
    hasProgressData: false,
    exits: 0,
    shares: 0,
    hasShareData: false,
    errors: 0,
    completionRate: row.completion_rate,
    completionStatus: row.completion_rate == null ? "N/A" : `${row.completion_rate}%`,
    growthPercent: null,
  }));
}

function canonicalPages(report: CanonicalAnalyticsReport) {
  const rows: AnalyticsPageRow[] = report.pages.map((row) => ({
    page: row.page,
    title: row.title,
    views: row.views,
    visitors: row.visitors,
    exits: 0,
    exitRate: 0,
    averageDurationSeconds: null,
    hasExplicitDuration: false,
    durationStatus: "нет данных",
    averageEvents: 0,
  }));
  return { topPages: rows.slice(0, 12), highExitPages: [], lowDurationPages: [], transitions: [] };
}

export function normalizeAnalyticsPeriod(value: unknown): AnalyticsPeriodKey {
  return value === "24h" || value === "14d" ? value : "7d";
}

export async function buildAdminAnalytics(supabase: SupabaseClient, period: AnalyticsPeriodKey = "7d", now = new Date()): Promise<AnalyticsAdminPayload> {
  const todayStart = startOfUtcDay(now);
  const availablePeriods: AnalyticsPeriodKey[] = ["24h", "7d", "14d"];
  const effectivePeriod: AnalyticsPeriodKey = availablePeriods.includes(period) ? period : "7d";
  const days = PERIOD_DAYS[effectivePeriod];
  const { currentStart: periodStart, currentEnd: periodEnd, previousStart, previousEnd } = analyticsPeriodRanges(days, now);
  const [loaded, report24h, report7d, report14d] = await Promise.all([
    loadRows(supabase, previousStart, periodEnd),
    loadCanonicalReport(supabase, "24h", now),
    loadCanonicalReport(supabase, "7d", now),
    loadCanonicalReport(supabase, "14d", now),
  ]);
  const reports: Record<AnalyticsPeriodKey, CanonicalAnalyticsReport> = { "24h": report24h, "7d": report7d, "14d": report14d };
  const selectedReport = reports[effectivePeriod];
  const rows = loaded.rows;
  const currentRows = rowsInRange(rows, periodStart, periodEnd);
  const previousRows = rowsInRange(rows, previousStart, previousEnd);
  const todayRows = rowsInRange(currentRows, todayStart, periodEnd);
  const last12HoursRows = rowsInRange(currentRows, new Date(now.getTime() - 12 * 60 * 60 * 1000), periodEnd);
  const last24HoursRows = rowsInRange(currentRows, new Date(now.getTime() - 24 * 60 * 60 * 1000), periodEnd);
  const rawContentRows = buildContentRows(currentRows, previousRows);
  const contentRows = canonicalContentRows(selectedReport).map((row) => {
    const raw = rawContentRows.find((item) => item.key === row.key);
    return raw ? { ...row, progress: raw.progress, hasProgressData: raw.hasProgressData, shares: raw.shares, hasShareData: raw.hasShareData, errors: raw.errors } : row;
  });
  const rawLanguages = buildLanguages(currentRows, previousRows);
  const languages: AnalyticsLanguageRow[] = Object.entries(selectedReport.languages).map(([lang, events]) => ({
    lang,
    events,
    opens: 0,
    completions: 0,
    exits: 0,
    completionRate: null,
    completionStatus: "N/A — требуется session-content breakdown",
    growthPercent: rawLanguages.find((row) => row.lang === lang)?.growthPercent ?? null,
  }));
  const rawPages = buildPages(currentRows);
  const pages = { ...canonicalPages(selectedReport), transitions: rawPages.transitions };
  const rawStudio = buildStudio(currentRows);
  const studio = {
    ...rawStudio,
    opened: selectedReport.studio.opened,
    realOpened: selectedReport.studio.opened,
    approximateOpened: 0,
    openedIsApproximate: false,
    projectsCreated: selectedReport.studio.projects_created,
    exportCompleted: selectedReport.studio.successful_exports,
    exportFailed: selectedReport.studio.failed_exports,
    recordingCompleted: selectedReport.studio.successful_recordings,
    recordingFailed: selectedReport.studio.failed_recordings,
    successfulExports: selectedReport.studio.successful_exports,
    breakpoints: [],
    funnels: [],
    funnelBlockedReason: "Conversion скрыта: шаги ещё не связаны в сопоставимую cohort/attempt модель.",
  };
  const summaryWarnings = [
    {
      title: "30/90 дней скрыты",
      description: "Raw analytics_events очищается примерно через 15 дней. 24h/7d/14d считаются из raw; daily summary сохраняет компактную долгосрочную динамику.",
      severity: "warning" as const,
    },
  ];
  const growth = buildGrowth(currentRows, periodStart, days);

  const basePayload = {
    generatedAt: now.toISOString(),
    period: effectivePeriod,
    periodLabel: PERIOD_LABELS[effectivePeriod],
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    today: {
      date: formatDay(todayStart),
      visitors: uniqueCount(todayRows, "userId"),
      sessions: uniqueCount(todayRows, "sessionId"),
      events: todayRows.length,
      projectsCreated: todayRows.filter((row) => row.eventName === "studio_project_created").length,
    },
    rollingActivity: {
      last12Hours: {
        visitors: uniqueCount(last12HoursRows, "userId"),
        sessions: uniqueCount(last12HoursRows, "sessionId"),
      },
      last24Hours: {
        visitors: uniqueCount(last24HoursRows, "userId"),
        sessions: uniqueCount(last24HoursRows, "sessionId"),
      },
    },
    availableDays: days,
    periods: {
      "24h": canonicalMetricCards(report24h),
      "7d": canonicalMetricCards(report7d),
      "14d": canonicalMetricCards(report14d),
    },
    growth,
    content: {
      rows: contentRows,
      best: [...contentRows].sort((a, b) => b.opens - a.opens || (b.completionRate ?? -1) - (a.completionRate ?? -1)).slice(0, 8),
      openedNotFinished: [...contentRows].filter((row) => row.opens >= 3 && row.completionRate != null && row.completions === 0).sort((a, b) => b.opens - a.opens).slice(0, 8),
      highCompletion: [...contentRows].filter((row) => row.opens >= 2 && row.completionRate != null).sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1) || b.opens - a.opens).slice(0, 8),
      lowCompletion: [...contentRows].filter((row) => row.opens >= 3 && row.completionRate != null).sort((a, b) => (a.completionRate ?? 101) - (b.completionRate ?? 101) || b.opens - a.opens).slice(0, 8),
      developFurther: [...contentRows].filter((row) => row.opens >= 3 && row.completionRate != null && row.completionRate >= 50).sort((a, b) => b.opens - a.opens).slice(0, 8),
    },
    funnels: [],
    languages,
    pages,
    studio,
    opportunities: buildOpportunities(currentRows, contentRows, pages, languages, studio)
      .filter((item) => !/exit|conversion|воронк/i.test(`${item.title} ${item.description}`)),
    dataQuality: buildDataQuality(currentRows, rows, growth, formatDay(todayStart), summaryWarnings, studio),
    availablePeriods,
    unavailablePeriodReasons: { "30d": "Нельзя суммировать daily unique visitors как 30-day uniques.", "90d": "Нельзя суммировать daily unique visitors как 90-day uniques." },
  };

  return {
    ...basePayload,
    exportSummary: buildExportSummary(basePayload),
  };
}
