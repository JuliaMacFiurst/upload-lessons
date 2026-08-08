// scripts/generate_batch.ts – wrapper to run a generation batch
import { runCanonicalMapStoryBatch } from "../lib/server/mapContentWriter/batchRunner";
import { parseRequestedCount } from "./parseRequestedCount";

async function main() {
  // Parse requestedCount with CLI argument precedence
  const requestedCount = parseRequestedCount(process.argv, process.env);

  const mapTypeFilter = process.env.MAP_TYPE_FILTER?.trim();
  const report = await runCanonicalMapStoryBatch({
    requestedCount,
    operation: "generation",
    mapTypeFilter,
  });
  console.log("=== Generation Batch Report ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Batch generation error:", err);
  process.exit(1);
});
