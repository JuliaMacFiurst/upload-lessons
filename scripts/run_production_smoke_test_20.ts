import { runCanonicalMapStoryBatch } from "../lib/server/mapContentWriter/batchRunner.ts";

async function main() {
  console.log("================================================================================");
  console.log("🧪 RUNNING PRODUCTION SMOKE TEST (20 TARGETS)");
  console.log("================================================================================");

  try {
    const report = await runCanonicalMapStoryBatch({
      requestedCount: 20,
      operation: "smoke_test",
    });

    console.log("\n================================================================================");
    console.log("📊 SMOKE TEST EXECUTION REPORT");
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
    console.error("❌ Smoke test execution failed:", err);
    process.exit(1);
  }
}

main();
