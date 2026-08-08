import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import { sanitizeMapStoryContent } from "@/lib/server/mapTargets/sanitizeMapStoryContent";
import { getRemediationBacklogStats, selectNextRewriteBatch } from "@/lib/server/mapContentWriter/remediationBacklog";

export type AiDraftItem = {
  id: number | string;
  type: string;
  target_id: string;
  title_ru?: string | null;
  content: string;
  created_at: string;
  auto_generation_model: string | null;
  is_approved: boolean;
  auto_generated: boolean;
  wordCount: number;
  story_sources?: any;
  source_validation_status?: string | null;
  source_validated_at?: string | null;
  content_version?: number;
  needs_rewrite?: boolean;
};

export type RejectedItemDiagnostic = {
  target_id: string;
  map_type: string;
  validator: string;
  reason: string;
  description: string;
};

export type BatchDiagnostics = {
  batchId: string;
  requested: number;
  inserted: number;
  rejected: number;
  duplicate: number;
  dbErrors: number;
  durationMs: number;
  rejectionBreakdown: Record<string, number>;
  rejectedItems: RejectedItemDiagnostic[];
  createdAt: string;
};

export type ContentFactoryStats = {
  pendingStories: number;
  pendingByMapType: Record<string, number>;
  draftsWaitingReview: number;
  readyStories: number;
  createdToday: number;
  completedStories: number;
  totalStories: number;
  progressPercent: number;
  latestBatch?: BatchDiagnostics | null;
  rewriteStats?: {
    rewrittenV2Count: number;
    needsRewriteCount: number;
  };
  v2CleanupStats?: {
    originalDefectiveTotal: number;
    v2RewrittenTotal: number;
    remainingBacklogTotal: number;
    remainingReadyCount: number;
    remainingDraftCount: number;
  };
};

export type AiDraftsResponse = {
  drafts: AiDraftItem[];
  count: number;
  stats?: ContentFactoryStats;
  backlog?: any[];
};

export type ApproveBatchResponse = {
  approved: number;
  failed: number;
  failures: Array<{ id: number | string; error: string }>;
};

async function loadContentFactoryStats(supabase: SupabaseClient): Promise<ContentFactoryStats> {
  const { data: queueItems, count: pendingCount } = await supabase
    .from("map_story_generation_queue")
    .select("map_type", { count: "exact" });

  const pendingByMapType: Record<string, number> = {};
  (queueItems ?? []).forEach((item) => {
    const type = item.map_type || "other";
    pendingByMapType[type] = (pendingByMapType[type] || 0) + 1;
  });

  const { count: draftsCount } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .eq("language", "ru")
    .eq("is_approved", false)
    .eq("auto_generated", true);

  const { count: readyCount } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .eq("language", "ru")
    .eq("is_approved", true);

  const { count: totalRuStories } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .eq("language", "ru");

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count: createdTodayCount } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .eq("language", "ru")
    .eq("auto_generated", true)
    .gte("created_at", startOfDay.toISOString());

  const pending = pendingCount ?? 0;
  const completed = totalRuStories ?? 0;
  const total = completed + pending;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  let latestBatch: BatchDiagnostics | null = null;
  try {
    // 1. Fetch strictly the latest completed production generation batch log
    const { data: batchRow } = await supabase
      .from("map_story_batch_logs")
      .select("batch_id, requested, inserted, rejected, duplicate, db_errors, duration_ms, rejection_breakdown, rejected_items, created_at, operation, status")
      .eq("operation", "generation")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchRow) {
      latestBatch = {
        batchId: batchRow.batch_id ?? "",
        requested: batchRow.requested ?? 0,
        inserted: batchRow.inserted ?? 0,
        rejected: batchRow.rejected ?? 0,
        duplicate: batchRow.duplicate ?? 0,
        dbErrors: batchRow.db_errors ?? 0,
        durationMs: batchRow.duration_ms ?? 0,
        rejectionBreakdown: (batchRow.rejection_breakdown as Record<string, number>) || {},
        rejectedItems: (batchRow.rejected_items as RejectedItemDiagnostic[]) || [],
        createdAt: batchRow.created_at ?? "",
      };
    }
  } catch (err) {
    latestBatch = null;
  }

  const { count: needsRewriteCount } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .eq("needs_rewrite", true);

  const { count: rewrittenV2Count } = await supabase
    .from("map_stories")
    .select("id", { count: "exact", head: true })
    .gt("content_version", 1)
    .eq("needs_rewrite", false)
    .eq("source_validation_status", "verified")
    .eq("is_approved", false);

  const v2CleanupStats = await getRemediationBacklogStats();

  return {
    pendingStories: pending,
    pendingByMapType,
    draftsWaitingReview: draftsCount ?? 0,
    readyStories: readyCount ?? 0,
    createdToday: createdTodayCount ?? 0,
    completedStories: completed,
    totalStories: total,
    progressPercent,
    latestBatch,
    rewriteStats: {
      rewrittenV2Count: rewrittenV2Count ?? 0,
      needsRewriteCount: needsRewriteCount ?? 0,
    },
    v2CleanupStats,
  };
}

async function loadAiDrafts(supabase: SupabaseClient): Promise<AiDraftItem[]> {
  const { data: stories, error: storyError } = await supabase
    .from("map_stories")
    .select("id,type,target_id,content,created_at,auto_generation_model,is_approved,auto_generated,story_sources,source_validation_status,source_validated_at,content_version,needs_rewrite")
    .eq("language", "ru")
    .eq("is_approved", false)
    .eq("auto_generated", true)
    .order("created_at", { ascending: false });

  if (storyError) {
    throw new Error(`Failed to load AI drafts: ${storyError.message}`);
  }

  const draftStories = stories ?? [];
  if (draftStories.length === 0) {
    return [];
  }

  const { data: targets, error: targetError } = await supabase
    .from("map_targets")
    .select("map_type,target_id,title_ru");

  if (targetError) {
    throw new Error(`Failed to load map targets: ${targetError.message}`);
  }

  const titleMap = new Map<string, string>();
  (targets ?? []).forEach((t) => {
    if (t.title_ru) {
      titleMap.set(`${t.map_type}::${t.target_id}`, t.title_ru);
    }
  });

  return draftStories.map((s) => {
    const mapType = s.type ?? "";
    const targetId = s.target_id ?? "";
    const content = s.content ?? "";
    const titleRu = titleMap.get(`${mapType}::${targetId}`) || null;
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

    return {
      id: s.id,
      type: mapType,
      target_id: targetId,
      title_ru: titleRu,
      content,
      created_at: s.created_at ?? new Date().toISOString(),
      auto_generation_model: s.auto_generation_model ?? "antigravity-ide",
      is_approved: false,
      auto_generated: true,
      wordCount,
      story_sources: s.story_sources ?? null,
      source_validation_status: s.source_validation_status ?? null,
      source_validated_at: s.source_validated_at ?? null,
      content_version: s.content_version ?? 1,
      needs_rewrite: s.needs_rewrite ?? false,
    };
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;

  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res
      .status(
        error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500
      )
      .json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const [drafts, stats, backlog] = await Promise.all([
        loadAiDrafts(supabase),
        loadContentFactoryStats(supabase),
        req.query.view === "backlog" ? selectNextRewriteBatch(50) : Promise.resolve(undefined),
      ]);
      return res.status(200).json({ drafts, count: drafts.length, stats, backlog } satisfies AiDraftsResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load AI drafts.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    const action = typeof req.body?.action === "string" ? req.body.action : "";

    // 1. APPROVE_AI_DRAFT
    if (action === "APPROVE_AI_DRAFT") {
      const id = req.body?.id;
      if (id === undefined || id === null) {
        return res.status(400).json({ error: "Draft id is required." });
      }

      const { data, error } = await supabase
        .from("map_stories")
        .update({ is_approved: true })
        .eq("id", id)
        .eq("is_approved", false)
        .eq("auto_generated", true)
        .select("id")
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: `Failed to approve draft: ${error.message}` });
      }

      if (!data) {
        const { data: existing } = await supabase
          .from("map_stories")
          .select("id, is_approved")
          .eq("id", id)
          .maybeSingle();

        if (existing && existing.is_approved === true) {
          return res.status(200).json({ success: true, approvedId: id, alreadyApproved: true });
        }

        return res.status(404).json({ error: "Draft story not found or already deleted." });
      }

      return res.status(200).json({ success: true, approvedId: id });
    }

    // 2. APPROVE_AI_DRAFT_BATCH
    if (action === "APPROVE_AI_DRAFT_BATCH") {
      const ids = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Draft ids array is required." });
      }

      const failures: Array<{ id: number | string; error: string }> = [];
      let approved = 0;

      for (const id of ids) {
        try {
          const { data, error } = await supabase
            .from("map_stories")
            .update({ is_approved: true })
            .eq("id", id)
            .eq("is_approved", false)
            .eq("auto_generated", true)
            .select("id")
            .maybeSingle();

          if (error) {
            failures.push({ id, error: error.message });
          } else if (!data) {
            const { data: existing } = await supabase
              .from("map_stories")
              .select("id, is_approved")
              .eq("id", id)
              .maybeSingle();

            if (existing && existing.is_approved === true) {
              approved += 1;
            } else {
              failures.push({ id, error: "Draft not found or deleted" });
            }
          } else {
            approved += 1;
          }
        } catch (err) {
          failures.push({
            id,
            error: err instanceof Error ? err.message : "Failed to approve draft",
          });
        }
      }

      return res.status(200).json({
        approved,
        failed: failures.length,
        failures,
      } satisfies ApproveBatchResponse);
    }

    // 3. UPDATE_AI_DRAFT_CONTENT
    if (action === "UPDATE_AI_DRAFT_CONTENT") {
      const id = req.body?.id;
      const rawContent = typeof req.body?.content === "string" ? req.body.content : "";

      if (id === undefined || id === null) {
        return res.status(400).json({ error: "Draft id is required." });
      }

      const content = sanitizeMapStoryContent(rawContent);
      if (!content.trim()) {
        return res.status(400).json({ error: "Draft content cannot be empty." });
      }

      const { data, error } = await supabase
        .from("map_stories")
        .update({ content })
        .eq("id", id)
        .eq("is_approved", false)
        .eq("auto_generated", true)
        .select("id,content")
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: `Failed to update draft: ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: "Draft story not found or already approved." });
      }

      return res.status(200).json({ success: true, id, content });
    }

    // 4. DELETE_AI_DRAFT
    if (action === "DELETE_AI_DRAFT") {
      const id = req.body?.id;
      if (id === undefined || id === null) {
        return res.status(400).json({ error: "Draft id is required." });
      }

      const { data, error } = await supabase
        .from("map_stories")
        .delete()
        .eq("id", id)
        .eq("is_approved", false)
        .eq("auto_generated", true)
        .select("id")
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: `Failed to delete draft: ${error.message}` });
      }

      if (!data) {
        return res.status(404).json({ error: "Draft story not found or already approved." });
      }

      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(400).json({ error: "Unknown action." });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
