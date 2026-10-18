import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommerceArtifactStatus, CommerceFilters, CommerceListResponse, CommerceOperationalProblem, CommerceOrder, CommerceOrderDetail, CommerceOriginalDeliveryStatus, CommerceReceiptState, CommerceReviewState } from "../commerce-admin";

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
type ReceiptRow = { id: string; receipt_number: number; document_type: string; issued_at: string; provider_environment: "live"; total_minor: number; currency: string; seller_snapshot: Record<string, unknown>; customer_snapshot: Record<string, unknown>; receipt_series: { series_code: string } | Array<{ series_code: string }> | null };
type ArtifactRow = { document_copy: "original" | "copy"; status: Exclude<CommerceArtifactStatus, "missing">; attempt_count: number; generated_at: string | null; last_failure_code: string | null };
type NotificationRow = { status: "pending" | "processing" | "sent" | "failed"; attempt_count: number; delivered_at: string | null; last_failure_code: string | null };
type OriginalDeliveryRow = { status: "pending" | "sending" | "accepted" | "failed" | "uncertain"; attempt_count: number; claimed_at: string | null; accepted_at: string | null; updated_at: string; provider_email_id: string | null; error_code: string | null };
type RefundRow = { order_id: string; status: string; access_revoked_at: string | null };

const first = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;

export function deriveReview(input: { status: CommerceOrder["status"]; failureCode: string | null; createdAt: string; entitlement: EntitlementRow | null; refund?: RefundRow | null; now?: number }) {
  const reasons: string[] = [];
  const completedRefund = input.refund?.status === "completed";
  const repurchased = completedRefund && input.entitlement?.status === "active" && Boolean(input.refund?.access_revoked_at && input.entitlement.granted_at && new Date(input.entitlement.granted_at).getTime() > new Date(input.refund.access_revoked_at).getTime());
  if (input.status === "failed" || input.failureCode) reasons.push("payment_failure");
  if (input.status === "paid" && !input.entitlement) reasons.push("paid_without_entitlement");
  if (input.status === "paid" && input.entitlement && !completedRefund && input.entitlement.status !== "active") reasons.push(`access_${input.entitlement.status}`);
  if (input.status === "paid" && completedRefund && input.entitlement?.status !== "refunded" && !repurchased) reasons.push("refund_access_not_revoked");
  if (input.refund && ["provider_confirmed", "failed", "needs_review", "uncertain"].includes(input.refund.status)) reasons.push(`refund_${input.refund.status}`);
  if (input.status === "capture_pending" && (input.now ?? Date.now()) - new Date(input.createdAt).getTime() > STALE_CAPTURE_MS) reasons.push("stale_capture_pending");
  const state: CommerceReviewState = reasons.length ? "needs_review" : completedRefund ? "refunded" : ["creating", "pending_approval", "capture_pending"].includes(input.status) ? "pending" : "ok";
  return { reviewState: state, reviewReasons: reasons };
}

export function deriveReceiptState(order: Pick<CommerceOrder, "status" | "environment">, receiptExists: boolean): CommerceReceiptState {
  if (receiptExists) return "issued";
  if (order.status !== "paid") return "not_paid";
  if (order.environment === "live") return "expected_missing";
  if (order.environment === "sandbox") return "not_eligible";
  return "legacy_unknown";
}

export function deriveOperationalProblems(input: {
  order: CommerceOrder;
  receiptState: CommerceReceiptState;
  artifacts: Record<"original" | "copy", { status: CommerceArtifactStatus }>;
  notificationStatus: "not_registered" | "pending" | "processing" | "sent" | "failed";
  originalDeliveryStatus?: CommerceOriginalDeliveryStatus;
  failedProviderEvents: boolean;
}): CommerceOperationalProblem[] {
  const problems: CommerceOperationalProblem[] = [];
  if (input.order.status === "paid" && !input.order.entitlement) problems.push({ code: "paid_without_entitlement", label: "Paid order has no entitlement", severity: "warning" });
  if (input.receiptState === "expected_missing") problems.push({ code: "live_receipt_missing", label: "Paid Live order has no receipt", severity: "warning" });
  if (input.receiptState === "issued") {
    for (const copy of ["original", "copy"] as const) {
      const status = input.artifacts[copy].status;
      if (status === "missing" || status === "failed") problems.push({ code: `${copy}_artifact_${status}`, label: `${copy === "original" ? "Customer original" : "Business copy"} PDF is ${status}`, severity: "warning" });
    }
  }
  if (input.notificationStatus === "failed") problems.push({ code: "purchase_notification_failed", label: "Internal purchase notification failed", severity: "warning" });
  if (input.originalDeliveryStatus === "missing" || input.originalDeliveryStatus === "failed" || input.originalDeliveryStatus === "uncertain") {
    problems.push({ code: `original_delivery_${input.originalDeliveryStatus}`, label: `Original email delivery is ${input.originalDeliveryStatus}; inspect provider evidence before acting`, severity: "warning" });
  }
  if (input.failedProviderEvents) problems.push({ code: "provider_event_failed", label: "A provider event requires review", severity: "warning" });
  if (input.order.status === "paid" && input.order.environment === "unknown") problems.push({ code: "legacy_unknown_environment", label: "Legacy order: accounting automation is intentionally disabled", severity: "info" });
  return problems;
}

function safeSnapshotString(snapshot: Record<string, unknown>, key: string) {
  return typeof snapshot[key] === "string" ? snapshot[key] as string : null;
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

export function mapCommerceOrder(row: OrderRow, currentEmail: string | null, refund: RefundRow | null = null): CommerceOrder | null {
  const item = first(row.order_items); if (!item) return null;
  const entitlement = first(item.product_entitlements);
  return {
    id: row.id, createdAt: row.created_at, paidAt: row.paid_at, status: row.status, paymentDisplayStatus: refund?.status === "completed" ? "refunded" : row.status, accessDisplayStatus: refund?.status === "completed" ? "refunded" : entitlement?.status ?? "missing", provider: "paypal",
    environment: row.provider_environment ?? "unknown", totalMinor: row.total_minor, currency: row.currency,
    providerOrderId: row.provider_order_id, providerCaptureId: row.provider_capture_id, failureCode: row.failure_code,
    customer: { id: row.user_id, name: row.customer_name_snapshot, email: row.customer_email_snapshot ?? currentEmail,
      emailSource: row.customer_email_snapshot ? "order_snapshot" : currentEmail ? "current_auth_fallback" : "unavailable" },
    item: { productId: item.product_id, productName: PRODUCT_NAMES[item.product_id] ?? item.product_id, quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor, priceSource: item.price_source, offerCode: item.offer_code },
    entitlement: entitlement ? { id: entitlement.id, status: entitlement.status, source: entitlement.source, grantedAt: entitlement.granted_at } : null,
    ...deriveReview({ status: row.status, failureCode: row.failure_code, createdAt: row.created_at, entitlement, refund }),
  };
}

export function normalizeCommerceFilters(query: Record<string, string | string[] | undefined>): CommerceFilters {
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : "";
  return { page: Math.max(1, Number.parseInt(one(query.page), 10) || 1), pageSize: Math.min(COMMERCE_MAX_PAGE_SIZE, Math.max(1, Number.parseInt(one(query.pageSize), 10) || 25)), status: one(query.status) || null, access: one(query.access) || null, priceSource: one(query.priceSource) || null, reviewState: one(query.reviewState) || null, environment: one(query.environment) || null, search: one(query.search).slice(0, 180) || null };
}
export function matchesCommerceFilters(order: CommerceOrder, filters: CommerceFilters) {
  if (filters.status && order.paymentDisplayStatus !== filters.status) return false;
  if (filters.access === "none" ? order.accessDisplayStatus !== "missing" : filters.access && order.accessDisplayStatus !== filters.access) return false;
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
  const scanned = rows.slice(0, COMMERCE_MAX_SCAN);
  const refundResult = scanned.length ? await supabase.from("commerce_refund_operations").select("order_id,status,access_revoked_at").in("order_id", scanned.map((row) => row.id)) : { data: [], error: null };
  if (refundResult.error) throw refundResult.error;
  const refunds = new Map(((refundResult.data ?? []) as RefundRow[]).map((row) => [row.order_id, row]));
  const mapped = scanned.map((row) => mapCommerceOrder(row, directory.emails.get(row.user_id) ?? null, refunds.get(row.id) ?? null)).filter((row): row is CommerceOrder => Boolean(row)).filter((row) => matchesCommerceFilters(row, filters));
  const start = (filters.page - 1) * filters.pageSize; const orders = mapped.slice(start, start + filters.pageSize);
  return { orders, page: filters.page, pageSize: filters.pageSize, total: mapped.length, totalPages: Math.max(1, Math.ceil(mapped.length / filters.pageSize)), boundedScanLimit: COMMERCE_MAX_SCAN, resultsMayBeTruncated: truncated, authDirectoryMayBeTruncated: directory.truncated,
    counters: { paid: mapped.filter((x) => x.paymentDisplayStatus === "paid").length, pending: mapped.filter((x) => x.reviewState === "pending").length, needsReview: mapped.filter((x) => x.reviewState === "needs_review").length, paymentProblems: mapped.filter((x) => x.status === "failed" || Boolean(x.failureCode)).length, livePaid: mapped.filter((x) => x.paymentDisplayStatus === "paid" && x.environment === "live").length, sandboxPaid: mapped.filter((x) => x.paymentDisplayStatus === "paid" && x.environment === "sandbox").length, unknownPaid: mapped.filter((x) => x.paymentDisplayStatus === "paid" && x.environment === "unknown").length } };
}

export async function getCommerceOrderDetail(supabase: SupabaseClient, id: string): Promise<CommerceOrderDetail | null> {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).limit(1).maybeSingle(); if (error) throw error; if (!data) return null;
  const row = data as unknown as OrderRow; const item = first(row.order_items); if (!item) return null;
  const [userResult, eventsResult, personalizationResult, receiptResult, notificationResult, refundResult] = await Promise.all([
    supabase.auth.admin.getUserById(row.user_id),
    supabase.from("payment_provider_events").select("id,event_type,status,provider_order_id,provider_capture_id,failure_code,received_at,processed_at").eq("provider", "paypal").or(`provider_order_id.eq.${row.provider_order_id ?? "__none__"},provider_capture_id.eq.${row.provider_capture_id ?? "__none__"}`).order("received_at").limit(100),
    item.entitlement_id ? supabase.from("quest_personalizations").select("payload,updated_at").eq("entitlement_id", item.entitlement_id).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("receipts").select("id,receipt_number,document_type,issued_at,provider_environment,total_minor,currency,seller_snapshot,customer_snapshot,receipt_series(series_code)").eq("order_id", id).eq("document_type", "receipt").limit(1).maybeSingle(),
    supabase.from("purchase_notifications").select("status,attempt_count,delivered_at,last_failure_code").eq("order_id", id).limit(1).maybeSingle(),
    supabase.from("commerce_refund_operations").select("order_id,status,access_revoked_at").eq("order_id", id).limit(1).maybeSingle(),
  ]);
  if (userResult.error || eventsResult.error || personalizationResult.error || receiptResult.error || notificationResult.error || refundResult.error) throw userResult.error ?? eventsResult.error ?? personalizationResult.error ?? receiptResult.error ?? notificationResult.error ?? refundResult.error;
  const summary = mapCommerceOrder(row, userResult.data.user?.email ?? null, refundResult.data as RefundRow | null); if (!summary) return null;
  const receipt = receiptResult.data as unknown as ReceiptRow | null;
  const [artifactResult, deliveryResult] = await Promise.all([
    receipt ? supabase.from("receipt_artifacts").select("document_copy,status,attempt_count,generated_at,last_failure_code").eq("receipt_id", receipt.id).eq("artifact_type", "receipt_pdf") : Promise.resolve({ data: [], error: null }),
    receipt ? supabase.from("receipt_original_deliveries").select("status,attempt_count,claimed_at,accepted_at,updated_at,provider_email_id,error_code").eq("receipt_id", receipt.id).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (artifactResult.error || deliveryResult.error) throw artifactResult.error ?? deliveryResult.error;
  const artifactRows = (artifactResult.data ?? []) as ArtifactRow[];
  const artifact = (copy: "original" | "copy"): CommerceOrderDetail["receipt"]["artifacts"]["original"] => {
    const row = artifactRows.find((entry) => entry.document_copy === copy);
    return { status: row?.status ?? "missing", attemptCount: row?.attempt_count ?? 0, generatedAt: row?.generated_at ?? null, failureCode: row?.last_failure_code ?? null, downloadAvailable: row?.status === "ready" };
  };
  const artifacts = { original: artifact("original"), copy: artifact("copy") };
  const delivery = deliveryResult.data as OriginalDeliveryRow | null;
  const originalDelivery: CommerceOrderDetail["receipt"]["originalDelivery"] = receipt ? {
    status: delivery?.status ?? "missing", attemptCount: delivery?.attempt_count ?? 0,
    claimedAt: delivery?.claimed_at ?? null, acceptedAt: delivery?.accepted_at ?? null,
    updatedAt: delivery?.updated_at ?? null, providerEmailId: delivery?.provider_email_id ?? null,
    errorCode: delivery?.error_code ?? null,
  } : null;
  const notification = notificationResult.data as NotificationRow | null;
  const purchaseNotification = { status: notification?.status ?? "not_registered", attemptCount: notification?.attempt_count ?? 0, sentAt: notification?.delivered_at ?? null, failureCode: notification?.last_failure_code ?? null } as CommerceOrderDetail["purchaseNotification"];
  const receiptState = deriveReceiptState(summary, Boolean(receipt));
  const p = personalizationResult.data as { payload?: { locale?: unknown }; updated_at?: string } | null; const locale = p?.payload?.locale;
  const events = (eventsResult.data ?? []).map((event) => ({ id: event.id, eventType: event.event_type, status: event.status, providerOrderId: event.provider_order_id, providerCaptureId: event.provider_capture_id, failureCode: event.failure_code, receivedAt: event.received_at, processedAt: event.processed_at }));
  const series = receipt ? first(receipt.receipt_series) : null;
  return { ...summary, updatedAt: row.updated_at, item: { ...summary.item, id: item.id, lineTotalMinor: item.unit_price_minor * item.quantity }, events,
    personalization: { exists: Boolean(p), locale: locale === "ru" || locale === "en" || locale === "he" ? locale : null, updatedAt: p?.updated_at ?? null },
    receipt: { state: receiptState, id: receipt?.id ?? null, displayNumber: receipt && series ? `${series.series_code}-${String(receipt.receipt_number).padStart(6, "0")}` : null, documentType: receipt?.document_type ?? null, issuedAt: receipt?.issued_at ?? null, environment: receipt?.provider_environment ?? summary.environment, totalMinor: receipt?.total_minor ?? null, currency: receipt?.currency ?? null,
      seller: receipt ? { legalName: safeSnapshotString(receipt.seller_snapshot, "legalName"), businessStatus: safeSnapshotString(receipt.seller_snapshot, "businessStatus"), businessNumber: safeSnapshotString(receipt.seller_snapshot, "businessNumber") } : null,
      customer: receipt ? { name: safeSnapshotString(receipt.customer_snapshot, "name"), email: safeSnapshotString(receipt.customer_snapshot, "email") } : null,
      artifacts, originalDelivery },
    purchaseNotification,
    operationalProblems: deriveOperationalProblems({ order: summary, receiptState, artifacts, notificationStatus: purchaseNotification.status, originalDeliveryStatus: originalDelivery?.status, failedProviderEvents: events.some((event) => event.status === "failed") }) };
}

export async function downloadCommerceReceiptArtifact(supabase: SupabaseClient, orderId: string, documentCopy: "original" | "copy") {
  const { data: receiptData, error: receiptError } = await supabase.from("receipts").select("id,receipt_number,receipt_series(series_code)").eq("order_id", orderId).eq("document_type", "receipt").limit(1).maybeSingle();
  if (receiptError) throw receiptError;
  if (!receiptData) return { status: "receipt_not_found" as const };
  const receipt = receiptData as unknown as Pick<ReceiptRow, "id" | "receipt_number" | "receipt_series">;
  const { data: artifactData, error: artifactError } = await supabase.from("receipt_artifacts").select("status,storage_bucket,storage_key,content_type").eq("receipt_id", receipt.id).eq("artifact_type", "receipt_pdf").eq("document_copy", documentCopy).limit(1).maybeSingle();
  if (artifactError) throw artifactError;
  if (!artifactData) return { status: "artifact_not_found" as const };
  if (artifactData.status !== "ready" || artifactData.content_type !== "application/pdf") return { status: "artifact_not_ready" as const };
  const { data: object, error: storageError } = await supabase.storage.from(artifactData.storage_bucket).download(artifactData.storage_key);
  if (storageError || !object) return { status: "object_unavailable" as const };
  const series = first(receipt.receipt_series);
  if (!series) return { status: "receipt_not_found" as const };
  return { status: "ready" as const, bytes: Buffer.from(await object.arrayBuffer()), fileName: `receipt-${series.series_code}-${String(receipt.receipt_number).padStart(6, "0")}-${documentCopy}.pdf` };
}
