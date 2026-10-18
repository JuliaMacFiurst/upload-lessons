import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCommerceOrderDetail } from "../lib/server/commerce-admin.ts";

const orderId = "11111111-1111-4111-8111-111111111111";
const receiptId = "33333333-3333-4333-8333-333333333333";

function query(data: unknown, calls: Array<[string, unknown, unknown]>, table: string) {
  const result = { data, error: null };
  return {
    select(columns: string) { calls.push([table, "select", columns]); return this; },
    eq(column: string, value: unknown) { calls.push([table, column, value]); return this; },
    or() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
}

async function detail(delivery: Record<string, unknown> | null) {
  const calls: Array<[string, unknown, unknown]> = [];
  const rows: Record<string, unknown> = {
    orders: {
      id: orderId, user_id: "22222222-2222-4222-8222-222222222222", provider: "paypal", status: "paid",
      currency: "ILS", total_minor: 4900, provider_order_id: "PAYPAL_ORDER", provider_capture_id: "PAYPAL_CAPTURE",
      paid_at: "2026-10-13T10:00:00Z", failure_code: null, created_at: "2026-10-13T09:00:00Z", updated_at: "2026-10-13T10:00:00Z",
      customer_name_snapshot: null, customer_email_snapshot: null, provider_environment: "live",
      order_items: { id: "item", product_id: "sound-case-001", quantity: 1, unit_price_minor: 4900, price_source: "catalog", offer_code: null, entitlement_id: "ent", product_entitlements: { id: "ent", status: "active", source: "laplapla_web", granted_at: "2026-10-13T10:00:00Z" } },
    },
    payment_provider_events: [], quest_personalizations: null,
    receipts: { id: receiptId, receipt_number: 1, document_type: "receipt", issued_at: "2026-10-13T10:01:00Z", provider_environment: "live", total_minor: 4900, currency: "ILS", seller_snapshot: {}, customer_snapshot: {}, receipt_series: { series_code: "WEB" } },
    purchase_notifications: null,
    receipt_artifacts: [
      { document_copy: "original", status: "ready", attempt_count: 1, generated_at: "2026-10-13T10:02:00Z", last_failure_code: null },
      { document_copy: "copy", status: "ready", attempt_count: 1, generated_at: "2026-10-13T10:02:00Z", last_failure_code: null },
    ],
    receipt_original_deliveries: delivery,
  };
  const db = {
    auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    from: (table: string) => query(rows[table], calls, table),
  };
  return { result: await getCommerceOrderDetail(db as never, orderId), calls };
}

for (const status of ["pending", "sending", "accepted", "failed", "uncertain"] as const) test(`admin reads original delivery status ${status} without mutation`, async () => {
  const { result, calls } = await detail({
    status, attempt_count: status === "pending" ? 0 : 1,
    claimed_at: status === "pending" ? null : "2026-10-13T10:03:00Z",
    accepted_at: status === "accepted" ? "2026-10-13T10:04:00Z" : null,
    updated_at: "2026-10-13T10:04:00Z", provider_email_id: status === "accepted" ? "resend-test-id" : null,
    error_code: status === "failed" || status === "uncertain" ? "provider_unconfirmed" : null,
  });
  assert.equal(result?.receipt.originalDelivery?.status, status);
  assert.equal(result?.receipt.originalDelivery?.providerEmailId, status === "accepted" ? "resend-test-id" : null);
  assert.ok(calls.some(([table, column, value]) => table === "receipt_original_deliveries" && column === "receipt_id" && value === receiptId));
  assert.ok(calls.every(([, action]) => !["insert", "update", "delete"].includes(String(action))));
  assert.equal(result?.operationalProblems.some((problem) => problem.code === `original_delivery_${status}`), status === "failed" || status === "uncertain");
});

test("admin reports missing delivery evidence explicitly", async () => {
  const { result } = await detail(null);
  assert.equal(result?.receipt.originalDelivery?.status, "missing");
  assert.equal(result?.receipt.originalDelivery?.attemptCount, 0);
  assert.ok(result?.operationalProblems.some((problem) => problem.code === "original_delivery_missing"));
});

test("delivery evidence is confined to the existing authorized GET order detail", async () => {
  const api = await readFile(new URL("../pages/api/admin/commerce/orders/[orderId].ts", import.meta.url), "utf8");
  const server = await readFile(new URL("../lib/server/commerce-admin.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../pages/admin/commerce/orders/[orderId].tsx", import.meta.url), "utf8");
  assert.match(api, /req\.method !== "GET"/);
  assert.match(api, /requireAdminSession\(req, res\)/);
  assert.match(server, /from\("receipt_original_deliveries"\)\.select\("status,attempt_count,claimed_at,accepted_at,updated_at,provider_email_id,error_code"\)/);
  assert.doesNotMatch(server, /select\("[^"]*claim_token/);
  assert.match(page, /Original email delivery/);
  assert.match(page, /No original email delivery record exists/);
  assert.doesNotMatch(page, /Retry original|Resend original|Mark accepted/i);
});
