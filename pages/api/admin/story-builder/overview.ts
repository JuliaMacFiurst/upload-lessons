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
    const [templatesRes, overviewRes, narrationStepsRes] = await Promise.all([
      supabase
        .from("story_templates")
        .select("id,name")
        .order("name"),
      supabase
        .from("story_templates_overview")
        .select("*")
        .order("name"),
      supabase
        .from("story_steps")
        .select("template_id,step_key,narration")
        .eq("step_key", "narration"),
    ]);

    if (templatesRes.error) {
      return res.status(500).json({ error: templatesRes.error.message });
    }
    if (overviewRes.error) {
      return res.status(500).json({ error: overviewRes.error.message });
    }
    if (narrationStepsRes.error) {
      return res.status(500).json({ error: narrationStepsRes.error.message });
    }

    const narrationRows =
      ((narrationStepsRes.data ?? []) as Array<{
        template_id: string;
        step_key: string;
        narration: string | null;
      }>);
    const narrationByTemplateId = new Map(
      narrationRows.map((row) => [
        row.template_id,
        Boolean(row.narration?.trim()),
      ]),
    );

    const overviewRows = ((overviewRes.data ?? []) as StoryTemplateOverviewRow[]).map((row) =>
      row.step_key === "narration"
        ? {
            ...row,
            choices_count: narrationByTemplateId.get(row.id) ? 1 : 0,
            narration_filled: narrationByTemplateId.get(row.id) ?? false,
          }
        : row,
    );

    const narrationRowIds = new Set(
      overviewRows.filter((row) => row.step_key === "narration").map((row) => row.id),
    );
    narrationByTemplateId.forEach((filled, templateId) => {
      if (narrationRowIds.has(templateId)) {
        return;
      }
      const template = ((templatesRes.data ?? []) as Array<{ id: string; name: string }>).find((item) => item.id === templateId);
      if (!template) {
        return;
      }
      overviewRows.push({
        id: template.id,
        name: template.name,
        description: null,
        keywords: null,
        age_group: null,
        step_key: "narration",
        choices_count: filled ? 1 : 0,
        narration_filled: filled,
      });
    });

    return res.status(200).json({
      templates: (templatesRes.data ?? []) as Array<{ id: string; name: string }>,
      rows: overviewRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story overview.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
