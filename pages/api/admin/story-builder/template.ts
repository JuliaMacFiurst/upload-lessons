import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import {
  deleteStoryTemplate,
  loadStoryTemplateById,
  requireAdminSession,
  saveStoryTemplate,
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

  if (req.method === "DELETE") {
    try {
      const supabase = await requireAdminSession(req, res);
      const templateId =
        typeof req.query.id === "string"
          ? req.query.id
          : typeof req.body?.id === "string"
            ? req.body.id
            : "";
      if (!templateId) {
        return res.status(400).json({ error: "Template id is required." });
      }
      await deleteStoryTemplate(supabase, templateId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete story template.";
      return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const mode = req.body?.mode === "strict" ? "strict" : "draft";
    const result = await saveStoryTemplate(supabase, req.body ?? {}, { mode });
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save story template.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
