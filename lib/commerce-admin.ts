export type CommerceEnvironment = "unknown" | "sandbox" | "live";
export type CommerceReviewState = "ok" | "pending" | "needs_review";
export type CommerceArtifactStatus = "missing" | "pending" | "processing" | "ready" | "failed";
export type CommerceReceiptState = "issued" | "expected_missing" | "not_eligible" | "legacy_unknown" | "not_paid";
export type CommerceOperationalProblem = {
  code: string;
  label: string;
  severity: "info" | "warning";
};
export type CommerceOrder = {
  id: string; createdAt: string; updatedAt?: string; paidAt: string | null;
  status: "creating" | "pending_approval" | "capture_pending" | "paid" | "cancelled" | "failed";
  provider: "paypal"; environment: CommerceEnvironment; totalMinor: number; currency: string;
  providerOrderId: string | null; providerCaptureId: string | null; failureCode: string | null;
  customer: { id: string; name: string | null; email: string | null; emailSource: "order_snapshot" | "current_auth_fallback" | "unavailable" };
  item: { id?: string; productId: string; productName: string; quantity: number; unitPriceMinor: number; lineTotalMinor?: number; priceSource: "catalog" | "preorder"; offerCode: string | null };
  entitlement: { id: string; status: "active" | "inactive" | "revoked" | "refunded" | "expired"; source: string; grantedAt: string } | null;
  reviewState: CommerceReviewState; reviewReasons: string[];
};
export type CommerceListResponse = {
  orders: CommerceOrder[]; page: number; pageSize: number; total: number; totalPages: number;
  boundedScanLimit: number; resultsMayBeTruncated: boolean; authDirectoryMayBeTruncated: boolean;
  counters: { paid: number; pending: number; needsReview: number; paymentProblems: number; livePaid: number; sandboxPaid: number; unknownPaid: number };
};
export type CommerceOrderDetail = CommerceOrder & {
  updatedAt: string;
  item: Required<Pick<CommerceOrder["item"], "id" | "lineTotalMinor">> & CommerceOrder["item"];
  events: Array<{ id: string; eventType: string; status: string; providerOrderId: string | null; providerCaptureId: string | null; failureCode: string | null; receivedAt: string; processedAt: string | null }>;
  personalization: { exists: boolean; locale: "ru" | "en" | "he" | null; updatedAt: string | null };
  receipt: {
    state: CommerceReceiptState;
    id: string | null;
    displayNumber: string | null;
    documentType: string | null;
    issuedAt: string | null;
    environment: CommerceEnvironment;
    totalMinor: number | null;
    currency: string | null;
    seller: { legalName: string | null; businessStatus: string | null; businessNumber: string | null } | null;
    customer: { name: string | null; email: string | null } | null;
    artifacts: Record<"original" | "copy", {
      status: CommerceArtifactStatus;
      attemptCount: number;
      generatedAt: string | null;
      failureCode: string | null;
      downloadAvailable: boolean;
    }>;
  };
  purchaseNotification: {
    status: "not_registered" | "pending" | "processing" | "sent" | "failed";
    attemptCount: number;
    sentAt: string | null;
    failureCode: string | null;
  };
  operationalProblems: CommerceOperationalProblem[];
};
export type CommerceFilters = { page: number; pageSize: number; status: string | null; access: string | null; priceSource: string | null; reviewState: string | null; environment: string | null; search: string | null };
