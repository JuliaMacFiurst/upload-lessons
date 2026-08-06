export type CtaValidationResult = {
  isValid: boolean;
  stopId?: "STOP-DOD-01";
  message?: string;
};

const CLOSED_CTA_PATTERNS = [
  /^\s*хочешь(\s+|$|[.,!?])/i,
  /^\s*хотел(\s+|$|[.,!?])/i,
  /^\s*хотела(\s+|$|[.,!?])/i,
  /^\s*хотели(\s+|$|[.,!?])/i,
  /^\s*нравится(\s+|$|[.,!?])/i,
  /^\s*бывал(\s+|$|[.,!?])/i,
  /^\s*бывала(\s+|$|[.,!?])/i,
  /^\s*видел(\s+|$|[.,!?])/i,
  /^\s*видела(\s+|$|[.,!?])/i,
  /^\s*знаешь(\s+|$|[.,!?])/i,
  /^\s*помнишь(\s+|$|[.,!?])/i,
];

const OPEN_QUESTION_PATTERNS = [
  /^\s*как(\s+|$|[.,!?])/i,
  /^\s*что(\s+|$|[.,!?])/i,
  /^\s*почему(\s+|$|[.,!?])/i,
  /^\s*каким(\s+|$|[.,!?])/i,
  /^\s*какой(\s+|$|[.,!?])/i,
  /^\s*какая(\s+|$|[.,!?])/i,
  /^\s*какое(\s+|$|[.,!?])/i,
  /^\s*какие(\s+|$|[.,!?])/i,
  /^\s*каких(\s+|$|[.,!?])/i,
  /^\s*какую(\s+|$|[.,!?])/i,
  /^\s*какого(\s+|$|[.,!?])/i,
  /^\s*каком(\s+|$|[.,!?])/i,
  /^\s*какому(\s+|$|[.,!?])/i,
  /^\s*зачем(\s+|$|[.,!?])/i,
  /^\s*чем(\s+|$|[.,!?])/i,
  /^\s*чему(\s+|$|[.,!?])/i,
  /^\s*где(\s+|$|[.,!?])/i,
  /^\s*куда(\s+|$|[.,!?])/i,
  /^\s*откуда(\s+|$|[.,!?])/i,
];

/**
 * Validates that the story CTA is a proper open-ended question encouraging thought/reasoning.
 * Blocks closed yes/no questions ("Хочешь...?", "Хотел бы...?").
 */
export function validateOpenCTA(content: string): CtaValidationResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      isValid: false,
      stopId: "STOP-DOD-01",
      message: "[STOP-DOD-01] Story content is empty.",
    };
  }

  // Split into sentences
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lastSentence = sentences[sentences.length - 1]?.trim() ?? "";

  if (!lastSentence.endsWith("?")) {
    return {
      isValid: false,
      stopId: "STOP-DOD-01",
      message: "[STOP-DOD-01] Last sentence must be a question ending with '?'.",
    };
  }

  // Check closed question patterns
  for (const pattern of CLOSED_CTA_PATTERNS) {
    if (pattern.test(lastSentence)) {
      return {
        isValid: false,
        stopId: "STOP-DOD-01",
        message: `[STOP-DOD-01] Closed CTA question detected ("${lastSentence}"). Question must be open-ended, encouraging reasoning.`,
      };
    }
  }

  // Check open question patterns
  const isStartOpen = OPEN_QUESTION_PATTERNS.some((p) => p.test(lastSentence));
  const hasOpenPhrases =
    /как ты думаешь/i.test(lastSentence) ||
    /как думаешь/i.test(lastSentence) ||
    /что помогает/i.test(lastSentence) ||
    /каким образом/i.test(lastSentence);

  if (!isStartOpen && !hasOpenPhrases) {
    return {
      isValid: false,
      stopId: "STOP-DOD-01",
      message: `[STOP-DOD-01] CTA question ("${lastSentence}") does not start with an open question word (как, почему, что, каким образом, каких, etc.).`,
    };
  }

  return { isValid: true };
}
