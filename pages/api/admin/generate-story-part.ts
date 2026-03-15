import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  buildStoryPartPrompt,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";
import { STORY_ROLE_KEYS } from "../../../lib/books/types";

const bodySchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  ageGroup: z.string().trim().optional().nullable(),
  templateName: z.string().trim().optional().nullable(),
  kind: z.enum(["step", "choice", "fragment", "twist"]),
  storyRole: z.enum(STORY_ROLE_KEYS),
  previousRole: z.enum(STORY_ROLE_KEYS).optional().nullable(),
  context: z.string().trim().optional(),
});

const responseSchema = z.union([
  z.object({
    question: z.string().trim().min(1),
    step_key: z.enum(STORY_ROLE_KEYS),
  }),
  z.object({
    text: z.string().trim().min(1),
    keywords: z.array(z.string().trim().min(1)).max(12).default([]),
  }),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const generated = await runGeminiJsonPrompt<unknown>(buildStoryPartPrompt(body));
    const data = responseSchema.parse(generated);
    return res.status(200).json(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate story part.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
