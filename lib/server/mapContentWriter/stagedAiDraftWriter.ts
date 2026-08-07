import type { SupabaseClient } from "@supabase/supabase-js";
import { validateMapStoryBeforeWrite } from "./preWriteSafetyLayer.ts";

export type StagedAiDraftInsertOptions = {
  generationBatchId?: string | null;
  dryRunOnly?: boolean;
};

export type StagedAiDraftItemResult = {
  mapType: string;
  targetId: string;
  status: "CREATED" | "SKIPPED_EXISTING" | "REJECTED_VALIDATION" | "FAILED_WRITE";
  error?: string;
};

export type StagedAiDraftBatchResult = {
  created: number;
  skipped: number;
  rejected: number;
  failed: number;
  itemResults: StagedAiDraftItemResult[];
  rejectionBreakdown: Record<string, number>;
  rejectedItems: Array<{
    target_id: string;
    map_type: string;
    validator: string;
    reason: string;
    description: string;
  }>;
};

/**
 * Validates and inserts staged AI drafts into map_stories with strict server-side safeguards.
 * generationBatchId is verified against map_story_batch_logs (status='running') before being written.
 */
export async function insertStagedAiDrafts(
  items: Array<{ map_type?: string; mapType?: string; target_id?: string; targetId?: string; content?: string }>,
  supabase: SupabaseClient,
  options?: StagedAiDraftInsertOptions
): Promise<StagedAiDraftBatchResult> {
  let verifiedBatchId: string | null = null;

  // If a generationBatchId is passed, strictly verify its existence, status='running', and valid operation
  if (options?.generationBatchId) {
    const rawBatchId = options.generationBatchId.trim();
    const { data: batchLog, error: batchErr } = await supabase
      .from("map_story_batch_logs")
      .select("batch_id, status, operation")
      .eq("batch_id", rawBatchId)
      .maybeSingle();

    if (batchErr || !batchLog) {
      throw new Error(`Untrusted generation_batch_id "${rawBatchId}": Not found in map_story_batch_logs (FK requirement).`);
    }

    if (batchLog.status !== "running") {
      throw new Error(`Invalid generation_batch_id "${rawBatchId}": Batch status is "${batchLog.status}", expected "running".`);
    }

    if (batchLog.operation !== "generation" && batchLog.operation !== "smoke_test") {
      throw new Error(`Invalid generation_batch_id "${rawBatchId}": Operation is "${batchLog.operation}", expected "generation" or "smoke_test".`);
    }

    verifiedBatchId = rawBatchId;
  }

  const itemResults: StagedAiDraftItemResult[] = [];
  const rejectionBreakdown: Record<string, number> = {};
  const rejectedItems: Array<{
    target_id: string;
    map_type: string;
    validator: string;
    reason: string;
    description: string;
  }> = [];

  let created = 0;
  let skipped = 0;
  let rejected = 0;
  let failed = 0;

  for (const item of items) {
    const rawMapType = (typeof item?.map_type === "string" ? item.map_type : typeof item?.mapType === "string" ? item.mapType : "").trim();
    const rawTargetId = (typeof item?.target_id === "string" ? item.target_id : typeof item?.targetId === "string" ? item.targetId : "").trim();

    const valRes = await validateMapStoryBeforeWrite(
      item,
      { map_type: rawMapType, target_id: rawTargetId },
      supabase
    );

    if (!valRes.isValid) {
      const primaryStop = valRes.stopConditions[0] || "VALIDATION";
      rejectionBreakdown[primaryStop] = (rejectionBreakdown[primaryStop] || 0) + 1;

      rejectedItems.push({
        target_id: rawTargetId || "unknown",
        map_type: rawMapType || "unknown",
        validator: primaryStop,
        reason: valRes.stopConditions.join(", ") || "Validation Error",
        description: valRes.errors.join("; ") || "Validation failed before database write",
      });

      if (valRes.stopConditions.includes("STOP-META-03")) {
        skipped += 1;
        itemResults.push({
          mapType: rawMapType,
          targetId: rawTargetId,
          status: "SKIPPED_EXISTING",
          error: valRes.errors.join("; "),
        });
      } else {
        rejected += 1;
        itemResults.push({
          mapType: rawMapType,
          targetId: rawTargetId,
          status: "REJECTED_VALIDATION",
          error: valRes.errors.join("; "),
        });
      }
      continue;
    }

    if (options?.dryRunOnly === true) {
      created += 1;
      itemResults.push({
        mapType: rawMapType,
        targetId: rawTargetId,
        status: "CREATED",
        error: "DRY_RUN_SIMULATION",
      });
    } else {
      try {
        const insertPayload: Record<string, unknown> = {
          type: rawMapType,
          target_id: rawTargetId,
          language: "ru",
          content: valRes.candidate!.content,
          is_approved: false, // Server-forced draft status
          auto_generated: true, // Server-forced AI flag
          auto_generation_model: "antigravity-ide", // Server-forced model metadata
        };

        if (verifiedBatchId) {
          insertPayload.generation_batch_id = verifiedBatchId;
        }

        const { error: insertError } = await supabase.from("map_stories").insert(insertPayload);

        if (insertError) {
          const isUniqueViolation =
            insertError.code === "23505" ||
            insertError.message.toLowerCase().includes("unique") ||
            insertError.message.toLowerCase().includes("already exists");

          if (isUniqueViolation) {
            skipped += 1;
            itemResults.push({
              mapType: rawMapType,
              targetId: rawTargetId,
              status: "SKIPPED_EXISTING",
              error: "Story already exists in map_stories (UNIQUE constraint caught)",
            });
          } else {
            failed += 1;
            itemResults.push({
              mapType: rawMapType,
              targetId: rawTargetId,
              status: "FAILED_WRITE",
              error: insertError.message,
            });
          }
        } else {
          created += 1;
          itemResults.push({
            mapType: rawMapType,
            targetId: rawTargetId,
            status: "CREATED",
          });
        }
      } catch (err) {
        failed += 1;
        itemResults.push({
          mapType: rawMapType,
          targetId: rawTargetId,
          status: "FAILED_WRITE",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    created,
    skipped,
    rejected,
    failed,
    itemResults,
    rejectionBreakdown,
    rejectedItems,
  };
}
