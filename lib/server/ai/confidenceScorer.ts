import type { ConfidenceScoreBreakdown } from "./types";

export type ConfidenceInputParams = {
  hasLevel1Sources: boolean;
  sourceCount: number;
  hasAllowlistLatinTokens: boolean;
  hasLanguageViolation: boolean;
  dodPassed: boolean;
  retriesUsed: number;
  triggeredStopConditions: string[];
};

/**
 * Deterministic Production Confidence Score Engine.
 * Calculates score: CS = S_fact * S_lang * S_dod * S_retry
 */
export function calculateConfidenceScore(
  params: ConfidenceInputParams
): ConfidenceScoreBreakdown {
  const {
    hasLevel1Sources,
    sourceCount,
    hasAllowlistLatinTokens,
    hasLanguageViolation,
    dodPassed,
    retriesUsed,
    triggeredStopConditions,
  } = params;

  // 1. If any blocking STOP condition was triggered, confidence is 0%
  if (triggeredStopConditions.length > 0 || !dodPassed) {
    return {
      factualScore: 0,
      languageScore: 0,
      dodScore: 0,
      retryPenalty: 0,
      finalScorePercentage: 0,
      band: "REJECTED",
    };
  }

  // 2. Factual Score calculation
  let factualScore = 1.0;
  if (!hasLevel1Sources) {
    factualScore = 0.85;
  }
  if (sourceCount < 2) {
    factualScore *= 0.9;
  }

  // 3. Language Score calculation
  let languageScore = 1.0;
  if (hasLanguageViolation) {
    languageScore = 0.0;
  } else if (hasAllowlistLatinTokens) {
    languageScore = 0.95;
  }

  // 4. DoD Score
  const dodScore = dodPassed ? 1.0 : 0.0;

  // 5. Retry penalty
  let retryPenalty = 1.0;
  if (retriesUsed === 1) {
    retryPenalty = 0.92;
  } else if (retriesUsed > 1) {
    retryPenalty = 0.8;
  }

  // Calculate final percentage (0–100)
  const rawScore = factualScore * languageScore * dodScore * retryPenalty;
  const finalScorePercentage = Math.round(rawScore * 100);

  let band: ConfidenceScoreBreakdown["band"] = "LOW";
  if (finalScorePercentage >= 95) {
    band = "HIGH";
  } else if (finalScorePercentage >= 85) {
    band = "MEDIUM";
  } else if (finalScorePercentage > 0) {
    band = "LOW";
  } else {
    band = "REJECTED";
  }

  return {
    factualScore,
    languageScore,
    dodScore,
    retryPenalty,
    finalScorePercentage,
    band,
  };
}
