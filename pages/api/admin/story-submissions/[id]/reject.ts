import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { rejectStorySubmission } from "../../../../../lib/server/story-submissions-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id : "";

  if (!id) {
    return res.status(400).json({ error: "Submission id is required." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const submission = await rejectStorySubmission(supabase, id, req.body ?? {});
    return res.status(200).json({ ok: true, submission });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to reject story submission.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
