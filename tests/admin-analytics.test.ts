import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTestingReminderState } from "../lib/admin-analytics-reminder.ts";
import {
  analyticsPeriodRanges,
  buildAdminAnalytics,
  normalizeEvent,
  rowsInRange,
} from "../lib/server/admin-analytics.ts";
import {
  AdminSessionError,
  getServiceSupabaseClient,
  isAllowedAdminEmail,
} from "../lib/server/admin-session.ts";

type QueryResult = { data: Array<Record<string, unknown>> | null; error: Error | null };

function canonicalReport(rows: Array<Record<string, unknown>>, from: string, to: string) {
  const selected = rows.filter((row) => {
    const created = Date.parse(String(row.created_at));
    return created >= Date.parse(from) && created < Date.parse(to);
  });
  const visitors = new Set(selected.map((row) => row.visitor_id).filter(Boolean)).size;
  const sessions = new Set(selected.map((row) => row.session_id).filter(Boolean)).size;
  const count = (name: string) => selected.filter((row) => row.event_name === name).length;
  return {
    version: 2,
    period: { from, to, timezone: "UTC" },
    audience: { unique_visitors: visitors, sessions, page_views: count("page_view"), events: selected.length, average_session_duration_seconds: null, bounce_rate: null },
    engagement: { content_opened: count("content_open"), content_completed: Math.min(count("content_open"), count("content_complete")), completion_rate: null },
    studio: { opened: count("studio_open"), projects_created: count("studio_project_created"), successful_exports: count("studio_export_completed"), failed_exports: count("studio_export_failed"), successful_recordings: count("studio_recording_completed"), failed_recordings: count("studio_recording_failed") },
    pages: [], content: [], sections: {}, languages: {}, event_counts: {},
    data_quality: { status: "data ok", truncated: false, events_without_session_id: 0, events_without_user_id: 0, events_without_event_id: selected.length, skipped_events_observable: false, note: "not stored" },
  };
}

function supabaseReturning(result: QueryResult) {
  const calls: Array<{ table: string; start?: string; end?: string }> = [];
  return {
    calls,
    client: {
      rpc(name: string, args: { p_from: string; p_to: string }) {
        assert.equal(name, "analytics_report_v2");
        return Promise.resolve({ data: canonicalReport(result.data || [], args.p_from, args.p_to), error: result.error });
      },
      from(table: string) {
        const call = { table } as { table: string; start?: string; end?: string };
        calls.push(call);
        const builder = {
          select() { return builder; },
          gte(_column: string, value: string) { call.start = value; return builder; },
          lt(_column: string, value: string) { call.end = value; return builder; },
          order() { return builder; },
          range() { return Promise.resolve(result); },
        };
        return builder;
      },
    },
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    event_name: "content_exit",
    page: "/",
    visitor_id: "visitor-1",
    session_id: "session-1",
    properties: { section: "home", content_type: "page", content_id: "/" },
    metadata: {},
    created_at: "2026-07-29T16:18:00Z",
    ...overrides,
  };
}

test("fresh analytics_events rows produce non-zero KPI and use the raw table", async () => {
  const supabase = supabaseReturning({ data: [event()], error: null });
  const payload = await buildAdminAnalytics(
    supabase.client as never,
    "7d",
    new Date("2026-07-29T17:00:00Z"),
  );

  assert.equal(supabase.calls.length, 1);
  assert.equal(supabase.calls[0].table, "analytics_events");
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 1);
});

test("today event is included in the live 7d period and today snapshot", async () => {
  const rows = [
    event({ id: "six-days-ago", created_at: "2026-07-23T09:00:00Z" }),
    event({ id: "today", event_name: "studio_project_created", created_at: "2026-07-29T11:00:00Z" }),
  ];
  const supabase = supabaseReturning({ data: rows, error: null });
  const payload = await buildAdminAnalytics(
    supabase.client as never,
    "7d",
    new Date("2026-07-29T11:36:00Z"),
  );

  assert.equal(payload.periodStart, "2026-07-22T11:36:00.000Z");
  assert.equal(payload.periodEnd, "2026-07-29T11:36:00.000Z");
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 2);
  assert.deepEqual(payload.today, {
    date: "2026-07-29",
    visitors: 1,
    sessions: 1,
    events: 1,
    projectsCreated: 1,
  });
});

test("current and previous comparison periods have equal live duration", () => {
  const range = analyticsPeriodRanges(7, new Date("2026-08-23T11:36:00Z"));

  assert.equal(range.currentStart.toISOString(), "2026-08-16T11:36:00.000Z");
  assert.equal(range.currentEnd.toISOString(), "2026-08-23T11:36:00.000Z");
  assert.equal(range.previousStart.toISOString(), "2026-08-09T11:36:00.000Z");
  assert.equal(range.previousEnd.toISOString(), "2026-08-16T11:36:00.000Z");
  assert.equal(
    range.currentEnd.getTime() - range.currentStart.getTime(),
    range.previousEnd.getTime() - range.previousStart.getTime(),
  );
});

test("testing reminder follows visitor threshold after local 09:00", () => {
  assert.equal(getTestingReminderState(14, 10), "reminder-needed");
  assert.equal(getTestingReminderState(15, 10), "activity-good");
  assert.equal(getTestingReminderState(20, 10), "activity-good");
  assert.equal(getTestingReminderState(5, 8), "before-reminder-time");
});

test("rolling activity excludes rows older than 12h and counts unique visitors and sessions over 24h", async () => {
  const rows = [
    event({ id: "recent-a", visitor_id: "visitor-a", session_id: "session-a", created_at: "2026-07-29T11:00:00Z" }),
    event({ id: "recent-a-repeat", visitor_id: "visitor-a", session_id: "session-a", created_at: "2026-07-29T10:00:00Z" }),
    event({ id: "within-24h", visitor_id: "visitor-b", session_id: "session-b", created_at: "2026-07-28T18:00:00Z" }),
    event({ id: "older-than-24h", visitor_id: "visitor-c", session_id: "session-c", created_at: "2026-07-28T11:00:00Z" }),
  ];
  const supabase = supabaseReturning({ data: rows, error: null });
  const payload = await buildAdminAnalytics(
    supabase.client as never,
    "7d",
    new Date("2026-07-29T12:00:00Z"),
  );

  assert.deepEqual(payload.rollingActivity.last12Hours, { visitors: 1, sessions: 1 });
  assert.deepEqual(payload.rollingActivity.last24Hours, { visitors: 2, sessions: 2 });
});

test("pagination reaches fresh rows after more than 1000 older events", async () => {
  const olderRows = Array.from({ length: 1000 }, (_, index) => event({
    id: `old-${index}`,
    created_at: "2026-07-20T12:00:00Z",
  }));
  const freshRow = event({ id: "fresh", created_at: "2026-07-29T16:18:00Z" });
  const allRows = [...olderRows, freshRow];
  const ranges: Array<[number, number]> = [];
  const client = {
    rpc(name: string, args: { p_from: string; p_to: string }) {
      assert.equal(name, "analytics_report_v2");
      return Promise.resolve({ data: canonicalReport(allRows, args.p_from, args.p_to), error: null });
    },
    from(table: string) {
      assert.equal(table, "analytics_events");
      const builder = {
        select() { return builder; },
        gte() { return builder; },
        lt() { return builder; },
        order() { return builder; },
        range(from: number, to: number) {
          ranges.push([from, to]);
          return Promise.resolve({ data: allRows.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };

  const payload = await buildAdminAnalytics(
    client as never,
    "7d",
    new Date("2026-07-29T17:00:00Z"),
  );

  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 1);
});

test("2026-07-29T16:18:00Z is in the current Israel UI day", () => {
  const normalized = normalizeEvent(event());
  const israelDayStartUtc = new Date("2026-07-28T21:00:00Z");
  const israelNextDayStartUtc = new Date("2026-07-29T21:00:00Z");

  assert.equal(rowsInRange([normalized], israelDayStartUtc, israelNextDayStartUtc).length, 1);
  assert.match(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(normalized.createdAt)),
    /29\/07\/2026, 19:18/,
  );
});

test("empty result is a successful zero state", async () => {
  const supabase = supabaseReturning({ data: [], error: null });
  const payload = await buildAdminAnalytics(
    supabase.client as never,
    "7d",
    new Date("2026-07-29T17:00:00Z"),
  );
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 0);
});

test("Supabase errors reject instead of becoming zero metrics", async () => {
  const supabase = supabaseReturning({ data: null, error: new Error("RLS denied") });
  await assert.rejects(
    buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-07-29T17:00:00Z")),
    /RLS denied/,
  );
});

test("snake_case rows are normalized into the UI model", () => {
  const normalized = normalizeEvent(event());
  assert.equal(normalized.eventName, "content_exit");
  assert.equal(normalized.currentPage, "/");
  assert.equal(normalized.userId, "visitor-1");
  assert.equal(normalized.sessionId, "session-1");
  assert.equal(normalized.contentId, "/");
  assert.equal(normalized.section, "home");
});

test("non-admin is denied with a 403-class error", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "admin@example.com";
  try {
    assert.equal(isAllowedAdminEmail("other@example.com"), false);
    const error = new AdminSessionError("Forbidden", 403);
    assert.equal(error.statusCode, 403);
  } finally {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  }
});

test("admin data client is created from server-only service role credentials", () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-service-role-test-key";
  try {
    const client = getServiceSupabaseClient() as unknown as { supabaseKey: string };
    assert.equal(client.supabaseKey, "server-service-role-test-key");
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test("API and browser responses opt out of caching and expose an error state", async () => {
  const api = await readFile(new URL("../pages/api/admin/analytics/overview.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../pages/admin/analytics.tsx", import.meta.url), "utf8");
  assert.match(api, /Cache-Control", "private, no-store, max-age=0"/);
  assert.match(page, /cache: "no-store"/);
  assert.match(page, /Не удалось загрузить аналитику/);
  assert.match(page, /Повторить загрузку/);
  assert.match(page, /setPayload\(null\)/);
});

test("Discord and admin analytics use the canonical report RPC", async () => {
  const admin = await readFile(new URL("../lib/server/admin-analytics.ts", import.meta.url), "utf8");
  const discord = await readFile(
    new URL("../../capybara_tales/lib/analytics/dailyReport.ts", import.meta.url),
    "utf8",
  );
  assert.match(admin, /supabase\.rpc\("analytics_report_v2"/);
  assert.match(discord, /loadAnalyticsReportV2/);
});

test("all analytics copy buttons use the canonical exportSummary and expose 24h, 7d and 14d", async () => {
  const page = await readFile(new URL("../pages/admin/analytics.tsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../lib/server/admin-analytics.ts", import.meta.url), "utf8");
  assert.match(page, /const copyText = tab === "export" \? payload\.exportSummary : payload\.exportSummary/);
  assert.match(page, /copyTextToClipboard\(payload\.exportSummary\)/);
  assert.match(server, /\["24h", "7d", "14d"\]/);
  assert.match(server, /"Audience:"/);
  assert.match(server, /"Engagement:"/);
  assert.match(server, /"Studio:"/);
  assert.doesNotMatch(server, /`- .*exit rate \$\{/i);
});
