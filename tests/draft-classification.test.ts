import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getDraftCategoryState,
  filterDraftsByCategory,
  computeDraftCategoryCounts,
  type ClassifiableDraft,
} from "../lib/server/mapContentWriter/draftClassifier.ts";

describe("Admin AI Drafts State Classification (V2 UX)", () => {
  test("classifies rewritten V2 story when content_version > 1, verified, needs_rewrite=false, is_approved=false", () => {
    const item: ClassifiableDraft = {
      content_version: 2,
      needs_rewrite: false,
      source_validation_status: "verified",
      is_approved: false,
    };
    assert.equal(getDraftCategoryState(item), "REWRITTEN_V2");
  });

  test("classifies new draft when content_version = 1, needs_rewrite=false, is_approved=false", () => {
    const item: ClassifiableDraft = {
      content_version: 1,
      needs_rewrite: false,
      source_validation_status: null,
      is_approved: false,
    };
    assert.equal(getDraftCategoryState(item), "NEW_DRAFT");
  });

  test("classifies attention item when needs_rewrite = true regardless of content_version", () => {
    const item1: ClassifiableDraft = {
      content_version: 1,
      needs_rewrite: true,
      source_validation_status: "not_checked",
      is_approved: false,
    };
    const item2: ClassifiableDraft = {
      content_version: 2,
      needs_rewrite: true,
      source_validation_status: "verified",
      is_approved: false,
    };
    assert.equal(getDraftCategoryState(item1), "NEEDS_REWRITE_ATTENTION");
    assert.equal(getDraftCategoryState(item2), "NEEDS_REWRITE_ATTENTION");
  });

  test("computes counts for mixed list correctly", () => {
    const items: ClassifiableDraft[] = [
      { content_version: 2, needs_rewrite: false, source_validation_status: "verified", is_approved: false },
      { content_version: 2, needs_rewrite: false, source_validation_status: "verified", is_approved: false },
      { content_version: 1, needs_rewrite: false, is_approved: false },
      { content_version: 1, needs_rewrite: true, is_approved: false },
    ];
    const counts = computeDraftCategoryCounts(items);
    assert.equal(counts.total, 4);
    assert.equal(counts.rewrittenV2Count, 2);
    assert.equal(counts.newDraftCount, 1);
    assert.equal(counts.needsAttentionCount, 1);
  });

  test("filters items by category correctly", () => {
    const v2Item: ClassifiableDraft = { content_version: 2, needs_rewrite: false, source_validation_status: "verified", is_approved: false };
    const newItem: ClassifiableDraft = { content_version: 1, needs_rewrite: false, is_approved: false };
    const attentionItem: ClassifiableDraft = { content_version: 1, needs_rewrite: true, is_approved: false };

    const list = [v2Item, newItem, attentionItem];

    assert.equal(filterDraftsByCategory(list, "all").length, 3);
    assert.deepEqual(filterDraftsByCategory(list, "v2_rewritten"), [v2Item]);
    assert.deepEqual(filterDraftsByCategory(list, "new"), [newItem]);
    assert.deepEqual(filterDraftsByCategory(list, "needs_attention"), [attentionItem]);
  });
});
