import { estimateTokens } from "./tokenEstimator";
import { calculateCost } from "./pricing";

export const BOOK_SECTION_OUTPUT = {
  plot: 800,
  characters: 400,
  main_idea: 300,
  philosophy: 350,
  conflicts: 350,
  author_message: 300,
  ending_meaning: 350,
  twenty_seconds: 150,
  test: 250,
} as const;

export type BookGenerationSection = keyof typeof BOOK_SECTION_OUTPUT;

export function estimateBookSectionCost(prompt: string, section: BookGenerationSection) {
  const inputTokens = estimateTokens(prompt);
  const outputTokens = BOOK_SECTION_OUTPUT[section];
  const cost = calculateCost(inputTokens, outputTokens);

  return {
    inputTokens,
    outputTokens,
    ...cost,
  };
}

export function estimateFullBookCost(prompts: Partial<Record<BookGenerationSection, string>>) {
  let inputTokens = 0;
  let outputTokens = 0;

  Object.entries(prompts).forEach(([section, prompt]) => {
    if (!prompt) {
      return;
    }
    inputTokens += estimateTokens(prompt);
    outputTokens += BOOK_SECTION_OUTPUT[section as BookGenerationSection];
  });

  return {
    inputTokens,
    outputTokens,
    ...calculateCost(inputTokens, outputTokens),
  };
}

export function estimateBatchBooksCost(books: number, costPerBook: number) {
  return books * costPerBook;
}
