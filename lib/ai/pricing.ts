export const GEMINI_PRICING = {
  input_per_1k: 0.00035,
  output_per_1k: 0.00105,
} as const;

export const USD_TO_ILS = 3.7;

export function calculateCost(inputTokens: number, outputTokens: number) {
  const inputCost = (inputTokens / 1000) * GEMINI_PRICING.input_per_1k;
  const outputCost = (outputTokens / 1000) * GEMINI_PRICING.output_per_1k;
  const usd = inputCost + outputCost;

  return {
    usd,
    ils: usd * USD_TO_ILS,
  };
}
