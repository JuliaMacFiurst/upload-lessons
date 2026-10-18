import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveOperationalProblems, deriveReceiptState, deriveReview, mapCommerceOrder, matchesCommerceFilters, normalizeCommerceFilters } from "../lib/server/commerce-admin.ts";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    provider: "paypal", status: "paid", currency: "ILS", total_minor: 4900,
    provider_order_id: "PAYPAL-ORDER", provider_capture_id: "PAYPAL-CAPTURE",
    paid_at: "2026-10-06T12:00:00Z", failure_code: null,
    created_at: "2026-10-06T11:00:00Z", updated_at: "2026-10-06T12:00:00Z",
    customer_name_snapshot: "Julia Snapshot", customer_email_snapshot: "snapshot@example.com",
    provider_environment: "sandbox",
    order_items: [{
      id: "item", product_id: "sound-case-001", quantity: 1, unit_price_minor: 4900,
      price_source: "catalog", offer_code: null, entitlement_id: "ent",
      product_entitlements: {
        id: "ent", status: "active", source: "laplapla_web", granted_at: "2026-10-06T12:00:00Z",
      },
    }],
    ...overrides,
  };
}

test("new orders use immutable customer snapshots and environment", () => {
  const order = mapCommerceOrder(row() as never, "current@example.com");
  assert.equal(order?.customer.name, "Julia Snapshot"); assert.equal(order?.customer.email, "snapshot@example.com");
  assert.equal(order?.customer.emailSource, "order_snapshot"); assert.equal(order?.environment, "sandbox");
});
test("legacy orders preserve truthful missing and Auth fallback states", () => {
  const order = mapCommerceOrder(row({ customer_name_snapshot: null, customer_email_snapshot: null, provider_environment: null }) as never, "current@example.com");
  assert.equal(order?.customer.name, null); assert.equal(order?.customer.email, "current@example.com");
  assert.equal(order?.customer.emailSource, "current_auth_fallback"); assert.equal(order?.environment, "unknown");
});
test("paid missing entitlement and stale capture require review", () => {
  assert.deepEqual(deriveReview({ status: "paid", failureCode: null, createdAt: "2026-10-06", entitlement: null }), { reviewState: "needs_review", reviewReasons: ["paid_without_entitlement"] });
  assert.equal(deriveReview({ status: "capture_pending", failureCode: null, createdAt: "2026-10-06T10:00:00Z", entitlement: null, now: Date.parse("2026-10-06T12:00:00Z") }).reviewState, "needs_review");
});
test("completed refund is a refunded outcome, while incomplete revocation needs review", () => {
  const refunded = row({ order_items: [{ ...row().order_items[0], product_entitlements: { ...row().order_items[0].product_entitlements, status: "refunded" } }] });
  const evidence = { order_id: refunded.id, status: "completed", access_revoked_at: "2026-10-13T12:00:00Z" };
  const complete = mapCommerceOrder(refunded as never, null, evidence);
  assert.equal(complete?.paymentDisplayStatus, "refunded");
  assert.equal(complete?.accessDisplayStatus, "refunded");
  assert.equal(complete?.reviewState, "refunded");
  assert.deepEqual(complete?.reviewReasons, []);
  assert.equal(matchesCommerceFilters(complete!, normalizeCommerceFilters({ status: "refunded", access: "refunded" })), true);
  assert.equal(matchesCommerceFilters(complete!, normalizeCommerceFilters({ status: "paid" })), false);
  const repurchased = mapCommerceOrder(row({ order_items: [{ ...row().order_items[0], product_entitlements: { ...row().order_items[0].product_entitlements, granted_at: "2026-10-14T12:00:00Z" } }] }) as never, null, evidence);
  assert.equal(repurchased?.reviewState, "refunded");
  assert.equal(repurchased?.paymentDisplayStatus, "refunded");
  assert.equal(repurchased?.accessDisplayStatus, "refunded");
  assert.equal(mapCommerceOrder(row() as never, null, evidence)?.reviewState, "needs_review");
  assert.equal(mapCommerceOrder(row() as never, null, { ...evidence, status: "provider_confirmed" })?.reviewState, "needs_review");
  assert.equal(mapCommerceOrder(row() as never, null, { ...evidence, status: "failed" })?.reviewState, "needs_review");
});
test("filters search safe identifiers and distinguish environments", () => {
  const order = mapCommerceOrder(row() as never, null); assert.ok(order);
  const filters = normalizeCommerceFilters({ search: "paypal-capture", environment: "sandbox", access: "active" });
  assert.equal(matchesCommerceFilters(order, filters), true);
  assert.equal(matchesCommerceFilters(order, { ...filters, environment: "live" }), false);
  assert.equal(normalizeCommerceFilters({ pageSize: "999" }).pageSize, 50);
});
test("Commerce uses existing admin guard and sanitized provider/personalization fields", async () => {
  const api = await readFile(new URL("../pages/api/admin/commerce/orders/index.ts", import.meta.url), "utf8");
  const detail = await readFile(new URL("../lib/server/commerce-admin.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../pages/admin/commerce/orders/[orderId].tsx", import.meta.url), "utf8");
  assert.match(api, /requireAdminSession\(req, res\)/);
  assert.doesNotMatch(detail, /raw_payload|payer_email|payer_name/);
  assert.match(ui, /Names and participants are intentionally hidden/);
  assert.match(ui, /CommerceRefundPanel/);
  assert.doesNotMatch(ui, /retry capture/i);
});
test("Commerce search resists global full-width button styles and explains pending counter", async () => {
  const page = await readFile(new URL("../pages/admin/commerce/index.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../styles/admin-commerce.css", import.meta.url), "utf8");
  assert.match(page, /className="commerce-search-control"/);
  assert.match(page, /Pending \(no warning\)/);
  assert.match(page, /Unknown paid/);
  assert.match(styles, /\.commerce-search-control\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;/);
  assert.match(styles, /\.commerce-filters input\s*\{[^}]*flex:\s*1 1 auto;/);
  assert.match(styles, /\.commerce-filters button\s*\{[^}]*width:\s*auto;[^}]*flex:\s*0 0 auto;/);
});

test("receipt eligibility remains truthful for Live, Sandbox, legacy, and unpaid orders", () => {
  const live = mapCommerceOrder(row({ provider_environment: "live" }) as never, null); assert.ok(live);
  const sandbox = mapCommerceOrder(row() as never, null); assert.ok(sandbox);
  const legacy = mapCommerceOrder(row({ provider_environment: null }) as never, null); assert.ok(legacy);
  assert.equal(deriveReceiptState(live, false), "expected_missing");
  assert.equal(deriveReceiptState(sandbox, false), "not_eligible");
  assert.equal(deriveReceiptState(legacy, false), "legacy_unknown");
  assert.equal(deriveReceiptState({ ...live, status: "capture_pending" }, false), "not_paid");
  assert.equal(deriveReceiptState(live, true), "issued");
});

test("operational problems distinguish healthy, missing, failed, and legacy states", () => {
  const healthy = mapCommerceOrder(row({ provider_environment: "live" }) as never, null); assert.ok(healthy);
  const ready = { original: { status: "ready" as const }, copy: { status: "ready" as const } };
  assert.deepEqual(deriveOperationalProblems({ order: healthy, receiptState: "issued", artifacts: ready, notificationStatus: "sent", failedProviderEvents: false }), []);
  assert.deepEqual(deriveOperationalProblems({ order: { ...healthy, entitlement: null }, receiptState: "expected_missing", artifacts: ready, notificationStatus: "failed", failedProviderEvents: true }).map((x) => x.code), ["paid_without_entitlement", "live_receipt_missing", "purchase_notification_failed", "provider_event_failed"]);
  assert.deepEqual(deriveOperationalProblems({ order: healthy, receiptState: "issued", artifacts: { original: { status: "missing" }, copy: { status: "failed" } }, notificationStatus: "sent", failedProviderEvents: false }).map((x) => x.code), ["original_artifact_missing", "copy_artifact_failed"]);
  const legacy = { ...healthy, environment: "unknown" as const };
  const legacyProblems = deriveOperationalProblems({ order: legacy, receiptState: "legacy_unknown", artifacts: ready, notificationStatus: "not_registered", failedProviderEvents: false });
  assert.deepEqual(legacyProblems, [{ code: "legacy_unknown_environment", label: "Legacy order: accounting automation is intentionally disabled", severity: "info" }]);
});

test("Commerce detail renders receipt operations without Takbull or mutation controls", async () => {
  const ui = await readFile(new URL("../pages/admin/commerce/orders/[orderId].tsx", import.meta.url), "utf8");
  assert.match(ui, /Customer original · מקור/);
  assert.match(ui, /Business copy · העתק/);
  assert.match(ui, /Operational problems/);
  assert.match(ui, /Internal purchase notification/);
  assert.doesNotMatch(ui, /Takbull/i);
  assert.doesNotMatch(ui, /Mark paid|Issue receipt|Retry artifact|Retry notification/i);
});
