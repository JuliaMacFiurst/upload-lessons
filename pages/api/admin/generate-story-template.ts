import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  detectFormatViolations,
  logGenerationEvent,
  logZodError,
  validateWithDiagnostics,
} from "../../../lib/ai/generationDiagnostics";
import {
  canonicalStoryTemplateSchema,
  strictGeneratedStoryTemplateSchema,
  type StrictGeneratedStoryTemplate,
} from "../../../lib/books/contracts";
import { validateStoryTemplateSource } from "../../../lib/story/story-service";
import {
  GeminiPipelineError,
  buildStoryTemplatePrompt,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  title: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  ageGroup: z.string().trim().optional().nullable(),
  templateName: z.string().trim().optional().nullable(),
  templateSlug: z.string().trim().optional().nullable(),
});

const responseSchema = canonicalStoryTemplateSchema;

type StoryTemplateResponse = z.infer<typeof responseSchema>;
type StoryTemplateStepResponse = StoryTemplateResponse["steps"][number];

const DEFAULT_STEP_QUESTIONS: Record<Exclude<StrictGeneratedStoryTemplate["steps"][number]["step_key"], "narration">, string> = {
  intro: "С чего началось приключение?",
  journey: "Куда герой отправляется дальше?",
  problem: "Какая проблема появляется в пути?",
  solution: "Как герой решает проблему?",
  ending: "Чем заканчивается история?",
};

function flattenStrictGeneratedStoryTemplate(
  input: StrictGeneratedStoryTemplate,
): StoryTemplateResponse {
  const [narrationStep, introStep, journeyStep, problemStep, solutionStep, endingStep] = input.steps;
  const interactiveSteps = [introStep, journeyStep, problemStep, solutionStep, endingStep];

  return {
    title: input.title.trim(),
    steps: [
      {
        step_key: "narration",
        question: narrationStep.question.trim(),
        choices: [],
      },
      ...interactiveSteps.map((step) => ({
        step_key: step.step_key,
        question: step.question.trim() || DEFAULT_STEP_QUESTIONS[step.step_key],
        choices: step.choices.map((choice) => ({
          text: choice.text.trim(),
          short_text: choice.short_text.trim(),
        })),
      })),
    ],
    fragments: interactiveSteps.flatMap((step) =>
      step.choices.flatMap((choice, choiceIndex) =>
        choice.fragments.map((fragment) => ({
          step_key: step.step_key,
          choice_index: choiceIndex,
          text: fragment.text.trim(),
        })),
      ),
    ),
    twists: input.twists.map((twist) => ({
      text: twist.text.trim(),
    })),
  };
}

function trimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRawChoice(choice: unknown) {
  if (!choice || typeof choice !== "object") {
    return null;
  }
  const record = choice as Record<string, unknown>;
  const text = trimString(record.text);
  const short_text = trimString(record.short_text);
  const rawFragments = Array.isArray(record.fragments) ? record.fragments : [];
  const fragments = rawFragments
    .map((fragment) => {
      if (!fragment || typeof fragment !== "object") {
        return null;
      }
      const fragmentText = trimString((fragment as Record<string, unknown>).text);
      return fragmentText ? { text: fragmentText } : null;
    })
    .filter((fragment): fragment is { text: string } => fragment !== null);

  if (!text || !short_text || fragments.length === 0) {
    return null;
  }

  return { text, short_text, fragments };
}

function normalizeRawStep(step: unknown): StoryTemplateStepResponse | null {
  if (!step || typeof step !== "object") {
    return null;
  }

  const record = step as Record<string, unknown>;
  const step_key = trimString(record.step_key);

  if (step_key === "narration") {
    return {
      step_key: "narration",
      question: trimString(record.question),
      choices: [],
    };
  }

  if (!["intro", "journey", "problem", "solution", "ending"].includes(step_key)) {
    return null;
  }

  const choices = (Array.isArray(record.choices) ? record.choices : [])
    .map(normalizeRawChoice)
    .filter((choice): choice is NonNullable<ReturnType<typeof normalizeRawChoice>> => choice !== null)
    .slice(0, 3)
    .map((choice) => ({
      text: choice.text,
      short_text: choice.short_text,
    }));

  return {
    step_key: step_key as Exclude<StoryTemplateStepResponse["step_key"], "narration">,
    question: trimString(record.question) || DEFAULT_STEP_QUESTIONS[step_key as keyof typeof DEFAULT_STEP_QUESTIONS],
    choices,
  };
}

function fallbackStoryTemplateResponse(
  payload: unknown,
  promptInput: { title: string; templateName: string },
) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const normalizedSteps = rawSteps.map(normalizeRawStep).filter((step): step is StoryTemplateStepResponse => step !== null);
  const narrationRecord =
    rawSteps.find(
      (step) => step && typeof step === "object" && trimString((step as Record<string, unknown>).step_key) === "narration",
    ) ?? null;
  const narrationStep = narrationRecord && typeof narrationRecord === "object"
    ? (narrationRecord as Record<string, unknown>)
    : null;

  const steps: StoryTemplateResponse["steps"] = [
    normalizedSteps.find((step) => step.step_key === "narration") ?? {
      step_key: "narration",
      question: "",
      choices: [],
    },
    ...(["intro", "journey", "problem", "solution", "ending"] as const).map((stepKey) =>
      normalizedSteps.find((step) => step.step_key === stepKey) ?? {
        step_key: stepKey,
        question: DEFAULT_STEP_QUESTIONS[stepKey],
        choices: [],
      },
    ),
  ];

  const rawFragments = rawSteps.flatMap((step) => {
    if (!step || typeof step !== "object") {
      return [];
    }
    const stepRecord = step as Record<string, unknown>;
    const stepKey = trimString(stepRecord.step_key);
    if (!["intro", "journey", "problem", "solution", "ending"].includes(stepKey)) {
      return [];
    }
    const rawChoices = Array.isArray(stepRecord.choices) ? stepRecord.choices : [];
    return rawChoices.flatMap((choice, choiceIndex) => {
      const normalizedChoice = normalizeRawChoice(choice);
      if (!normalizedChoice) {
        return [];
      }
      return normalizedChoice.fragments.map((fragment) => ({
        step_key: stepKey as Exclude<StoryTemplateStepResponse["step_key"], "narration">,
        choice_index: choiceIndex,
        text: fragment.text,
      }));
    });
  });

  const rawTwists = Array.isArray(record.twists) ? record.twists : [];
  const twists = rawTwists
    .map((twist) => {
      if (!twist || typeof twist !== "object") {
        return null;
      }
      const text = trimString((twist as Record<string, unknown>).text);
      return text ? { text } : null;
    })
    .filter((twist): twist is { text: string } => twist !== null)
    .slice(0, 3);

  return {
    title: trimString(record.title) || promptInput.title || promptInput.templateName,
    steps,
    fragments: rawFragments,
    twists,
    narrationMeta: {
      question: trimString(narrationStep?.question),
      narration: trimString(narrationStep?.narration),
    },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const promptInput = {
      title: body.title?.trim() || "",
      description: body.description ?? "",
      ageGroup: body.ageGroup ?? "",
      templateName: body.templateName?.trim() || "Новый шаблон истории",
      templateSlug: body.templateSlug?.trim() || "novyj-shablon-istorii",
    };
    const generated = await runGeminiJsonPrompt<unknown>(buildStoryTemplatePrompt(promptInput));
    logGenerationEvent("raw.story-template.route", generated, {
      valid: true,
      level: "success",
      summary: { title: promptInput.title || promptInput.templateName },
    });
    detectFormatViolations(generated, "generate-story-template");

    let data: StoryTemplateResponse;
    let narrationStep: { question: string; narration: string };
    let usedValidationFallback = false;

    try {
      const strictData = validateWithDiagnostics(
        strictGeneratedStoryTemplateSchema,
        generated,
        "validation.story-template.strict-generated",
        { title: promptInput.title || promptInput.templateName },
      );
      logGenerationEvent("normalized.story-template", strictData, {
        valid: true,
        level: "success",
        summary: {
          title: strictData.title,
          steps: strictData.steps.length,
          twists: strictData.twists.length,
        },
      });
      const flattened = flattenStrictGeneratedStoryTemplate(strictData);
      narrationStep = strictData.steps[0];
      data = validateWithDiagnostics(responseSchema, flattened, "validation.story-template.canonical", {
        title: flattened.title,
        steps: flattened.steps.length,
        fragments: flattened.fragments.length,
        twists: flattened.twists.length,
      }) as StoryTemplateResponse;
    } catch (validationError) {
      console.warn("Validation failed, returning raw data", validationError);
      const fallback = fallbackStoryTemplateResponse(generated, {
        title: promptInput.title,
        templateName: promptInput.templateName,
      });
      narrationStep = fallback.narrationMeta;
      data = fallback;
      usedValidationFallback = true;
    }
    const contractValidation = validateStoryTemplateSource({
      steps: data.steps.map((step, index) => ({
        step_key: step.step_key,
        question: step.step_key === "narration" ? narrationStep.question : step.question,
        short_text: null,
        sort_order: index,
        choices: step.choices.map((choice, choiceIndex) => ({
          text: choice.text,
          short_text: choice.short_text,
          sort_order: choiceIndex,
        })),
      })),
      fragments: data.fragments.map((fragment, index) => ({
        step_key: fragment.step_key,
        choice_temp_key: String(fragment.choice_index),
        choice_id: null,
        text: fragment.text,
        sort_order: index,
      })),
      twists: data.twists.map((twist) => ({
        text: twist.text,
        age_group: null,
        is_published: true,
      })),
    });
    if (contractValidation.errors.length > 0) {
      logGenerationEvent("validation.story-template.contract.errors", data, {
        valid: false,
        level: "error",
        errors: contractValidation.errors,
        summary: {
          title: data.title,
          warnings: contractValidation.warnings.length,
        },
      });
      if (usedValidationFallback) {
        console.warn("Contract validation failed in safe mode, returning raw data", contractValidation.errors);
      } else {
      return res.status(500).json({
        error: "Story generation failed validation.",
        ...(process.env.NODE_ENV === "development"
          ? { details: contractValidation.errors }
          : {}),
      });
      }
    }
    if (contractValidation.warnings.length > 0) {
      logGenerationEvent("validation.story-template.contract.warnings", data, {
        valid: false,
        level: "warning",
        errors: contractValidation.warnings,
        summary: {
          title: data.title,
          errors: contractValidation.errors.length,
        },
      });
    }
    logGenerationEvent("final.story-template.payload", data, {
      valid: true,
      level: "success",
      summary: {
        title: data.title,
        steps: data.steps.length,
        fragments: data.fragments.length,
        twists: data.twists.length,
      },
    });

    return res.status(200).json({
      title: data.title,
      steps: data.steps.map((step) =>
        step.step_key === "narration"
          ? {
              ...step,
              question: narrationStep.question || step.question,
              narration: narrationStep.narration,
            }
          : step
      ),
      fragments: data.fragments,
      twists: data.twists,
    });
  } catch (error) {
    logZodError("validation.story-template.error", error, req.body ?? {}, {
      route: "generate-story-template",
    });

    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }

    if (error instanceof GeminiPipelineError) {
      return res.status(500).json({
        error: "Story generation failed",
        ...(process.env.NODE_ENV === "development" && error.rawResponse
          ? { raw_response: error.rawResponse }
          : {}),
      });
    }

    const message = error instanceof Error ? error.message : "Failed to generate story template.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({
      error: message === "Unauthorized" ? message : "Story generation failed",
      ...(process.env.NODE_ENV === "development" && error instanceof Error
        ? { details: error.message }
        : {}),
    });
  }
}
