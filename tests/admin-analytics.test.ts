import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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

function supabaseReturning(result: QueryResult) {
  const calls: Array<{ table: string; start?: string; end?: string }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        const call = { table } as { table: string; start?: string; end?: string };
        calls.push(call);
        const builder = {
          select() { return builder; },
          gte(_column: string, value: string) { call.start = value; return builder; },
          lt(_column: string, value: string) { call.end = value; return builder; },
          order() { return builder; },
          limit() { return Promise.resolve(result); },
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

test("Discord and admin analytics sources remain documented in code", async () => {
  const admin = await readFile(new URL("../lib/server/admin-analytics.ts", import.meta.url), "utf8");
  const discord = await readFile(
    new URL("../../capybara_tales/lib/analytics/dailyReport.ts", import.meta.url),
    "utf8",
  );
  assert.match(admin, /\.from\("analytics_events"\)/);
  assert.doesNotMatch(admin, /\.from\("analytics_events_normalized"\)/);
  assert.match(discord, /\.from\("analytics_events"\)/);
});
