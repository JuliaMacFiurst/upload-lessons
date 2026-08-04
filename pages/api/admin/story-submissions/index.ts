import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listStorySubmissions } from "../../../../lib/server/story-submissions-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const submissions = await listStorySubmissions(supabase);
    return res.status(200).json({ submissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story submissions.";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }
}
