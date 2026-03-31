import { calculateCost } from "./pricing";
import { buildMapTargetStoryPrompt } from "./mapTargetPrompts";
import { estimateTokens } from "./tokenEstimator";

export const MAP_TARGET_GENERATION_MODEL = "gemini-2.5-flash";
const MAP_TARGET_OUTPUT_TOKENS = 260;

export function estimateMapTargetStoryCost(mapType: string, targetId: string) {
  const prompt = buildMapTargetStoryPrompt({ mapType, targetId });
  const inputTokens = estimateTokens(prompt);
  const outputTokens = MAP_TARGET_OUTPUT_TOKENS;

  return {
    model: MAP_TARGET_GENERATION_MODEL,
    prompt,
    inputTokens,
    outputTokens,
    ...calculateCost(inputTokens, outputTokens),
  };
}

export function estimateMapTargetBatchCost(targets: Array<{ map_type: string; target_id: string }>) {
  return targets.reduce(
    (acc, target) => {
      const current = estimateMapTargetStoryCost(target.map_type, target.target_id);
      return {
        model: current.model,
        inputTokens: acc.inputTokens + current.inputTokens,
        outputTokens: acc.outputTokens + current.outputTokens,
        usd: acc.usd + current.usd,
        ils: acc.ils + current.ils,
      };
    },
    {
      model: MAP_TARGET_GENERATION_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      usd: 0,
      ils: 0,
    },
  );
}
