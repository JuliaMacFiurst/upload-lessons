import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  detectFormatViolations,
  logGenerationEvent,
  logZodError,
  validateWithDiagnostics,
} from "../../../lib/ai/generationDiagnostics";
import { canonicalExplanationSectionSchema } from "../../../lib/books/contracts";
import {
  buildExplanationPrompt,
  normalizeGeneratedExplanationPayload,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  mode: z.string().trim().min(1),
});

const responseSchema = z.object({
  slides: z.unknown(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const generated = await runGeminiJsonPrompt(buildExplanationPrompt(body));
    logGenerationEvent("raw.explanation.route", generated, {
      valid: true,
      level: "success",
      summary: { mode: body.mode, book: body.title },
    });
    detectFormatViolations(generated, "generate-book-content");
    let data;
    try {
      data = validateWithDiagnostics(responseSchema, generated, "validation.explanation.parsed", {
        mode: body.mode,
      });
    } catch (error) {
      logZodError("validation.explanation.parsed.error", error, generated, {
        mode: body.mode,
      });
      throw new Error("Gemini returned invalid explanation format");
    }
    const normalized = normalizeGeneratedExplanationPayload(data);
    const validated = validateWithDiagnostics(canonicalExplanationSectionSchema.extend({
      slides: canonicalExplanationSectionSchema.shape.slides.max(6),
    }), normalized, "validation.explanation.canonical", {
      mode: body.mode,
      slides: normalized.slides.length,
    });
    logGenerationEvent("final.explanation.payload", validated, {
      valid: true,
      level: "success",
      summary: { mode: body.mode, slides: validated.slides.length },
    });
    return res.status(200).json(validated);
  } catch (error) {
    logZodError("validation.explanation.error", error, req.body ?? {}, {
      route: "generate-book-content",
    });
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate explanation.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
