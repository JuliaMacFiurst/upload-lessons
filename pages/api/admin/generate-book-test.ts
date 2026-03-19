import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  buildTestPrompt,
  normalizeGeneratedQuizPayload,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";
import { bookTestQuestionSchema } from "../../../lib/books/types";

const bodySchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  ageGroup: z.string().trim().optional().nullable(),
});

const responseSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  quiz: z.unknown(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const generated = await runGeminiJsonPrompt<unknown>(buildTestPrompt(body));
    if (process.env.NODE_ENV === "development") {
      console.info("[generation] single-test.raw", generated);
    }

    const data = responseSchema.parse(generated);
    const normalizedQuiz = z.array(bookTestQuestionSchema).min(1).max(10).parse(
      normalizeGeneratedQuizPayload(data.quiz),
    );
    const normalized = {
      title: data.title,
      description: data.description ?? null,
      quiz: normalizedQuiz,
    };
    if (process.env.NODE_ENV === "development") {
      console.info("[generation] single-test.normalized", normalized);
    }

    return res.status(200).json(normalized);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate test.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
