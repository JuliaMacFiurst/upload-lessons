import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import { buildExplanationPrompt, requireAdminSession, runGeminiJsonPrompt } from "../../../lib/server/book-admin";
import { bookExplanationSlideSchema } from "../../../lib/books/types";

const bodySchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  mode: z.string().trim().min(1),
});

const responseSchema = z.object({
  slides: z.array(bookExplanationSlideSchema).min(1).max(6),
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
    let data;
    try {
      data = responseSchema.parse(generated);
    } catch {
      throw new Error("Gemini returned invalid explanation format");
    }
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate explanation.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
