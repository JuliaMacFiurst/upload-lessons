import { calculateCost } from "./pricing";
import { estimateTokens } from "./tokenEstimator";

const NAME_CANDIDATE_OUTPUT_TOKENS = 180;
const DESCRIPTION_OUTPUT_TOKENS = 220;

export function buildArtistNameCandidatesPrompt() {
  return [
    "Ты помогаешь детскому образовательному проекту про искусство.",
    "Придумай 8 вариантов имён художников для карточки в админке.",
    "Можно использовать как реальных художников, так и стилистически подходящие имена для детского контента.",
    "Имена должны быть звучными, узнаваемыми или любопытными для ребёнка.",
    "Верни JSON без markdown в формате:",
    '{"candidates":["Имя 1","Имя 2"]}',
  ].join("\n");
}

export function buildArtistDescriptionPrompt(title: string) {
  return [
    "Ты помогаешь детскому образовательному проекту про искусство.",
    `Подготовь короткое и увлекательное описание художника "${title}".`,
    "Тон: дружелюбный, познавательный, понятный детям.",
    "Без сложного академического языка.",
    "Длина: 2-4 предложения.",
    "Верни JSON без markdown в формате:",
    '{"description":"..."}',
  ].join("\n");
}

export function estimateArtistNameCandidatesCost() {
  const prompt = buildArtistNameCandidatesPrompt();
  const inputTokens = estimateTokens(prompt);
  const outputTokens = NAME_CANDIDATE_OUTPUT_TOKENS;

  return {
    inputTokens,
    outputTokens,
    ...calculateCost(inputTokens, outputTokens),
  };
}

export function estimateArtistDescriptionCost(title: string) {
  const prompt = buildArtistDescriptionPrompt(title);
  const inputTokens = estimateTokens(prompt);
  const outputTokens = DESCRIPTION_OUTPUT_TOKENS;

  return {
    inputTokens,
    outputTokens,
    ...calculateCost(inputTokens, outputTokens),
  };
}
