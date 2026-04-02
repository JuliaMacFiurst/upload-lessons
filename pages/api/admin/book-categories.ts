import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import {
  createBookCategory,
  loadCategoryOptions,
  requireAdminSession,
} from "../../../lib/server/book-admin";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Название категории обязательно."),
  slug: z.string().trim().optional().nullable(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const categories = await loadCategoryOptions(supabase);
      return res.status(200).json({ categories });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load book categories.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = createCategorySchema.parse(req.body ?? {});
      const category = await createBookCategory(supabase, body);
      return res.status(201).json({ category });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
      }
      const message = error instanceof Error ? error.message : "Failed to create book category.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
