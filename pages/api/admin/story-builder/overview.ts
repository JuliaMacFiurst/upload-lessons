import type { NextApiRequest, NextApiResponse } from "next";
import { STORY_ROLE_KEYS, type StoryRoleKey, type StoryTemplateOverviewRow } from "../../../../lib/books/types";
import { requireAdminSession } from "../../../../lib/server/book-admin";

type TemplateRow = {
  id: string;
  name: string;
};

type StepRow = {
  id: string;
  template_id: string;
  step_key: StoryRoleKey;
  question: string | null;
  short_text: string | null;
  narration: string | null;
};

type ChoiceRow = {
  id: string;
  step_id: string;
  text: string | null;
  short_text: string | null;
  sort_order: number | null;
};

type FragmentRow = {
  choice_id: string | null;
  text: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const [templatesRes, stepsRes, choicesRes, fragmentsRes] = await Promise.all([
      supabase.from("story_templates").select("id,name").order("name"),
      supabase.from("story_steps").select("id,template_id,step_key,question,short_text,narration"),
      supabase
        .from("story_choices")
        .select("id,step_id,text,short_text,sort_order")
        .order("sort_order", { ascending: true }),
      supabase.from("story_fragments").select("choice_id,text"),
    ]);

    if (templatesRes.error) {
      return res.status(500).json({ error: templatesRes.error.message });
    }
    if (stepsRes.error) {
      return res.status(500).json({ error: stepsRes.error.message });
    }
    if (choicesRes.error) {
      return res.status(500).json({ error: choicesRes.error.message });
    }
    if (fragmentsRes.error) {
      return res.status(500).json({ error: fragmentsRes.error.message });
    }

    const templates = ((templatesRes.data ?? []) as TemplateRow[]);
    const steps = ((stepsRes.data ?? []) as StepRow[]);
    const choices = ((choicesRes.data ?? []) as ChoiceRow[]);
    const fragments = ((fragmentsRes.data ?? []) as FragmentRow[]);

    const fragmentsByChoiceId = new Map<string, Array<{ text: string | null }>>();
    fragments.forEach((fragment) => {
      if (!fragment.choice_id || !fragment.text?.trim()) {
        return;
      }
      const bucket = fragmentsByChoiceId.get(fragment.choice_id) ?? [];
      bucket.push({ text: fragment.text });
      fragmentsByChoiceId.set(fragment.choice_id, bucket);
    });

    const stepById = new Map<string, StepRow>();
    const stepByTemplateAndRole = new Map<string, StepRow>();
    steps.forEach((step) => {
      stepById.set(step.id, step);
      stepByTemplateAndRole.set(`${step.template_id}:${step.step_key}`, step);
    });

    const choicesByTemplateAndRole = new Map<string, StoryTemplateOverviewRow["choices"]>();
    choices.forEach((choice) => {
      const stepRef = stepById.get(choice.step_id) ?? null;
      if (!stepRef) {
        return;
      }
      const key = `${stepRef.template_id}:${stepRef.step_key}`;
      const bucket = choicesByTemplateAndRole.get(key) ?? [];
      bucket.push({
        id: choice.id,
        text: choice.text ?? null,
        short_text: choice.short_text ?? null,
        fragments_count: (fragmentsByChoiceId.get(choice.id) ?? []).length,
        fragments: fragmentsByChoiceId.get(choice.id) ?? [],
      });
      choicesByTemplateAndRole.set(key, bucket);
    });

    const rows: StoryTemplateOverviewRow[] = [];

    templates.forEach((template) => {
      const templateRows: StoryTemplateOverviewRow[] = [];
      STORY_ROLE_KEYS.forEach((step_key) => {
        const step = stepByTemplateAndRole.get(`${template.id}:${step_key}`);
        const roleChoices = choicesByTemplateAndRole.get(`${template.id}:${step_key}`) ?? [];
        const narration = step?.narration ?? null;
        const question = step?.question ?? null;
        const narrationFilled = step_key === "narration"
          ? Boolean(narration?.trim()) && Boolean(question?.trim())
          : undefined;
        const validChoices = step_key === "narration"
          ? []
          : roleChoices.filter((choice) =>
              Boolean(choice.text?.trim() || choice.short_text?.trim()),
            );
        const stepWithChoices = {
          step_key,
          narration,
          question,
          choices: roleChoices,
        };

        console.log("STEP WITH CHOICES", stepWithChoices);
        console.log("OVERVIEW STEP", stepWithChoices);

        console.log("VALID CHOICES", validChoices);

        const row: StoryTemplateOverviewRow = {
          id: template.id,
          name: template.name,
          description: null,
          age_group: null,
          step_key,
          choices_count: step_key === "narration" ? (narrationFilled ? 1 : 0) : validChoices.length,
          narration_filled: narrationFilled,
          question,
          narration,
          choices: roleChoices,
        };
        rows.push(row);
        templateRows.push(row);
      });

      console.log("OVERVIEW RAW", {
        template,
        rows: templateRows,
      });
    });

    return res.status(200).json({
      templates,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load story overview.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
