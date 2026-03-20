import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import {
  loadStoryTemplateById,
  requireAdminSession,
  saveStoryTemplateMeta,
} from "../../../../lib/server/book-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const supabase = await requireAdminSession(req, res);
      const templateId = typeof req.query.id === "string" ? req.query.id : "";
      if (!templateId) {
        return res.status(400).json({ error: "Template id is required." });
      }
      const template = await loadStoryTemplateById(supabase, templateId);
      return res.status(200).json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load story template.";
      return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const template = await saveStoryTemplateMeta(supabase, req.body ?? {});
    return res.status(200).json({ template });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save story template.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
