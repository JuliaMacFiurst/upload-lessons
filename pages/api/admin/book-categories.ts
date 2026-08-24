import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import {
  createBookCategory,
  loadCategoryOptions,
  requireAdminSession,
} from "../../../lib/server/book-admin";
import { BOOK_CATEGORY_GROUP_KEYS } from "../../../lib/books/types";
import { findTranslationScriptIssues } from "../../../lib/translations/script-validation";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Название категории обязательно."),
  slug: z.string().trim().optional().nullable(),
  translations: z.object({
    ru: z.string().trim().min(1).optional(),
    en: z.string().trim().min(1).optional(),
    he: z.string().trim().min(1).optional(),
  }).strict().optional(),
  group_key: z.enum(BOOK_CATEGORY_GROUP_KEYS).optional().default("other"),
  sort_order: z.number().int().optional().nullable(),
  is_published: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
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
      for (const language of ["en", "he"] as const) {
        const label = body.translations?.[language];
        if (!label) continue;
        const issue = findTranslationScriptIssues(label, language, `translations.${language}`)[0];
        if (issue) return res.status(422).json({ error: `${issue.path}: ${issue.message}`, issue });
      }
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
