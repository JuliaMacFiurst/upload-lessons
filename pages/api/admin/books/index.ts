import type { NextApiRequest, NextApiResponse } from "next";
import {
  createUniqueBookSlug,
  findBookByExactTitle,
  listBooks,
  requireAdminSession,
} from "../../../../lib/server/book-admin";

type CreateBody = {
  title?: string;
  author?: string;
};

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
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const books = await listBooks(supabase, q);
      return res.status(200).json({ books });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load books.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as CreateBody;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";

  if (!title) {
    return res.status(400).json({ error: "Title is required." });
  }

  try {
    const existing = await findBookByExactTitle(supabase, title);
    if (existing) {
      return res.status(200).json({ existing: true, book: existing });
    }

    const slug = await createUniqueBookSlug(supabase, title);
    const { data, error } = await supabase
      .from("books")
      .insert({
        title,
        author: author || null,
        slug,
      })
      .select("id,title,slug,author,year,is_published,created_at")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create book.");
    }

    return res.status(201).json({
      existing: false,
      book: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create book.";
    return res.status(500).json({ error: message });
  }
}
