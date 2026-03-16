import { calculateCost } from "./pricing";
import { estimateTokens } from "./tokenEstimator";

export const STORY_OUTPUT = {
  intro: 60,
  journey: 60,
  problem: 60,
  solution: 60,
  ending: 60,
} as const;

export function estimateStoryVariantCost(prompt: string) {
  const inputTokens = estimateTokens(prompt);
  const outputTokens = 300;

  return {
    inputTokens,
    outputTokens,
    ...calculateCost(inputTokens, outputTokens),
  };
}

export function estimateFullStoryCost(prompt: string) {
  const variant = estimateStoryVariantCost(prompt);

  return {
    inputTokens: variant.inputTokens * 7,
    outputTokens: variant.outputTokens * 7,
    usd: variant.usd * 7,
    ils: variant.ils * 7,
  };
}
