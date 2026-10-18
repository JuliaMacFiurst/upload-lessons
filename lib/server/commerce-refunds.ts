import type { SupabaseClient } from "@supabase/supabase-js";

type Environment = "sandbox" | "live";
type Json = Record<string, unknown>;
type RefundRow = {
  id: string; order_id: string; entitlement_id: string; provider_capture_id: string;
  provider_environment: Environment; amount_minor: number; currency: string;
  request_id: string; status: string; provider_refund_id: string | null;
  accounting_status: "not_required" | "pending_manual"; error_code: string | null;
};
type OrderRow = {
  id: string; user_id: string; provider: string; status: string; total_minor: number;
  currency: string; provider_order_id: string | null; provider_capture_id: string | null;
  paid_at: string | null;
  provider_environment: Environment | null;
  order_items: { entitlement_id: string | null; product_id: string } | Array<{ entitlement_id: string | null; product_id: string }> | null;
};
export class RefundError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly refundId: string | null;
  constructor(code: string, httpStatus = 409, refundId: string | null = null) {
    super(code); this.code = code; this.httpStatus = httpStatus; this.refundId = refundId;
  }
}
const record = (value: unknown): Json | null => value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const validId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
const minor = (value: unknown) => typeof value === "string" && /^\d+\.\d{2}$/u.test(value) ? Math.round(Number(value) * 100) : null;
const endpoint = (environment: Environment) => environment === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

function credentials(environment: Environment) {
  const id = environment === "sandbox" ? process.env.PAYPAL_CLIENT_ID : process.env.PAYPAL_LIVE_CLIENT_ID;
  const secret = environment === "sandbox" ? process.env.PAYPAL_CLIENT_SECRET : process.env.PAYPAL_LIVE_CLIENT_SECRET;
  if (!id || !secret) throw new RefundError(`${environment}_credentials_missing`, 503);
  return { id, secret };
}

async function paypalRequest(environment: Environment, path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch) {
  const { id, secret } = credentials(environment);
  const auth = await fetcher(`${endpoint(environment)}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!auth.ok) throw new RefundError("paypal_auth_failed", 502);
  const token = record(await auth.json())?.access_token;
  if (typeof token !== "string" || !token) throw new RefundError("paypal_auth_invalid", 502);
  const response = await fetcher(`${endpoint(environment)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* A failed or empty provider response is handled below. */ }
  return { status: response.status, body: record(payload) };
}

function validateCapture(body: Json | null, order: OrderRow) {
  const amount = record(body?.amount);
  const related = record(record(body?.supplementary_data)?.related_ids);
  return body?.id === order.provider_capture_id && body.status === "COMPLETED"
    && minor(amount?.value) === order.total_minor && amount?.currency_code === order.currency
    && related?.order_id === order.provider_order_id;
}

async function resolveEnvironment(order: OrderRow, fetcher: typeof fetch) {
  const environments: Environment[] = order.provider_environment ? [order.provider_environment] : ["sandbox", "live"];
  for (const environment of environments) {
    let result;
    try { result = await paypalRequest(environment, `/v2/payments/captures/${encodeURIComponent(order.provider_capture_id!)}`, {}, fetcher); }
    catch (error) {
      if (error instanceof RefundError && error.code === `${environment}_credentials_missing` && !order.provider_environment) continue;
      throw error;
    }
    if (result.status === 404) continue;
    if (result.status !== 200) throw new RefundError("capture_verification_failed", 502);
    if (validateCapture(result.body, order)) return environment;
    throw new RefundError("capture_mismatch");
  }
  throw new RefundError("environment_unconfirmed");
}

function validateRefund(body: Json | null, order: OrderRow) {
  const amount = record(body?.amount);
  const links = Array.isArray(body?.links) ? body.links : [];
  const up = links.find((entry) => record(entry)?.rel === "up");
  const upUrl = record(up)?.href;
  return validId(body?.id) && minor(amount?.value) === order.total_minor
    && amount?.currency_code === order.currency
    && typeof upUrl === "string" && new URL(upUrl).pathname === `/v2/payments/captures/${order.provider_capture_id}`;
}

async function loadOrder(db: SupabaseClient, orderId: string) {
  const { data, error } = await db.from("orders")
    .select("id,user_id,provider,status,total_minor,currency,provider_order_id,provider_capture_id,provider_environment,paid_at,order_items(entitlement_id,product_id)")
    .eq("id", orderId).limit(1).maybeSingle();
  if (error) throw error;
  const order = data as OrderRow | null;
  const item = order && first(order.order_items);
  if (!order || order.provider !== "paypal" || order.status !== "paid" || !order.provider_capture_id
    || !order.provider_order_id || !item?.entitlement_id || !validId(order.provider_capture_id)) {
    throw new RefundError("order_not_eligible");
  }
  const { data: access, error: accessError } = await db.from("product_entitlements")
    .select("id,user_id,product_id,status").eq("id", item.entitlement_id).limit(1).maybeSingle();
  if (accessError) throw accessError;
  if (!access || access.user_id !== order.user_id || access.product_id !== item.product_id) throw new RefundError("entitlement_mismatch");
  return { order, entitlementId: item.entitlement_id, accessStatus: access.status as string };
}

async function ensureNoNewerPurchase(db: SupabaseClient, order: OrderRow, entitlementId: string) {
  const { data: links, error: linksError } = await db.from("order_items")
    .select("order_id,orders!inner(status,paid_at)").eq("entitlement_id", entitlementId);
  if (linksError) throw linksError;
  if ((links ?? []).some((link) => {
    const other = first(link.orders as { status: string; paid_at: string | null } | Array<{ status: string; paid_at: string | null }> | null);
    return link.order_id !== order.id && other?.status === "paid" && Boolean(other.paid_at && order.paid_at && other.paid_at > order.paid_at);
  })) throw new RefundError("newer_purchase_requires_review");
}

async function loadOperation(db: SupabaseClient, orderId: string): Promise<RefundRow | null> {
  const { data, error } = await db.from("commerce_refund_operations").select("*").eq("order_id", orderId).limit(1).maybeSingle();
  if (error) throw error;
  return data as RefundRow | null;
}

export async function getRefundPreview(db: SupabaseClient, orderId: string, fetcher: typeof fetch = fetch) {
  const { order, entitlementId, accessStatus } = await loadOrder(db, orderId);
  const operation = await loadOperation(db, orderId);
  if (operation?.status !== "prepared" && operation) return { environment: operation.provider_environment, amountMinor: operation.amount_minor, currency: operation.currency, accessStatus, enabled: false, operation };
  if (accessStatus !== "active") throw new RefundError("access_not_active");
  await ensureNoNewerPurchase(db, order, entitlementId);
  const environment = await resolveEnvironment(order, fetcher);
  if (operation) verifyPreparedOperation(operation, order, entitlementId, environment);
  const enabled = process.env.COMMERCE_REFUNDS_ENABLED === "true" && (environment === "sandbox" || process.env.COMMERCE_LIVE_REFUNDS_ENABLED === "true");
  return { environment, amountMinor: order.total_minor, currency: order.currency, accessStatus, enabled, operation };
}

function verifyPreparedOperation(operation: RefundRow, order: OrderRow, entitlementId: string, environment: Environment) {
  if (operation.status !== "prepared" || operation.order_id !== order.id || operation.entitlement_id !== entitlementId
    || operation.provider_capture_id !== order.provider_capture_id || operation.provider_environment !== environment
    || operation.amount_minor !== order.total_minor || operation.currency !== order.currency || operation.provider_refund_id
    || !operation.request_id) throw new RefundError("refund_operation_mismatch");
}

async function recordProviderResult(db: SupabaseClient, operation: RefundRow, order: OrderRow, body: Json) {
  if (!validateRefund(body, order)) throw new RefundError("refund_response_mismatch", 502);
  const providerId = body.id as string;
  const status = body.status === "COMPLETED" ? "provider_confirmed" : body.status === "PENDING" ? "provider_pending" : "needs_review";
  const { data, error } = await db.from("commerce_refund_operations")
    .update({ status, provider_refund_id: providerId, provider_confirmed_at: status === "provider_confirmed" ? new Date().toISOString() : null, error_code: status === "needs_review" ? "provider_refund_not_completed" : null })
    .eq("id", operation.id).in("status", ["dispatching", "uncertain", "provider_pending", "provider_confirmed"])
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new RefundError("refund_state_changed");
  if (status !== "provider_confirmed") return data as RefundRow;
  const final = await db.rpc("complete_commerce_full_refund", { target_operation_id: operation.id });
  if (final.error) throw final.error;
  if (final.data !== "completed" && final.data !== "already_completed") throw new RefundError("access_revocation_needs_review");
  const completed = await loadOperation(db, order.id);
  if (!completed) throw new RefundError("refund_record_missing");
  return completed;
}

export async function startFullRefund(db: SupabaseClient, orderId: string, fetcher: typeof fetch = fetch) {
  if (process.env.COMMERCE_REFUNDS_ENABLED !== "true") throw new RefundError("refunds_disabled", 503);
  const { order, entitlementId, accessStatus } = await loadOrder(db, orderId);
  const existing = await loadOperation(db, orderId);
  if (existing && existing.status !== "prepared") throw new RefundError("refund_already_started");
  if (accessStatus !== "active") throw new RefundError("access_not_active");
  await ensureNoNewerPurchase(db, order, entitlementId);
  const environment = await resolveEnvironment(order, fetcher);
  if (environment === "live" && process.env.COMMERCE_LIVE_REFUNDS_ENABLED !== "true") throw new RefundError("live_refunds_disabled", 503);
  if (existing) verifyPreparedOperation(existing, order, entitlementId, environment);
  let operation = existing;
  if (!operation) {
    const { data: inserted, error: insertError } = await db.from("commerce_refund_operations").insert({
      order_id: order.id, entitlement_id: entitlementId, provider_capture_id: order.provider_capture_id,
      provider_environment: environment, amount_minor: order.total_minor, currency: order.currency,
      accounting_status: environment === "sandbox" ? "not_required" : "pending_manual",
    }).select("*").limit(1).maybeSingle();
    if (insertError || !inserted) throw new RefundError(insertError?.code === "23505" ? "refund_already_started" : "refund_record_failed", 409);
    operation = inserted as RefundRow;
  }
  const { data: claimed, error: claimError } = await db.from("commerce_refund_operations")
    .update({ status: "dispatching" }).eq("id", operation.id).eq("status", "prepared").select("id").maybeSingle();
  if (claimError) throw new RefundError("refund_claim_failed", 503);
  if (!claimed) throw new RefundError("refund_already_started");
  let response: { status: number; body: Json | null };
  try {
    response = await paypalRequest(environment, `/v2/payments/captures/${encodeURIComponent(order.provider_capture_id!)}/refund`, {
      method: "POST", headers: { "PayPal-Request-Id": operation.request_id, Prefer: "return=representation" }, body: "{}",
    }, fetcher);
  } catch {
    await db.from("commerce_refund_operations").update({ status: "uncertain", error_code: "provider_outcome_unknown" }).eq("id", operation.id).eq("status", "dispatching");
    throw new RefundError("provider_outcome_unknown", 202);
  }
  if (response.status !== 200 && response.status !== 201) {
    const ambiguous = response.status >= 500 || response.status === 409 || response.status === 422;
    await db.from("commerce_refund_operations").update({ status: ambiguous ? "uncertain" : "failed", error_code: ambiguous ? "provider_outcome_unknown" : "provider_refused" }).eq("id", operation.id).eq("status", "dispatching");
    throw new RefundError(ambiguous ? "provider_outcome_unknown" : "provider_refused", ambiguous ? 202 : 409);
  }
  try { return await recordProviderResult(db, operation, order, response.body ?? {}); }
  catch { throw new RefundError("provider_result_needs_reconciliation", 202, validId(response.body?.id)); }
}

// Reconciliation only reads PayPal. It never repeats the monetary POST.
export async function reconcileFullRefund(db: SupabaseClient, orderId: string, refundId: string, fetcher: typeof fetch = fetch) {
  if (!validId(refundId)) throw new RefundError("invalid_refund_id", 400);
  const { order } = await loadOrder(db, orderId);
  const operation = await loadOperation(db, orderId);
  if (!operation) throw new RefundError("refund_record_missing");
  if (operation.status === "completed") return operation;
  if (!["dispatching", "uncertain", "provider_pending", "provider_confirmed"].includes(operation.status)) throw new RefundError("refund_not_reconcilable");
  if (operation.provider_refund_id && operation.provider_refund_id !== refundId) throw new RefundError("refund_id_mismatch");
  const response = await paypalRequest(operation.provider_environment, `/v2/payments/refunds/${encodeURIComponent(refundId)}`, {}, fetcher);
  if (response.status !== 200 || !response.body) throw new RefundError("refund_verification_failed", 502);
  return recordProviderResult(db, operation, order, response.body);
}
