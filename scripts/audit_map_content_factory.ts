// scripts/audit_map_content_factory.ts – read‑only audit against Supabase
import { getAdminSupabaseClient } from "../lib/server/mapContentWriter/batchRunner";

async function main() {
  const supabase = getAdminSupabaseClient();

  // 1. Last 10 batch logs
  const { data: batchLogs, error: batchErr } = await supabase
    .from("map_story_batch_logs")
    .select("batch_id, created_at, operation, status, requested, inserted, rejected, duplicate, db_errors")
    .order("created_at", { ascending: false })
    .limit(10);
  if (batchErr) throw batchErr;
  console.log("--- LAST 10 BATCH LOGS ---");
  console.log(JSON.stringify(batchLogs, null, 2));

  // 2. Story counts per batch_id
  const storyCounts = [];
  for (const log of batchLogs ?? []) {
    const { count, error } = await supabase
      .from("map_stories")
      .select("id", { count: "exact", head: true })
      .eq("generation_batch_id", log.batch_id);
    if (error) throw error;
    storyCounts.push({ generation_batch_id: log.batch_id, count: count ?? 0 });
  }
  console.log("--- STORY COUNTS PER BATCH ---");
  console.log(JSON.stringify(storyCounts, null, 2));

  // 3. Stories from last 30 minutes grouped by generation_batch_id
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: recentStories, error: recentErr } = await supabase
    .from("map_stories")
    .select("id, generation_batch_id, created_at")
    .gte("created_at", thirtyMinsAgo);
  if (recentErr) throw recentErr;
  const groups: Record<string, { count: number; min: string; max: string }> = {};
  for (const s of recentStories ?? []) {
    const gid = s.generation_batch_id ?? "NULL";
    if (!groups[gid]) {
      groups[gid] = { count: 0, min: s.created_at, max: s.created_at };
    }
    const g = groups[gid];
    g.count++;
    if (s.created_at < g.min) g.min = s.created_at;
    if (s.created_at > g.max) g.max = s.created_at;
  }
  console.log("--- RECENT STORY GROUPS (last 30 min) ---");
  console.log(JSON.stringify(groups, null, 2));

  // 4. Stories with NULL generation_batch_id in last 30 min
  const nullStories = recentStories?.filter(s => s.generation_batch_id === null) ?? [];
  console.log("--- STORIES WITH NULL generation_batch_id (last 30 min) ---");
  console.log(JSON.stringify(nullStories, null, 2));

  // 5. Orphan stories: generation_batch_id not in batch logs
  const { data: allBatchIds, error: batchIdsErr } = await supabase.from("map_story_batch_logs").select("batch_id");
  if (batchIdsErr) throw batchIdsErr;
  const existingIds = new Set(allBatchIds?.map(b => b.batch_id));
  const orphanStories = recentStories?.filter(s => s.generation_batch_id && !existingIds.has(s.generation_batch_id)) ?? [];
  console.log("--- ORPHAN STORIES (batch_id not in logs, last 30 min) ---");
  console.log(JSON.stringify(orphanStories, null, 2));

  // 6. Reconciliation table
  const reconciliation = [];
  for (const log of batchLogs ?? []) {
    const { count, error } = await supabase
      .from("map_stories")
      .select("id", { count: "exact", head: true })
      .eq("generation_batch_id", log.batch_id);
    if (error) throw error;
    const actual = count ?? 0;
    reconciliation.push({
      batch_id: log.batch_id,
      requested: log.requested,
      inserted_log: log.inserted,
      actual_rows: actual,
      difference: (log.inserted ?? 0) - actual,
    });
  }
  console.log("--- RECONCILIATION TABLE ---");
  console.log(JSON.stringify(reconciliation, null, 2));

  // 7. Verify that all new rows for the latest batch have correct status
  const latestBatch = batchLogs?.[0];
  if (latestBatch) {
    const { data: batchStories, error: batchStoriesErr } = await supabase
      .from('map_stories')
      .select('story_status,is_approved')
      .eq('generation_batch_id', latestBatch.batch_id);
    if (batchStoriesErr) throw batchStoriesErr;
    const allDraft = batchStories?.every((s: any) => s.story_status === 'draft');
    const allNotApproved = batchStories?.every((s: any) => s.is_approved === false);
    console.log('--- LATEST BATCH STORY STATUS CHECK ---');
    console.log(JSON.stringify({ allDraft, allNotApproved, count: batchStories?.length ?? 0 }, null, 2));
  }
}

main().catch(err => {
  console.error("Audit script error:", err);
  process.exit(1);
});
