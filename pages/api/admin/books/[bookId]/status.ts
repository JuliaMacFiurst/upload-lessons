import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/book-admin";

type BookCompletionOverview = {
  id: string;
  title: string;
  author: string | null;
  filled_blocks: number;
  total_blocks: number;
  progress_percent: number;
};

type BookMissingSectionRow = {
  section: string;
  is_filled: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";

  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const [{ data: progress, error: progressError }, { data: sections, error: sectionsError }] =
      await Promise.all([
        supabase.from("books_completion_overview").select("*").eq("id", bookId).single(),
        supabase.from("books_missing_sections").select("*").eq("book_id", bookId),
      ]);

    if (progressError) {
      return res.status(500).json({ error: progressError.message });
    }

    if (sectionsError) {
      return res.status(500).json({ error: sectionsError.message });
    }

    return res.status(200).json({
      progress: progress as BookCompletionOverview,
      sections: (sections ?? []) as BookMissingSectionRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load book status.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
