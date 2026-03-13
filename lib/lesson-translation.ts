export const NON_TRANSLATABLE_STEP_FIELDS = [
  "type",
  "coordinates",
  "brush",
  "tool",
  "layer",
  "id",
] as const;

const DEFAULT_TRANSLATABLE_LESSON_FIELDS = [
  "title",
  "subtitle",
  "hint",
  "frank_comment",
] as const;

type LessonStep = Record<string, unknown> & {
  text?: string | null;
  frank?: string | null;
};

export type LessonJson = Record<string, unknown> & {
  steps: LessonStep[];
};

export type ExtractedTranslationPayload = {
  steps?: Array<{ text: string }>;
  steps_texts?: string[];
  steps_frank?: string[];
} & {
  [key: string]: string | string[] | Array<{ text: string }> | undefined;
};

type TranslatedPayload = {
  steps?: Array<{ text: string }>;
  steps_texts?: string[];
  steps_frank?: string[];
} & {
  [key: string]: string | string[] | Array<{ text: string }> | undefined;
};

export type TranslationValidationResult = {
  valid: boolean;
  errors: string[];
};

export type TranslationAttemptResult =
  | {
      ok: true;
      attempts: number;
      validation: TranslationValidationResult;
      translatedPayload: TranslatedPayload;
      mergedLesson: LessonJson;
      translationRecord: ExtractedTranslationPayload;
    }
  | {
      ok: false;
      attempts: number;
      lastError: string;
      validation?: TranslationValidationResult;
    };

export type TranslateLessonWithRetriesInput = {
  lesson: LessonJson;
  sourceLanguage: string;
  targetLanguage: string;
  maxRetries?: number;
  translatableLessonFields?: string[];
  // Should return only raw model output text (JSON string).
  translateFn: (args: { prompt: string; payload: string; attempt: number }) => Promise<string>;
};

const SAFETY_RULES_BLOCK = `Add an additional safety rule for lesson translations.

Lessons contain a steps JSON structure stored in the database.

This structure must NEVER be modified.

Only the value of "text" may be translated.

Fields that must NEVER change:
type
coordinates
brush
tool
layer
id

SAFE JSON TRANSLATION LOGIC

Before sending JSON to the AI model:
1. Parse the lesson JSON.
2. Extract only translatable fields.

AFTER TRANSLATION

After receiving the translated JSON:
1. Validate JSON syntax.
2. Ensure the number of steps matches the original.
3. Merge translated "text" values back into the original steps structure.

VALIDATION RULES

Before saving verify:
step_count_original === step_count_translated

If mismatch occurs:
retry translation

Maximum retries:
3

If still invalid:
skip lesson and log error

JSON SAFETY

Return JSON only.
Do not include explanations.
Do not include markdown.
Do not include comments.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildLessonTranslationPrompt(args: {
  sourceLanguage: string;
  targetLanguage: string;
}): string {
  return [
    `Translate lesson content from ${args.sourceLanguage} to ${args.targetLanguage}.`,
    "Translate only human-readable values.",
    SAFETY_RULES_BLOCK,
  ].join("\n\n");
}

export function extractTranslatableLessonPayload(args: {
  lesson: LessonJson;
  translatableLessonFields?: string[];
}): ExtractedTranslationPayload {
  const { lesson } = args;
  const fields = args.translatableLessonFields ?? [...DEFAULT_TRANSLATABLE_LESSON_FIELDS];

  if (!Array.isArray(lesson.steps)) {
    throw new Error("Invalid lesson JSON: `steps` must be an array.");
  }

  const collectedText: string[] = [];
  const collectedFrank: string[] = [];
  for (const [index, step] of lesson.steps.entries()) {
    if (!isRecord(step)) {
      throw new Error(`Invalid lesson JSON: step at index ${index} is not an object.`);
    }
    if ("frank" in step && typeof step.frank === "string") {
      collectedFrank.push(step.frank.trim());
      continue;
    }
    if ("text" in step && typeof step.text === "string") {
      collectedText.push(step.text.trim());
      continue;
    }
    // Preserve positional safety for empty strings if a step has no translatable field.
    collectedText.push("");
  }

  const extracted: ExtractedTranslationPayload = {};
  if (collectedFrank.length > 0) {
    extracted.steps_frank = collectedFrank;
  } else {
    extracted.steps_texts = collectedText;
    // Backward compatibility for older callers expecting `steps`.
    extracted.steps = collectedText.map((text) => ({ text }));
  }

  for (const field of fields) {
    const value = lesson[field];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        extracted[field as keyof ExtractedTranslationPayload] = trimmed;
      }
    }
  }

  return extracted;
}

export function parseTranslatedPayload(raw: string): TranslatedPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON returned by model.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Translated payload must be a JSON object.");
  }
  const parsedRecord = parsed as Record<string, unknown>;

  const result: TranslatedPayload = {};
  const hasSteps = Array.isArray(parsedRecord.steps);
  const hasStepsTexts = Array.isArray(parsedRecord.steps_texts);
  const hasStepsFrank = Array.isArray(parsedRecord.steps_frank);
  if (!hasSteps && !hasStepsTexts && !hasStepsFrank) {
    throw new Error(
      "Translated payload must contain one of: `steps`, `steps_texts`, `steps_frank`.",
    );
  }

  if (hasSteps) {
    const translatedSteps = (parsedRecord.steps as unknown[]).map((step, index) => {
      if (!isRecord(step) || typeof step.text !== "string") {
        throw new Error(
          `Translated step at index ${index} must be an object with string \`text\`.`,
        );
      }
      return { text: step.text };
    });
    result.steps = translatedSteps;
    result.steps_texts = translatedSteps.map((step) => step.text);
  }

  if (hasStepsTexts) {
    const stepsTexts = (parsedRecord.steps_texts as unknown[]).map((value, index) => {
      if (typeof value !== "string") {
        throw new Error(`Translated steps_texts at index ${index} must be a string.`);
      }
      return value;
    });
    result.steps_texts = stepsTexts;
    if (!result.steps) {
      result.steps = stepsTexts.map((text) => ({ text }));
    }
  }

  if (hasStepsFrank) {
    const stepsFrank = (parsedRecord.steps_frank as unknown[]).map((value, index) => {
      if (typeof value !== "string") {
        throw new Error(`Translated steps_frank at index ${index} must be a string.`);
      }
      return value;
    });
    result.steps_frank = stepsFrank;
  }

  for (const [key, value] of Object.entries(parsedRecord)) {
    if (key === "steps" || key === "steps_texts" || key === "steps_frank") {
      continue;
    }
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

export function validateLessonTranslation(args: {
  original: LessonJson;
  translated: TranslatedPayload;
  requiredLessonFields?: string[];
}): TranslationValidationResult {
  const errors: string[] = [];
  const requiredFields = args.requiredLessonFields ?? ["steps"];

  if (!Array.isArray(args.original.steps)) {
    errors.push("Original lesson is invalid: `steps` must be an array.");
  }

  const translatedStepsCount = Array.isArray(args.translated.steps_frank)
    ? args.translated.steps_frank.length
    : Array.isArray(args.translated.steps_texts)
      ? args.translated.steps_texts.length
      : Array.isArray(args.translated.steps)
        ? args.translated.steps.length
        : -1;

  if (translatedStepsCount < 0) {
    errors.push(
      "Translated lesson is invalid: missing steps array (`steps`, `steps_texts`, or `steps_frank`).",
    );
  }

  if (args.original.steps.length !== translatedStepsCount) {
    errors.push(
      `Step count mismatch: original=${args.original.steps.length}, translated=${translatedStepsCount}.`,
    );
  }

  for (const field of requiredFields) {
    if (field === "steps") {
      continue;
    }
    if (typeof args.translated[field] !== "string") {
      errors.push(`Missing required translated field: \`${field}\`.`);
    }
  }

  if (Array.isArray(args.translated.steps_frank)) {
    args.translated.steps_frank.forEach((step, index) => {
      if (typeof step !== "string") {
        errors.push(`Missing translated frank text for step ${index}.`);
      }
    });
  } else if (Array.isArray(args.translated.steps_texts)) {
    args.translated.steps_texts.forEach((step, index) => {
      if (typeof step !== "string") {
        errors.push(`Missing translated text for step ${index}.`);
      }
    });
  } else if (Array.isArray(args.translated.steps)) {
    args.translated.steps.forEach((step, index) => {
      if (typeof step.text !== "string") {
        errors.push(`Missing translated text for step ${index}.`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function mergeTranslatedStepText(args: {
  original: LessonJson;
  translated: TranslatedPayload;
}): LessonJson {
  const translatedFrank = Array.isArray(args.translated.steps_frank)
    ? args.translated.steps_frank
    : null;
  const translatedText = Array.isArray(args.translated.steps_texts)
    ? args.translated.steps_texts
    : Array.isArray(args.translated.steps)
      ? args.translated.steps.map((step) => step.text)
      : [];

  const mergedSteps = args.original.steps.map((step, index) => ({
    ...step,
    ...(translatedFrank
      ? { frank: translatedFrank[index] ?? "" }
      : { text: translatedText[index] ?? "" }),
  }));

  return {
    ...args.original,
    steps: mergedSteps,
  };
}

export function buildTranslationRecord(args: {
  translated: TranslatedPayload;
  translatableLessonFields?: string[];
}): ExtractedTranslationPayload {
  const fields = args.translatableLessonFields ?? [...DEFAULT_TRANSLATABLE_LESSON_FIELDS];
  const record: ExtractedTranslationPayload = {};
  if (Array.isArray(args.translated.steps_frank)) {
    record.steps_frank = [...args.translated.steps_frank];
  } else {
    const stepsTexts = Array.isArray(args.translated.steps_texts)
      ? args.translated.steps_texts
      : Array.isArray(args.translated.steps)
        ? args.translated.steps.map((step) => step.text)
        : [];
    record.steps_texts = [...stepsTexts];
    record.steps = stepsTexts.map((text) => ({ text }));
  }

  for (const field of fields) {
    if (typeof args.translated[field] === "string") {
      record[field as keyof ExtractedTranslationPayload] = args.translated[field] as string;
    }
  }

  return record;
}

export async function translateLessonWithRetries(
  args: TranslateLessonWithRetriesInput,
): Promise<TranslationAttemptResult> {
  const maxRetries = args.maxRetries ?? 3;
  const prompt = buildLessonTranslationPrompt({
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
  });
  const extracted = extractTranslatableLessonPayload({
    lesson: args.lesson,
    translatableLessonFields: args.translatableLessonFields,
  });
  const payload = JSON.stringify(extracted);

  let lastError = "Unknown translation error";
  let lastValidation: TranslationValidationResult | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await args.translateFn({ prompt, payload, attempt });
      const translated = parseTranslatedPayload(raw);
      const validation = validateLessonTranslation({
        original: args.lesson,
        translated,
      });

      if (!validation.valid) {
        lastValidation = validation;
        lastError = validation.errors.join(" ");
        continue;
      }

      const mergedLesson = mergeTranslatedStepText({
        original: args.lesson,
        translated,
      });
      const translationRecord = buildTranslationRecord({
        translated,
        translatableLessonFields: args.translatableLessonFields,
      });

      return {
        ok: true,
        attempts: attempt,
        validation,
        translatedPayload: translated,
        mergedLesson,
        translationRecord,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: false,
    attempts: maxRetries,
    lastError,
    validation: lastValidation,
  };
}
