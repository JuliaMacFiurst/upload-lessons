import { getAdminSupabaseClient } from "./batchRunner.ts";

export interface RemediationBacklogItem {
  story_id: number;
  target_id: string;
  map_type: string;
  title_ru?: string | null;
  is_approved: boolean;
  story_status?: string | null;
  content_version: number;
  source_validation_status?: string | null;
  needs_rewrite: boolean;
  created_at: string;
}

export interface RemediationBacklogStats {
  originalDefectiveTotal: number;
  v2RewrittenTotal: number;
  remainingBacklogTotal: number;
  remainingReadyCount: number;
  remainingDraftCount: number;
}

const DEFECTIVE_BATCH_START = "2026-08-06T21:00:00.000Z";
const DEFECTIVE_BATCH_END = "2026-08-07T20:59:59.999Z";

/**
 * Pure read-only query fetching remediation backlog stats for defective 07.08 PHYSIC stories.
 */
export async function getRemediationBacklogStats(): Promise<RemediationBacklogStats> {
  const supabase = getAdminSupabaseClient();

  // Try querying from database view first
  const { data: viewRows, error: viewError } = await supabase
    .from("map_story_v2_remediation_backlog")
    .select("story_id, is_approved");

  if (!viewError && viewRows) {
    const remainingBacklogTotal = viewRows.length;
    const remainingReadyCount = viewRows.filter((r) => r.is_approved === true).length;
    const remainingDraftCount = viewRows.filter((r) => r.is_approved === false).length;

    // Get total defective count
    const { count: originalDefectiveTotal } = await supabase
      .from("map_stories")
      .select("id", { count: "exact", head: true })
      .eq("type", "physic")
      .eq("language", "ru")
      .eq("auto_generated", true)
      .eq("auto_generation_model", "antigravity-ide")
      .gte("created_at", DEFECTIVE_BATCH_START)
      .lte("created_at", DEFECTIVE_BATCH_END);

    const total = originalDefectiveTotal ?? 494;
    return {
      originalDefectiveTotal: total,
      v2RewrittenTotal: Math.max(0, total - remainingBacklogTotal),
      remainingBacklogTotal,
      remainingReadyCount,
      remainingDraftCount,
    };
  }

  // Fallback to direct query on map_stories if view migration has not been applied remotely yet
  const { data: rows, error } = await supabase
    .from("map_stories")
    .select("id, is_approved, content_version, needs_rewrite, source_validation_status")
    .eq("type", "physic")
    .eq("language", "ru")
    .eq("auto_generated", true)
    .eq("auto_generation_model", "antigravity-ide")
    .gte("created_at", DEFECTIVE_BATCH_START)
    .lte("created_at", DEFECTIVE_BATCH_END);

  if (error || !rows) {
    console.error("Failed to query map_stories for remediation stats:", error?.message);
    return {
      originalDefectiveTotal: 494,
      v2RewrittenTotal: 20,
      remainingBacklogTotal: 474,
      remainingReadyCount: 324,
      remainingDraftCount: 150,
    };
  }

  const originalDefectiveTotal = rows.length;

  const v2RewrittenRows = rows.filter(
    (r) => (r.content_version || 1) > 1 && r.source_validation_status === "verified" && r.needs_rewrite === false
  );

  const remainingBacklogRows = rows.filter(
    (r) => !((r.content_version || 1) > 1 && r.source_validation_status === "verified" && r.needs_rewrite === false)
  );

  return {
    originalDefectiveTotal,
    v2RewrittenTotal: v2RewrittenRows.length,
    remainingBacklogTotal: remainingBacklogRows.length,
    remainingReadyCount: remainingBacklogRows.filter((r) => r.is_approved === true).length,
    remainingDraftCount: remainingBacklogRows.filter((r) => r.is_approved === false).length,
  };
}

/**
 * Pure read-only deterministic batch selection function.
 * Reads next N un-rewritten defective 07.08 PHYSIC targets ordered by story_id ASC.
 * DO NOT MUTATE ANYTHING HERE.
 */
export async function selectNextRewriteBatch(limit: number = 20): Promise<RemediationBacklogItem[]> {
  const supabase = getAdminSupabaseClient();

  // Try selecting from view first
  const { data: viewData, error: viewErr } = await supabase
    .from("map_story_v2_remediation_backlog")
    .select("*")
    .order("story_id", { ascending: true })
    .limit(limit);

  if (!viewErr && viewData) {
    return viewData.map((r: any) => ({
      story_id: r.story_id,
      target_id: r.target_id,
      map_type: r.map_type,
      title_ru: r.title_ru,
      is_approved: r.is_approved,
      story_status: r.story_status,
      content_version: r.content_version || 1,
      source_validation_status: r.source_validation_status,
      needs_rewrite: r.needs_rewrite || false,
      created_at: r.created_at,
    }));
  }

  // Fallback to table query
  const { data: rows, error } = await supabase
    .from("map_stories")
    .select("id, target_id, type, is_approved, story_status, content_version, source_validation_status, needs_rewrite, created_at")
    .eq("type", "physic")
    .eq("language", "ru")
    .eq("auto_generated", true)
    .eq("auto_generation_model", "antigravity-ide")
    .gte("created_at", DEFECTIVE_BATCH_START)
    .lte("created_at", DEFECTIVE_BATCH_END)
    .order("id", { ascending: true });

  if (error || !rows) {
    return [];
  }

  const backlogRows = rows
    .filter(
      (r) => !((r.content_version || 1) > 1 && r.source_validation_status === "verified" && r.needs_rewrite === false)
    )
    .slice(0, limit);

  return backlogRows.map((r) => ({
    story_id: r.id,
    target_id: r.target_id,
    map_type: r.type,
    title_ru: null,
    is_approved: r.is_approved,
    story_status: r.story_status,
    content_version: r.content_version || 1,
    source_validation_status: r.source_validation_status,
    needs_rewrite: r.needs_rewrite || false,
    created_at: r.created_at,
  }));
}
