import { runCanonicalMapStoryBatch } from "../lib/server/mapContentWriter/batchRunner.ts";

async function main() {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => !a.startsWith("--"));
  const requestedCount = countArg ? parseInt(countArg, 10) : 100;

  console.log("================================================================================");
  console.log(`🚀 RUNNING CANONICAL MAP CONTENT FACTORY BATCH (${requestedCount} TARGETS)`);
  console.log("================================================================================");

  try {
    const report = await runCanonicalMapStoryBatch({
      requestedCount,
      operation: "generation",
    });

    console.log("\n================================================================================");
    console.log("📊 CANONICAL BATCH EXECUTION REPORT");
    console.log("================================================================================");
    console.log(`Batch ID:          ${report.batchId}`);
    console.log(`Operation:         ${report.operation}`);
    console.log(`Status:            ${report.status}`);
    console.log(`Requested:         ${report.requested}`);
    console.log(`Inserted Drafts:   ${report.inserted}`);
    console.log(`Validation Reject: ${report.rejected}`);
    console.log(`Duplicates Skip:   ${report.duplicate}`);
    console.log(`Database Errors:   ${report.dbErrors}`);
    console.log(`Duration (ms):     ${report.durationMs}`);
    console.log(`Queue Before:      ${report.queueBeforeCount}`);
    console.log(`Queue After:       ${report.queueAfterCount}`);
    console.log("================================================================ drop-in complete.\n");
  } catch (err) {
    console.error("❌ Batch execution failed:", err);
    process.exit(1);
  }
}

main();
