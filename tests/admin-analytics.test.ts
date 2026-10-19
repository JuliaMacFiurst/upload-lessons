import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getTestingReminderState } from "../lib/admin-analytics-reminder.ts";
import { buildAnalyticsCsv, createLatestRequestCoordinator, tableToCsv } from "../lib/admin-analytics-client.ts";
import {
  analyticsPeriodRanges,
  buildAdminAnalytics,
  normalizeEvent,
  parseAnalyticsPeriod,
  parseCommerceAnalyticsEnvironment,
  parseCommerceAnalyticsReportV1,
  rowsInRange,
  type CommerceAnalyticsReportV1,
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

function commerceReport(from: string, to: string, environment: "live" | "sandbox" = "live"): CommerceAnalyticsReportV1 {
  return {
    version: 1,
    period: { from, to, timezone: "UTC", interval: "[from,to)" },
    environment,
    traffic_scope: "all_production",
    audience: { visitors: 3, sessions: 4, shop_visitors: 2, product_viewers: 2, product_views: 3, interested_visitors: 1, interest_events: 1 },
    commerce: {
      checkout_starts: 2,
      paid_orders: 1,
      refunded_orders: 1,
      status_counts: { paid: 1, pending: 1 },
      revenue: [{ currency: "ILS", gross_minor: 4900, refunded_minor: 9800, net_minor: -4900 }],
    },
    attribution: { order_cohort_timestamp: "orders.created_at", paid_source_timestamp: "orders.paid_at", checkout_orders: 2, attributed_orders: 1, unattributed_orders: 1, coverage_percent: 50, causality_note: "Marketing signal, not causality." },
    sources: {
      first_touch: [{ source: "youtube", utm_source: "youtube", utm_medium: "video", utm_campaign: "launch", currency: "ILS", paid_orders: 1, gross_minor: 4900 }],
      session_touch: [{ source: "Unknown", utm_source: null, utm_medium: null, utm_campaign: null, currency: "ILS", paid_orders: 1, gross_minor: 4900 }],
    },
    products: [{ product_id: "sound-case-001", product_views: 3, product_viewers: 2, interest_events: 1, interested_visitors: 1, checkout_starts: 2, paid: [{ currency: "ILS", paid_orders: 1, gross_minor: 4900 }] }],
    funnel: { mode: "independent_counts", conversion_percentages_available: false, note: "Independent counts.", entry_points: { product_hero: 1, product_final: 0, home_promo: 0 } },
    data_quality: {
      status: "data incomplete", raw_traffic_retention_days: 15, traffic_may_be_truncated: false, traffic_environment_segmented: false,
      events_without_visitor_id: 0, events_without_session_id: 0, visitor_identity_conflict_events: 0, legacy_visitor_fallback_events: 0,
      legacy_null_attribution_orders: 1, invalid_attribution_orders: 0, unknown_environment_orders: 1, unknown_environment_paid_orders: 1,
      unknown_environment_paid_minor: [{ currency: "ILS", paid_minor: 4900 }], refund_order_environment_mismatch_count: 1,
      paid_orders_without_items: 0, paid_orders_with_item_total_mismatch: 0, paid_orders_with_item_currency_mismatch: 0, attribution_is_causal: false,
    },
  };
}

function supabaseReturning(result: QueryResult, commerceOverride?: { data?: unknown; error?: Error | null; promise?: Promise<{ data: unknown; error: Error | null }> }) {
  const calls: Array<{ table: string; start?: string; end?: string }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, string> }> = [];
  return {
    calls,
    rpcCalls,
    client: {
      rpc(name: string, args: { p_from: string; p_to: string; p_environment?: "live" | "sandbox" }) {
        rpcCalls.push({ name, args: args as Record<string, string> });
        if (name === "analytics_report_v2") return Promise.resolve({ data: canonicalReport(result.data || [], args.p_from, args.p_to), error: result.error });
        assert.equal(name, "commerce_analytics_report_v1");
        if (commerceOverride?.promise) return commerceOverride.promise;
        return Promise.resolve({ data: commerceOverride && "data" in commerceOverride ? commerceOverride.data : commerceReport(args.p_from, args.p_to, args.p_environment), error: commerceOverride?.error || null });
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
    rpc(name: string, args: { p_from: string; p_to: string; p_environment?: "live" | "sandbox" }) {
      if (name === "analytics_report_v2") return Promise.resolve({ data: canonicalReport(allRows, args.p_from, args.p_to), error: null });
      assert.equal(name, "commerce_analytics_report_v1");
      return Promise.resolve({ data: commerceReport(args.p_from, args.p_to, args.p_environment), error: null });
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

test("commerce RPC receives the rolling period and defaults to live", async () => {
  const supabase = supabaseReturning({ data: [], error: null });
  const payload = await buildAdminAnalytics(supabase.client as never, "24h", new Date("2026-10-19T12:00:00Z"));
  const call = supabase.rpcCalls.find((item) => item.name === "commerce_analytics_report_v1");
  assert.deepEqual(call?.args, { p_from: "2026-10-18T12:00:00.000Z", p_to: "2026-10-19T12:00:00.000Z", p_environment: "live" });
  assert.equal(payload.commerceAnalytics?.environment, "live");
  assert.equal(payload.commerceAnalytics?.commerce.revenue[0].net_minor, -4900);
  assert.deepEqual(payload.commerceAnalyticsStatus, { state: "available" });
});

test("commerce RPC supports sandbox without segmenting traffic", async () => {
  const supabase = supabaseReturning({ data: [], error: null });
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"), "sandbox");
  assert.equal(payload.commerceAnalytics?.environment, "sandbox");
  assert.equal(payload.commerceAnalytics?.traffic_scope, "all_production");
  assert.equal(payload.commerceAnalytics?.data_quality.traffic_environment_segmented, false);
});

test("period and environment query validation is strict", () => {
  assert.equal(parseAnalyticsPeriod(undefined), "7d");
  assert.equal(parseAnalyticsPeriod("14d"), "14d");
  assert.equal(parseAnalyticsPeriod("30d"), null);
  assert.equal(parseAnalyticsPeriod(["7d"]), null);
  assert.equal(parseCommerceAnalyticsEnvironment(undefined), "live");
  assert.equal(parseCommerceAnalyticsEnvironment("sandbox"), "sandbox");
  assert.equal(parseCommerceAnalyticsEnvironment("unknown"), null);
});

test("commerce parser rejects malformed financial data instead of coercing to zero", () => {
  const valid = commerceReport("2026-10-12T00:00:00.000Z", "2026-10-19T00:00:00.000Z");
  assert.equal(parseCommerceAnalyticsReportV1(valid).commerce.revenue[0].net_minor, -4900);
  const malformed = structuredClone(valid) as ReturnType<typeof commerceReport>;
  (malformed.commerce.revenue[0] as unknown as { gross_minor: string }).gross_minor = "4900";
  assert.throws(() => parseCommerceAnalyticsReportV1(malformed), /commerce\.revenue\[0\]\.gross_minor/);
});

test("Phase 1 survives a Commerce RPC error without invented metrics or internal error text", async () => {
  const supabase = supabaseReturning({ data: [], error: null }, { error: new Error("function commerce_analytics_report_v1 does not exist") });
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"));
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 0);
  assert.equal(payload.commerceAnalytics, null);
  assert.deepEqual(payload.commerceAnalyticsStatus, { state: "unavailable", reason: "rpc_error" });
  assert.match(payload.exportSummary, /Commerce analytics unavailable: rpc_error/);
  assert.doesNotMatch(payload.exportSummary, /does not exist/);
  assert.doesNotThrow(() => buildAnalyticsCsv(payload, "overview"));
  assert.throws(() => buildAnalyticsCsv(payload, "commerce"), /unavailable/);
});

test("Phase 1 survives malformed Commerce JSON", async () => {
  const supabase = supabaseReturning({ data: [event({ created_at: "2026-10-19T11:00:00Z" })], error: null }, { data: { version: 1, commerce: { revenue: "invalid" } } });
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"));
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 1);
  assert.equal(payload.commerceAnalytics, null);
  assert.deepEqual(payload.commerceAnalyticsStatus, { state: "unavailable", reason: "invalid_response" });
});

test("Phase 1 returns after the bounded Commerce timeout", async () => {
  const never = new Promise<{ data: unknown; error: Error | null }>(() => undefined);
  const supabase = supabaseReturning({ data: [event({ created_at: "2026-10-19T11:00:00Z" })], error: null }, { promise: never });
  const started = Date.now();
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"), "live", { commerceTimeoutMs: 10 });
  assert.ok(Date.now() - started < 500);
  assert.equal(payload.periods["7d"].find((metric) => metric.key === "events")?.value, 1);
  assert.equal(payload.commerceAnalytics, null);
  assert.deepEqual(payload.commerceAnalyticsStatus, { state: "unavailable", reason: "timeout" });
});

test("commerce contract preserves Unknown attribution, currency separation, and incomplete warnings", async () => {
  const supabase = supabaseReturning({ data: [], error: null });
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"));
  const report = payload.commerceAnalytics;
  assert.ok(report);
  assert.equal(report.sources.session_touch[0].source, "Unknown");
  assert.equal(report.commerce.revenue[0].currency, "ILS");
  assert.equal(report.commerce.revenue[0].net_minor, -4900);
  assert.equal(report.data_quality.unknown_environment_paid_minor[0].currency, "ILS");
  assert.equal(report.data_quality.refund_order_environment_mismatch_count, 1);
  assert.equal(report.data_quality.status, "data incomplete");
  assert.equal(report.funnel.mode, "independent_counts");
  assert.equal(report.funnel.conversion_percentages_available, false);
  assert.match(payload.exportSummary, /Commerce \/ live:/);
  assert.match(payload.exportSummary, /net -4900 ILS minor units/);
  assert.doesNotMatch(payload.exportSummary, /provider[_ ]id|visitor-1|session-1/i);
});

test("empty commerce report is accepted and remains an explicit zero state", () => {
  const empty = commerceReport("2026-10-18T00:00:00.000Z", "2026-10-19T00:00:00.000Z");
  empty.audience = { visitors: 0, sessions: 0, shop_visitors: 0, product_viewers: 0, product_views: 0, interested_visitors: 0, interest_events: 0 };
  empty.commerce = { checkout_starts: 0, paid_orders: 0, refunded_orders: 0, status_counts: {}, revenue: [] };
  empty.attribution = { ...empty.attribution, checkout_orders: 0, attributed_orders: 0, unattributed_orders: 0, coverage_percent: null };
  empty.sources = { first_touch: [], session_touch: [] };
  empty.products = [];
  const parsed = parseCommerceAnalyticsReportV1(empty);
  assert.equal(parsed.commerce.paid_orders, 0);
  assert.deepEqual(parsed.commerce.revenue, []);
});

test("commerce tabs and exports preserve independent-count and no-PII contracts", async () => {
  const page = await readFile(new URL("../pages/admin/analytics.tsx", import.meta.url), "utf8");
  const exports = await readFile(new URL("../lib/admin-analytics-client.ts", import.meta.url), "utf8");
  const api = await readFile(new URL("../pages/api/admin/analytics/overview.ts", import.meta.url), "utf8");
  assert.match(page, /Acquisition/);
  assert.match(page, /Commerce Analytics/);
  assert.match(page, /These are independent counts, not a linked conversion funnel/);
  assert.match(page, /traffic remains all production|traffic остаётся all production/i);
  assert.match(exports, /tab === "acquisition"/);
  assert.match(exports, /tab === "commerce"/);
  assert.doesNotMatch(page, /conversion.*paid_orders|paid_orders.*conversion/i);
  assert.match(api, /parseCommerceAnalyticsEnvironment/);
  assert.match(api, /status\(400\)/);
});

test("latest-request coordinator rejects stale successes, stale errors, and stale loading completion", async () => {
  const coordinator = createLatestRequestCoordinator();
  let payload = "initial";
  let error: string | null = null;
  let loading = false;
  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const run = async (pending: ReturnType<typeof deferred<string>>) => {
    const request = coordinator.start();
    loading = true;
    error = null;
    try {
      const value = await pending.promise;
      if (!coordinator.isLatest(request.requestId)) return;
      payload = value;
    } catch (caught) {
      if (!coordinator.isLatest(request.requestId)) return;
      error = caught instanceof Error ? caught.message : "error";
    } finally {
      if (coordinator.isLatest(request.requestId)) loading = false;
    }
  };

  const oldLive = deferred<string>();
  const sandbox = deferred<string>();
  const newestLive = deferred<string>();
  const oldRun = run(oldLive);
  const sandboxRun = run(sandbox);
  const newestRun = run(newestLive);
  oldLive.resolve("old-live");
  sandbox.reject(new Error("old sandbox error"));
  await Promise.all([oldRun, sandboxRun]);
  assert.equal(payload, "initial");
  assert.equal(error, null);
  assert.equal(loading, true);
  newestLive.resolve("new-live");
  await newestRun;
  assert.equal(payload, "new-live");
  assert.equal(error, null);
  assert.equal(loading, false);

  const old7d = deferred<string>();
  const latest14d = deferred<string>();
  const old7dRun = run(old7d);
  const latest14dRun = run(latest14d);
  latest14d.reject(new Error("latest failure"));
  await latest14dRun;
  old7d.resolve("stale 7d success");
  await old7dRun;
  assert.equal(payload, "new-live");
  assert.equal(error, "latest failure");
  assert.equal(loading, false);
});

test("Commerce Copy and CSV include complete nonzero data-quality context and preserve financial values", async () => {
  const report = commerceReport("2026-10-12T12:00:00.000Z", "2026-10-19T12:00:00.000Z");
  report.data_quality.traffic_may_be_truncated = true;
  report.data_quality.events_without_visitor_id = 2;
  report.data_quality.events_without_session_id = 3;
  report.data_quality.visitor_identity_conflict_events = 4;
  report.data_quality.legacy_visitor_fallback_events = 5;
  report.data_quality.invalid_attribution_orders = 6;
  report.data_quality.paid_orders_without_items = 7;
  report.data_quality.paid_orders_with_item_total_mismatch = 8;
  report.data_quality.paid_orders_with_item_currency_mismatch = 9;
  report.data_quality.unknown_environment_paid_minor.push({ currency: "USD", paid_minor: 123 });
  report.commerce.revenue.push({ currency: "USD", gross_minor: 0, refunded_minor: 123, net_minor: -123 });
  report.sources.first_touch.push({ source: "YouTube, \"Launch\"\nעברית", utm_source: "youtube", utm_medium: "video", utm_campaign: "осень", currency: "USD", paid_orders: 1, gross_minor: 100 });
  const supabase = supabaseReturning({ data: [], error: null }, { data: report });
  const payload = await buildAdminAnalytics(supabase.client as never, "7d", new Date("2026-10-19T12:00:00Z"));
  assert.ok(payload.commerceAnalytics);

  const commerceCsv = buildAnalyticsCsv(payload, "commerce");
  const acquisitionCsv = buildAnalyticsCsv(payload, "acquisition");
  for (const expected of [
    "traffic_may_be_truncated", "raw_traffic_retention_days", "events_without_visitor_id", "events_without_session_id",
    "visitor_identity_conflict_events", "legacy_visitor_fallback_events", "legacy_null_attribution_orders", "invalid_attribution_orders",
    "unknown_environment_orders", "unknown_environment_paid_orders", "unknown_environment_paid_minor", "refund_order_environment_mismatch_count",
    "paid_orders_without_items", "paid_orders_with_item_total_mismatch", "paid_orders_with_item_currency_mismatch",
  ]) {
    assert.match(commerceCsv, new RegExp(expected));
    assert.match(acquisitionCsv, new RegExp(expected));
  }
  assert.match(commerceCsv, /"USD".*"net_minor","-123"/);
  assert.match(acquisitionCsv, /"YouTube, ""Launch""\nעברית"/);
  assert.match(acquisitionCsv, /"осень"/);
  assert.doesNotMatch(`${commerceCsv}\n${acquisitionCsv}`, /customer_email|provider_order_id|visitor-1|session-1/i);
  assert.match(payload.exportSummary, /unknown_environment_paid_minor \(ILS\)/);
  assert.match(payload.exportSummary, /refund_order_environment_mismatch_count: 1/);
  assert.match(payload.exportSummary, /events_without_visitor_id: 2/);
  assert.match(payload.exportSummary, /paid_orders_with_item_currency_mismatch: 9/);
  assert.match(payload.exportSummary, /unknown_environment_paid_minor \(USD\): 123 USD minor units/);
});

test("CSV escaping preserves commas, quotes, newlines, and Unicode", () => {
  assert.equal(tableToCsv(["name"], [["YouTube, \"Launch\"\nעברית"]]), '"name"\n"YouTube, ""Launch""\nעברית"');
});

test("UI binds exports to the applied report and disables stale Commerce exports", async () => {
  const page = await readFile(new URL("../pages/admin/analytics.tsx", import.meta.url), "utf8");
  assert.match(page, /appliedFilters\.period !== period/);
  assert.match(page, /appliedFilters\.environment !== environment/);
  assert.match(page, /activeTab === "acquisition" \|\| activeTab === "commerce"/);
  assert.match(page, /Previous report|Предыдущий отчёт/);
  assert.doesNotMatch(page, /setPeriod\(payload\.period\)/);
});
