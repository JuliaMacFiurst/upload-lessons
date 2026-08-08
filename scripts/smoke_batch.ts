import { runCanonicalMapStoryBatch } from "../lib/server/mapContentWriter/batchRunner";
import { parseRequestedCount } from "./parseRequestedCount";

async function main() {
  // Parse requestedCount with CLI argument precedence (default 20 for smoke)
  const requestedCount = parseRequestedCount(process.argv, { ...process.env, REQUESTED_COUNT: process.env.REQUESTED_COUNT || "20" });
  const mapTypeFilter = process.env.MAP_TYPE_FILTER?.trim();
  const report = await runCanonicalMapStoryBatch({
    requestedCount,
    operation: "smoke_test",
    mapTypeFilter,
    dryRunOnly: true,
  });
  console.log("=== Smoke Test Batch Report ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Smoke test batch error:", err);
  process.exit(1);
});
