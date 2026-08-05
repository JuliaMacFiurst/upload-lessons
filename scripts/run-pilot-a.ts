import fs from "fs";
import path from "path";
import { runPilotA } from "../lib/server/mapContentWriter/pilotRunner.ts";

// Simple env loader for .env.local if not already loaded
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

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const useMock = args.includes("--mock");

  let mapType = "river";
  const typeIdx = args.indexOf("--type");
  if (typeIdx !== -1 && args[typeIdx + 1]) {
    mapType = args[typeIdx + 1];
  }

  let limit = 5;
  const limitIdx = args.indexOf("--limit");
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    limit = parseInt(args[limitIdx + 1], 10) || 5;
  }

  console.log("================================================================================");
  console.log("🚀 PILOT A RUNNER v0.1 — MAP CONTENT WRITER WORKSPACE SKILL");
  console.log("================================================================================");
  console.log(`Target Map Type: ${mapType}`);
  console.log(`Limit: ${limit} objects`);
  console.log(`Mock LLM Mode: ${useMock ? "ENABLED" : "DISABLED (Live Model)"}`);
  console.log("--------------------------------------------------------------------------------");

  try {
    const report = await runPilotA({
      mapType,
      limit,
      useMockLlm: useMock,
    });

    console.log("\n--------------------------------------------------------------------------------");
    console.log("✅ PILOT A RUN COMPLETED SUCCESSFULLY!");
    console.log("--------------------------------------------------------------------------------");
    console.log(`Objects Processed: ${report.objectsProcessed}`);
    console.log(`Success Count: ${report.successCount}`);
    console.log(`Failure Count: ${report.failureCount}`);
    console.log(`Execution Time: ${report.executionDurationMs} ms`);
    console.log(`Format Recognized: ${report.validation.isContractTestReport ? "Contract Test Report" : "Candidate JSON"}`);
    console.log(`Raw Response Saved: ${report.rawResponsePath}`);
    console.log(`Human Report Saved: ${report.reportPath}`);
    console.log("================================================================================\n");
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("\n❌ PILOT A RUN FAILED WITH ERROR:");
    console.error(errMsg);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error in Pilot A runner:", err);
  process.exit(1);
});
