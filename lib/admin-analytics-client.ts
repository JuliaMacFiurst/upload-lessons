import type { AnalyticsAdminPayload, CommerceAnalyticsReportV1 } from "./server/admin-analytics";

export type AnalyticsExportTab = "overview" | "content" | "funnels" | "languages" | "pages" | "studio" | "acquisition" | "commerce" | "opportunities" | "quality" | "export";

export function createLatestRequestCoordinator() {
  let latestRequestId = 0;
  let controller: AbortController | null = null;
  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      latestRequestId += 1;
      return { requestId: latestRequestId, signal: controller.signal };
    },
    isLatest(requestId: number) {
      return requestId === latestRequestId;
    },
    cancel() {
      latestRequestId += 1;
      controller?.abort();
      controller = null;
    },
  };
}

export function tableToCsv(headers: string[], rows: Array<Array<string | number | boolean | null>>) {
  const escape = (value: string | number | boolean | null) => `"${(value == null ? "" : String(value)).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function commerceDataQualityEntries(report: CommerceAnalyticsReportV1) {
  const quality = report.data_quality;
  const entries: Array<{ metric: string; value: string | number | boolean; currency: string | null }> = [
    { metric: "status", value: quality.status, currency: null },
    { metric: "raw_traffic_retention_days", value: quality.raw_traffic_retention_days, currency: null },
  ];
  if (quality.traffic_may_be_truncated) entries.push({ metric: "traffic_may_be_truncated", value: true, currency: null });
  const countKeys = [
    "events_without_visitor_id", "events_without_session_id", "visitor_identity_conflict_events", "legacy_visitor_fallback_events",
    "legacy_null_attribution_orders", "invalid_attribution_orders", "unknown_environment_orders", "unknown_environment_paid_orders",
    "refund_order_environment_mismatch_count", "paid_orders_without_items", "paid_orders_with_item_total_mismatch", "paid_orders_with_item_currency_mismatch",
  ] as const;
  for (const metric of countKeys) {
    if (quality[metric] > 0) entries.push({ metric, value: quality[metric], currency: null });
  }
  for (const row of quality.unknown_environment_paid_minor) {
    if (row.paid_minor !== 0) entries.push({ metric: "unknown_environment_paid_minor", value: row.paid_minor, currency: row.currency });
  }
  return entries;
}

export function buildAnalyticsCsv(payload: AnalyticsAdminPayload, tab: AnalyticsExportTab) {
  if (tab === "acquisition" || tab === "commerce") {
    const report = payload.commerceAnalytics;
    if (!report) throw new Error("Commerce analytics is unavailable");
    const context = [payload.periodStart, payload.periodEnd, report.environment];
    if (tab === "acquisition") {
      const rows: Array<Array<string | number | boolean | null>> = [];
      Object.entries(report.audience).forEach(([metric, value]) => rows.push([...context, "audience", null, null, null, null, null, metric, value, report.data_quality.status]));
      (["checkout_orders", "attributed_orders", "unattributed_orders", "coverage_percent"] as const).forEach((metric) => rows.push([...context, "attribution", null, null, null, null, null, metric, report.attribution[metric], report.data_quality.status]));
      (["first_touch", "session_touch"] as const).forEach((touch) => report.sources[touch].forEach((row) => {
        rows.push([...context, touch, row.source, row.utm_source, row.utm_medium, row.utm_campaign, row.currency, "paid_orders", row.paid_orders, report.data_quality.status]);
        rows.push([...context, touch, row.source, row.utm_source, row.utm_medium, row.utm_campaign, row.currency, "gross_minor", row.gross_minor, report.data_quality.status]);
      }));
      commerceDataQualityEntries(report).forEach((entry) => rows.push([...context, "data_quality", null, null, null, null, entry.currency, entry.metric, entry.value, report.data_quality.status]));
      return tableToCsv(
        ["period_from", "period_to", "environment", "section", "source", "utm_source", "utm_medium", "utm_campaign", "currency", "metric", "value", "data_quality"],
        rows,
      );
    }
    const rows: Array<Array<string | number | boolean | null>> = [];
    report.commerce.revenue.forEach((row) => rows.push([...context, "revenue", row.currency, "gross_minor", row.gross_minor], [...context, "revenue", row.currency, "refunded_minor", row.refunded_minor], [...context, "revenue", row.currency, "net_minor", row.net_minor]));
    Object.entries(report.commerce.status_counts).forEach(([status, count]) => rows.push([...context, "status", null, status, count]));
    report.products.forEach((product) => {
      rows.push([...context, `product:${product.product_id}`, null, "product_views", product.product_views]);
      product.paid.forEach((paid) => rows.push([...context, `product:${product.product_id}`, paid.currency, "gross_minor", paid.gross_minor]));
    });
    commerceDataQualityEntries(report).forEach((entry) => rows.push([...context, "data_quality", entry.currency, entry.metric, entry.value]));
    return tableToCsv(["period_from", "period_to", "environment", "section", "currency", "metric", "value"], rows);
  }
  if (tab === "content") return tableToCsv(["title", "type", "opens", "completions", "progress", "exits", "shares", "errors", "completion_rate", "growth_percent"], payload.content.rows.map((row) => [row.title, row.type, row.opens, row.completions, row.progress, row.exits, row.shares, row.errors, row.completionStatus, row.growthPercent]));
  if (tab === "languages") return tableToCsv(["lang", "events", "opens", "completions", "exits", "completion_rate"], payload.languages.map((row) => [row.lang, row.events, row.opens, row.completions, row.exits, row.completionStatus]));
  if (tab === "pages") return tableToCsv(["title", "page", "views", "visitors"], payload.pages.topPages.map((row) => [row.title, row.page, row.views, row.visitors]));
  if (tab === "funnels") return tableToCsv(["funnel", "step", "count", "conversion_percent", "note"], payload.funnels.flatMap((funnel) => funnel.steps.map((step) => [funnel.title, step.step, step.count, step.conversionPercent, step.note])));
  if (tab === "studio") return tableToCsv(["step", "count", "conversion_percent", "note"], payload.studio.breakpoints.map((step) => [step.step, step.count, step.conversionPercent, step.note]));
  return tableToCsv(["date", "visitors", "sessions", "events"], payload.growth.map((row) => [row.date, row.visitors, row.sessions, row.events]));
}
