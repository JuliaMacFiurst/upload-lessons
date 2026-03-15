import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { requireAdminSession, saveBookExplanation } from "../../../../../lib/server/book-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";
  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const explanation = await saveBookExplanation(supabase, bookId, req.body ?? {});
    return res.status(200).json({ explanation });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save explanation.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
