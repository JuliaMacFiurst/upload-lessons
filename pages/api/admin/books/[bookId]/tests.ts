import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import { deleteBookTest, requireAdminSession, saveBookTest } from "../../../../../lib/server/book-admin";

const deleteSchema = z.object({
  testId: z.string().uuid(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";
  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  try {
    const supabase = await requireAdminSession(req, res);

    if (req.method === "POST") {
      const test = await saveBookTest(supabase, bookId, req.body ?? {});
      return res.status(200).json({ test });
    }

    if (req.method === "DELETE") {
      const body = deleteSchema.parse(req.body ?? {});
      await deleteBookTest(supabase, bookId, body.testId);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save test.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
