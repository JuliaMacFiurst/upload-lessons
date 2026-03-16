import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import { normalizeStoryTemplate } from "../../../lib/ai/normalizeStoryTemplate";
import { STORY_ROLE_KEYS } from "../../../lib/books/types";
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

const responseSchema = z.object({
  title: z.string().trim().min(1).max(120),
  steps: z.array(
    z.object({
      step_key: z.enum(STORY_ROLE_KEYS),
      question: z.string().trim().min(1),
      choices: z
        .array(
          z.object({
            text: z.string().trim().min(1),
            keywords: z.array(z.string().trim().min(1)).max(12),
          }),
        )
        .length(3),
    }),
  ).length(5),
  fragments: z.array(
    z.object({
      step_key: z.enum(STORY_ROLE_KEYS),
      choice_index: z.number().int().min(0).max(10),
      text: z.string().trim().min(1),
      keywords: z.array(z.string().trim().min(1)).max(12),
    }),
  ),
  twists: z.array(
    z.object({
      text: z.string().trim().min(1),
      keywords: z.array(z.string().trim().min(1)).max(12),
    }),
  ),
});

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
      templateName: body.templateName?.trim() || "Capybara Story",
      templateSlug: body.templateSlug?.trim() || "capybara-story",
    };
    const generated = await runGeminiJsonPrompt<unknown>(buildStoryTemplatePrompt(promptInput));
    console.log("Gemini raw response:", JSON.stringify(generated));

    const normalized = normalizeStoryTemplate(generated);
    normalized.title = (normalized.title || promptInput.title || "История про капибару").trim().slice(0, 120);
    console.log("Normalized story template:", normalized);
    const data = responseSchema.parse(normalized) as StoryTemplateResponse;

    return res.status(200).json(data);
  } catch (error) {
    console.error("Story template parse error", error);

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
