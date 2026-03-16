import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { ZodError, z } from "zod";
import { logBatchError } from "../../../lib/ai/logBatchError";
import { GeminiPipelineError } from "../../../lib/server/book-admin";
import {
  createOrGetBook,
  generateAndSaveFullBookContent,
  requireAdminSession,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  batchId: z.string().trim().optional().nullable(),
  books: z.array(
    z.object({
      title: z.string().trim().min(1),
      author: z.string().trim().optional().nullable(),
      ageGroup: z.string().trim().optional().nullable(),
      genre: z.string().trim().optional().nullable(),
    }),
  ).min(1).max(20),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const batchId = body.batchId || crypto.randomUUID();
    const created: Array<{ id: string; title: string }> = [];
    const errors: Array<{ title: string; error: string }> = [];

    for (const book of body.books) {
      try {
        const savedBook = await createOrGetBook(supabase, {
          title: book.title,
          author: book.author,
          ageGroup: book.ageGroup,
        });
        await generateAndSaveFullBookContent(supabase, {
          bookId: savedBook.id,
          title: savedBook.title,
          author: savedBook.author,
          description: savedBook.description,
          ageGroup: savedBook.age_group,
        });
        created.push({ id: savedBook.id, title: savedBook.title });
      } catch (error) {
        await logBatchError({
          batchId,
          bookTitle: book.title,
          stage: error instanceof GeminiPipelineError ? error.stage : "generation",
          error,
          rawResponse: error instanceof GeminiPipelineError ? error.rawResponse : undefined,
        });
        errors.push({
          title: book.title,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return res.status(200).json({
      batchId,
      books: created,
      generated: created.length,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to run book batch.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
