import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCandidateSchema, DB_TABLE_SCHEMAS } from "../ai/schemaLayer.ts";
import { validateRussianLanguagePurity } from "../ai/languageGuard.ts";
import { validateOpenCTA } from "./ctaValidator.ts";
import {
  mapStoryCandidateBuilder,
  type MapStoryCandidate,
} from "./candidateBuilder.ts";

export type PreWriteSafetyResult = {
  isValid: boolean;
  candidate?: MapStoryCandidate;
  stopConditions: string[];
  errors: string[];
};

/**
 * Universal Pre-Write Safety Layer for Map Content Writer.
 * Runs 6 mandatory safety checks before any Admin API write request:
 * 1. Schema Validation (STOP-SCHEMA-01)
 * 2. Immutable Target Contract (STOP-META-01)
 * 3. Target Existence in map_targets (STOP-META-02)
 * 4. Duplicate Check in map_stories (STOP-META-03)
 * 5. Russian Language Purity (STOP-LANG-01)
 * 6. Definition of Done Quality Checks (STOP-DOD-01)
 */
export async function validateMapStoryBeforeWrite(
  candidateInput: Record<string, unknown>,
  expectedTarget: { target_id: string; map_type: string },
  supabase: SupabaseClient,
  customAllowlist: string[] = []
): Promise<PreWriteSafetyResult> {
  const stopConditions: string[] = [];
  const errors: string[] = [];

  // 1. Candidate Schema Guard (STOP-SCHEMA-01)
  const schemaRes = validateCandidateSchema(candidateInput, DB_TABLE_SCHEMAS.map_stories);
  if (!schemaRes.isValid) {
    stopConditions.push("STOP-SCHEMA-01");
    if (schemaRes.message) errors.push(schemaRes.message);
    return { isValid: false, stopConditions, errors };
  }

  const mapType = String(candidateInput.map_type ?? "");
  const targetId = String(candidateInput.target_id ?? "");
  const content = String(candidateInput.content ?? "");

  // 2. Immutable Target Contract Guard (STOP-META-01)
  if (targetId !== expectedTarget.target_id || mapType !== expectedTarget.map_type) {
    stopConditions.push("STOP-META-01");
    errors.push(
      `[STOP-META-01] Target contract mismatch: expected (${expectedTarget.map_type}, "${expectedTarget.target_id}"), got (${mapType}, "${targetId}")`
    );
    return { isValid: false, stopConditions, errors };
  }

  // 3. Target Existence Guard in map_targets (STOP-META-02)
  const { data: targetRow, error: targetError } = await supabase
    .from("map_targets")
    .select("map_type,target_id")
    .eq("map_type", mapType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (targetError || !targetRow) {
    stopConditions.push("STOP-META-02");
    errors.push(
      `[STOP-META-02] Target (${mapType}, "${targetId}") does not exist in map_targets table.`
    );
    return { isValid: false, stopConditions, errors };
  }

  // 4. Duplicate Guard in map_stories (STOP-META-03)
  const { data: existingStory, error: storyError } = await supabase
    .from("map_stories")
    .select("id")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (storyError) {
    errors.push(`Failed to check existing story: ${storyError.message}`);
    return { isValid: false, stopConditions, errors };
  }

  if (existingStory?.id) {
    stopConditions.push("STOP-META-03");
    errors.push(
      `[STOP-META-03] Story already exists in map_stories for (${mapType}, "${targetId}", language='ru'). Direct overwrite is FORBIDDEN.`
    );
    return { isValid: false, stopConditions, errors };
  }

  // 5. Russian Language Guard (STOP-LANG-01)
  const langRes = validateRussianLanguagePurity(content, customAllowlist);
  if (!langRes.isValid) {
    stopConditions.push("STOP-LANG-01");
    if (langRes.message) errors.push(langRes.message);
    return { isValid: false, stopConditions, errors };
  }

  // 6. Quality Guard & DoD checks (STOP-DOD-01)
  const ctaRes = validateOpenCTA(content);
  if (!ctaRes.isValid) {
    stopConditions.push("STOP-DOD-01");
    if (ctaRes.message) errors.push(ctaRes.message);
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 80 || wordCount > 140) {
    stopConditions.push("STOP-DOD-01");
    errors.push(
      `[STOP-DOD-01] Word count is ${wordCount} (outside hard range 80–140 words).`
    );
  }

  const sentences = content.split(/(?<=[.!?])\s+/);
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  sentences.forEach((sentence, sIdx) => {
    const matches = sentence.match(emojiRegex);
    if (sIdx > 0 && matches && matches.length > 0) {
      stopConditions.push("STOP-DOD-01");
      errors.push(`[STOP-DOD-01] Emoji found in sentence ${sIdx + 1} (allowed ONLY in sentence 1).`);
    }
    if (sIdx === 0 && matches && matches.length > 1) {
      stopConditions.push("STOP-DOD-01");
      errors.push(`[STOP-DOD-01] ${matches.length} emojis found in sentence 1 (maximum 1 emoji allowed).`);
    }
  });

  if (stopConditions.length > 0) {
    return { isValid: false, stopConditions, errors };
  }

  const built = mapStoryCandidateBuilder.buildAndValidate({
    map_type: mapType,
    target_id: targetId,
    content: content,
  });

  return {
    isValid: true,
    candidate: built.candidate,
    stopConditions: [],
    errors: [],
  };
}
