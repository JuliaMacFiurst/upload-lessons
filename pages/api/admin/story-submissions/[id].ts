import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  loadStorySubmissionById,
  saveStorySubmissionEdits,
} from "../../../../lib/server/story-submissions-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id : "";

  if (!id) {
    return res.status(400).json({ error: "Submission id is required." });
  }

  try {
    const supabase = await requireAdminSession(req, res);

    if (req.method === "GET") {
      const submission = await loadStorySubmissionById(supabase, id);
      return res.status(200).json({ submission });
    }

    if (req.method === "PATCH") {
      const submission = await saveStorySubmissionEdits(supabase, id, req.body ?? {});
      return res.status(200).json({ ok: true, submission });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to handle story submission.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
