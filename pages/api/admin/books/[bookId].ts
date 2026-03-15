import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { loadBookEditorData, requireAdminSession, saveBookEditorData } from "../../../../lib/server/book-admin";
import type { BookEditorPayload } from "../../../../lib/books/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";

  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const data = await loadBookEditorData(supabase, bookId);
      return res.status(200).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load book editor.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await saveBookEditorData(supabase, bookId, (req.body ?? {}) as BookEditorPayload);
    const data = await loadBookEditorData(supabase, bookId);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: error.issues[0]?.message ?? "Validation failed.",
        issues: error.issues,
      });
    }
    const message = error instanceof Error ? error.message : "Failed to save book.";
    return res.status(500).json({ error: message });
  }
}
