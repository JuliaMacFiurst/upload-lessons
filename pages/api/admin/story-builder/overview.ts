import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/book-admin";
import type { StoryTemplateOverviewRow } from "../../../../lib/books/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const { data, error } = await supabase
      .from("story_templates_overview")
      .select("*")
      .order("name");

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ rows: (data ?? []) as StoryTemplateOverviewRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story overview.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
