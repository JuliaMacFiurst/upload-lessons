import { STORY_ROLE_KEYS, type StoryRoleKey } from "../books/types";

const DEFAULT_STEP_QUESTIONS: Record<StoryRoleKey, string> = {
  intro: "С чего началось приключение?",
  journey: "Куда герой отправляется дальше?",
  problem: "Какая проблема появляется в пути?",
  solution: "Как герой решает проблему?",
  ending: "Чем заканчивается история?",
};

function normalizeStoryRole(value: unknown, fallbackIndex = 0): StoryRoleKey {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (STORY_ROLE_KEYS.includes(normalized as StoryRoleKey)) {
      return normalized as StoryRoleKey;
    }
  }
  return STORY_ROLE_KEYS[Math.max(0, Math.min(fallbackIndex, STORY_ROLE_KEYS.length - 1))];
}

function defaultQuestion(role: StoryRoleKey) {
  return DEFAULT_STEP_QUESTIONS[role];
}

function normalizeKeywords(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean),
  )].slice(0, 12);
}

function normalizeChoices(value: unknown) {
  const rawChoices = Array.isArray(value) ? value : [];
  const choices = rawChoices
    .map((choice) => {
      if (!choice || typeof choice !== "object") {
        return null;
      }
      const record = choice as { text?: unknown; keywords?: unknown };
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) {
        return null;
      }
      return {
        text,
        keywords: normalizeKeywords(record.keywords),
      };
    })
    .filter((choice): choice is NonNullable<typeof choice> => choice !== null)
    .slice(0, 3);

  while (choices.length < 3) {
    choices.push({
      text: choices[choices.length - 1]?.text ?? "Герой пробует другой путь.",
      keywords: [],
    });
  }

  return choices;
}

function normalizeSteps(value: unknown) {
  const rawSteps = Array.isArray(value) ? value : [];
  const stepsByRole = new Map<StoryRoleKey, { step_key: StoryRoleKey; question: string; choices: ReturnType<typeof normalizeChoices> }>();

  rawSteps.forEach((step, index) => {
    if (!step || typeof step !== "object") {
      return;
    }
    const record = step as { step_key?: unknown; question?: unknown; choices?: unknown };
    const role = normalizeStoryRole(record.step_key, index);
    if (stepsByRole.has(role)) {
      return;
    }
    const question =
      typeof record.question === "string" && record.question.trim()
        ? record.question.trim()
        : defaultQuestion(role);

    stepsByRole.set(role, {
      step_key: role,
      question,
      choices: normalizeChoices(record.choices),
    });
  });

  return STORY_ROLE_KEYS.map((role) => (
    stepsByRole.get(role) ?? {
      step_key: role,
      question: defaultQuestion(role),
      choices: normalizeChoices([]),
    }
  ));
}

function normalizeFragments(
  value: unknown,
  steps: ReturnType<typeof normalizeSteps>,
) {
  const rawFragments = Array.isArray(value) ? value : [];
  const roleCounters = new Map<StoryRoleKey, number>();

  return rawFragments
    .map((fragment, index) => {
      if (!fragment || typeof fragment !== "object") {
        return null;
      }
      const record = fragment as {
        step_key?: unknown;
        choice_index?: unknown;
        text?: unknown;
        keywords?: unknown;
      };
      const step_key = normalizeStoryRole(record.step_key, index);
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) {
        return null;
      }

      const sequentialIndex = roleCounters.get(step_key) ?? 0;
      const rawChoiceIndex =
        typeof record.choice_index === "number" && Number.isInteger(record.choice_index)
          ? record.choice_index
          : sequentialIndex;
      roleCounters.set(step_key, sequentialIndex + 1);

      const maxIndex = Math.max(0, (steps.find((step) => step.step_key === step_key)?.choices.length ?? 3) - 1);

      return {
        step_key,
        choice_index: Math.max(0, Math.min(maxIndex, rawChoiceIndex)),
        text,
        keywords: normalizeKeywords(record.keywords),
      };
    })
    .filter((fragment): fragment is NonNullable<typeof fragment> => fragment !== null);
}

function normalizeTwists(value: unknown) {
  const rawTwists = Array.isArray(value) ? value : [];
  const twists = rawTwists
    .map((twist) => {
      if (typeof twist === "string") {
        const text = twist.trim();
        return text ? { text, keywords: [] } : null;
      }
      if (!twist || typeof twist !== "object") {
        return null;
      }
      const record = twist as { text?: unknown; keywords?: unknown };
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) {
        return null;
      }
      return {
        text,
        keywords: normalizeKeywords(record.keywords),
      };
    })
    .filter((twist): twist is NonNullable<typeof twist> => twist !== null)
    .slice(0, 3);

  while (twists.length < 3) {
    twists.push({
      text: twists[twists.length - 1]?.text ?? "Но тут случается добрый неожиданный поворот.",
      keywords: [],
    });
  }

  return twists;
}

export function normalizeStoryTemplate(data: unknown) {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const steps = normalizeSteps(record.steps);
  const title = typeof record.title === "string" && record.title.trim()
    ? record.title.trim().slice(0, 120)
    : "Новая история";

  return {
    title,
    steps,
    fragments: normalizeFragments(record.fragments, steps),
    twists: normalizeTwists(record.twists),
  };
}
