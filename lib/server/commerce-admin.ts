import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommerceFilters, CommerceListResponse, CommerceOrder, CommerceOrderDetail, CommerceReviewState } from "../commerce-admin";

export const COMMERCE_MAX_SCAN = 250;
export const COMMERCE_MAX_PAGE_SIZE = 50;
const AUTH_PAGE_SIZE = 200;
const AUTH_MAX_PAGES = 5;
const STALE_CAPTURE_MS = 30 * 60 * 1000;
const PRODUCT_NAMES: Record<string, string> = { "sound-case-001": "Sound Case #001" };
const ORDER_SELECT = "id,user_id,provider,status,currency,total_minor,provider_order_id,provider_capture_id,paid_at,failure_code,created_at,updated_at,customer_name_snapshot,customer_email_snapshot,provider_environment,order_items(id,product_id,quantity,unit_price_minor,currency,price_source,offer_code,entitlement_id,product_entitlements(id,status,source,granted_at))";

type EntitlementRow = { id: string; status: CommerceOrder["entitlement"] extends infer T ? T extends { status: infer S } ? S : never : never; source: string; granted_at: string };
type ItemRow = { id: string; product_id: string; quantity: number; unit_price_minor: number; price_source: "catalog" | "preorder"; offer_code: string | null; entitlement_id: string | null; product_entitlements: EntitlementRow | EntitlementRow[] | null };
type OrderRow = { id: string; user_id: string; provider: "paypal"; status: CommerceOrder["status"]; currency: string; total_minor: number; provider_order_id: string | null; provider_capture_id: string | null; paid_at: string | null; failure_code: string | null; created_at: string; updated_at: string; customer_name_snapshot: string | null; customer_email_snapshot: string | null; provider_environment: "sandbox" | "live" | null; order_items: ItemRow | ItemRow[] | null };

const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export function deriveReview(input: { status: CommerceOrder["status"]; failureCode: string | null; createdAt: string; entitlement: EntitlementRow | null; now?: number }) {
  const reasons: string[] = [];
  if (input.status === "failed" || input.failureCode) reasons.push("payment_failure");
  if (input.status === "paid" && !input.entitlement) reasons.push("paid_without_entitlement");
  if (input.status === "paid" && input.entitlement && input.entitlement.status !== "active") reasons.push(`access_${input.entitlement.status}`);
  if (input.status === "capture_pending" && (input.now ?? Date.now()) - new Date(input.createdAt).getTime() > STALE_CAPTURE_MS) reasons.push("stale_capture_pending");
  const state: CommerceReviewState = reasons.length ? "needs_review" : ["creating", "pending_approval", "capture_pending"].includes(input.status) ? "pending" : "ok";
  return { reviewState: state, reviewReasons: reasons };
}

async function authEmails(supabase: SupabaseClient) {
  const emails = new Map<string, string>();
  for (let page = 1; page <= AUTH_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) throw error;
    data.users.forEach((user) => { if (user.email) emails.set(user.id, user.email); });
    if (data.users.length < AUTH_PAGE_SIZE) return { emails, truncated: false };
  }
  return { emails, truncated: true };
}

export function mapCommerceOrder(row: OrderRow, currentEmail: string | null): CommerceOrder | null {
  const item = first(row.order_items); if (!item) return null;
  const entitlement = first(item.product_entitlements);
  return {
    id: row.id, createdAt: row.created_at, paidAt: row.paid_at, status: row.status, provider: "paypal",
    environment: row.provider_environment ?? "unknown", totalMinor: row.total_minor, currency: row.currency,
    providerOrderId: row.provider_order_id, providerCaptureId: row.provider_capture_id, failureCode: row.failure_code,
    customer: { id: row.user_id, name: row.customer_name_snapshot, email: row.customer_email_snapshot ?? currentEmail,
      emailSource: row.customer_email_snapshot ? "order_snapshot" : currentEmail ? "current_auth_fallback" : "unavailable" },
    item: { productId: item.product_id, productName: PRODUCT_NAMES[item.product_id] ?? item.product_id, quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor, priceSource: item.price_source, offerCode: item.offer_code },
    entitlement: entitlement ? { id: entitlement.id, status: entitlement.status, source: entitlement.source, grantedAt: entitlement.granted_at } : null,
    ...deriveReview({ status: row.status, failureCode: row.failure_code, createdAt: row.created_at, entitlement }),
  };
}

export function normalizeCommerceFilters(query: Record<string, string | string[] | undefined>): CommerceFilters {
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : "";
  return { page: Math.max(1, Number.parseInt(one(query.page), 10) || 1), pageSize: Math.min(COMMERCE_MAX_PAGE_SIZE, Math.max(1, Number.parseInt(one(query.pageSize), 10) || 25)), status: one(query.status) || null, access: one(query.access) || null, priceSource: one(query.priceSource) || null, reviewState: one(query.reviewState) || null, environment: one(query.environment) || null, search: one(query.search).slice(0, 180) || null };
}
export function matchesCommerceFilters(order: CommerceOrder, filters: CommerceFilters) {
  if (filters.status && order.status !== filters.status) return false;
  if (filters.access === "none" ? order.entitlement : filters.access && order.entitlement?.status !== filters.access) return false;
  if (filters.priceSource && order.item.priceSource !== filters.priceSource) return false;
  if (filters.reviewState && order.reviewState !== filters.reviewState) return false;
  if (filters.environment && order.environment !== filters.environment) return false;
  if (filters.search && ![order.customer.email, order.id, order.providerOrderId, order.providerCaptureId].filter(Boolean).join(" ").toLowerCase().includes(filters.search.toLowerCase())) return false;
  return true;
}

export async function listCommerceOrders(supabase: SupabaseClient, filters: CommerceFilters): Promise<CommerceListResponse> {
  const [{ data, error }, directory] = await Promise.all([supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false }).limit(COMMERCE_MAX_SCAN + 1), authEmails(supabase)]);
  if (error) throw error;
  const rows = (data ?? []) as unknown as OrderRow[]; const truncated = rows.length > COMMERCE_MAX_SCAN;
  const mapped = rows.slice(0, COMMERCE_MAX_SCAN).map((row) => mapCommerceOrder(row, directory.emails.get(row.user_id) ?? null)).filter((row): row is CommerceOrder => Boolean(row)).filter((row) => matchesCommerceFilters(row, filters));
  const start = (filters.page - 1) * filters.pageSize; const orders = mapped.slice(start, start + filters.pageSize);
  return { orders, page: filters.page, pageSize: filters.pageSize, total: mapped.length, totalPages: Math.max(1, Math.ceil(mapped.length / filters.pageSize)), boundedScanLimit: COMMERCE_MAX_SCAN, resultsMayBeTruncated: truncated, authDirectoryMayBeTruncated: directory.truncated,
    counters: { paid: mapped.filter((x) => x.status === "paid").length, pending: mapped.filter((x) => x.reviewState === "pending").length, needsReview: mapped.filter((x) => x.reviewState === "needs_review").length, paymentProblems: mapped.filter((x) => x.status === "failed" || Boolean(x.failureCode)).length, livePaid: mapped.filter((x) => x.status === "paid" && x.environment === "live").length, sandboxPaid: mapped.filter((x) => x.status === "paid" && x.environment === "sandbox").length, unknownPaid: mapped.filter((x) => x.status === "paid" && x.environment === "unknown").length } };
}

export async function getCommerceOrderDetail(supabase: SupabaseClient, id: string): Promise<CommerceOrderDetail | null> {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).limit(1).maybeSingle(); if (error) throw error; if (!data) return null;
  const row = data as unknown as OrderRow; const item = first(row.order_items); if (!item) return null;
  const [userResult, eventsResult, personalizationResult] = await Promise.all([
    supabase.auth.admin.getUserById(row.user_id),
    supabase.from("payment_provider_events").select("id,event_type,status,provider_order_id,provider_capture_id,failure_code,received_at,processed_at").eq("provider", "paypal").or(`provider_order_id.eq.${row.provider_order_id ?? "__none__"},provider_capture_id.eq.${row.provider_capture_id ?? "__none__"}`).order("received_at").limit(100),
    item.entitlement_id ? supabase.from("quest_personalizations").select("payload,updated_at").eq("entitlement_id", item.entitlement_id).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (userResult.error || eventsResult.error || personalizationResult.error) throw userResult.error ?? eventsResult.error ?? personalizationResult.error;
  const summary = mapCommerceOrder(row, userResult.data.user?.email ?? null); if (!summary) return null;
  const p = personalizationResult.data as { payload?: { locale?: unknown }; updated_at?: string } | null; const locale = p?.payload?.locale;
  return { ...summary, updatedAt: row.updated_at, item: { ...summary.item, id: item.id, lineTotalMinor: item.unit_price_minor * item.quantity },
    events: (eventsResult.data ?? []).map((event) => ({ id: event.id, eventType: event.event_type, status: event.status, providerOrderId: event.provider_order_id, providerCaptureId: event.provider_capture_id, failureCode: event.failure_code, receivedAt: event.received_at, processedAt: event.processed_at })),
    personalization: { exists: Boolean(p), locale: locale === "ru" || locale === "en" || locale === "he" ? locale : null, updatedAt: p?.updated_at ?? null } };
}
