import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "node:crypto";
import { ZodError, z } from "zod";
import {
  buildBookBatchPlanPrompt,
  buildExplanationPrompt,
  buildTestPrompt,
} from "../../../lib/ai/prompts";
import {
  estimateFullBookCost,
  type BookGenerationSection,
} from "../../../lib/ai/bookGenerationProfile";
import { logBatchError } from "../../../lib/ai/logBatchError";
import {
  GeminiPipelineError,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";

const bodySchema = z.object({
  ageGroup: z.enum(["5-7", "8-10", "10-12"]),
  genre: z.string().trim().optional().nullable(),
  count: z.number().int().min(1).max(20),
});

const responseSchema = z.object({
  books: z.array(
    z.object({
      title: z.string().trim().min(1),
      author: z.string().trim().min(1).optional().nullable(),
    }),
  ).max(25),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const batchId = crypto.randomUUID();
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const { data: existingRows, error: existingError } = await supabase.from("books").select("title");

    if (existingError) {
      throw new Error(`Failed to load existing books: ${existingError.message}`);
    }

    const existingTitles = ((existingRows as Array<{ title: string }> | null) ?? []).map((item) => item.title);
    let generated: unknown;
    try {
      generated = await runGeminiJsonPrompt<unknown>(
        buildBookBatchPlanPrompt({
          ageGroup: body.ageGroup,
          genre: body.genre,
          count: body.count + 5,
          existingTitles,
        }),
      );
    } catch (error) {
      await logBatchError({
        batchId,
        stage: error instanceof GeminiPipelineError ? error.stage : "plan",
        error,
        rawResponse: error instanceof GeminiPipelineError ? error.rawResponse : undefined,
      });
      throw error;
    }

    let parsed;
    try {
      parsed = responseSchema.parse(generated);
    } catch (error) {
      await logBatchError({
        batchId,
        stage: "validation",
        error,
        rawResponse: JSON.stringify(generated),
      });
      throw error;
    }
    const existingNormalized = new Set(existingTitles.map((title) => title.trim().toLowerCase()));

    const books = parsed.books
      .filter((book) => !existingNormalized.has(book.title.trim().toLowerCase()))
      .filter(
        (book, index, array) =>
          array.findIndex((item) => item.title.trim().toLowerCase() === book.title.trim().toLowerCase()) === index,
      )
      .slice(0, body.count)
      .map((book) => ({
        title: book.title.trim(),
        author: book.author?.trim() || null,
      }));

    const estimate = books.reduce(
      (acc, book) => {
        const current = estimateFullBookCost({
          plot: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "plot" }),
          characters: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "characters" }),
          main_idea: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "main_idea" }),
          philosophy: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "philosophy" }),
          conflicts: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "conflicts" }),
          author_message: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "author_message" }),
          ending_meaning: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "ending_meaning" }),
          twenty_seconds: buildExplanationPrompt({ title: book.title, author: book.author, description: null, mode: "twenty_seconds" }),
          test: buildTestPrompt({ title: book.title, author: book.author, description: null, ageGroup: body.ageGroup }),
        } as Partial<Record<BookGenerationSection, string>>);

        return {
          estimated_tokens: acc.estimated_tokens + current.inputTokens + current.outputTokens,
          estimated_cost_ils: acc.estimated_cost_ils + current.ils,
        };
      },
      { estimated_tokens: 0, estimated_cost_ils: 0 },
    );

    return res.status(200).json({
      batchId,
      books,
      estimated_tokens: estimate.estimated_tokens,
      estimated_cost_ils: estimate.estimated_cost_ils,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate book batch plan.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
