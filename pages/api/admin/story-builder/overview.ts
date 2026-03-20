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
    const [templatesRes, overviewRes] = await Promise.all([
      supabase
        .from("story_templates")
        .select("id,name")
        .order("name"),
      supabase
        .from("story_templates_overview")
        .select("*")
        .order("name"),
    ]);

    if (templatesRes.error) {
      return res.status(500).json({ error: templatesRes.error.message });
    }
    if (overviewRes.error) {
      return res.status(500).json({ error: overviewRes.error.message });
    }

    return res.status(200).json({
      templates: (templatesRes.data ?? []) as Array<{ id: string; name: string }>,
      rows: (overviewRes.data ?? []) as StoryTemplateOverviewRow[],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story overview.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
