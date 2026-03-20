import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  detectFormatViolations,
  logGenerationEvent,
  logZodError,
  validateWithDiagnostics,
} from "../../../lib/ai/generationDiagnostics";
import { normalizeStoryTemplate } from "../../../lib/ai/normalizeStoryTemplate";
import { canonicalStoryTemplateSchema } from "../../../lib/books/contracts";
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

    const normalized = normalizeStoryTemplate(generated);
    normalized.title = (normalized.title || promptInput.title || "Тайна тихого чердака").trim().slice(0, 120);
    logGenerationEvent("normalized.story-template", normalized, {
      valid: true,
      level: "success",
      summary: {
        title: normalized.title,
        steps: normalized.steps.length,
        fragments: normalized.fragments.length,
        twists: normalized.twists.length,
      },
    });
    const data = validateWithDiagnostics(responseSchema, normalized, "validation.story-template.canonical", {
      title: normalized.title,
      steps: normalized.steps.length,
      fragments: normalized.fragments.length,
      twists: normalized.twists.length,
    }) as StoryTemplateResponse;
    const contractValidation = validateStoryTemplateSource({
      steps: data.steps.map((step, index) => ({
        step_key: step.step_key,
        question: step.question,
        sort_order: index,
        choices: step.choices.map((choice, choiceIndex) => ({
          text: choice.text,
          keywords: choice.keywords,
          sort_order: choiceIndex,
        })),
      })),
      fragments: data.fragments.map((fragment, index) => ({
        step_key: fragment.step_key,
        choice_temp_key: String(fragment.choice_index),
        choice_id: null,
        text: fragment.text,
        keywords: fragment.keywords,
        sort_order: index,
      })),
      twists: data.twists.map((twist) => ({
        text: twist.text,
        keywords: twist.keywords,
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

    return res.status(200).json(data);
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
