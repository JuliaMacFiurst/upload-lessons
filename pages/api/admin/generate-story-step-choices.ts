import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  detectFormatViolations,
  logGenerationEvent,
  logZodError,
  validateWithDiagnostics,
} from "../../../lib/ai/generationDiagnostics";
import { buildMissingStoryChoicesPrompt } from "../../../lib/ai/prompts";
import { requireAdminSession, runGeminiJsonPrompt } from "../../../lib/server/book-admin";
import { STORY_ROLE_KEYS } from "../../../lib/books/types";

const requestSchema = z.object({
  title: z.string().trim().min(1),
  stepKey: z.enum(STORY_ROLE_KEYS),
  narrationText: z.string().trim().optional().nullable(),
  currentStoryText: z.string().trim().optional().nullable(),
  selectedPath: z.string().trim().optional().nullable(),
  roleDescription: z.string().trim().min(1),
  question: z.string().trim().min(1),
  existingChoices: z.array(
    z.object({
      text: z.string().trim().min(1),
      fragment: z.string().trim().optional().nullable(),
    }),
  ).max(3),
  count: z.number().int().min(1).max(3),
});

const responseSchema = z.object({
  choices: z.array(
    z.object({
      text: z.string().trim().min(1).max(120),
      fragment: z.string().trim().min(1).max(220),
      short_text: z.string().trim().min(1).max(220),
    }),
  ).min(1).max(3),
});

function clampText(text: string, maxLength: number) {
  return text.trim().slice(0, maxLength).trim();
}

function normalizeChoiceSentence(text: string) {
  const firstSentence = text.trim().split(/(?<=[.!?])\s+/)[0] ?? text.trim();
  return clampText(firstSentence, 120);
}

function normalizeFragmentSentence(text: string) {
  const firstSentence = text.trim().split(/(?<=[.!?])\s+/)[0] ?? text.trim();
  return clampText(firstSentence, 220);
}

function normalizeResponse(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawChoices = Array.isArray(record.choices) ? record.choices : [];

  return {
    choices: rawChoices
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const choice = item as Record<string, unknown>;
        const text = typeof choice.text === "string" ? normalizeChoiceSentence(choice.text) : "";
        const fragment =
          typeof choice.fragment === "string" ? normalizeFragmentSentence(choice.fragment) : "";

        const shortText =
          typeof choice.short_text === "string" && choice.short_text.trim()
            ? clampText(choice.short_text.trim(), 220)
            : "";

        if (!text || !fragment || !shortText) {
          return null;
        }

        return { text, fragment, short_text: shortText };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

function hasEnoughChoices(
  payload: z.infer<typeof responseSchema>,
  requestedCount: number,
) {
  return payload.choices.length >= requestedCount;
}

function looksLikeStoryRestart(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith("жила-была") ||
    normalized.startsWith("жил-был") ||
    normalized.startsWith("однажды") ||
    normalized.startsWith("в один день") ||
    normalized.startsWith("как-то раз")
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const body = requestSchema.parse(req.body ?? {});

    const runGeneration = async (attempt: "initial" | "retry") => {
      const prompt = buildMissingStoryChoicesPrompt({
        ...body,
        narrationText: body.narrationText ?? "",
        currentStoryText: body.currentStoryText ?? "",
        selectedPath: body.selectedPath ?? "",
      });
      const generated = await runGeminiJsonPrompt<unknown>(prompt);
      logGenerationEvent(`raw.story-step-choices.${attempt}`, generated, {
        valid: true,
        level: "success",
        summary: { step: body.stepKey, count: body.count, title: body.title },
      });
      detectFormatViolations(generated, `generate-story-step-choices-${attempt}`);
      const normalized = normalizeResponse(generated);
      logGenerationEvent(`normalized.story-step-choices.${attempt}`, normalized, {
        valid: true,
        level: "success",
        summary: { step: body.stepKey, count: normalized.choices.length },
      });
      return normalized;
    };

    let normalized = await runGeneration("initial");

    if (!hasEnoughChoices(normalized, body.count)) {
      logGenerationEvent("story-step-choices.retry-needed", normalized, {
        valid: false,
        level: "warning",
        errors: ["Model returned too few choices for the requested step."],
        summary: { step: body.stepKey, requested: body.count, received: normalized.choices.length },
      });
      normalized = await runGeneration("retry");
    }

    if (!hasEnoughChoices(normalized, body.count)) {
      console.error("EMPTY_OR_INCOMPLETE_STEP_CHOICES", {
        requested: body.count,
        received: normalized.choices.length,
        step: body.stepKey,
        title: body.title,
      });
      return res.status(500).json({ error: "Не удалось сгенерировать недостающие варианты шага." });
    }

    if (
      body.stepKey !== "narration" &&
      (body.currentStoryText?.trim() || body.narrationText?.trim()) &&
      normalized.choices.some((choice) => looksLikeStoryRestart(choice.fragment))
    ) {
      console.error("STORY_CONTINUITY_REJECTED", {
        step: body.stepKey,
        currentStoryText: body.currentStoryText,
        choices: normalized.choices,
      });
      return res.status(500).json({ error: "Модель начала историю заново вместо продолжения ветки." });
    }

    const data = validateWithDiagnostics(
      responseSchema,
      { choices: normalized.choices.slice(0, body.count) },
      "validation.story-step-choices",
      { step: body.stepKey, requested: body.count },
    );

    return res.status(200).json(data);
  } catch (error) {
    logZodError("validation.story-step-choices.error", error, req.body ?? {}, {
      route: "generate-story-step-choices",
    });
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate story step choices.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
