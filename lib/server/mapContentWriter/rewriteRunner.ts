/**
 * Map Content Writer v2 — Rewrite Runner Engine
 * Executes controlled rewrites for defective stories in map_story_rewrite_queue.
 *
 * SAFE REWRITE INVARIANT:
 * Old story content is treated as UNTRUSTED. V2 research is run from scratch.
 * Content in map_stories is ONLY updated after the new candidate passes ALL V2 gates
 * and independent source validation. If validation fails, existing DB row remains UNCHANGED.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateV2VerifiedCandidate, type V2GenerationResult } from "./v2StoryGenerator.ts";

export type RewriteRunnerOptions = {
  batchSize?: number;
  dryRunOnly?: boolean;
  targetIdFilter?: string;
};

export type RewriteItemResult = {
  storyId: number | string;
  targetId: string;
  mapType: string;
  status: "REWRITTEN" | "REJECTED_VALIDATION" | "FAILED_WRITE" | "SIMULATED";
  previousVersion: number;
  newVersion?: number;
  errors?: string[];
};

export type RewriteBatchReport = {
  batchId: string;
  requested: number;
  rewritten: number;
  rejected: number;
  failed: number;
  itemResults: RewriteItemResult[];
  rejectionBreakdown: Record<string, number>;
  durationMs: number;
};

export async function runV2RewriteBatch(
  supabase: SupabaseClient,
  options?: RewriteRunnerOptions
): Promise<RewriteBatchReport> {
  const startTime = Date.now();
  const batchSize = options?.batchSize ?? 20;
  const dryRunOnly = options?.dryRunOnly ?? false;
  const batchId = `rewrite-batch-${Date.now()}`;

  let query = supabase
    .from("map_story_rewrite_queue" as any)
    .select("story_id, map_type, target_id, title_ru, current_content, content_version")
    .order("story_id", { ascending: true })
    .limit(batchSize);

  if (options?.targetIdFilter) {
    query = query.eq("target_id", options.targetIdFilter);
  }

  const { data: queueRows, error: fetchErr } = await query;

  if (fetchErr) {
    throw new Error(`Failed to fetch rewrite queue: ${fetchErr.message}`);
  }

  const targetsToRewrite = queueRows || [];
  let rewritten = 0;
  let rejected = 0;
  let failed = 0;

  const itemResults: RewriteItemResult[] = [];
  const rejectionBreakdown: Record<string, number> = {};

  for (const item of targetsToRewrite) {
    const storyId = item.story_id;
    const targetId = item.target_id;
    const mapType = item.map_type;
    const titleRu = item.title_ru || targetId;
    const currentVersion = Number(item.content_version || 1);

    // 1. GENERATE NEW V2 CANDIDATE FROM SCRATCH (UNTRUSTED OLD STORY IS IGNORED)
    const candidate: V2GenerationResult = await generateV2VerifiedCandidate(mapType, targetId, titleRu);

    if (!candidate.isValid || !candidate.content || !candidate.story_sources) {
      const primaryStop = candidate.stopConditions[0] || "VALIDATION_FAILED";
      rejectionBreakdown[primaryStop] = (rejectionBreakdown[primaryStop] || 0) + 1;
      rejected++;

      itemResults.push({
        storyId,
        targetId,
        mapType,
        status: "REJECTED_VALIDATION",
        previousVersion: currentVersion,
        errors: candidate.errors,
      });

      // DO NOT MODIFY DB ROW (UNTOUCHED)
      continue;
    }

    if (dryRunOnly) {
      rewritten++;
      itemResults.push({
        storyId,
        targetId,
        mapType,
        status: "SIMULATED",
        previousVersion: currentVersion,
        newVersion: currentVersion + 1,
      });
    } else {
      // 2. SAFE ATOMIC REWRITE UPDATE TO MAP_STORIES
      const nowIso = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("map_stories")
        .update({
          content: candidate.content,
          story_sources: candidate.story_sources,
          source_validation_status: "verified",
          source_validated_at: nowIso,
          source_validation_version: 1,
          content_version: currentVersion + 1,
          needs_rewrite: false,
          is_approved: false, // Remains draft for admin review
          updated_at: nowIso,
        })
        .eq("id", storyId);

      if (updateErr) {
        failed++;
        itemResults.push({
          storyId,
          targetId,
          mapType,
          status: "FAILED_WRITE",
          previousVersion: currentVersion,
          errors: [updateErr.message],
        });
      } else {
        rewritten++;
        itemResults.push({
          storyId,
          targetId,
          mapType,
          status: "REWRITTEN",
          previousVersion: currentVersion,
          newVersion: currentVersion + 1,
        });
      }
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    batchId,
    requested: targetsToRewrite.length,
    rewritten,
    rejected,
    failed,
    itemResults,
    rejectionBreakdown,
    durationMs,
  };
}
