import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession, loadStoryBuilderData } from "../../../../lib/server/book-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const data = await loadStoryBuilderData(supabase);
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story builder.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
