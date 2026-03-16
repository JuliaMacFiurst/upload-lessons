import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import { logBatchError } from "../../../lib/ai/logBatchError";
import {
  GeminiPipelineError,
  generateAndSaveFullBookContent,
  loadBookEditorData,
  requireAdminSession,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().trim().min(1),
  author: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  ageGroup: z.string().trim().optional().nullable(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    await generateAndSaveFullBookContent(supabase, body);
    const data = await loadBookEditorData(supabase, body.bookId);
    return res.status(200).json({ data });
  } catch (error) {
    if (!(error instanceof ZodError)) {
      await logBatchError({
        bookTitle: typeof req.body?.title === "string" ? req.body.title : undefined,
        stage: error instanceof GeminiPipelineError ? error.stage : "generation",
        error,
        rawResponse: error instanceof GeminiPipelineError ? error.rawResponse : undefined,
      });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate full book.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
