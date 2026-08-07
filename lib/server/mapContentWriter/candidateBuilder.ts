import {
  CandidateBuilder,
  DB_TABLE_SCHEMAS,
  validateCandidateSchema,
  type SchemaValidationResult,
} from "../ai/schemaLayer.ts";

export type MapStoryCandidate = {
  map_type: string;
  target_id: string;
  content: string;
};

/**
 * Candidate Builder for Map Content Writer.
 * Serializes raw generated output into canonical 3-key Candidate objects (map_type, target_id, content)
 * matching the exact Admin UI & Admin API bulk importer input contract.
 */
export const mapStoryCandidateBuilder = new CandidateBuilder<
  { map_type: string; target_id: string; content: string },
  MapStoryCandidate
>(DB_TABLE_SCHEMAS.map_stories, (raw) => ({
  map_type: raw.map_type,
  target_id: raw.target_id,
  content: raw.content,
}));

/**
 * Validates any candidate against canonical map_stories Importer schema (map_type, target_id, content).
 * Triggers STOP-SCHEMA-01 on schema mismatch.
 */
export function validateMapStoryCandidateSchema(
  candidate: Record<string, unknown>
): SchemaValidationResult {
  return validateCandidateSchema(candidate, DB_TABLE_SCHEMAS.map_stories);
}

export type OpenerDiversityCheckResult = {
  isDiverse: boolean;
  duplicateOpenerCount: number;
  dominantOpener?: string;
  message?: string;
};

/**
 * Batch-level detection of repetitive story opening phrases (STOP-OPENER-MONOCULTURE).
 * Analyzes the first 2 words of each story across a batch.
 * Flags if more than maxAllowedRepetitions (default 2) share the exact same opening phrase.
 */
export function detectOpenerMonoculture(
  contents: string[],
  maxAllowedRepetitions = 2
): OpenerDiversityCheckResult {
  const openerCounts = new Map<string, number>();

  for (const text of contents) {
    const cleanText = text
      .replace(/^[\p{Emoji}\p{Symbol}\uFE0F\u200D\s\p{P}]+/gu, "")
      .trim();
    const words = cleanText.split(/\s+/).slice(0, 2).map((w) => w.toLowerCase());
    if (words.length < 2) continue;

    const openerKey = words.join(" ");
    openerCounts.set(openerKey, (openerCounts.get(openerKey) || 0) + 1);
  }

  let maxCount = 0;
  let dominantOpener = "";

  for (const [opener, count] of openerCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      dominantOpener = opener;
    }
  }

  if (maxCount > maxAllowedRepetitions) {
    return {
      isDiverse: false,
      duplicateOpenerCount: maxCount,
      dominantOpener,
      message: `[STOP-OPENER-MONOCULTURE] ${maxCount} stories in batch start with the exact same phrase "${dominantOpener}". Opener diversity rule violated.`,
    };
  }

  return {
    isDiverse: true,
    duplicateOpenerCount: maxCount,
    dominantOpener,
  };
}

