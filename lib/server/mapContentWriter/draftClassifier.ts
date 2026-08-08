/**
 * Map Content Writer v2 — Admin Draft State Classifier
 * Pure classification and filtering rules for Admin AI Drafts:
 * - REWRITTEN_V2: content_version > 1 AND needs_rewrite = false AND source_validation_status = 'verified' AND is_approved = false
 * - NEW_DRAFT: content_version = 1 AND needs_rewrite = false AND is_approved = false
 * - NEEDS_REWRITE_ATTENTION: needs_rewrite = true
 */

export type DraftCategoryState = "REWRITTEN_V2" | "NEW_DRAFT" | "NEEDS_REWRITE_ATTENTION";

export type ClassifiableDraft = {
  content_version?: number;
  needs_rewrite?: boolean;
  source_validation_status?: string | null;
  is_approved?: boolean;
};

export function getDraftCategoryState(item: ClassifiableDraft): DraftCategoryState {
  if (item.needs_rewrite === true) {
    return "NEEDS_REWRITE_ATTENTION";
  }
  if (
    (item.content_version ?? 1) > 1 &&
    item.needs_rewrite === false &&
    item.source_validation_status === "verified" &&
    item.is_approved === false
  ) {
    return "REWRITTEN_V2";
  }
  return "NEW_DRAFT";
}

export type CategoryFilterType = "all" | "new" | "v2_rewritten" | "needs_attention";

export function filterDraftsByCategory<T extends ClassifiableDraft>(
  drafts: T[],
  filter: CategoryFilterType
): T[] {
  if (filter === "all") return drafts;
  if (filter === "v2_rewritten") return drafts.filter((d) => getDraftCategoryState(d) === "REWRITTEN_V2");
  if (filter === "needs_attention") return drafts.filter((d) => getDraftCategoryState(d) === "NEEDS_REWRITE_ATTENTION");
  if (filter === "new") return drafts.filter((d) => getDraftCategoryState(d) === "NEW_DRAFT");
  return drafts;
}

export function computeDraftCategoryCounts(drafts: ClassifiableDraft[]) {
  let rewrittenV2Count = 0;
  let newDraftCount = 0;
  let needsAttentionCount = 0;

  for (const item of drafts) {
    const state = getDraftCategoryState(item);
    if (state === "REWRITTEN_V2") rewrittenV2Count++;
    else if (state === "NEEDS_REWRITE_ATTENTION") needsAttentionCount++;
    else newDraftCount++;
  }

  return {
    total: drafts.length,
    newDraftCount,
    rewrittenV2Count,
    needsAttentionCount,
  };
}
