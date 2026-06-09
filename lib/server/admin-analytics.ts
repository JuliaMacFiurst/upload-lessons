import type { SupabaseClient } from "@supabase/supabase-js";

type AnalyticsRow = {
  event_name: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_title: string | null;
  page: string | null;
  lang: string | null;
  visitor_id: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AnalyticsPeriodKey = "today" | "7d" | "14d";

export type AnalyticsMetricCard = {
  key: string;
  label: string;
  value: number;
  suffix?: string;
  changePercent: number | null;
  explanation: string;
};

export type AnalyticsContentRow = {
  title: string;
  type: string;
  opens: number;
  completions: number;
  completionRate: number;
  growthPercent: number | null;
};

export type AnalyticsLanguageRow = {
  lang: string;
  events: number;
  completionRate: number;
  growthPercent: number | null;
};

export type AnalyticsPageRow = {
  page: string;
  views: number;
  visitors: number;
  averageEvents: number;
};

export type AnalyticsOpportunity = {
  title: string;
  description: string;
  tone: "good" | "warning" | "growth" | "idea";
};

export type AnalyticsAdminPayload = {
  generatedAt: string;
  availableDays: number;
  periods: Record<AnalyticsPeriodKey, AnalyticsMetricCard[]>;
  growth: Array<{ date: string; visitors: number; sessions: number; events: number }>;
  content: {
    rows: AnalyticsContentRow[];
    best: AnalyticsContentRow[];
    worst: AnalyticsContentRow[];
    fastest: AnalyticsContentRow[];
    hiddenGems: AnalyticsContentRow[];
  };
  funnels: Array<{ step: string; users: number; dropoffPercent: number | null }>;
  languages: AnalyticsLanguageRow[];
  pages: {
    topPages: AnalyticsPageRow[];
    entryPages: AnalyticsPageRow[];
    exitPages: AnalyticsPageRow[];
    transitions: Array<{ from: string; to: string; count: number }>;
  };
  studio: {
    projectsCreated: number;
    videosExported: number;
    downloads: number;
    averageSlides: number | null;
    averageVideoSeconds: number | null;
    topPresets: Array<{ label: string; count: number }>;
    topLanguages: Array<{ label: string; count: number }>;
  };
  drawingLessons: {
    lessons: Array<{ title: string; completions: number; growthPercent: number | null }>;
    categories: Array<{ title: string; completions: number }>;
  };
  opportunities: AnalyticsOpportunity[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 50000;

const METRIC_EXPLANATIONS: Record<string, string> = {
  visitors: "Показывает, сколько разных людей приходили на сайт. Если число растёт, аудитория увеличивается.",
  sessions: "Сессия - это один визит пользователя. Рост сессий обычно означает, что люди чаще возвращаются или активнее открывают сайт.",
  events: "События - это действия на сайте: открытия страниц, историй, рецептов, экспорт видео и другие важные шаги.",
  completionRate: "Completion Rate показывает, какая доля открытого контента была завершена. Низкое значение часто означает, что материал бросают до конца.",
  projectsCreated: "Сколько проектов пользователи создали в студии. Это хороший сигнал интереса к творческим инструментам.",
  videosExported: "Сколько видео пользователи экспортировали. Это показывает, сколько людей дошли до готового результата.",
  audioCreated: "Сколько раз пользователи создали аудио. Если данных нет, возможно это событие ещё не отправляется в аналитику.",
  transitions: "Схема переходов показывает, откуда пользователи приходили на страницу, куда шли дальше и где закрывали сайт.",
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

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function percent(part: number, total: number) {
  if (total <= 0) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

function uniqueCount(rows: AnalyticsRow[], key: "visitor_id" | "session_id") {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size;
}

function countEvents(rows: AnalyticsRow[], eventName: string) {
  return rows.filter((row) => row.event_name === eventName).length;
}

function countAudioCreated(rows: AnalyticsRow[]) {
  return rows.filter((row) => (
    row.event_name === "audio_created" ||
    row.metadata?.action === "audio_created" ||
    row.metadata?.audioCreated === true
  )).length;
}

function normalizePage(page: string | null) {
  if (!page) {
    return "Неизвестная страница";
  }
  return page.split("?")[0] || "/";
}

function normalizeContentType(row: AnalyticsRow) {
  if (row.entity_type === "dog-lesson" || row.entity_type === "drawing-lesson") {
    return "drawing-lesson";
  }
  if (row.event_name === "dog-lesson_completed") {
    return "drawing-lesson";
  }
  if (row.entity_type) {
    return row.entity_type;
  }
  if (row.event_name === "recipe_opened") {
    return "recipe";
  }
  if (row.event_name === "map_opened") {
    return "map";
  }
  if (row.event_name.startsWith("story_")) {
    return "story";
  }
  return "page";
}

function contentTitle(row: AnalyticsRow) {
  return row.entity_title || row.entity_id || normalizePage(row.page);
}

function isOpenEvent(row: AnalyticsRow) {
  return (
    row.event_name === "story_opened" ||
    row.event_name === "recipe_opened" ||
    row.event_name === "map_opened" ||
    row.event_name === "page_viewed"
  );
}

function isCompletionEvent(row: AnalyticsRow) {
  return row.event_name === "story_completed" || row.event_name === "dog-lesson_completed" || row.event_name === "quest_completed";
}

function topMapEntries(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function rowsInRange(rows: AnalyticsRow[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return rows.filter((row) => {
    const time = Date.parse(row.created_at);
    return time >= startMs && time < endMs;
  });
}

function buildMetricCards(rows: AnalyticsRow[], previousRows: AnalyticsRow[]): AnalyticsMetricCard[] {
  const visitors = uniqueCount(rows, "visitor_id");
  const sessions = uniqueCount(rows, "session_id");
  const completions = rows.filter(isCompletionEvent).length;
  const opens = rows.filter((row) => row.event_name === "story_opened" || row.event_name === "dog-lesson_opened").length;
  const previousCompletions = previousRows.filter(isCompletionEvent).length;
  const previousOpens = previousRows.filter((row) => row.event_name === "story_opened" || row.event_name === "dog-lesson_opened").length;
  const completionRate = percent(completions, opens);
  const previousCompletionRate = percent(previousCompletions, previousOpens);
  const projectsCreated = countEvents(rows, "project_created");
  const videosExported = countEvents(rows, "video_exported");
  const audioCreated = countAudioCreated(rows);
  const transitions = buildTransitions(rows).reduce((sum, item) => sum + item.count, 0);

  const values = [
    ["visitors", "Посетители", visitors, uniqueCount(previousRows, "visitor_id")],
    ["sessions", "Сессии", sessions, uniqueCount(previousRows, "session_id")],
    ["events", "События", rows.length, previousRows.length],
    ["completionRate", "Completion Rate", completionRate, previousCompletionRate, "%"],
    ["projectsCreated", "Созданные проекты", projectsCreated, countEvents(previousRows, "project_created")],
    ["videosExported", "Экспортированные видео", videosExported, countEvents(previousRows, "video_exported")],
    ["audioCreated", "Созданные аудио", audioCreated, countAudioCreated(previousRows)],
    ["transitions", "Схема переходов", transitions, buildTransitions(previousRows).reduce((sum, item) => sum + item.count, 0)],
  ] as const;

  return values.map(([key, label, value, previous, suffix]) => ({
    key,
    label,
    value,
    suffix,
    changePercent: percentChange(value, previous),
    explanation: METRIC_EXPLANATIONS[key],
  }));
}

function buildGrowth(rows: AnalyticsRow[], start: Date, days: number) {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const dayRows = rowsInRange(rows, dayStart, dayEnd);
    return {
      date: formatDay(dayStart),
      visitors: uniqueCount(dayRows, "visitor_id"),
      sessions: uniqueCount(dayRows, "session_id"),
      events: dayRows.length,
    };
  });
}

function buildContentRows(rows: AnalyticsRow[], previousRows: AnalyticsRow[]): AnalyticsContentRow[] {
  const content = new Map<string, AnalyticsContentRow>();
  const previousOpens = new Map<string, number>();

  for (const row of previousRows) {
    if (!isOpenEvent(row)) {
      continue;
    }
    const type = normalizeContentType(row);
    if (!["story", "recipe", "map", "book", "drawing-lesson"].includes(type)) {
      continue;
    }
    const key = `${type}:${row.entity_id || contentTitle(row)}`;
    previousOpens.set(key, (previousOpens.get(key) || 0) + 1);
  }

  for (const row of rows) {
    const type = normalizeContentType(row);
    if (!["story", "recipe", "map", "book", "drawing-lesson"].includes(type)) {
      continue;
    }

    const key = `${type}:${row.entity_id || contentTitle(row)}`;
    const current = content.get(key) || {
      title: contentTitle(row),
      type,
      opens: 0,
      completions: 0,
      completionRate: 0,
      growthPercent: 0,
    };

    if (isOpenEvent(row)) {
      current.opens += 1;
    }
    if (isCompletionEvent(row)) {
      current.completions += 1;
    }
    content.set(key, current);
  }

  return Array.from(content.entries())
    .map(([key, item]) => ({
      ...item,
      completionRate: percent(item.completions, item.opens),
      growthPercent: percentChange(item.opens, previousOpens.get(key) || 0),
    }))
    .sort((a, b) => b.opens - a.opens || b.completionRate - a.completionRate);
}

function buildFunnels(rows: AnalyticsRow[]) {
  const steps = [
    ["Story Opened", "story_opened"],
    ["Story Completed", "story_completed"],
    ["Project Created", "project_created"],
    ["Video Exported", "video_exported"],
    ["Downloaded", "story_downloaded"],
  ] as const;

  let previousUsers: number | null = null;
  return steps.map(([step, eventName]) => {
    const users = uniqueCount(rows.filter((row) => row.event_name === eventName), "visitor_id");
    const dropoffPercent = previousUsers == null || previousUsers === 0 ? null : Math.max(0, percent(previousUsers - users, previousUsers));
    previousUsers = users;
    return { step, users, dropoffPercent };
  });
}

function buildLanguages(rows: AnalyticsRow[], previousRows: AnalyticsRow[]): AnalyticsLanguageRow[] {
  const previousCounts = new Map<string, number>();
  for (const row of previousRows) {
    const lang = row.lang || "unknown";
    previousCounts.set(lang, (previousCounts.get(lang) || 0) + 1);
  }

  const byLang = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    const lang = row.lang || "unknown";
    byLang.set(lang, [...(byLang.get(lang) || []), row]);
  }

  return Array.from(byLang.entries())
    .map(([lang, langRows]) => ({
      lang,
      events: langRows.length,
      completionRate: percent(langRows.filter(isCompletionEvent).length, langRows.filter(isOpenEvent).length),
      growthPercent: percentChange(langRows.length, previousCounts.get(lang) || 0),
    }))
    .sort((a, b) => b.events - a.events || a.lang.localeCompare(b.lang));
}

function buildPageRows(rows: AnalyticsRow[], pages: string[]): AnalyticsPageRow[] {
  return pages.map((page) => {
    const pageRows = rows.filter((row) => normalizePage(row.page) === page);
    const pageViews = pageRows.filter((row) => row.event_name === "page_viewed").length || pageRows.length;
    const visitors = uniqueCount(pageRows, "visitor_id");
    return {
      page,
      views: pageViews,
      visitors,
      averageEvents: visitors > 0 ? Math.round((pageRows.length / visitors) * 10) / 10 : 0,
    };
  });
}

function buildTransitions(rows: AnalyticsRow[]) {
  const bySession = new Map<string, AnalyticsRow[]>();
  rows
    .filter((row) => row.session_id && row.page)
    .forEach((row) => {
      const key = row.session_id as string;
      bySession.set(key, [...(bySession.get(key) || []), row]);
    });

  const transitions = new Map<string, number>();
  bySession.forEach((sessionRows) => {
    const pages = sessionRows
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((row) => normalizePage(row.page));

    for (let index = 0; index < pages.length - 1; index += 1) {
      if (pages[index] === pages[index + 1]) {
        continue;
      }
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
    .slice(0, 12);
}

function buildPages(rows: AnalyticsRow[]) {
  const views = new Map<string, number>();
  const entry = new Map<string, number>();
  const exit = new Map<string, number>();
  const bySession = new Map<string, AnalyticsRow[]>();

  rows.forEach((row) => {
    const page = normalizePage(row.page);
    views.set(page, (views.get(page) || 0) + 1);
    if (row.session_id) {
      bySession.set(row.session_id, [...(bySession.get(row.session_id) || []), row]);
    }
  });

  bySession.forEach((sessionRows) => {
    const sorted = sessionRows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const first = normalizePage(sorted[0]?.page || null);
    const last = normalizePage(sorted[sorted.length - 1]?.page || null);
    entry.set(first, (entry.get(first) || 0) + 1);
    exit.set(last, (exit.get(last) || 0) + 1);
  });

  return {
    topPages: buildPageRows(rows, topMapEntries(views, 10).map((item) => item.label)),
    entryPages: buildPageRows(rows, topMapEntries(entry, 10).map((item) => item.label)),
    exitPages: buildPageRows(rows, topMapEntries(exit, 10).map((item) => item.label)),
    transitions: buildTransitions(rows),
  };
}

function numericMetadata(row: AnalyticsRow, keys: string[]) {
  for (const key of keys) {
    const value = row.metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function buildStudio(rows: AnalyticsRow[]) {
  const projectRows = rows.filter((row) => row.event_name === "project_created");
  const exportRows = rows.filter((row) => row.event_name === "video_exported");
  const downloadRows = rows.filter((row) => row.event_name === "story_downloaded");
  const presets = new Map<string, number>();
  const langs = new Map<string, number>();

  [...projectRows, ...exportRows].forEach((row) => {
    const preset = row.metadata?.sourcePresetId || row.metadata?.preset || row.metadata?.presetId;
    if (typeof preset === "string" && preset.trim()) {
      presets.set(preset, (presets.get(preset) || 0) + 1);
    }
    const lang = row.lang || (typeof row.metadata?.sourceLang === "string" ? row.metadata.sourceLang : null);
    if (lang) {
      langs.set(lang, (langs.get(lang) || 0) + 1);
    }
  });

  return {
    projectsCreated: projectRows.length,
    videosExported: exportRows.length,
    downloads: downloadRows.length,
    averageSlides: average([...projectRows, ...exportRows].map((row) => numericMetadata(row, ["slideCount", "slides"])).filter((value): value is number => value != null)),
    averageVideoSeconds: average(exportRows.map((row) => numericMetadata(row, ["durationSeconds", "videoSeconds", "duration"])).filter((value): value is number => value != null)),
    topPresets: topMapEntries(presets, 8),
    topLanguages: topMapEntries(langs, 8),
  };
}

function buildDrawingLessons(rows: AnalyticsRow[], previousRows: AnalyticsRow[]) {
  const previous = new Map<string, number>();
  previousRows.filter((row) => normalizeContentType(row) === "drawing-lesson").forEach((row) => {
    const title = contentTitle(row);
    previous.set(title, (previous.get(title) || 0) + 1);
  });

  const lessons = new Map<string, number>();
  const categories = new Map<string, number>();
  rows.filter((row) => normalizeContentType(row) === "drawing-lesson").forEach((row) => {
    const title = contentTitle(row);
    lessons.set(title, (lessons.get(title) || 0) + 1);
    const category = typeof row.metadata?.category === "string" ? row.metadata.category : null;
    if (category) {
      categories.set(category, (categories.get(category) || 0) + 1);
    }
  });

  return {
    lessons: Array.from(lessons.entries())
      .map(([title, completions]) => ({
        title,
        completions,
        growthPercent: percentChange(completions, previous.get(title) || 0),
      }))
      .sort((a, b) => b.completions - a.completions)
      .slice(0, 20),
    categories: topMapEntries(categories, 12).map(({ label, count }) => ({ title: label, completions: count })),
  };
}

function buildOpportunities(contentRows: AnalyticsContentRow[], languages: AnalyticsLanguageRow[]): AnalyticsOpportunity[] {
  const opportunities: AnalyticsOpportunity[] = [];
  const hiddenGem = contentRows.find((row) => row.completionRate >= 60 && row.opens > 0 && row.opens <= 5);
  const weakPopular = contentRows.find((row) => row.opens >= 10 && row.completionRate > 0 && row.completionRate < 35);
  const fastest = [...contentRows].sort((a, b) => (b.growthPercent ?? -Infinity) - (a.growthPercent ?? -Infinity))[0];
  const growingLang = [...languages].sort((a, b) => (b.growthPercent ?? -Infinity) - (a.growthPercent ?? -Infinity))[0];

  if (hiddenGem) {
    opportunities.push({
      title: "🔥 Контент с высоким completion, но низким трафиком",
      description: `${hiddenGem.title} часто досматривают до конца, но открытий мало. Его стоит сильнее показать на главной, в соцсетях или подборках.`,
      tone: "good",
    });
  }

  if (weakPopular) {
    opportunities.push({
      title: "⚠ Контент с высоким трафиком, но низким completion",
      description: `${weakPopular.title} привлекает людей, но многие не доходят до конца. Проверь первые экраны, длину и обещание в заголовке.`,
      tone: "warning",
    });
  }

  if (fastest && fastest.growthPercent != null && fastest.growthPercent > 0) {
    opportunities.push({
      title: "📈 Самый быстрорастущий контент",
      description: `${fastest.title} растёт быстрее остальных. Это хороший кандидат для продолжения серии или похожего материала.`,
      tone: "growth",
    });
  }

  if (growingLang && growingLang.growthPercent != null && growingLang.growthPercent > 0) {
    opportunities.push({
      title: "💡 Разделы, которые растут быстрее остальных",
      description: `Язык ${growingLang.lang} показывает рост активности. Посмотри, какой контент на этом языке получает больше завершений.`,
      tone: "idea",
    });
  }

  if (opportunities.length === 0) {
    opportunities.push({
      title: "Данных пока мало для уверенных рекомендаций",
      description: "Когда накопится больше открытий, завершений и экспортов, здесь появятся идеи о том, что развивать дальше.",
      tone: "idea",
    });
  }

  return opportunities;
}

async function loadRows(supabase: SupabaseClient, start: Date, end: Date): Promise<AnalyticsRow[]> {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("event_name,entity_type,entity_id,entity_title,page,lang,visitor_id,session_id,metadata,created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    throw error;
  }

  return (data || []) as AnalyticsRow[];
}

export async function buildAdminAnalytics(supabase: SupabaseClient, now = new Date()): Promise<AnalyticsAdminPayload> {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const start = addDays(todayStart, -28);
  const rows = await loadRows(supabase, start, tomorrowStart);

  const todayRows = rowsInRange(rows, todayStart, tomorrowStart);
  const yesterdayRows = rowsInRange(rows, addDays(todayStart, -1), todayStart);
  const last7Start = addDays(tomorrowStart, -7);
  const previous7Start = addDays(last7Start, -7);
  const last14Start = addDays(tomorrowStart, -14);
  const previous14Start = addDays(last14Start, -14);
  const last7Rows = rowsInRange(rows, last7Start, tomorrowStart);
  const previous7Rows = rowsInRange(rows, previous7Start, last7Start);
  const last14Rows = rowsInRange(rows, last14Start, tomorrowStart);
  const previous14Rows = rowsInRange(rows, previous14Start, last14Start);
  const contentRows = buildContentRows(last14Rows, previous14Rows);
  const languages = buildLanguages(last14Rows, previous14Rows);

  return {
    generatedAt: now.toISOString(),
    availableDays: Math.min(28, Math.ceil((tomorrowStart.getTime() - start.getTime()) / DAY_MS)),
    periods: {
      today: buildMetricCards(todayRows, yesterdayRows),
      "7d": buildMetricCards(last7Rows, previous7Rows),
      "14d": buildMetricCards(last14Rows, previous14Rows),
    },
    growth: buildGrowth(rows, last14Start, 14),
    content: {
      rows: contentRows,
      best: [...contentRows].filter((row) => row.opens > 0).sort((a, b) => b.completionRate - a.completionRate || b.opens - a.opens).slice(0, 5),
      worst: [...contentRows].filter((row) => row.opens >= 3).sort((a, b) => a.completionRate - b.completionRate || b.opens - a.opens).slice(0, 5),
      fastest: [...contentRows].sort((a, b) => (b.growthPercent ?? -Infinity) - (a.growthPercent ?? -Infinity)).slice(0, 5),
      hiddenGems: [...contentRows].filter((row) => row.completionRate >= 60 && row.opens <= 5 && row.opens > 0).slice(0, 5),
    },
    funnels: buildFunnels(last14Rows),
    languages,
    pages: buildPages(last14Rows),
    studio: buildStudio(last14Rows),
    drawingLessons: buildDrawingLessons(last14Rows, previous14Rows),
    opportunities: buildOpportunities(contentRows, languages),
  };
}
