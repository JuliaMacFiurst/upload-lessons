import fs from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapStoryCandidateBuilder } from "./candidateBuilder.ts";
import { insertStagedAiDrafts, type StagedAiDraftBatchResult } from "./stagedAiDraftWriter.ts";
import { generateCanonicalStoryText } from "./canonicalStoryGenerator.ts";

export type BatchRunnerOptions = {
  requestedCount?: number;
  operation?: "generation" | "smoke_test";
  mapTypeFilter?: string;
  dryRunOnly?: boolean;
};

export type CanonicalBatchReport = {
  batchId: string;
  operation: "generation" | "smoke_test";
  status: "completed" | "failed";
  requested: number;
  inserted: number;
  rejected: number;
  duplicate: number;
  dbErrors: number;
  durationMs: number;
  queueBeforeCount: number;
  queueAfterCount: number;
  stagedWriteResults: StagedAiDraftBatchResult;
};

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valParts] = trimmed.split("=");
        const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    });
  }
}

export function getAdminSupabaseClient(): SupabaseClient {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceKey);
}

/**
 * Canonical Map Story Content Factory Batch Runner.
 * Sole owner and generator of batch_id. Guaranteed lifecycle:
 * status='running' -> execution -> status='completed' (or status='failed').
 */
export async function runCanonicalMapStoryBatch(
  options?: BatchRunnerOptions,
  customSupabase?: SupabaseClient
): Promise<CanonicalBatchReport> {
  const startTime = Date.now();
  const supabase = customSupabase || getAdminSupabaseClient();

  const requestedCount = options?.requestedCount ?? 50;
  const operation = options?.operation ?? "generation";
  const mapTypeFilter = options?.mapTypeFilter?.trim();
  const dryRunOnly = options?.dryRunOnly ?? false;

  // 1. GENERATE TRUSTED UNIQUE BATCH ID
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const batchId = `batch-${Date.now()}-${randomSuffix}`;

  // 2. CREATE INITIAL BATCH LOG WITH STATUS = 'running'
  const { error: logInitErr } = await supabase.from("map_story_batch_logs").insert({
    batch_id: batchId,
    requested: requestedCount,
    inserted: 0,
    rejected: 0,
    duplicate: 0,
    db_errors: 0,
    duration_ms: 0,
    rejection_breakdown: {},
    rejected_items: [],
    model: "antigravity-ide",
    status: "running",
    operation: operation,
    updated_count: 0,
  });

  if (logInitErr) {
    throw new Error(`Failed to initialize running log for batch ${batchId}: ${logInitErr.message}`);
  }

  try {
    // 3. FETCH PENDING WORK EXCLUSIVELY FROM MAP_STORY_GENERATION_QUEUE
    let queueQuery = supabase
      .from("map_story_generation_queue")
      .select("map_type, target_id, title_ru, title_en", { count: "exact" });

    if (mapTypeFilter) {
      queueQuery = queueQuery.eq("map_type", mapTypeFilter);
    }

    const { data: queueTargets, count: totalQueueCount, error: queueErr } = await queueQuery.limit(requestedCount);

    if (queueErr) {
      throw new Error(`Failed to fetch generation queue: ${queueErr.message}`);
    }

    const targetsToProcess = queueTargets || [];
    const queueBeforeCount = totalQueueCount ?? targetsToProcess.length;

    if (targetsToProcess.length === 0) {
      const durationMs = Date.now() - startTime;
      await supabase
        .from("map_story_batch_logs")
        .update({
          status: "completed",
          duration_ms: durationMs,
        })
        .eq("batch_id", batchId);

      return {
        batchId,
        operation,
        status: "completed",
        requested: requestedCount,
        inserted: 0,
        rejected: 0,
        duplicate: 0,
        dbErrors: 0,
        durationMs,
        queueBeforeCount,
        queueAfterCount: queueBeforeCount,
        stagedWriteResults: {
          created: 0,
          skipped: 0,
          rejected: 0,
          failed: 0,
          itemResults: [],
          rejectionBreakdown: {},
          rejectedItems: [],
        },
      };
    }

    // 4. GENERATE MAP STORY CANDIDATES
    const candidatesToInsert: Array<{ map_type: string; target_id: string; content: string }> = [];

    for (let i = 0; i < targetsToProcess.length; i++) {
      const target = targetsToProcess[i];
      const name = target.title_ru || target.title_en || target.target_id;
      const content = generateCanonicalStoryText(target.map_type, target.target_id, name, i);

      const built = mapStoryCandidateBuilder.buildAndValidate({
        map_type: target.map_type,
        target_id: target.target_id,
        content: content,
      });

      if (built.candidate) {
        candidatesToInsert.push({
          map_type: built.candidate.map_type,
          target_id: built.candidate.target_id,
          content: built.candidate.content,
        });
      }
    }

    // 5. STAGED AI DRAFT WRITE (CHUNKS OF 5 ITEMS MAX WITH VERIFIED GENERATION_BATCH_ID)
    const stagedResults: StagedAiDraftBatchResult = {
      created: 0,
      skipped: 0,
      rejected: 0,
      failed: 0,
      itemResults: [],
      rejectionBreakdown: {},
      rejectedItems: [],
    };

    const chunkSize = 5;
    for (let i = 0; i < candidatesToInsert.length; i += chunkSize) {
      const chunk = candidatesToInsert.slice(i, i + chunkSize);
      const chunkRes = await insertStagedAiDrafts(chunk, supabase, {
        generationBatchId: batchId,
        dryRunOnly,
      });

      stagedResults.created += chunkRes.created;
      stagedResults.skipped += chunkRes.skipped;
      stagedResults.rejected += chunkRes.rejected;
      stagedResults.failed += chunkRes.failed;
      stagedResults.itemResults.push(...chunkRes.itemResults);

      Object.entries(chunkRes.rejectionBreakdown).forEach(([key, count]) => {
        stagedResults.rejectionBreakdown[key] = (stagedResults.rejectionBreakdown[key] || 0) + count;
      });
      stagedResults.rejectedItems.push(...chunkRes.rejectedItems);
    }

    const durationMs = Date.now() - startTime;

    // Check queue count after batch
    let afterQuery = supabase.from("map_story_generation_queue").select("*", { count: "exact", head: true });
    if (mapTypeFilter) afterQuery = afterQuery.eq("map_type", mapTypeFilter);
    const { count: queueAfterCount } = await afterQuery;

    // 6. FINALIZE BATCH LOG RECORD (STATUS = 'completed')
    const { error: updateErr } = await supabase
      .from("map_story_batch_logs")
      .update({
        inserted: stagedResults.created,
        rejected: stagedResults.rejected,
        duplicate: stagedResults.skipped,
        db_errors: stagedResults.failed,
        duration_ms: durationMs,
        rejection_breakdown: stagedResults.rejectionBreakdown,
        rejected_items: stagedResults.rejectedItems,
        status: "completed",
      })
      .eq("batch_id", batchId);

    if (updateErr) {
      console.warn(`[BatchRunner] Failed to finalize completed log for batch ${batchId}:`, updateErr.message);
    }

    // Save report to .pilot-reports for persistent audit log
    const reportDir = path.join(process.cwd(), ".pilot-reports");
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `canonical-batch-${batchId}.json`);
    fs.writeFileSync(reportPath, JSON.stringify({ batchId, operation, durationMs, stagedResults }, null, 2));

    return {
      batchId,
      operation,
      status: "completed",
      requested: targetsToProcess.length,
      inserted: stagedResults.created,
      rejected: stagedResults.rejected,
      duplicate: stagedResults.skipped,
      dbErrors: stagedResults.failed,
      durationMs,
      queueBeforeCount,
      queueAfterCount: queueAfterCount ?? (queueBeforeCount - stagedResults.created),
      stagedWriteResults: stagedResults,
    };
  } catch (fatalError) {
    const durationMs = Date.now() - startTime;
    await supabase
      .from("map_story_batch_logs")
      .update({
        status: "failed",
        duration_ms: durationMs,
      })
      .eq("batch_id", batchId);

    throw fatalError;
  }
}
