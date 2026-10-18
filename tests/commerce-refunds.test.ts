import assert from "node:assert/strict";
import test from "node:test";
import { getRefundPreview, reconcileFullRefund, startFullRefund } from "../lib/server/commerce-refunds.ts";

const orderId = "11111111-1111-4111-8111-111111111111";
const captureId = "CAPTURE123";
const providerOrderId = "ORDER123";
const refundId = "REFUND123";

function fixture(options: { environment?: "sandbox" | "live" | null; captureStatus?: string; refundStatus?: string; paypalStatus?: number; ambiguous?: boolean; failRpc?: boolean; failProviderRecord?: boolean; newerPurchase?: boolean; preparedOperation?: boolean } = {}) {
  const environment = options.environment === undefined ? "sandbox" : options.environment;
  const order = { id: orderId, user_id: "user-1", provider: "paypal", status: "paid", total_minor: 4900, currency: "ILS", provider_order_id: providerOrderId, provider_capture_id: captureId, provider_environment: environment, paid_at: "2026-10-06T12:00:00Z", order_items: { product_id: "sound-case-001", entitlement_id: "ent-1" } };
  const entitlement = { id: "ent-1", user_id: "user-1", product_id: "sound-case-001", status: "active" };
  let operation: Record<string, unknown> | null = options.preparedOperation ? { id: "op-existing", order_id: orderId, entitlement_id: "ent-1", provider_capture_id: captureId, provider_environment: environment ?? "sandbox", amount_minor: 4900, currency: "ILS", request_id: "request-existing", status: "prepared", provider_refund_id: null, accounting_status: "not_required", error_code: null } : null;
  let postCount = 0;
  let rpcCount = 0;
  const calls: string[] = [];
  const requestIds: string[] = [];
  function rows(table: string) {
    if (table === "orders") return [order];
    if (table === "product_entitlements") return [entitlement];
    if (table === "commerce_refund_operations") return operation ? [operation] : [];
    if (table === "order_items") return options.newerPurchase ? [{ entitlement_id: "ent-1", order_id: orderId, orders: { status: "paid", paid_at: order.paid_at } }, { entitlement_id: "ent-1", order_id: "new", orders: { status: "paid", paid_at: "2026-10-07T12:00:00Z" } }] : [{ entitlement_id: "ent-1", order_id: orderId, orders: { status: "paid", paid_at: order.paid_at } }];
    throw new Error(`Unexpected table ${table}`);
  }
  function from(table: string) {
    let mode: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> = {};
    let limited = false;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      limit() { limited = true; return query; },
      insert(value: Record<string, unknown>) { mode = "insert"; payload = value; return query; },
      update(value: Record<string, unknown>) { mode = "update"; payload = value; return query; },
      async maybeSingle() {
        if (mode === "insert") {
          if (operation) return { data: null, error: { code: "23505" } };
          operation = { id: "op-1", request_id: "request-1", status: "prepared", provider_refund_id: null, error_code: null, ...payload };
          return { data: operation, error: null };
        }
        const match = rows(table).filter((row) => filters.every((filter) => filter(row as Record<string, unknown>)))[0] ?? null;
        if (mode === "update") {
          // PostgREST rejects PATCH with limit but no unique-column order (PGRST109).
          if (limited) return { data: null, error: { code: "PGRST109" } };
          if (options.failProviderRecord && payload.provider_refund_id) return { data: null, error: { code: "database_unavailable" } };
          if (match) Object.assign(match, payload);
          return { data: match, error: null };
        }
        return { data: match, error: null };
      },
      then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
        const matches = rows(table).filter((row) => filters.every((filter) => filter(row as Record<string, unknown>)));
        if (mode === "update") matches.forEach((row) => Object.assign(row, payload));
        return Promise.resolve({ data: matches, error: null }).then(resolve);
      },
    };
    return query;
  }
  const db = { from, async rpc(name: string) {
    assert.equal(name, "complete_commerce_full_refund"); rpcCount += 1;
    if (options.failRpc) return { data: null, error: { code: "database_unavailable" } };
    entitlement.status = "refunded";
    if (operation) Object.assign(operation, { status: "completed", access_revoked_at: "2026-10-13T22:00:00Z" });
    return { data: "completed", error: null };
  } };
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const respond = (status: number, body: object) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
    if (url.endsWith("/v1/oauth2/token")) return respond(200, { access_token: "fake-token" });
    if (url.endsWith(`/v2/payments/captures/${captureId}`)) return respond(200, { id: captureId, status: options.captureStatus ?? "COMPLETED", amount: { value: "49.00", currency_code: "ILS" }, supplementary_data: { related_ids: { order_id: providerOrderId } } });
    if (url.endsWith(`/v2/payments/captures/${captureId}/refund`)) {
      requestIds.push(new Headers(init?.headers).get("PayPal-Request-Id") ?? "");
      postCount += 1;
      if (options.ambiguous) throw new Error("timeout");
      if (options.paypalStatus) return respond(options.paypalStatus, { name: "REFUND_ERROR" });
      return respond(201, { id: refundId, status: options.refundStatus ?? "COMPLETED", amount: { value: "49.00", currency_code: "ILS" }, links: [{ rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` }] });
    }
    if (url.endsWith(`/v2/payments/refunds/${refundId}`)) return respond(200, { id: refundId, status: "COMPLETED", amount: { value: "49.00", currency_code: "ILS" }, links: [{ rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` }] });
    throw new Error(`Unexpected provider path ${url}`);
  }) as typeof fetch;
  return { db: db as never, fetcher, entitlement, calls, requestIds, get operation() { return operation; }, get postCount() { return postCount; }, get rpcCount() { return rpcCount; } };
}

test("claim PATCH omits PostgREST limit and reaches dispatching before one provider request", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true"; process.env.PAYPAL_CLIENT_ID = "test"; process.env.PAYPAL_CLIENT_SECRET = "test";
  const f = fixture({ ambiguous: true });
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_outcome_unknown" });
  assert.equal(f.operation?.status, "uncertain");
  assert.equal(f.postCount, 1);
});

test("existing prepared operation is recovered with its original ID and request ID", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true"; process.env.PAYPAL_CLIENT_ID = "test"; process.env.PAYPAL_CLIENT_SECRET = "test";
  const f = fixture({ preparedOperation: true });
  const preview = await getRefundPreview(f.db, orderId, f.fetcher);
  assert.equal(preview.enabled, true);
  assert.equal(preview.operation?.id, "op-existing");
  const result = await startFullRefund(f.db, orderId, f.fetcher);
  assert.equal(result.id, "op-existing");
  assert.deepEqual(f.requestIds, ["request-existing"]);
  assert.equal(f.postCount, 1);
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "refund_already_started" });
  assert.equal(f.postCount, 1);
});

test("full Sandbox refund revokes access once and records no accounting document", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true"; process.env.PAYPAL_CLIENT_ID = "test"; process.env.PAYPAL_CLIENT_SECRET = "test";
  const f = fixture();
  const result = await startFullRefund(f.db, orderId, f.fetcher);
  assert.equal(result.status, "completed"); assert.equal(result.provider_refund_id, refundId);
  assert.equal(result.accounting_status, "not_required"); assert.equal(f.entitlement.status, "refunded");
  assert.equal(f.postCount, 1); assert.equal(f.rpcCount, 1);
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "refund_already_started" });
  assert.equal(f.postCount, 1);
});

test("PayPal refusal does not revoke access", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture({ paypalStatus: 403 });
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_refused" });
  assert.equal(f.entitlement.status, "active"); assert.equal(f.operation?.status, "failed");
});

test("uncertain provider result never sends a second monetary request", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture({ ambiguous: true });
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_outcome_unknown" });
  assert.equal(f.operation?.status, "uncertain");
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "refund_already_started" });
  assert.equal(f.postCount, 1); assert.equal(f.entitlement.status, "active");
  const recovered = await reconcileFullRefund(f.db, orderId, refundId, f.fetcher);
  assert.equal(recovered.status, "completed"); assert.equal(f.entitlement.status, "refunded"); assert.equal(f.postCount, 1);
});

test("provider success with failed DB finalization can reconcile without second refund", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const options = { failRpc: true };
  const f = fixture(options);
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_result_needs_reconciliation", refundId });
  assert.equal(f.operation?.status, "provider_confirmed"); assert.equal(f.entitlement.status, "active"); assert.equal(f.postCount, 1);
  options.failRpc = false;
  const recovered = await reconcileFullRefund(f.db, orderId, refundId, f.fetcher);
  assert.equal(recovered.status, "completed"); assert.equal(f.entitlement.status, "refunded"); assert.equal(f.postCount, 1);
});

test("lost Supabase write after provider success exposes refund ID for read-only recovery", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const options = { failProviderRecord: true };
  const f = fixture(options);
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_result_needs_reconciliation", refundId });
  assert.equal(f.operation?.status, "dispatching"); assert.equal(f.entitlement.status, "active");
  options.failProviderRecord = false;
  const recovered = await reconcileFullRefund(f.db, orderId, refundId, f.fetcher);
  assert.equal(recovered.status, "completed"); assert.equal(f.postCount, 1);
});

test("provider HTTP 5xx is uncertain and never revokes access", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture({ paypalStatus: 503 });
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "provider_outcome_unknown" });
  assert.equal(f.operation?.status, "uncertain"); assert.equal(f.entitlement.status, "active");
  assert.equal(f.postCount, 1);
});

test("previous full or partial provider refund blocks a second request", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  for (const captureStatus of ["REFUNDED", "PARTIALLY_REFUNDED"]) {
    const f = fixture({ captureStatus });
    await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "capture_mismatch" });
    assert.equal(f.postCount, 0);
  }
});

test("pending provider refund retains access until confirmed", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture({ refundStatus: "PENDING" });
  const operation = await startFullRefund(f.db, orderId, f.fetcher);
  assert.equal(operation.status, "provider_pending"); assert.equal(f.entitlement.status, "active");
  assert.equal(f.rpcCount, 0);
});

test("concurrent admin confirmations produce one monetary request", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture();
  const outcomes = await Promise.allSettled([
    startFullRefund(f.db, orderId, f.fetcher), startFullRefund(f.db, orderId, f.fetcher),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(f.postCount, 1);
});

test("newer paid purchase blocks refund before PayPal mutation", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true";
  const f = fixture({ newerPurchase: true });
  await assert.rejects(startFullRefund(f.db, orderId, f.fetcher), { code: "newer_purchase_requires_review" });
  assert.equal(f.postCount, 0);
});

test("legacy environment is identified by capture API, Live retains accounting obligation", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true"; process.env.COMMERCE_LIVE_REFUNDS_ENABLED = "true";
  process.env.PAYPAL_CLIENT_ID = "test"; process.env.PAYPAL_CLIENT_SECRET = "test";
  delete process.env.PAYPAL_SANDBOX_CLIENT_ID; delete process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
  process.env.PAYPAL_LIVE_CLIENT_ID = "test"; process.env.PAYPAL_LIVE_CLIENT_SECRET = "test";
  const sandbox = fixture({ environment: null });
  assert.equal((await getRefundPreview(sandbox.db, orderId, sandbox.fetcher)).environment, "sandbox");
  assert.ok(sandbox.calls.some((call) => call.includes("api-m.sandbox.paypal.com/v2/payments/captures/")));
  assert.ok(sandbox.calls.every((call) => !call.includes("https://api-m.paypal.com/")));
  const live = fixture({ environment: "live" });
  const result = await startFullRefund(live.db, orderId, live.fetcher);
  assert.equal(result.accounting_status, "pending_manual");
});

test("Live refunds stay disabled while Sandbox credentials are available", async () => {
  process.env.COMMERCE_REFUNDS_ENABLED = "true"; process.env.COMMERCE_LIVE_REFUNDS_ENABLED = "false";
  process.env.PAYPAL_CLIENT_ID = "test"; process.env.PAYPAL_CLIENT_SECRET = "test";
  const live = fixture({ environment: "live" });
  assert.equal((await getRefundPreview(live.db, orderId, live.fetcher)).enabled, false);
  await assert.rejects(startFullRefund(live.db, orderId, live.fetcher), { code: "live_refunds_disabled" });
  assert.equal(live.postCount, 0);
});
