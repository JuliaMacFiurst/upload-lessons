import type { MapStoryCandidate } from "./candidateBuilder.ts";

export type StagedWriteStatus =
  | "CREATED"
  | "SKIPPED_EXISTING"
  | "REJECTED_VALIDATION"
  | "FAILED_WRITE";

export type ItemWriteResult = {
  mapType: string;
  targetId: string;
  status: StagedWriteStatus;
  storyId?: string;
  error?: string;
};

export type BatchWriteSummary = {
  requestedCount: number;
  validatedCount: number;
  createdCount: number;
  skippedCount: number;
  rejectedCount: number;
  failedCount: number;
  items: ItemWriteResult[];
};

export type StagedWriteOptions = {
  dryRunOnly: boolean; // Must be true while Mutation Capability is NO_WRITE
  maxBatchSize?: number; // Max 5 for limited write track
};

/**
 * Staged Admin API Write Client for Map Content Writer.
 * Accepts ONLY candidates that have passed Pre-Write Safety Layer validation.
 * Enforces dry-run mode and batch size limits.
 */
export async function stagedWriteCandidateBatch(
  validatedCandidates: Array<{
    candidate: MapStoryCandidate;
    isValid: boolean;
    stopConditions: string[];
    errors: string[];
  }>,
  options: StagedWriteOptions = { dryRunOnly: true, maxBatchSize: 5 }
): Promise<BatchWriteSummary> {
  const maxBatch = options.maxBatchSize ?? 5;
  const limitedBatch = validatedCandidates.slice(0, maxBatch);

  const results: ItemWriteResult[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let rejectedCount = 0;
  let failedCount = 0;

  for (const item of limitedBatch) {
    const { candidate, isValid, stopConditions, errors } = item;

    if (!isValid) {
      rejectedCount++;
      results.push({
        mapType: candidate.map_type,
        targetId: candidate.target_id,
        status: "REJECTED_VALIDATION",
        error: errors.join("; ") || stopConditions.join(", "),
      });
      continue;
    }

    if (stopConditions.includes("STOP-META-03")) {
      skippedCount++;
      results.push({
        mapType: candidate.map_type,
        targetId: candidate.target_id,
        status: "SKIPPED_EXISTING",
        error: "Story already exists in map_stories",
      });
      continue;
    }

    if (options.dryRunOnly) {
      // DRY-RUN MODE: Simulate creation without DB write
      createdCount++;
      results.push({
        mapType: candidate.map_type,
        targetId: candidate.target_id,
        status: "CREATED",
        error: "DRY-RUN SIMULATION (NO_WRITE mode enforced)",
      });
    } else {
      // REAL WRITE MODE (Requires explicit Mutation Grant & Owner Release)
      failedCount++;
      results.push({
        mapType: candidate.map_type,
        targetId: candidate.target_id,
        status: "FAILED_WRITE",
        error: "Real write requires explicit Mutation Grant from Project Owner.",
      });
    }
  }

  return {
    requestedCount: limitedBatch.length,
    validatedCount: limitedBatch.filter((i) => i.isValid).length,
    createdCount,
    skippedCount,
    rejectedCount,
    failedCount,
    items: results,
  };
}
