import type {
  StoryChoiceInput,
  StoryFragmentInput,
  StoryRoleKey,
  StoryStepInput,
  StoryTemplateInput,
  StoryTwistInput,
} from "./types";
import { STORY_ROLE_KEYS } from "./types";

type CsvRow = Record<string, string>;

const CSV_HEADERS = [
  "entity",
  "step_key",
  "parent_step_key",
  "parent_choice_index",
  "sort_order",
  "text",
  "short_text",
  "name",
  "slug",
  "age_group",
  "is_published",
] as const;

function escapeCsvCell(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      output.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  output.push(current);
  return output;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return [];
  }

  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    header.forEach((column, index) => {
      row[column] = values[index] ?? "";
    });
    return row;
  });
}

function buildChoiceIndexMap(steps: StoryStepInput[]): Map<string, number> {
  const map = new Map<string, number>();
  steps.forEach((step) => {
    step.choices.forEach((choice, index) => {
      if (choice.id) {
        map.set(choice.id, index);
      }
    });
  });
  return map;
}

export function exportStoryTemplateCsv(template: StoryTemplateInput): string {
  const rows: CsvRow[] = [];
  const choiceIndexMap = buildChoiceIndexMap(template.steps);

  rows.push({
    entity: "template",
    step_key: "",
    parent_step_key: "",
    parent_choice_index: "",
    sort_order: "",
    text: "",
    short_text: "",
    name: template.name,
    slug: template.slug,
    age_group: "",
    is_published: String(template.is_published),
  });

  template.steps.forEach((step) => {
    rows.push({
      entity: "step",
      step_key: step.step_key,
      parent_step_key: "",
      parent_choice_index: "",
      sort_order: String(step.sort_order),
      text: step.step_key === "narration" ? step.narration?.trim() || step.question : step.question,
      short_text: "",
      name: "",
      slug: "",
      age_group: "",
      is_published: "",
    });

    step.choices.forEach((choice) => {
      rows.push({
        entity: "choice",
        step_key: step.step_key,
        parent_step_key: step.step_key,
        parent_choice_index: "",
        sort_order: String(choice.sort_order),
        text: choice.text,
        short_text: choice.short_text ?? "",
        name: "",
        slug: "",
        age_group: "",
        is_published: "",
      });
    });
  });

  template.fragments.forEach((fragment) => {
    rows.push({
      entity: "fragment",
      step_key: fragment.step_key,
      parent_step_key: fragment.step_key,
      parent_choice_index:
        fragment.choice_id && choiceIndexMap.has(fragment.choice_id)
          ? String(choiceIndexMap.get(fragment.choice_id))
          : "",
      sort_order: String(fragment.sort_order),
      text: fragment.text,
      short_text: "",
      name: "",
      slug: "",
      age_group: "",
      is_published: "",
    });
  });

  template.twists.forEach((twist) => {
    rows.push({
      entity: "twist",
      step_key: "",
      parent_step_key: "",
      parent_choice_index: "",
      sort_order: "",
      text: twist.text,
      short_text: "",
      name: "",
      slug: "",
      age_group: twist.age_group ?? "",
      is_published: String(twist.is_published),
    });
  });

  return [
    CSV_HEADERS.join(","),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => escapeCsvCell(row[header] ?? "")).join(","),
    ),
  ].join("\n");
}

function coerceInteger(value: string, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function normalizeStoryRole(value: string, fallbackIndex = 0): StoryRoleKey {
  const trimmed = value.trim();
  if (STORY_ROLE_KEYS.includes(trimmed as StoryRoleKey)) {
    return trimmed as StoryRoleKey;
  }
  return STORY_ROLE_KEYS[Math.max(0, Math.min(fallbackIndex, STORY_ROLE_KEYS.length - 1))];
}

export function importStoryTemplateCsv(text: string): StoryTemplateInput {
  const rows = parseCsv(text);
  const templateRow = rows.find((row) => row.entity === "template");

  const steps: StoryStepInput[] = [];
  const stepMap = new Map<string, StoryStepInput>();
  const fragments: StoryFragmentInput[] = [];
  const twists: StoryTwistInput[] = [];

  rows.forEach((row) => {
    if (row.entity === "step") {
      const stepKey = normalizeStoryRole(row.step_key, steps.length);
      const step: StoryStepInput = {
        step_key: stepKey,
        question: stepKey === "narration" ? row.name.trim() : row.text.trim(),
        short_text: null,
        narration: stepKey === "narration" ? row.text.trim() : null,
        sort_order: coerceInteger(row.sort_order),
        choices: [],
      };
      if (step.step_key) {
        steps.push(step);
        stepMap.set(step.step_key, step);
      }
    }
  });

  rows.forEach((row) => {
    if (row.entity === "choice") {
      const parent = stepMap.get(row.parent_step_key.trim() || row.step_key.trim());
      if (!parent) {
        return;
      }
      const choice: StoryChoiceInput = {
        text: row.text.trim(),
        short_text: row.short_text.trim(),
        sort_order: coerceInteger(row.sort_order, parent.choices.length),
      };
      parent.choices.push(choice);
    }
    if (row.entity === "fragment") {
      fragments.push({
        step_key: normalizeStoryRole(row.step_key, fragments.length),
        choice_temp_key: row.parent_choice_index.trim() || null,
        choice_id: null,
        text: row.text.trim(),
        sort_order: coerceInteger(row.sort_order),
      });
    }
    if (row.entity === "twist") {
      twists.push({
        text: row.text.trim(),
        age_group: row.age_group.trim() || null,
        is_published: row.is_published.trim() !== "false",
      });
    }
  });

  return {
    name: templateRow?.name?.trim() || "Story Template",
    slug: templateRow?.slug?.trim() || "story-template",
    description: null,
    keywords: [],
    age_group: null,
    hero_name: null,
    is_published: templateRow?.is_published?.trim() !== "false",
    steps,
    fragments,
    twists,
  };
}
