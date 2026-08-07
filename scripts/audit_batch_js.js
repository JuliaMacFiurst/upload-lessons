// JS script to run canonical batch (50) and perform full audit queries using ts-node register
require('ts-node').register({ transpileOnly: true });
const { runCanonicalMapStoryBatch, getAdminSupabaseClient } = require('./lib/server/mapContentWriter/batchRunner.ts');

(async () => {
  const requestedCount = 50;
  const report = await runCanonicalMapStoryBatch({ requestedCount, operation: 'generation' });
  console.log('=== Batch Report ===');
  console.log(JSON.stringify(report, null, 2));

  const supabase = getAdminSupabaseClient();
  // Query batch log
  const { data: batchLog, error: logErr } = await supabase
    .from('map_story_batch_logs')
    .select('*')
    .eq('batch_id', report.batchId)
    .single();
  if (logErr) throw logErr;

  // Query stories for this batch
  const { data: stories, error: storiesErr } = await supabase
    .from('map_stories')
    .select('id, target_id, generation_batch_id, story_status, is_approved')
    .eq('generation_batch_id', report.batchId);
  if (storiesErr) throw storiesErr;

  const queueBefore = report.queueBeforeCount;
  const queueAfter = report.queueAfterCount;
  const queueDiff = (queueBefore ?? 0) - (queueAfter ?? 0);
  const inserted = report.inserted;
  const invariantsOk = queueDiff === inserted;

  const allSameBatch = stories.every(s => s.generation_batch_id === report.batchId);
  const allDraft = stories.every(s => s.story_status === 'draft');
  const allNotApproved = stories.every(s => s.is_approved === false);
  const countMatchesLog = stories.length === (batchLog?.inserted ?? 0);

  const audit = {
    batchId: report.batchId,
    queue_before: queueBefore,
    queue_after: queueAfter,
    queue_difference: queueDiff,
    requested: report.requested,
    inserted,
    rejected: report.rejected,
    duplicate: report.duplicate,
    db_errors: report.dbErrors,
    invariants_ok: invariantsOk,
    stories_count: stories.length,
    all_stories_same_batch: allSameBatch,
    all_stories_draft: allDraft,
    all_stories_not_approved: allNotApproved,
    count_matches_log: countMatchesLog,
    batch_log: batchLog,
    stories,
  };

  console.log('\n=== Full Audit Report (JSON) ===');
  console.log(JSON.stringify(audit, null, 2));
})();
