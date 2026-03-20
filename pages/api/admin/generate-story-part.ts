import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  detectFormatViolations,
  logGenerationEvent,
  logZodError,
  validateWithDiagnostics,
} from "../../../lib/ai/generationDiagnostics";
import {
  canonicalStoryTwistSchema,
} from "../../../lib/books/contracts";
import {
  buildStoryPartPrompt,
  requireAdminSession,
  runGeminiJsonPrompt,
  validateCanonicalStoryPartText,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  ageGroup: z.string().trim().optional().nullable(),
  templateName: z.string().trim().optional().nullable(),
  kind: z.enum(["fragment", "twist"]),
  storyRole: z.enum(["intro", "journey", "problem", "solution", "ending"]),
  previousRole: z.enum(["intro", "journey", "problem", "solution", "ending"]).optional().nullable(),
  context: z.string().trim().optional(),
});

function clampStoryPartText(text: string, maxLength: number) {
  return text.trim().slice(0, maxLength).trim();
}

function normalizeGeneratedStoryPart(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  const keywords = Array.isArray(record.keywords)
    ? record.keywords.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : typeof record.keywords === "string" && record.keywords.trim()
      ? [record.keywords.trim()]
      : [];

  const rawText = typeof record.text === "string" ? record.text.trim() : "";

  return {
    text: clampStoryPartText(rawText, 220),
    keywords,
  };
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
    const body = bodySchema.parse(req.body ?? {});
    const generated = await runGeminiJsonPrompt<unknown>(buildStoryPartPrompt(body));
    logGenerationEvent("raw.story-part.route", generated, {
      valid: true,
      level: "success",
      summary: { kind: body.kind, role: body.storyRole, title: body.title },
    });
    detectFormatViolations(generated, "generate-story-part");
    const normalized = normalizeGeneratedStoryPart(generated);
    if (
      body.kind === "fragment" &&
      body.storyRole !== "intro" &&
      body.context?.includes("Полный текущий текст истории:") &&
      looksLikeStoryRestart(normalized.text)
    ) {
      return res.status(400).json({
        error: "Сгенерированный фрагмент начал историю заново вместо продолжения текущей ветки.",
      });
    }
    logGenerationEvent("normalized.story-part", normalized, {
      valid: true,
      level: "success",
      summary: { kind: body.kind, role: body.storyRole },
    });
    const data = body.kind === "twist"
        ? validateWithDiagnostics(canonicalStoryTwistSchema, validateCanonicalStoryPartText(normalized), "validation.story-part.canonical.twist", {
            kind: body.kind,
            role: body.storyRole,
          })
      : validateWithDiagnostics(z.object({
          text: z.string().trim().min(1),
          keywords: z.array(z.string().trim().min(1)).max(12),
        }), validateCanonicalStoryPartText(normalized), "validation.story-part.canonical.text", {
          kind: body.kind,
          role: body.storyRole,
        });
    logGenerationEvent("final.story-part.payload", data, {
      valid: true,
      level: "success",
      summary: { kind: body.kind, role: body.storyRole },
    });
    return res.status(200).json(data);
  } catch (error) {
    logZodError("validation.story-part.error", error, req.body ?? {}, {
      route: "generate-story-part",
    });
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate story part.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
