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
