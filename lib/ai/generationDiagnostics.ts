import { ZodError, type ZodType } from "zod";

type GenerationLogMeta = {
  valid?: boolean;
  errors?: string[];
  summary?: object;
  payloadPreview?: object;
  level?: "success" | "warning" | "error";
};

type QuizDeepIssue = {
  questionIndex: number;
  issues: string[];
};

function isDebugEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_DEBUG_GENERATION === "true"
  );
}

function colorForLevel(level: NonNullable<GenerationLogMeta["level"]>) {
  if (level === "success") return "color: #2e7d32; font-weight: 700;";
  if (level === "warning") return "color: #f9a825; font-weight: 700;";
  return "color: #c62828; font-weight: 700;";
}

function summarizePrimitive(value: unknown) {
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  return value;
}

function createPayloadPreview(value: unknown, depth = 0): unknown {
  if (depth > 2) {
    if (Array.isArray(value)) {
      return { type: "array", length: value.length };
    }
    if (value && typeof value === "object") {
      return { type: "object", keys: Object.keys(value as Record<string, unknown>).slice(0, 8) };
    }
    return summarizePrimitive(value);
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 2).map((item) => createPayloadPreview(item, depth + 1)),
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 10);
    return Object.fromEntries(entries.map(([key, item]) => [key, createPayloadPreview(item, depth + 1)]));
  }

  return summarizePrimitive(value);
}

function zodIssuesToStrings(error: ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "root";
    return `${path}: ${issue.message}`;
  });
}

export function logGenerationEvent(stage: string, payload: unknown, meta: GenerationLogMeta = {}) {
  if (!isDebugEnabled()) {
    return;
  }

  const valid = meta.valid ?? !(meta.errors && meta.errors.length > 0);
  const level = meta.level ?? (valid ? "success" : "error");
  const logObject: {
    stage: string;
    valid: boolean;
    errors?: string[];
    summary?: object;
    payloadPreview?: object;
  } = {
    stage,
    valid,
  };

  if (meta.errors && meta.errors.length > 0) {
    logObject.errors = meta.errors;
  }
  if (meta.summary) {
    logObject.summary = meta.summary;
  }
  logObject.payloadPreview = meta.payloadPreview ?? (createPayloadPreview(payload) as object);

  console.groupCollapsed(`%c[GENERATION ${level.toUpperCase()}] ${stage}`, colorForLevel(level));
  console.log(logObject);
  console.groupEnd();
}

export function validateWithDiagnostics<T>(
  schema: ZodType<T> | undefined,
  payload: unknown,
  stage: string,
  summary?: object,
): T {
  try {
    if (!schema || typeof schema.parse !== "function") {
      throw new Error("StoryTemplateSchema is undefined");
    }
    const parsed = schema.parse(payload);
    logGenerationEvent(stage, payload, {
      valid: true,
      level: "success",
      summary,
    });
    return parsed;
  } catch (error) {
    if (error instanceof ZodError) {
      logGenerationEvent(stage, payload, {
        valid: false,
        level: "error",
        errors: zodIssuesToStrings(error),
        summary,
      });
    } else {
      logGenerationEvent(stage, payload, {
        valid: false,
        level: "error",
        errors: [error instanceof Error ? error.message : "Unknown validation error"],
        summary,
      });
    }
    throw error;
  }
}

export function detectFormatViolations(payload: unknown, context: string) {
  const violations: string[] = [];
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  if (record) {
    if (Array.isArray(record.slides) && record.slides.every((item) => typeof item === "string")) {
      violations.push("slides is string[]; expected [{ text }]");
    }
    if (Array.isArray(record.answers)) {
      violations.push("answers[] found; expected options[]");
    }
    if (Array.isArray(record.questions)) {
      violations.push("questions[] found at top level; expected quiz[]");
    }
    if (typeof record.keywords === "string") {
      violations.push("keywords is string; expected string[]");
    }
    if ("question" in record && !("correctAnswerIndex" in record) && Array.isArray(record.options)) {
      violations.push("question item is missing correctAnswerIndex");
    }
    if (Array.isArray(record.quiz)) {
      record.quiz.forEach((item, index) => {
        if (item && typeof item === "object") {
          const quizItem = item as Record<string, unknown>;
          if (Array.isArray(quizItem.answers)) {
            violations.push(`quiz[${index}] uses answers[]; expected options[]`);
          }
          if (!("correctAnswerIndex" in quizItem)) {
            violations.push(`quiz[${index}] is missing correctAnswerIndex`);
          }
        }
      });
    }
  }

  if (violations.length > 0) {
    logGenerationEvent("format.violation", payload, {
      valid: false,
      level: "warning",
      errors: violations,
      summary: { context },
    });
  }
}

export function validateQuizDeep(quiz: unknown) {
  const issues: QuizDeepIssue[] = [];
  if (!Array.isArray(quiz)) {
    logGenerationEvent("quiz.invalid.structure", quiz, {
      valid: false,
      level: "error",
      errors: ["quiz is not an array"],
    });
    return issues;
  }

  quiz.forEach((item, questionIndex) => {
    const itemIssues: string[] = [];
    if (!item || typeof item !== "object") {
      itemIssues.push("question is not an object");
    } else {
      const question = item as {
        question?: unknown;
        options?: unknown;
        correctAnswerIndex?: unknown;
      };
      const text = typeof question.question === "string" ? question.question.trim() : "";
      const options = Array.isArray(question.options)
        ? question.options.map((option) => (typeof option === "string" ? option.trim() : ""))
        : [];
      const correctAnswerIndex =
        typeof question.correctAnswerIndex === "number" ? question.correctAnswerIndex : -1;

      if (!text) {
        itemIssues.push("question is empty");
      }
      if (options.length < 3) {
        itemIssues.push("options length is less than 3");
      }
      if (options.some((option) => option.trim() === "")) {
        itemIssues.push("options contain empty strings");
      }
      if (new Set(options).size !== options.length) {
        itemIssues.push("options contain duplicates");
      }
      if (!Number.isInteger(correctAnswerIndex)) {
        itemIssues.push("correctAnswerIndex is not an integer");
      } else if (correctAnswerIndex < 0 || correctAnswerIndex >= options.length) {
        itemIssues.push("correctAnswerIndex is out of options range");
      }
    }

    if (itemIssues.length > 0) {
      issues.push({ questionIndex, issues: itemIssues });
    }
  });

  if (issues.length > 0) {
    logGenerationEvent("quiz.invalid.structure", quiz, {
      valid: false,
      level: "error",
      errors: issues.map((issue) => `question ${issue.questionIndex}: ${issue.issues.join("; ")}`),
      summary: { invalidQuestions: issues.length, totalQuestions: quiz.length },
    });
  }

  return issues;
}

export function logGenerationOk(summary: {
  book?: string;
  slides?: Record<string, number>;
  quizQuestions?: number;
  keywords?: number;
  [key: string]: unknown;
}) {
  logGenerationEvent("generation.ok", summary, {
    valid: true,
    level: "success",
    summary,
    payloadPreview: summary as object,
  });
}

export function logZodError(stage: string, error: unknown, payload: unknown, summary?: object) {
  if (error instanceof ZodError) {
    logGenerationEvent(stage, payload, {
      valid: false,
      level: "error",
      errors: zodIssuesToStrings(error),
      summary,
    });
    return;
  }

  logGenerationEvent(stage, payload, {
    valid: false,
    level: "error",
    errors: [error instanceof Error ? error.message : "Unknown error"],
    summary,
  });
}
