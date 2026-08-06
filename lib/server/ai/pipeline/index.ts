import { validateRussianLanguagePurity } from "../languageGuard";
import { calculateConfidenceScore } from "../confidenceScorer";
import { STOP_CONDITIONS_REGISTRY } from "../stopConditions";
import type { ConfidenceScoreBreakdown } from "../types";

export type PipelineStageResult<T = unknown> = {
  stageName: string;
  isSuccess: boolean;
  stopId?: string;
  data?: T;
  error?: string;
};

export type CandidateExecutionOutput<TCandidate = unknown> = {
  isValid: boolean;
  skillId: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  candidate?: TCandidate;
  confidenceScore: ConfidenceScoreBreakdown;
  stopConditionsTriggered: string[];
  stagesRun: string[];
  error?: string;
};

/**
 * Universal AI Pipeline Framework Stage Runners
 */
export const AIPipelineFramework = {
  // Stage 3: Research
  async executeResearchStage<TFacts>(
    targetId: string,
    fetchFactsFn: (id: string) => Promise<TFacts>
  ): Promise<PipelineStageResult<TFacts>> {
    try {
      const facts = await fetchFactsFn(targetId);
      return { stageName: "3. Research", isSuccess: true, data: facts };
    } catch (err: unknown) {
      return {
        stageName: "3. Research",
        isSuccess: false,
        stopId: "STOP-RESEARCH-01",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  // Stage 5: Generation
  async executeGenerationStage<TDraft>(
    generateFn: () => Promise<TDraft>
  ): Promise<PipelineStageResult<TDraft>> {
    try {
      const draft = await generateFn();
      return { stageName: "5. Writer", isSuccess: true, data: draft };
    } catch (err: unknown) {
      return {
        stageName: "5. Writer",
        isSuccess: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  // Stage 8: Quality & Language Guard
  executeLanguageGuardStage(
    content: string,
    customAllowlist: string[] = []
  ): PipelineStageResult<{ content: string }> {
    const purity = validateRussianLanguagePurity(content, customAllowlist);
    if (!purity.isValid) {
      return {
        stageName: "8. Kids Editor & Language Guard",
        isSuccess: false,
        stopId: "STOP-LANG-01",
        error: purity.message,
      };
    }
    return {
      stageName: "8. Kids Editor & Language Guard",
      isSuccess: true,
      data: { content },
    };
  },

  // Stage 9: Definition of Done & Quality Gate
  executeDoDStage(
    dodChecks: Array<{ name: string; passed: boolean }>
  ): PipelineStageResult<{ allPassed: boolean }> {
    const failedChecks = dodChecks.filter((c) => !c.passed);
    if (failedChecks.length > 0) {
      return {
        stageName: "9. Definition of Done",
        isSuccess: false,
        stopId: "STOP-DOD-01",
        error: `DoD failed: ${failedChecks.map((f) => f.name).join(", ")}`,
      };
    }
    return {
      stageName: "9. Definition of Done",
      isSuccess: true,
      data: { allPassed: true },
    };
  },

  // Stage Confidence Score Calculation
  executeConfidenceStage(params: {
    hasLevel1Sources: boolean;
    sourceCount: number;
    hasAllowlistLatinTokens: boolean;
    hasLanguageViolation: boolean;
    dodPassed: boolean;
    retriesUsed: number;
    triggeredStopConditions: string[];
  }): ConfidenceScoreBreakdown {
    return calculateConfidenceScore(params);
  },
};
