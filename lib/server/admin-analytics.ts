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

export type AnalyticsPeriodKey = "7d" | "14d" | "30d" | "90d";

export type AnalyticsMetricCard = {
  key: string;
  label: string;
  value: number;
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
  exits: number;
  shares: number;
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
  completionRate: number;
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
  durationStatus: "нет данных" | "0 секунд" | "нормальное" | "подозрительно долго";
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
    breakpoints: Array<{ step: string; count: number; conversionPercent: number | null; note: string }>;
    funnels: AnalyticsFunnel[];
  };
  opportunities: AnalyticsOpportunity[];
  dataQuality: {
    summaryWarnings: AnalyticsQualityIssue[];
    missingEverEvents: AnalyticsQualityIssue[];
    missingExpectedEvents: string[];
    propertyIssues: AnalyticsQualityIssue[];
    duplicateIssues: AnalyticsQualityIssue[];
    dailyDrops: AnalyticsQualityIssue[];
    unavailableMetrics: AnalyticsQualityIssue[];
  };
  availablePeriods: AnalyticsPeriodKey[];
  unavailablePeriodReasons: Partial<Record<AnalyticsPeriodKey, string>>;
  exportSummary: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 50000;
const PERIOD_DAYS: Record<AnalyticsPeriodKey, number> = { "7d": 7, "14d": 14, "30d": 30, "90d": 90 };
const PERIOD_LABELS: Record<AnalyticsPeriodKey, string> = {
  "7d": "последние 7 дней",
  "14d": "последние 14 дней",
  "30d": "последние 30 дней",
  "90d": "последние 90 дней",
};

const EXPECTED_EVENTS = [
  "page_view",
  "session_start",
  "content_open",
  "content_start",
  "content_progress",
  "content_complete",
  "content_exit",
  "language_changed",
  "share_clicked",
  "external_link_clicked",
  "error_seen",
  "studio_open",
  "studio_project_created",
  "studio_media_added",
  "studio_sticker_added",
  "studio_export_started",
  "studio_export_completed",
  "studio_export_failed",
  "studio_recording_started",
  "studio_recording_completed",
  "studio_recording_failed",
  "cat_question_opened",
  "cat_question_completed",
  "raccoon_map_opened",
  "country_opened",
  "recipe_opened",
  "dog_lesson_opened",
  "dog_lesson_completed",
  "parrot_music_opened",
  "parrot_audio_created",
  "bedtime_story_opened",
  "bedtime_story_completed",
];

const EVENT_EXPECTATIONS: Record<string, string> = {
  page_view: "Каждая загрузка страницы в `_app`.",
  session_start: "Первое событие новой browser session.",
  content_open: "Универсальное открытие контента.",
  content_start: "Начало чтения/прохождения контента.",
  content_progress: "Продвижение по шагам или экрану контента.",
  content_complete: "Пользователь дошёл до конца контента.",
  content_exit: "Пользователь ушёл со страницы контента, желательно с duration_seconds.",
  language_changed: "Language switcher.",
  share_clicked: "Кнопки share/download/export link.",
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

const LEGACY_EVENT_MAP: Record<string, string> = {
  page_viewed: "page_view",
  story_opened: "content_open",
  story_completed: "content_complete",
  map_opened: "content_open",
  video_exported: "studio_export_completed",
  project_created: "studio_project_created",
  story_downloaded: "share_clicked",
  short_opened: "content_open",
  recipe_opened: "recipe_opened",
};

const SPECIFIC_CONTENT_OPEN_EVENTS = new Set([
  "cat_question_opened",
  "raccoon_map_opened",
  "country_opened",
  "recipe_opened",
  "dog_lesson_opened",
  "parrot_music_opened",
  "bedtime_story_opened",
]);

const SPECIFIC_CONTENT_COMPLETE_EVENTS = new Set([
  "cat_question_completed",
  "dog_lesson_completed",
  "bedtime_story_completed",
]);

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

function normalizeEvent(row: AnalyticsRawRow): NormalizedEvent {
  const metadata = asObject(row.metadata);
  const properties = asObject(row.properties);
  const originalEventName = stringValue(row.event_name) || "unknown";
  const eventName = canonicalEventName(originalEventName);
  const createdAt = stringValue(row.created_at) || new Date(0).toISOString();
  const section = inferSection(row, properties, metadata, originalEventName);
  const currentPage = stringValue(row.current_page, properties.current_page, properties.page, metadata.current_page, metadata.page, row.page);

  return {
    id: stringValue(row.id) || `${originalEventName}-${createdAt}-${Math.random()}`,
    eventName,
    originalEventName,
    section,
    contentId: stringValue(row.content_id, properties.content_id, metadata.content_id, row.entity_id),
    contentSlug: stringValue(row.content_slug, properties.content_slug, metadata.content_slug, properties.slug, metadata.slug),
    contentTitle: stringValue(row.content_title, properties.content_title, properties.readable_title, properties.page_title, metadata.content_title, metadata.readable_title, metadata.page_title, row.entity_title, properties.title, metadata.title),
    pageTitle: stringValue(row.page_title, properties.page_title, properties.readable_title, metadata.page_title, metadata.readable_title, row.entity_title),
    language: normalizeLanguage(stringValue(row.language, properties.language, metadata.language, row.lang, properties.lang, metadata.lang)),
    sessionId: stringValue(row.session_id, properties.session_id, metadata.session_id),
    userId: stringValue(row.anonymous_user_id, properties.anonymous_user_id, metadata.anonymous_user_id, row.visitor_id, properties.visitor_id, metadata.visitor_id),
    currentPage,
    sourcePage: stringValue(row.source_page, properties.source_page, metadata.source_page),
    referrer: stringValue(row.referrer, properties.referrer, metadata.referrer),
    durationSeconds: numberValue(row.duration_seconds, properties.duration_seconds, metadata.duration_seconds, metadata.durationSeconds, properties.duration),
    completionPercent: numberValue(row.completion_percent, properties.completion_percent, metadata.completion_percent, metadata.completionPercent),
    stepIndex: numberValue(row.step_index, properties.step_index, metadata.step_index, metadata.stepIndex),
    totalSteps: numberValue(row.total_steps, properties.total_steps, metadata.total_steps, metadata.totalSteps),
    errorMessage: stringValue(row.error_message, properties.error_message, metadata.error_message, metadata.errorMessage),
    exportFormat: stringValue(row.export_format, properties.export_format, metadata.export_format, metadata.exportFormat, metadata.format),
    exportMethod: stringValue(properties.export_method, metadata.export_method, metadata.exportMethod),
    deviceType: stringValue(row.device_type, properties.device_type, metadata.device_type, metadata.deviceType),
    viewportWidth: numberValue(row.viewport_width, properties.viewport_width, metadata.viewport_width, metadata.viewportWidth),
    properties,
    metadata,
    createdAt,
    createdMs: Date.parse(createdAt),
  };
}

function rowsInRange(rows: NormalizedEvent[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return rows.filter((row) => row.createdMs >= startMs && row.createdMs < endMs);
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
  if (value > 60 * 60) return "подозрительно долго";
  return "нормальное";
}

function uniqueCount(rows: NormalizedEvent[], key: "userId" | "sessionId") {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function isContentOpen(row: NormalizedEvent) {
  return row.eventName === "content_open" || SPECIFIC_CONTENT_OPEN_EVENTS.has(row.eventName);
}

function isContentComplete(row: NormalizedEvent) {
  return row.eventName === "content_complete" || SPECIFIC_CONTENT_COMPLETE_EVENTS.has(row.eventName);
}

function isPageOrContentEvent(row: NormalizedEvent) {
  return row.eventName === "page_view" || isContentOpen(row) || row.eventName === "content_start" || row.eventName === "content_progress" || isContentComplete(row);
}

function contentKey(row: NormalizedEvent) {
  return row.contentId || row.contentSlug || row.contentTitle || row.currentPage || `${row.section || "content"}:${row.originalEventName}`;
}

function contentTitle(row: NormalizedEvent) {
  return row.contentTitle || row.contentSlug || row.contentId || row.currentPage || "Без названия";
}

function contentType(row: NormalizedEvent) {
  if (row.section) return row.section;
  if (row.eventName === "recipe_opened") return "recipes";
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

function buildSessionStats(rows: NormalizedEvent[]) {
  const sessions = Array.from(sessionGroups(rows).values());
  const durations = sessions.map(sessionDurationSeconds).filter((value): value is number => value != null);
  const bounced = sessions.filter((sessionRows) => {
    const duration = sessionDurationSeconds(sessionRows);
    const engagementEvents = sessionRows.filter(isPageOrContentEvent).length;
    return engagementEvents <= 1 || (duration != null && duration < 10);
  }).length;
  return {
    averageDuration: average(durations) || 0,
    bounceRate: percent(bounced, sessions.length),
  };
}

function returningUsers(rows: NormalizedEvent[]) {
  const users = new Map<string, { days: Set<string>; sessions: Set<string> }>();
  for (const row of rows) {
    if (!row.userId) continue;
    const current = users.get(row.userId) || { days: new Set<string>(), sessions: new Set<string>() };
    current.days.add(row.createdAt.slice(0, 10));
    if (row.sessionId) current.sessions.add(row.sessionId);
    users.set(row.userId, current);
  }
  return Array.from(users.values()).filter((item) => item.days.size > 1 || item.sessions.size > 1).length;
}

function buildMetricCards(rows: NormalizedEvent[], previousRows: NormalizedEvent[]): AnalyticsMetricCard[] {
  const completions = rows.filter(isContentComplete).length;
  const opens = rows.filter(isContentOpen).length;
  const previousCompletions = previousRows.filter(isContentComplete).length;
  const previousOpens = previousRows.filter(isContentOpen).length;
  const sessionStats = buildSessionStats(rows);
  const previousSessionStats = buildSessionStats(previousRows);
  const hasUserIds = rows.some((row) => row.userId);
  const hasSessionIds = rows.some((row) => row.sessionId);
  const hasCompletionEvents = rows.some(isContentComplete) || previousRows.some(isContentComplete);
  const hasDurationSignals = rows.some((row) => row.durationSeconds != null) || hasSessionIds;
  const values = [
    ["visitors", "Посетители", uniqueCount(rows, "userId"), uniqueCount(previousRows, "userId"), undefined, "Сколько разных людей было за период.", "count distinct anonymous_user_id, fallback visitor_id", ["anonymous_user_id", "visitor_id"], hasUserIds ? "высокая" : "низкая", hasUserIds ? "Можно доверять: есть идентификатор пользователя." : "Низкая точность: нет anonymous_user_id/visitor_id."],
    ["sessions", "Сессии", uniqueCount(rows, "sessionId"), uniqueCount(previousRows, "sessionId"), undefined, "Сколько визитов было за период.", "count distinct session_id", ["session_id"], hasSessionIds ? "высокая" : "низкая", hasSessionIds ? "Можно доверять: есть session_id." : "Низкая точность: session_id отсутствует."],
    ["events", "События", rows.length, previousRows.length, undefined, "Все действия, которые пришли в аналитику.", "count(*)", ["analytics_events"], "высокая", "Можно доверять как техническому счётчику полученных строк."],
    ["averageSessionDuration", "Средняя длительность сессии", sessionStats.averageDuration, previousSessionStats.averageDuration, " сек.", "Среднее время визита.", "content_exit.duration_seconds или разница первого/последнего события в session_id", ["content_exit", "session_id"], hasDurationSignals ? "средняя" : "низкая", hasDurationSignals ? "Точность средняя: часть длительности может быть вычислена по событиям." : "Нет данных для длительности."],
    ["completionRate", "Completion rate", hasCompletionEvents ? percent(completions, opens) : 0, hasCompletionEvents ? percent(previousCompletions, previousOpens) : 0, "%", hasCompletionEvents ? "Доля открытий контента, которые закончились завершением." : "Недостаточно данных: события завершения не приходят.", "content_complete / content_open с legacy fallback", ["content_open", "content_complete", "story_opened", "story_completed"], hasCompletionEvents ? "средняя" : "низкая", hasCompletionEvents ? "Можно использовать, но только для разделов, где отправляется completion." : "Нельзя интерпретировать: completion data отсутствует."],
    ["returningUsers", "Возвращающиеся пользователи", returningUsers(rows), returningUsers(previousRows), undefined, "Пользователи с событиями в разные дни или несколькими сессиями.", "user_id with >1 day or >1 session", ["anonymous_user_id", "session_id"], hasUserIds && hasSessionIds ? "средняя" : "низкая", hasUserIds ? "Можно оценивать как приблизительный сигнал возврата." : "Низкая точность без user id."],
    ["bounceRate", "Bounce rate", sessionStats.bounceRate, previousSessionStats.bounceRate, "%", "Доля коротких или одношаговых визитов.", "sessions with <=1 page/content event or duration < 10 sec", ["session_id", "page_view", "content_open", "content_exit"], hasSessionIds ? "средняя" : "низкая", hasSessionIds ? "Можно использовать как приблизительный сигнал." : "Нельзя точно считать без session_id."],
    ["createdProjects", "Созданные проекты", rows.filter((row) => row.eventName === "studio_project_created").length, previousRows.filter((row) => row.eventName === "studio_project_created").length, undefined, "Сколько проектов создали в студии.", "studio_project_created + project_created", ["studio_project_created", "project_created"], "высокая", "Можно доверять, если событие отправляется во всех studio flows."],
    ["successfulExports", "Успешные экспорты", rows.filter((row) => row.eventName === "studio_export_completed").length, previousRows.filter((row) => row.eventName === "studio_export_completed").length, undefined, "Сколько экспортов успешно завершилось.", "studio_export_completed + video_exported", ["studio_export_completed", "video_exported"], "высокая", "Можно доверять как счётчику успешных экспортов."],
  ] as const;

  return values.map(([key, label, value, previous, suffix, explanation, formula, events, confidence, reliability]) => ({
    key,
    label,
    value,
    suffix,
    changePercent: percentChange(value, previous),
    explanation,
    formula,
    events: [...events],
    confidence,
    reliability,
  }));
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
      exits: 0,
      shares: 0,
      errors: 0,
      completionRate: null,
      completionStatus: "Недостаточно данных",
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
        completionStatus: completionAvailable ? `${percent(item.completions, item.opens)}%` : "Недостаточно данных",
        growthPercent: percentChange(item.opens, previousOpens.get(item.key) || 0),
      };
    })
    .sort((a, b) => b.opens - a.opens || (b.completionRate ?? -1) - (a.completionRate ?? -1));
}

function funnelStep(rows: NormalizedEvent[], label: string, predicate: (row: NormalizedEvent) => boolean, previousCount: number | null) {
  const matched = rows.filter(predicate);
  const userCount = uniqueCount(matched, "userId") || matched.length;
  const conversionPercent = previousCount == null ? null : percent(userCount, previousCount);
  const conversionValue = conversionPercent ?? 0;
  const note = previousCount == null
    ? "Первый шаг воронки."
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
      const step = funnelStep(rows, label, predicate, previous);
      previous = step.count;
      return step;
    }),
  };
}

function buildFunnels(rows: NormalizedEvent[]) {
  const hasRecipeSteps = rows.some((row) => row.eventName === "recipe_steps_viewed");
  const hasRecipeComplete = rows.some((row) => row.eventName === "content_complete" && (row.section === "recipes" || row.originalEventName === "recipe_opened" || normalizePage(row.currentPage).includes("recipe")));
  const recipeSteps: Array<[string, (row: NormalizedEvent) => boolean]> = [
    ["Recipe opened", (row) => row.eventName === "recipe_opened"],
  ];
  if (hasRecipeSteps) {
    recipeSteps.push(["Steps viewed", (row) => row.eventName === "recipe_steps_viewed"]);
  }
  if (hasRecipeComplete) {
    recipeSteps.push(["Recipe completed", (row) => row.eventName === "content_complete" && (row.section === "recipes" || normalizePage(row.currentPage).includes("recipe"))]);
  }

  return [
    buildFunnel(rows, "main-content", "Главная -> раздел -> контент -> завершение", "Показывает общий путь от первого просмотра к завершению материала.", [
      ["Главная", (row) => row.eventName === "page_view" && normalizePage(row.currentPage) === "/"],
      ["Раздел", (row) => row.eventName === "page_view" && Boolean(row.section) && normalizePage(row.currentPage) !== "/"],
      ["Контент открыт", isContentOpen],
      ["Контент завершён", isContentComplete],
    ], rows.some(isContentComplete) ? "средняя" : "низкая"),
    buildFunnel(rows, "cats-studio", "Cats -> studio -> project created -> export completed", "Путь от cat-вовлечения к созданию и успешному экспорту.", [
      ["Cats opened", (row) => row.eventName === "cat_question_opened" || row.section === "cats"],
      ["Studio opened", (row) => row.eventName === "studio_open"],
      ["Project created", (row) => row.eventName === "studio_project_created"],
      ["Export completed", (row) => row.eventName === "studio_export_completed"],
    ]),
    buildFunnel(rows, "recipes", "Recipes -> steps viewed -> complete", "Реальная воронка рецептов. Steps и complete показываются только если эти события есть.", recipeSteps, hasRecipeSteps || hasRecipeComplete ? "средняя" : "низкая"),
    buildFunnel(rows, "dog-lessons", "Dog lessons -> completed", "Показывает удержание в уроках с собакой.", [
      ["Dog lesson opened", (row) => row.eventName === "dog_lesson_opened"],
      ["Dog lesson completed", (row) => row.eventName === "dog_lesson_completed"],
    ], rows.some((row) => row.eventName === "dog_lesson_completed") ? "средняя" : "низкая"),
  ];
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
    .map(([lang, langRows]) => ({
      lang,
      events: langRows.length,
      opens: langRows.filter(isContentOpen).length,
      completions: langRows.filter(isContentComplete).length,
      exits: langRows.filter((row) => row.eventName === "content_exit").length,
      completionRate: percent(langRows.filter(isContentComplete).length, langRows.filter(isContentOpen).length),
      growthPercent: percentChange(langRows.length, previousCounts.get(lang) || 0),
    }))
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
    return {
      page,
      title,
      views,
      visitors,
      exits,
      exitRate: percent(exits, views),
      averageDurationSeconds,
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
    highExitPages: [...pageRows].filter((row) => row.views >= 2).sort((a, b) => b.exitRate - a.exitRate || b.exits - a.exits).slice(0, 12),
    lowDurationPages: [...pageRows].filter((row) => row.averageDurationSeconds != null).sort((a, b) => (a.averageDurationSeconds || 0) - (b.averageDurationSeconds || 0)).slice(0, 12),
    transitions: buildTransitions(rows),
  };
}

function buildStudio(rows: NormalizedEvent[]) {
  const flowPredicate = (flow: string) => (row: NormalizedEvent) => {
    if (flow === "mobile_recording") return row.deviceType === "mobile" || row.exportFormat === "mobile_recording" || row.exportMethod === "mobile_recording";
    if (flow === "tablet_recording") return row.deviceType === "tablet" || row.exportFormat === "tablet_recording" || row.exportMethod === "tablet_recording";
    if (flow === "desktop_recording") return row.deviceType === "desktop" || row.exportFormat === "desktop_recording" || row.exportMethod === "desktop_recording";
    if (flow === "direct_canvas_recording") return row.exportMethod === "direct_canvas_recording";
    if (flow === "guided_screen_recording") return row.exportMethod === "guided_screen_recording" || row.exportFormat === "screen_recording";
    if (flow === "offline_audio_render") return row.exportMethod === "offline_audio_render";
    return false;
  };
  const recordingFlow = (key: string, title: string, predicate: (row: NormalizedEvent) => boolean) => buildFunnel(rows, key, title, "Recording и export считаются отдельно. Conversion нельзя считать надёжной, если нет studio_open.", [
    ["Studio opened", (row) => row.eventName === "studio_open" && (predicate(row) || !row.exportMethod)],
    ["Project created", (row) => row.eventName === "studio_project_created" && (predicate(row) || !row.exportMethod)],
    ["Recording started", (row) => row.eventName === "studio_recording_started" && predicate(row)],
    ["Recording completed", (row) => row.eventName === "studio_recording_completed" && predicate(row)],
    ["Recording failed", (row) => row.eventName === "studio_recording_failed" && predicate(row)],
  ], rows.some((row) => row.eventName === "studio_recording_started" && predicate(row)) ? "средняя" : "низкая");
  const exportFlow = (key: string, title: string, predicate: (row: NormalizedEvent) => boolean) => buildFunnel(rows, key, title, "Реальный экспортный путь. Media/sticker не считаются обязательными шагами.", [
    ["Studio opened", (row) => row.eventName === "studio_open" && (predicate(row) || !row.exportMethod)],
    ["Project created", (row) => row.eventName === "studio_project_created" && (predicate(row) || !row.exportMethod)],
    ["Export started", (row) => row.eventName === "studio_export_started" && predicate(row)],
    ["Export completed", (row) => row.eventName === "studio_export_completed" && predicate(row)],
    ["Export failed", (row) => row.eventName === "studio_export_failed" && predicate(row)],
  ], rows.some((row) => row.eventName === "studio_export_started" && predicate(row)) ? "средняя" : "низкая");

  const steps = [
    ["Studio opened", rows.filter((row) => row.eventName === "studio_open").length],
    ["Project created", rows.filter((row) => row.eventName === "studio_project_created").length],
    ["Media added", rows.filter((row) => row.eventName === "studio_media_added").length],
    ["Sticker added", rows.filter((row) => row.eventName === "studio_sticker_added").length],
    ["Export started", rows.filter((row) => row.eventName === "studio_export_started").length],
    ["Export completed", rows.filter((row) => row.eventName === "studio_export_completed").length],
  ] as const;
  let previous: number | null = null;
  const breakpoints = steps.map(([step, count]) => {
    const conversionPercent = previous == null ? null : percent(count, previous);
    const note = previous == null ? "Старт пути." : (conversionPercent ?? 0) >= 60 ? "Переход нормальный." : "Здесь заметная потеря пользователей или не хватает событий.";
    previous = count;
    return { step, count, conversionPercent, note };
  });
  return {
    opened: steps[0][1],
    projectsCreated: steps[1][1],
    mediaAdded: steps[2][1],
    stickersAdded: steps[3][1],
    exportStarted: steps[4][1],
    exportCompleted: steps[5][1],
    exportFailed: rows.filter((row) => row.eventName === "studio_export_failed").length,
    recordingStarted: rows.filter((row) => row.eventName === "studio_recording_started").length,
    recordingCompleted: rows.filter((row) => row.eventName === "studio_recording_completed").length,
    recordingFailed: rows.filter((row) => row.eventName === "studio_recording_failed").length,
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
  const bestLang = languages.filter((row) => row.opens >= 3).sort((a, b) => b.completionRate - a.completionRate || b.events - a.events)[0];

  if (strongSection) {
    opportunities.push({ title: `Развивать раздел ${strongSection.section}`, description: `В этом разделе много открытий и completion ${strongSection.completionRate}%. Стоит добавить похожий контент или вывести раздел выше.`, tone: "growth", confidence: hasIdentityData ? "средняя" : "низкая" });
  }
  if (exitPage) {
    opportunities.push({ title: "Проверить страницу с высоким выходом", description: `${exitPage.page}: exit rate ${exitPage.exitRate}%. Проверь, понятно ли пользователю, куда идти дальше.`, tone: "warning", confidence: hasIdentityData ? "средняя" : "низкая" });
  }
  if (weakContent) {
    opportunities.push({ title: "Контент открывают, но не досматривают", description: `${weakContent.title}: ${weakContent.opens} открытий и completion ${weakContent.completionRate}%. Проверь длину, первый экран и момент, где пользователь теряет интерес.`, tone: "warning", confidence: hasCompletionData ? "средняя" : "низкая" });
  }
  if (studio.exportStarted > 0 && percent(studio.exportCompleted, studio.exportStarted) < 60) {
    opportunities.push({ title: "Проверить UX экспорта или событие", description: `Экспорт начали ${studio.exportStarted} раз, успешно завершили ${studio.exportCompleted}. Нужно проверить ошибки, ожидание и отправку события завершения.`, tone: "warning", confidence: "средняя" });
  }
  if (bestLang && bestLang.completionRate >= 50) {
    opportunities.push({ title: `Хорошее удержание на языке ${bestLang.lang}`, description: `На этом языке completion ${bestLang.completionRate}%. Можно проверить, какой контент там работает, и повторить подход в других языках.`, tone: "good", confidence: hasCompletionData ? "средняя" : "низкая" });
  }
  if (opportunities.length === 0) {
    opportunities.push({ title: "Пока мало сильных сигналов", description: "Когда накопится больше открытий, завершений, выходов и экспортов, здесь появятся более точные рекомендации.", tone: "idea", confidence: "низкая" });
  }
  return opportunities;
}

function countMissing(rows: NormalizedEvent[], predicate: (row: NormalizedEvent) => boolean) {
  return rows.filter(predicate).length;
}

function buildDataQuality(rows: NormalizedEvent[], allRows: NormalizedEvent[], growth: AnalyticsAdminPayload["growth"], today: string, summaryWarnings: AnalyticsQualityIssue[], studio: ReturnType<typeof buildStudio>) {
  const presentEvents = new Set(rows.map((row) => row.eventName));
  const everEvents = new Set(allRows.map((row) => row.eventName));
  const missingExpectedEvents = EXPECTED_EVENTS.filter((eventName) => !presentEvents.has(eventName));
  const missingEverEvents = EXPECTED_EVENTS
    .filter((eventName) => !everEvents.has(eventName))
    .map((eventName) => ({
      title: eventName,
      description: `Во всём загруженном окне событие не встречалось. Где ожидается: ${EVENT_EXPECTATIONS[eventName] || "см. capybara_tales analytics events"}`,
      severity: "info" as const,
    }));
  const propertyChecks: Array<[string, (row: NormalizedEvent) => boolean]> = [
    ["page_view без current_page", (row) => row.eventName === "page_view" && !row.currentPage],
    ["content events без content_id/content_title", (row) => (isContentOpen(row) || row.eventName === "content_progress" || isContentComplete(row)) && !row.contentId && !row.contentTitle],
    ["completion/progress без completion_percent", (row) => (row.eventName === "content_progress" || isContentComplete(row)) && row.completionPercent == null],
    ["studio export без export_format", (row) => row.eventName.startsWith("studio_export") && !row.exportFormat],
    ["events без session_id", (row) => !row.sessionId],
    ["events без anonymous_user_id/visitor_id", (row) => !row.userId],
  ];
  const propertyIssues: AnalyticsQualityIssue[] = propertyChecks
    .map(([title, predicate]) => ({ title, count: countMissing(rows, predicate), description: "Такие строки ухудшают точность продуктовых метрик. Проверка сгруппирована по типам событий.", severity: "warning" as const }))
    .filter((issue) => issue.count > 0);
  if (studio.projectsCreated > studio.opened) {
    propertyIssues.push({
      title: "Project Created > Studio Opened",
      description: `Созданий проектов ${studio.projectsCreated}, открытий студии ${studio.opened}. Вероятно, часть flow не отправляет studio_open или project_created приходит из другого экрана.`,
      count: studio.projectsCreated - studio.opened,
      severity: "warning",
    });
  }
  if (studio.opened === 0 && (studio.projectsCreated > 0 || studio.exportStarted > 0 || studio.recordingStarted > 0)) {
    propertyIssues.push({
      title: "Studio activity без studio_open",
      description: "За период есть studio project/export/recording события, но нет studio_open. Conversion в studio funnels нельзя считать надёжной.",
      count: studio.projectsCreated + studio.exportStarted + studio.recordingStarted,
      severity: "critical",
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
  if (!rows.some(isContentComplete)) unavailableMetrics.push({ title: "Нельзя считать completion rate", description: "За период не пришли события завершения контента.", severity: "warning" });
  if (!rows.some((row) => row.durationSeconds != null)) unavailableMetrics.push({ title: "Длительность сессий приблизительная", description: "Нет `duration_seconds`, поэтому используется разница между первым и последним событием.", severity: "info" });

  return { summaryWarnings, missingEverEvents, missingExpectedEvents, propertyIssues, duplicateIssues, dailyDrops, unavailableMetrics };
}

function buildExportSummary(payload: Omit<AnalyticsAdminPayload, "exportSummary">) {
  const metric = (key: string) => payload.periods[payload.period].find((card) => card.key === key)?.value ?? 0;
  const lines = [
    `Период: ${payload.periodLabel} (${payload.periodStart.slice(0, 10)} - ${payload.periodEnd.slice(0, 10)})`,
    "",
    "Основные метрики:",
    `- Посетители: ${metric("visitors")}`,
    `- Сессии: ${metric("sessions")}`,
    `- События: ${metric("events")}`,
    `- Completion rate: ${metric("completionRate")}%`,
    `- Bounce rate: ${metric("bounceRate")}%`,
    `- Созданные проекты: ${metric("createdProjects")}`,
    `- Успешные экспорты: ${metric("successfulExports")}`,
    "",
    "Лучшие страницы:",
    ...payload.pages.topPages.slice(0, 5).map((row) => `- ${row.page}: ${row.views} просмотров, ${row.visitors} посетителей`),
    "",
    "Худшие страницы:",
    ...payload.pages.highExitPages.slice(0, 5).map((row) => `- ${row.page}: exit rate ${row.exitRate}%, exits ${row.exits}`),
    "",
    "Лучшие разделы и контент:",
    ...payload.content.highCompletion.slice(0, 5).map((row) => `- ${row.title}: opens ${row.opens}, completion ${row.completionStatus}`),
    "",
    "Слабые места:",
    ...payload.content.lowCompletion.slice(0, 5).map((row) => `- ${row.title}: opens ${row.opens}, completion ${row.completionStatus}`),
    "",
    "Воронки:",
    ...payload.funnels.flatMap((funnel) => [`- ${funnel.title}`, ...funnel.steps.map((step) => `  ${step.step}: ${step.count}, conversion ${step.conversionPercent ?? "n/a"}%`)]),
    "",
    "Выводы:",
    ...payload.opportunities.map((item) => `- ${item.title}: ${item.description}`),
    "",
    "Качество данных:",
    `- Достоверные метрики: ${payload.periods[payload.period].filter((card) => card.confidence !== "низкая").map((card) => card.label).join(", ") || "нет"}`,
    `- Недостоверные метрики: ${payload.periods[payload.period].filter((card) => card.confidence === "низкая").map((card) => card.label).join(", ") || "нет"}`,
    `- Отсутствующие события за период: ${payload.dataQuality.missingExpectedEvents.slice(0, 12).join(", ") || "нет"}`,
    ...payload.dataQuality.summaryWarnings.map((item) => `- ${item.title}: ${item.description}`),
    "",
    "Вопросы для анализа:",
    "- Какие страницы стоит улучшить первыми?",
    "- Какой контент лучше развивать в серию?",
    "- Где воронка теряет больше всего пользователей?",
    "- Какие события нужно починить, чтобы метрики стали точнее?",
  ];
  return lines.join("\n");
}

type DailySummaryRow = {
  summary_date: string;
  visitors: number | null;
  sessions: number | null;
  events: number | null;
  page_views: number | null;
  content_opens: number | null;
  content_completes: number | null;
  studio_projects: number | null;
  studio_exports: number | null;
  avg_session_duration_seconds: number | null;
  event_counts: Record<string, number> | null;
  top_content: Array<Record<string, unknown>> | null;
};

async function loadDailySummary(supabase: SupabaseClient, start: Date, end: Date): Promise<{ rows: DailySummaryRow[]; warning: AnalyticsQualityIssue | null }> {
  const { data, error } = await supabase
    .from("analytics_daily_summary")
    .select("*")
    .gte("summary_date", formatDay(start))
    .lt("summary_date", formatDay(end))
    .order("summary_date", { ascending: true });

  if (error) {
    return {
      rows: [],
      warning: {
        title: "analytics_daily_summary недоступна",
        description: `Для 30/90 дней нужны агрегаты daily summary. Supabase вернул: ${error.message}`,
        severity: "critical",
      },
    };
  }

  if (!data || data.length === 0) {
    return {
      rows: [],
      warning: {
        title: "analytics_daily_summary пустая",
        description: "Для 30/90 дней нет агрегатов. Метрики длинного периода нельзя считать точными.",
        severity: "critical",
      },
    };
  }

  return { rows: data as DailySummaryRow[], warning: null };
}

async function loadSummaryAvailability(supabase: SupabaseClient, start: Date, end: Date): Promise<{ available: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from("analytics_daily_summary")
    .select("summary_date")
    .gte("summary_date", formatDay(start))
    .lt("summary_date", formatDay(end))
    .limit(1);

  if (error) {
    return { available: false, reason: `analytics_daily_summary недоступна: ${error.message}` };
  }
  if (!data || data.length === 0) {
    return { available: false, reason: "analytics_daily_summary пустая для длинных периодов." };
  }
  return { available: true };
}

function buildSummaryGrowth(rows: DailySummaryRow[]) {
  return rows.map((row) => ({
    date: row.summary_date,
    visitors: row.visitors || 0,
    sessions: row.sessions || 0,
    events: row.events || 0,
  }));
}

function summaryMetricCards(rows: DailySummaryRow[], previousRows: DailySummaryRow[]): AnalyticsMetricCard[] {
  const sum = (items: DailySummaryRow[], key: keyof Pick<DailySummaryRow, "visitors" | "sessions" | "events" | "content_opens" | "content_completes" | "studio_projects" | "studio_exports">) => items.reduce((total, row) => total + (row[key] || 0), 0);
  const avgDuration = (items: DailySummaryRow[]) => average(items.map((row) => Number(row.avg_session_duration_seconds)).filter((value) => Number.isFinite(value))) || 0;
  const values = [
    ["visitors", "Посетители", sum(rows, "visitors"), sum(previousRows, "visitors"), undefined, "Сколько разных людей было за период.", "sum visitors from analytics_daily_summary", ["analytics_daily_summary.visitors"], "средняя", "Длинный период считается по daily summary."],
    ["sessions", "Сессии", sum(rows, "sessions"), sum(previousRows, "sessions"), undefined, "Сколько визитов было за период.", "sum sessions from analytics_daily_summary", ["analytics_daily_summary.sessions"], "средняя", "Длинный период считается по daily summary."],
    ["events", "События", sum(rows, "events"), sum(previousRows, "events"), undefined, "Все события за период.", "sum events from analytics_daily_summary", ["analytics_daily_summary.events"], "средняя", "Длинный период считается по daily summary."],
    ["averageSessionDuration", "Средняя длительность сессии", avgDuration(rows), avgDuration(previousRows), " сек.", "Среднее время визита.", "avg avg_session_duration_seconds", ["analytics_daily_summary.avg_session_duration_seconds"], avgDuration(rows) > 0 ? "средняя" : "низкая", avgDuration(rows) > 0 ? "Есть агрегированная длительность." : "В summary нет duration."],
    ["completionRate", "Completion rate", percent(sum(rows, "content_completes"), sum(rows, "content_opens")), percent(sum(previousRows, "content_completes"), sum(previousRows, "content_opens")), "%", "Доля открытий контента, которые закончились завершением.", "content_completes / content_opens", ["analytics_daily_summary.content_opens", "analytics_daily_summary.content_completes"], sum(rows, "content_completes") > 0 ? "средняя" : "низкая", sum(rows, "content_completes") > 0 ? "Есть агрегированные completion события." : "Completion в summary отсутствует."],
    ["returningUsers", "Возвращающиеся пользователи", 0, 0, undefined, "Для daily summary эта метрика недоступна.", "requires raw user/session events", ["anonymous_user_id", "session_id"], "низкая", "Нельзя точно считать по daily summary."],
    ["bounceRate", "Bounce rate", 0, 0, "%", "Для daily summary эта метрика недоступна.", "requires raw session event ordering", ["session_id", "page_view", "content_exit"], "низкая", "Нельзя точно считать по daily summary."],
    ["createdProjects", "Созданные проекты", sum(rows, "studio_projects"), sum(previousRows, "studio_projects"), undefined, "Сколько проектов создали в студии.", "sum studio_projects", ["analytics_daily_summary.studio_projects"], "средняя", "Длинный период считается по daily summary."],
    ["successfulExports", "Успешные экспорты", sum(rows, "studio_exports"), sum(previousRows, "studio_exports"), undefined, "Сколько экспортов успешно завершилось.", "sum studio_exports", ["analytics_daily_summary.studio_exports"], "средняя", "Длинный период считается по daily summary."],
  ] as const;

  return values.map(([key, label, value, previous, suffix, explanation, formula, events, confidence, reliability]) => ({
    key,
    label,
    value,
    suffix,
    changePercent: percentChange(value, previous),
    explanation,
    formula,
    events: [...events],
    confidence,
    reliability,
  }));
}

function buildSummaryContentRows(rows: DailySummaryRow[]): AnalyticsContentRow[] {
  const content = new Map<string, AnalyticsContentRow>();
  for (const row of rows) {
    for (const item of row.top_content || []) {
      const key = stringValue(item.content_id, item.content_slug, item.content_title) || "unknown";
      const current = content.get(key) || {
        key,
        title: stringValue(item.content_title, item.content_slug, item.content_id) || "Без названия",
        type: "summary",
        opens: 0,
        completions: 0,
        progress: 0,
        exits: 0,
        shares: 0,
        errors: 0,
        completionRate: null,
        completionStatus: "Недостаточно данных",
        growthPercent: null,
      };
      current.opens += numberValue(item.opens) || 0;
      current.completions += numberValue(item.completes, item.completions) || 0;
      content.set(key, current);
    }
  }
  return Array.from(content.values())
    .map((row) => ({
      ...row,
      completionRate: row.completions > 0 ? percent(row.completions, row.opens) : null,
      completionStatus: row.completions > 0 ? `${percent(row.completions, row.opens)}%` : "Недостаточно данных",
    }))
    .sort((a, b) => b.opens - a.opens || (b.completionRate ?? -1) - (a.completionRate ?? -1));
}

async function loadRows(supabase: SupabaseClient, start: Date, end: Date): Promise<NormalizedEvent[]> {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("*")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    throw error;
  }

  return ((data || []) as AnalyticsRawRow[]).map(normalizeEvent).filter((row) => Number.isFinite(row.createdMs));
}

export function normalizeAnalyticsPeriod(value: unknown): AnalyticsPeriodKey {
  return value === "14d" || value === "30d" || value === "90d" ? value : "7d";
}

export async function buildAdminAnalytics(supabase: SupabaseClient, period: AnalyticsPeriodKey = "7d", now = new Date()): Promise<AnalyticsAdminPayload> {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const summaryAvailability = await loadSummaryAvailability(supabase, addDays(tomorrowStart, -90), tomorrowStart);
  const availablePeriods: AnalyticsPeriodKey[] = summaryAvailability.available ? ["7d", "14d", "30d", "90d"] : ["7d", "14d"];
  const effectivePeriod: AnalyticsPeriodKey = availablePeriods.includes(period) ? period : "14d";
  const days = PERIOD_DAYS[effectivePeriod];
  const periodStart = addDays(tomorrowStart, -days);
  const previousStart = addDays(periodStart, -days);
  const rawStart = effectivePeriod === "7d" || effectivePeriod === "14d" ? previousStart : addDays(tomorrowStart, -15);
  const rows = await loadRows(supabase, rawStart, tomorrowStart);
  const summary = effectivePeriod === "30d" || effectivePeriod === "90d" ? await loadDailySummary(supabase, previousStart, tomorrowStart) : { rows: [] as DailySummaryRow[], warning: null };
  const summaryCurrentRows = summary.rows.filter((row) => row.summary_date >= formatDay(periodStart) && row.summary_date < formatDay(tomorrowStart));
  const summaryPreviousRows = summary.rows.filter((row) => row.summary_date >= formatDay(previousStart) && row.summary_date < formatDay(periodStart));
  const currentRows = rowsInRange(rows, periodStart, tomorrowStart);
  const previousRows = rowsInRange(rows, previousStart, periodStart);
  let contentRows = buildContentRows(currentRows, previousRows);
  const languages = buildLanguages(currentRows, previousRows);
  const pages = buildPages(currentRows);
  const studio = buildStudio(currentRows);
  const usesSummary = effectivePeriod === "30d" || effectivePeriod === "90d";
  const summaryWarnings = [
    ...(!summaryAvailability.available ? [{
      title: "30/90 дней скрыты",
      description: summaryAvailability.reason || "analytics_daily_summary не заполнена, поэтому доступны только raw periods 7/14 дней.",
      severity: "warning" as const,
    }] : []),
    ...(summary.warning ? [summary.warning] : []),
    ...(usesSummary && summary.rows.length > 0 ? [{
      title: "Длинный период считается по daily summary",
      description: "Raw events хранятся около 15 дней, поэтому 30/90 дней показывают overview/growth по агрегатам. Подробные Content/Pages/Funnels основаны на последних raw events и менее полные.",
      severity: "info" as const,
    }] : []),
  ];
  const growth = usesSummary && summary.rows.length > 0 ? buildSummaryGrowth(summaryCurrentRows) : buildGrowth(currentRows, periodStart, days);
  if (usesSummary && summaryCurrentRows.length > 0) {
    const summaryContentRows = buildSummaryContentRows(summaryCurrentRows);
    if (summaryContentRows.length > 0) {
      contentRows = summaryContentRows;
    }
  }

  const basePayload = {
    generatedAt: now.toISOString(),
    period: effectivePeriod,
    periodLabel: PERIOD_LABELS[effectivePeriod],
    periodStart: periodStart.toISOString(),
    periodEnd: tomorrowStart.toISOString(),
    availableDays: days,
    periods: {
      "7d": buildMetricCards(rowsInRange(rows, addDays(tomorrowStart, -7), tomorrowStart), rowsInRange(rows, addDays(tomorrowStart, -14), addDays(tomorrowStart, -7))),
      "14d": buildMetricCards(rowsInRange(rows, addDays(tomorrowStart, -14), tomorrowStart), rowsInRange(rows, addDays(tomorrowStart, -28), addDays(tomorrowStart, -14))),
      "30d": summaryAvailability.available && summary.rows.length > 0 ? summaryMetricCards(summaryCurrentRows, summaryPreviousRows) : buildMetricCards([], []),
      "90d": summaryAvailability.available && summary.rows.length > 0 ? summaryMetricCards(summaryCurrentRows, summaryPreviousRows) : buildMetricCards([], []),
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
    funnels: buildFunnels(currentRows),
    languages,
    pages,
    studio,
    opportunities: buildOpportunities(currentRows, contentRows, pages, languages, studio),
    dataQuality: buildDataQuality(currentRows, rows, growth, formatDay(todayStart), summaryWarnings, studio),
    availablePeriods,
    unavailablePeriodReasons: summaryAvailability.available ? {} : { "30d": summaryAvailability.reason, "90d": summaryAvailability.reason },
  };

  return {
    ...basePayload,
    exportSummary: buildExportSummary(basePayload),
  };
}
