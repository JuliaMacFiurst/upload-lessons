import type { NextApiRequest, NextApiResponse } from "next";
import { approveBook, requireAdminSession } from "../../../../../lib/server/book-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";

  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    await approveBook(supabase, bookId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to approve book.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
