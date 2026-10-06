import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveReview, mapCommerceOrder, matchesCommerceFilters, normalizeCommerceFilters } from "../lib/server/commerce-admin.ts";

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
  assert.doesNotMatch(ui, /refund|revoke|retry capture/i);
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
