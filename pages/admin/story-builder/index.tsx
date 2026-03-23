"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import slugify from "slugify";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../../components/AdminTabs";
import { AdminLogout } from "../../../components/AdminLogout";
import {
  buildStoryPartPrompt,
  buildStoryTemplatePrompt,
} from "../../../lib/ai/prompts";
import {
  estimateFullStoryCost,
  estimateStoryVariantCost,
} from "../../../lib/ai/storyGenerationProfile";
import { slugifyRu } from "../../../lib/books/slugify-ru";
import type {
  StoryBuilderResponse,
  StoryBuilderTemplate,
  StoryFragmentInput,
  StoryTemplateOverviewRow,
  StoryRoleKey,
  StoryTwistInput,
} from "../../../lib/books/types";
import { STORY_ROLE_KEYS } from "../../../lib/books/types";
import {
  adaptStoryTemplateToContract,
  buildStory,
  validateStoryTemplateSource,
} from "../../../lib/story/story-service";
import {
  createDefaultStoryPath,
  type StoryPath,
} from "../../../lib/story/story-contract";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

const DRAFT_TEMPLATE_ID = "__draft__";
const MAX_TEMPLATE_GENERATION_COST_ILS = 0.25;
const NARRATION_QUESTION = "Кто главный герой истории?";

const ROLE_HINTS: Record<StoryRoleKey, string> = {
  narration: "Открытие истории: герой, место и стартовая ситуация до первого вопроса ребёнку.",
  intro: "Начало истории: знакомство с главным героем и отправная точка истории.",
  journey: "Путь героя: куда главный герой отправляется после начала истории.",
  problem: "Проблема: какое препятствие возникает в путешествии.",
  solution: "Решение: как главный герой справляется с проблемой.",
  ending: "Финал: чем заканчивается история и какой остаётся вывод.",
};

const ROLE_QUESTIONS_RU: Record<StoryRoleKey, string> = {
  narration: "Как начинается история?",
  intro: "С чего началось приключение?",
  journey: "Куда герой отправляется дальше?",
  problem: "Какая проблема появляется в пути?",
  solution: "Как герой решает проблему?",
  ending: "Чем заканчивается история?",
};

const ROLE_LABELS_RU: Record<StoryRoleKey, string> = {
  narration: "Наррация",
  intro: "Начало",
  journey: "Путь",
  problem: "Проблема",
  solution: "Решение",
  ending: "Финал",
};

const ROLE_SUBTITLES_RU: Record<StoryRoleKey, string> = {
  narration: "Кто герой и с чего всё началось",
  intro: "Кто герой и где он",
  journey: "Что он делает",
  problem: "Что пошло не так",
  solution: "Как он справился",
  ending: "Чем всё закончилось",
};

const ROLE_EDITOR_HELP: Record<
  StoryRoleKey,
  { description: string; example: string }
> = {
  narration: {
    description: "Открой историю коротким рассказом до первого вопроса",
    example: "Жила-была Аня, и однажды утром на её окне появился светящийся листок",
  },
  intro: {
    description: "Опиши героя и начальную ситуацию",
    example: "Жила-была Аня, и она обожала находить странные вещи",
  },
  journey: {
    description: "Что герой делает или куда отправляется",
    example: "Однажды она пошла на чердак искать старый фонарь",
  },
  problem: {
    description: "Что пошло не так",
    example: "Но дверь захлопнулась, и фонарь вдруг погас",
  },
  solution: {
    description: "Как герой решил проблему",
    example: "Она нашла ключ по тихому звону в темноте",
  },
  ending: {
    description: "Чем всё закончилось",
    example: "С тех пор Аня всегда слушала странные подсказки внимательнее",
  },
};

function getNarrationStepText(template: StoryBuilderTemplate) {
  return template.steps.find((step) => step.step_key === "narration")?.narration ?? "";
}

function getNarrationHeroText(template: StoryBuilderTemplate) {
  return template.hero_name ?? "";
}

function inferHeroContext(template: StoryBuilderTemplate) {
  const heroText = getNarrationHeroText(template).trim();
  if (heroText) {
    return heroText;
  }
  const narrationText = getNarrationStepText(template);
  if (narrationText.trim()) {
    const firstSentence = narrationText.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) {
      return firstSentence;
    }
  }
  return template.name.trim() || "герой из этой истории";
}

function buildAssembledStorySegments(template: StoryBuilderTemplate, path: StoryPath) {
  return buildStory(
    adaptStoryTemplateToContract({
      steps: template.steps,
      fragments: template.fragments,
      twists: template.twists,
    }).template,
    path,
  ).flatMap((segment) => ("twist" in segment ? [] : [segment]));
}

function buildStoryPreviewText(
  template: StoryBuilderTemplate,
  path: StoryPath,
  maxStepIndex: number,
) {
  const segments = buildAssembledStorySegments(template, path).slice(0, maxStepIndex + 1);
  const parts = segments.flatMap((segment) =>
    [segment.sharedText ?? "", segment.choice, segment.text]
      .map((item) => item?.trim() ?? "")
      .filter(Boolean),
  );

  return parts.join(" ").trim();
}

type EditorPreviewSegment = {
  text: string;
  isActive: boolean;
};

function getChoiceFragmentText(
  template: StoryBuilderTemplate,
  stepKey: StoryRoleKey,
  choiceIndex: number,
) {
  return (
    template.fragments.find(
      (fragment) =>
        fragment.step_key === stepKey &&
        fragment.choice_temp_key === String(choiceIndex) &&
        fragment.text.trim().length > 0,
    )?.text?.trim() ?? ""
  );
}

function buildEditorPreviewSegments(
  template: StoryBuilderTemplate,
  stepIndex: number,
  choiceIndex: number,
) {
  const segments: EditorPreviewSegment[] = [];
  const narrationText = getNarrationStepText(template);

  if (narrationText) {
    segments.push({ text: narrationText, isActive: stepIndex === 0 });
  }

  for (let index = 0; index <= stepIndex; index += 1) {
    const step = template.steps[index];
    if (!step) {
      continue;
    }

    const choiceText = step.choices[choiceIndex]?.text?.trim() ?? "";
    const fragmentText = getChoiceFragmentText(template, step.step_key, choiceIndex);
    const isActive = index === stepIndex;

    if (choiceText) {
      segments.push({ text: choiceText, isActive });
    }

    if (fragmentText) {
      segments.push({ text: fragmentText, isActive });
    }
  }

  return segments;
}

function summarizeSelectedPath(path: StoryPath, maxStepIndex: number) {
  return STORY_ROLE_KEYS.slice(0, maxStepIndex + 1)
    .map((role) => `${role}: вариант ${(path[role] ?? 0) + 1}`)
    .join(", ");
}

type StoryTemplateStats = {
  id: string;
  name: string;
  description: string | null;
  age_group: string | null;
  steps: Record<StoryRoleKey, number>;
  narrationFilled: boolean;
  hasHero: boolean;
};

type StoryTemplateListItem = {
  id: string;
  name: string;
};

function helperLabel(label: string, tooltip: string, help: string) {
  return (
    <>
      <span className="books-field__label">
        {label}
        <span className="books-field__tip" title={tooltip}>
          i
        </span>
      </span>
      <span className="books-field__help">{help}</span>
    </>
  );
}

function saveButtonClass(state: Record<string, "saved" | "dirty">, key: string) {
  return state[key] === "saved"
    ? "books-button books-button--success"
    : "books-button books-button--primary";
}

function stripNullId<T extends { id?: string | null }>(item: T): Omit<T, "id"> | T {
  if (item.id == null || item.id === "") {
    const { ...rest } = item;
    return rest;
  }
  return item;
}

function generateSlug(title: string) {
  return (
    slugifyRu(title) ||
    slugify(title, { lower: true, strict: true, trim: true }) ||
    "story-template"
  );
}

function ensureThreeChoices(
  choices: StoryBuilderTemplate["steps"][number]["choices"],
): StoryBuilderTemplate["steps"][number]["choices"] {
  const normalized = Array.from({ length: 3 }, (_, index) => {
    const sourceChoice =
      choices.find((choice) => (choice.sort_order ?? index) === index) ?? null;

    if (sourceChoice) {
      return {
        ...sourceChoice,
        sort_order: index,
      };
    }

    return {
      text: "",
      short_text: "",
      sort_order: index,
    };
  });

  return normalized;
}

function normalizeTemplateChoices(
  template: StoryBuilderTemplate,
): StoryBuilderTemplate {
  return {
    ...template,
    steps: STORY_ROLE_KEYS.map((role, roleIndex) => {
      const sourceStep =
        template.steps.find((step) => step.step_key === role) ??
        {
          step_key: role,
          question: role === "narration" ? NARRATION_QUESTION : ROLE_QUESTIONS_RU[role],
          short_text: null,
          narration: role === "narration" ? "" : null,
          sort_order: roleIndex,
          choices: [],
        };

      return {
        ...sourceStep,
        step_key: role,
        sort_order: roleIndex,
        question: role === "narration"
          ? NARRATION_QUESTION
          : (sourceStep.question || ROLE_QUESTIONS_RU[role]),
        short_text: role === "narration" ? null : (sourceStep.short_text ?? null),
        narration: sourceStep.narration ?? (role === "narration" ? "" : null),
        choices: role === "narration" ? [] : ensureThreeChoices(sourceStep.choices ?? []),
      };
    }),
    hero_name: template.hero_name ?? "",
  };
}

function createEmptyTemplate(index: number): StoryBuilderTemplate {
  return normalizeTemplateChoices({
    name: `Шаблон истории ${index + 1}`,
    slug: `story-template-${index + 1}`,
    description: null,
    keywords: [],
    age_group: null,
    hero_name: "",
    is_published: true,
    steps: STORY_ROLE_KEYS.map((role, roleIndex) => ({
      step_key: role,
      question: role === "narration" ? NARRATION_QUESTION : ROLE_QUESTIONS_RU[role],
      short_text: null,
      narration: role === "narration" ? "" : null,
      sort_order: roleIndex,
      choices: role === "narration" ? [] : ensureThreeChoices([]),
    })),
    fragments: [],
    twists: [],
  });
}

function emptyTwist(): StoryTwistInput {
  return {
    text: "",
    age_group: null,
    is_published: true,
  };
}

function groupOverviewRows(
  templates: StoryTemplateListItem[],
  rows: StoryTemplateOverviewRow[],
): StoryTemplateStats[] {
  const grouped = new Map<string, StoryTemplateStats>();

  templates.forEach((template) => {
    grouped.set(template.id, {
      id: template.id,
      name: template.name,
      description: null,
      age_group: null,
      narrationFilled: false,
      hasHero: false,
      steps: {
        narration: 0,
        intro: 0,
        journey: 0,
        problem: 0,
        solution: 0,
        ending: 0,
      },
    });
  });

  rows.forEach((row) => {
    const current =
      grouped.get(row.id) ??
      {
        id: row.id,
        name: row.name,
        description: row.description,
        age_group: row.age_group,
        narrationFilled: false,
        hasHero: false,
        steps: {
          narration: 0,
          intro: 0,
          journey: 0,
          problem: 0,
          solution: 0,
          ending: 0,
        },
      };

    current.steps[row.step_key] = row.step_key === "narration"
      ? (row.narration_filled ? 1 : 0)
      : row.choices_count;
    if (row.step_key === "narration") {
      current.narrationFilled = row.narration_filled ?? row.choices_count > 0;
      current.hasHero = Boolean(row.hero_name?.trim());
    }

    grouped.set(row.id, current);
  });

  return Array.from(grouped.values()).sort((left, right) =>
    left.name.localeCompare(right.name, "ru"),
  );
}

function totalVariants(stats: StoryTemplateStats) {
  return STORY_ROLE_KEYS.reduce((sum, role) => sum + (stats.steps[role] ?? 0), 0);
}

function completionPercent(stats: StoryTemplateStats) {
  return Math.round(Math.min(totalVariants(stats) / 16, 1) * 100);
}

function progressTone(percent: number) {
  if (percent < 40) {
    return "#d9534f";
  }
  if (percent <= 70) {
    return "#f0ad4e";
  }
  return "#4caf50";
}

function variantsLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return "вариант";
  }
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "варианта";
  }
  return "вариантов";
}

function overviewStepCountLabel(role: StoryRoleKey, count: number) {
  if (role === "narration") {
    return count > 0 ? "1 текст" : "пусто";
  }
  return `${count} ${variantsLabel(count)}`;
}

function showOverviewStepWarning(role: StoryRoleKey, count: number) {
  if (role === "narration") {
    return count === 0;
  }
  return count < 3;
}

function overviewStepWarningLabel(role: StoryRoleKey) {
  return role === "narration" ? "⚠ нет текста" : "⚠ мало вариантов";
}

function formatIls(value: number) {
  return `${value.toFixed(3)} ₪`;
}

function findFirstIncompleteChoiceIndex(
  step: StoryBuilderTemplate["steps"][number],
): number {
  return step.choices.findIndex((choice) => {
    const hasText = choice.text.trim().length > 0;
    const hasShortText = (choice.short_text?.trim().length ?? 0) > 0;

    return !hasText || !hasShortText;
  });
}

function getStepCompletionStats(
  step: StoryBuilderTemplate["steps"][number],
  fragments: StoryBuilderTemplate["fragments"],
  heroName?: string | null,
) {
  const questionComplete = step.question.trim().length > 0;
  if (step.step_key === "narration") {
    const heroComplete = Boolean(heroName?.trim().length);
    const narrationComplete = (step.narration?.trim().length ?? 0) > 0;
    return {
      questionComplete: heroComplete,
      narrationComplete,
      filledChoicesCount: 0,
      choiceFragmentsCount: 0,
      stepComplete: heroComplete && narrationComplete,
    };
  }
  const validChoicesCount = step.choices.filter((choice) => {
    const hasText = choice.text.trim().length > 0;
    const hasShortText = (choice.short_text?.trim().length ?? 0) > 0;
    return hasText && hasShortText;
  }).length;
  const choiceFragmentsCount = step.choices.filter((_, choiceIndex) =>
    fragments.some(
      (fragment) =>
        fragment.step_key === step.step_key &&
        fragment.choice_temp_key === String(choiceIndex) &&
        fragment.text.trim().length > 0,
    ),
  ).length;

  return {
    questionComplete,
    narrationComplete: false,
    filledChoicesCount: validChoicesCount,
    choiceFragmentsCount,
    stepComplete:
      questionComplete && validChoicesCount === 3,
  };
}

function formatStoryWarning(message: string) {
  if (message === "Solution may not resolve the problem.") {
    return "Решение пока не выглядит как реальное преодоление проблемы.";
  }
  if (message === "Ending appears to introduce a new problem.") {
    return "Финал вводит новую проблему вместо завершения истории.";
  }
  if (message.includes("has semantically similar choice texts")) {
    return "Варианты выбора слишком похожи по смыслу.";
  }
  if (message.includes("may not connect clearly to the previous step")) {
    return "Переход с предыдущего шага выглядит логически слабым.";
  }
  if (message === "Journey reads too similarly to intro.") {
    return "Шаг journey слишком похож на intro и не двигает историю дальше.";
  }
  if (message === "Step narration does not have opening narration yet.") {
    return "Шаг narration пока не содержит открывающего текста.";
  }
  return message;
}

function normalizeChoiceSimilarityText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function getSimilarChoiceIndexes(step: StoryBuilderTemplate["steps"][number]) {
  const indexes = new Set<number>();
  const seen = new Map<string, number>();

  step.choices.forEach((choice, index) => {
    const key = normalizeChoiceSimilarityText(choice.text);
    if (!key) {
      return;
    }
    const existing = seen.get(key);
    if (existing !== undefined) {
      indexes.add(existing);
      indexes.add(index);
      return;
    }
    seen.set(key, index);
  });

  return indexes;
}

function getNextStoryRole(role: StoryRoleKey): StoryRoleKey | null {
  const index = STORY_ROLE_KEYS.indexOf(role);
  if (index === -1 || index >= STORY_ROLE_KEYS.length - 1) {
    return null;
  }
  return STORY_ROLE_KEYS[index + 1];
}

function countWords(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function collectTemplateWarnings(template: StoryBuilderTemplate) {
  const warnings: string[] = [];

  template.steps.forEach((step) => {
    const stepLabel = ROLE_LABELS_RU[step.step_key];
    const filledChoices = step.choices.filter((choice) => choice.text.trim().length > 0);

    if (step.step_key === "narration") {
      if (!template.hero_name?.trim().length) {
        warnings.push(`${stepLabel}: Не указан герой.`);
      }
      if (!(step.narration?.trim().length ?? 0)) {
        warnings.push(`${stepLabel}: Нет начала истории.`);
      }
      return;
    }

    if (filledChoices.length === 0) {
      warnings.push(`${stepLabel}: нет вариантов в шаге.`);
    }

    if (step.question.trim().length > 120) {
      warnings.push(`${stepLabel}: вопрос для ребёнка слишком длинный.`);
    }

    if (step.question.trim().length > 0 && countWords(step.question) < 3) {
      warnings.push(`${stepLabel}: вопрос для ребёнка слишком короткий.`);
    }

    step.choices.forEach((choice, choiceIndex) => {
      const choiceLabel = `${stepLabel}, вариант ${choiceIndex + 1}`;

      if (!choice.text.trim()) {
        return;
      }

      if (choice.text.trim().length > 120) {
        warnings.push(`${choiceLabel}: текст слишком длинный.`);
      }
      if (countWords(choice.text) < 3) {
        warnings.push(`${choiceLabel}: текст слишком короткий.`);
      }
    });
  });

  return warnings;
}

function getFragmentRenderKey(
  fragment: StoryBuilderTemplate["fragments"][number],
  fragmentIndex: number,
) {
  return (
    fragment.id ??
    `${fragment.step_key}:${fragment.choice_temp_key ?? "shared"}:${fragment.sort_order}:${fragmentIndex}`
  );
}

export default function StoryBuilderPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const activeTemplateRef = useRef<StoryBuilderTemplate | null>(null);
  const inFlightRequestsRef = useRef(new Map<string, Promise<unknown>>());
  const initialDataRequestedRef = useRef(false);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [editorLoading, setEditorLoading] = useState(false);
  const [overviewStats, setOverviewStats] = useState<StoryTemplateStats[]>([]);
  const [twists, setTwists] = useState<StoryBuilderResponse["twists"]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<StoryBuilderTemplate | null>(null);
  const [selectedStep, setSelectedStep] = useState(0);
  const [showSharedFragments, setShowSharedFragments] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<Record<string, "saved" | "dirty">>({});
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [previewPath, setPreviewPath] = useState<StoryPath>(createDefaultStoryPath());
  const [templateWarnings, setTemplateWarnings] = useState<string[]>([]);
  const [showFragmentHint, setShowFragmentHint] = useState(false);

  const isDirty = Object.values(saveState).includes("dirty");

  const runRequestOnce = useCallback(<T,>(key: string, factory: () => Promise<T>): Promise<T> => {
    const existing = inFlightRequestsRef.current.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
    const next = factory().finally(() => {
      inFlightRequestsRef.current.delete(key);
    });
    inFlightRequestsRef.current.set(key, next);
    return next;
  }, []);

  const loadOverview = useCallback(async () => {
    const overview = await runRequestOnce("overview", () =>
      fetchJson<{
        templates: StoryTemplateListItem[];
        rows: StoryTemplateOverviewRow[];
      }>(
        "/api/admin/story-builder/overview",
      ),
    );
    setOverviewStats(groupOverviewRows(overview.templates, overview.rows));
  }, [runRequestOnce]);

  const loadTwists = useCallback(async () => {
    const data = await runRequestOnce("twists", () =>
      fetchJson<{ twists: StoryBuilderResponse["twists"] }>(
        "/api/admin/story-builder/twists",
      ),
    );
    setTwists(data.twists);
  }, [runRequestOnce]);

  const loadInitialData = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      await Promise.all([loadOverview(), loadTwists()]);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoadingOverview(false);
    }
  }, [loadOverview, loadTwists]);

  const loadTemplate = useCallback(async (templateId: string) => {
    setEditorLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await runRequestOnce(`template:${templateId}`, () =>
        fetchJson<{ template: StoryBuilderTemplate }>(
          `/api/admin/story-builder/template?id=${encodeURIComponent(templateId)}`,
        ),
      );
      const template = normalizeTemplateChoices(data.template);
      setSelectedTemplateId(templateId);
      setActiveTemplate(template);
      setSelectedStep(0);
      setShowSharedFragments(false);
      setIsSlugManuallyEdited(template.slug !== generateSlug(template.name));
      setPreviewPath(createDefaultStoryPath());
      setTemplateWarnings([]);
      setShowFragmentHint(false);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setEditorLoading(false);
    }
  }, [runRequestOnce]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    if (initialDataRequestedRef.current) {
      return;
    }
    initialDataRequestedRef.current = true;
    void loadInitialData();
  }, [sessionChecked, loadInitialData]);

  useEffect(() => {
    activeTemplateRef.current = activeTemplate;
  }, [activeTemplate]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "У вас есть несохранённые изменения. Вы уверены?";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    const currentTemplate = activeTemplateRef.current;
    if (!currentTemplate) {
      return;
    }
    const nextStep = currentTemplate.steps[selectedStep];
    if (!nextStep) {
      return;
    }
    const firstProblemChoiceIndex = findFirstIncompleteChoiceIndex(nextStep);
    setPreviewPath((current) => ({
      ...current,
      [nextStep.step_key]:
        (firstProblemChoiceIndex === -1 ? current[nextStep.step_key] ?? 0 : firstProblemChoiceIndex) as
          0 | 1 | 2,
    }));
    setShowSharedFragments(false);
  }, [selectedStep]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
  };

  const showSaveError = (message: string) => {
    setError(`Ошибка сохранения: ${message}`);
    setSuccess(null);
  };

  const markDirty = (key: string) => {
    setSaveState((current) => ({ ...current, [key]: "dirty" }));
  };

  const markSaved = (key: string) => {
    setSaveState((current) => ({ ...current, [key]: "saved" }));
  };

  const updateActiveTemplate = (
    updater: (current: StoryBuilderTemplate) => StoryBuilderTemplate,
  ) => {
    setActiveTemplate((current) =>
      current ? normalizeTemplateChoices(updater(current)) : current,
    );
  };

  const openNewTemplate = () => {
    const template = createEmptyTemplate(overviewStats.length);
    setSelectedTemplateId(DRAFT_TEMPLATE_ID);
    setActiveTemplate(template);
    setSelectedStep(0);
    setShowSharedFragments(false);
    setIsSlugManuallyEdited(false);
    setPreviewPath(createDefaultStoryPath());
    setSaveState({});
    setTemplateWarnings([]);
    setShowFragmentHint(false);
    setError(null);
    setSuccess(null);
  };

  const closeEditor = () => {
    setSelectedTemplateId(null);
    setActiveTemplate(null);
    setSelectedStep(0);
    setShowSharedFragments(false);
    setIsSlugManuallyEdited(false);
    setPreviewPath(createDefaultStoryPath());
    setSaveState({});
    setTemplateWarnings([]);
    setShowFragmentHint(false);
    setError(null);
    setSuccess(null);
  };

  const buildStoryTemplatePayload = (template: StoryBuilderTemplate) => ({
    ...template,
    name: template.name.trim(),
    slug: generateSlug(template.slug || template.name),
    description: template.description?.trim() || null,
    keywords: template.keywords ?? [],
    age_group: template.age_group?.trim() || null,
    hero_name: template.hero_name?.trim() || null,
    is_published: template.is_published ?? true,
    steps: STORY_ROLE_KEYS.map((role, index) => {
      const step = template.steps.find((item) => item.step_key === role);
      return stripNullId({
        id: step?.id ?? null,
        step_key: role,
        question: role === "narration" ? NARRATION_QUESTION : (step?.question?.trim() || ROLE_QUESTIONS_RU[role]),
        short_text: role === "narration" ? null : (step?.short_text?.trim() || null),
        narration: step?.narration?.trim() || null,
        sort_order: index,
        choices: role === "narration"
          ? []
          : (step?.choices ?? []).map((choice, choiceIndex) => stripNullId({
              id: choice.id ?? null,
              text: choice.text,
              short_text: choice.short_text ?? "",
              sort_order: choice.sort_order ?? choiceIndex,
            })),
      });
    }),
    fragments: template.fragments
      .filter((fragment) => fragment.text.trim().length > 0)
      .map((fragment, index) => stripNullId({
        ...fragment,
        id: fragment.id ?? null,
        sort_order: fragment.sort_order ?? index,
      })),
  });

  const persistStoryTemplate = async (template: StoryBuilderTemplate) =>
    fetchJson<{ ok: true; template: StoryBuilderTemplate; warnings: string[] }>(
      "/api/admin/story-builder/template",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildStoryTemplatePayload(template),
          mode: "draft",
        }),
      },
    );

  const markStoryTemplateSaved = () => {
    setSaveState((current) => ({
      ...current,
      template: "saved",
      ...Object.fromEntries(
        STORY_ROLE_KEYS.flatMap((role) => [
          [`step:${role}`, "saved"],
          [`fragments:${role}`, "saved"],
        ]),
      ),
    }));
  };

  const isStepDirty = (stepKey: StoryRoleKey) =>
    saveState[`step:${stepKey}`] === "dirty" || saveState[`fragments:${stepKey}`] === "dirty";

  const saveTemplateMetaState = async (options?: { silent?: boolean }) => {
    const templateSnapshot = activeTemplateRef.current;
    if (!templateSnapshot) {
      return null;
    }

    setBusyKey("template-save");
    setError(null);
    try {
      const data = await persistStoryTemplate(templateSnapshot);
      setActiveTemplate(normalizeTemplateChoices(data.template));
      setSelectedTemplateId(data.template.id ?? DRAFT_TEMPLATE_ID);
      markStoryTemplateSaved();
      setTemplateWarnings(data.warnings);
      await loadOverview();
      if (!options?.silent) {
        showSuccess(
          data.warnings.length > 0
            ? "Черновик сохранён с предупреждениями."
            : "Шаблон сохранён: название, slug и герой.",
        );
      }
      return data.template;
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      showSaveError(message);
      throw fetchError;
    } finally {
      setBusyKey(null);
    }
  };

  const saveStepState = async (
    stepIndex: number,
    options?: { silent?: boolean },
  ) => {
    const templateSnapshot = activeTemplateRef.current;
    if (!templateSnapshot) {
      return null;
    }

    const step = templateSnapshot.steps[stepIndex];
    if (!step) {
      return null;
    }

    setBusyKey(`step-save:${step.step_key}`);
    setError(null);
    try {
      const result = await persistStoryTemplate(templateSnapshot);
      const persisted = result.template;

      setActiveTemplate(normalizeTemplateChoices(persisted));
      setIsSlugManuallyEdited(
        persisted.slug !== generateSlug(persisted.name),
      );

      markStoryTemplateSaved();
      setTemplateWarnings(result.warnings);
      await loadOverview();
      if (!options?.silent) {
        showSuccess(
          result.warnings.length > 0
            ? "Черновик шага сохранён с предупреждениями."
            : step.step_key === "narration"
              ? "Сохранено вступление: герой и начало истории."
              : `Сохранён шаг ${ROLE_LABELS_RU[step.step_key].toLowerCase()} и его фрагменты.`,
        );
      }
      return persisted;
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      showSaveError(message);
      throw fetchError;
    } finally {
      setBusyKey(null);
    }
  };

  const saveCurrentEditorState = async (options?: { silent?: boolean }) => {
    const templateSnapshot = activeTemplateRef.current;
    if (!templateSnapshot) {
      return;
    }
    const currentStep = templateSnapshot.steps[selectedStep];
    if (!currentStep) {
      return;
    }

    if (isStepDirty(currentStep.step_key)) {
      await saveStepState(selectedStep, options);
      return;
    }

    if (saveState.template === "dirty") {
      await saveTemplateMetaState(options);
    }
  };

  const deleteActiveTemplate = async () => {
    const templateSnapshot = activeTemplateRef.current;
    if (!templateSnapshot?.id || templateSnapshot.id === DRAFT_TEMPLATE_ID) {
      closeEditor();
      return;
    }

    const confirmed = window.confirm(
      "Удалить шаблон и все связанные данные? Это действие нельзя отменить.",
    );
    if (!confirmed) {
      return;
    }

    setBusyKey("template-delete");
    setError(null);
    try {
      await fetchJson<{ ok: true }>(
        `/api/admin/story-builder/template?id=${encodeURIComponent(templateSnapshot.id)}`,
        {
          method: "DELETE",
        },
      );
      await loadOverview();
      closeEditor();
      showSuccess("Шаблон удалён вместе со связанными шагами, вариантами и фрагментами.");
    } catch (fetchError) {
      showSaveError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const safeReturnToTemplateList = async () => {
    if (!isDirty) {
      closeEditor();
      return;
    }

    try {
      await saveCurrentEditorState({ silent: true });
      closeEditor();
    } catch {
      const confirmLeave = window.confirm(
        "Не удалось автосохранить изменения. Всё равно закрыть редактор?",
      );

      if (confirmLeave) {
        closeEditor();
      }
    }
  };

  const switchStep = async (index: number) => {
    if (index === selectedStep) {
      return;
    }

    try {
      await saveCurrentEditorState({ silent: true });
      setSelectedStep(index);
    } catch {
      // keep the current step selected when autosave fails
    }
  };

  const setSelectedChoiceIndex = (stepKey: StoryRoleKey, choiceIndex: number) => {
    setPreviewPath((current) => ({
      ...current,
      [stepKey]: Math.max(0, Math.min(2, choiceIndex)) as 0 | 1 | 2,
    }));
  };

  const updateChoiceFragment = (
    stepIndex: number,
    choiceIndex: number | null,
    fragmentGlobalIndex: number,
    updater: (fragment: StoryBuilderTemplate["fragments"][number]) => StoryBuilderTemplate["fragments"][number],
  ) => {
    updateActiveTemplate((current) => {
      const next = structuredClone(current);
      const step = next.steps[stepIndex];
      const fragment = next.fragments[fragmentGlobalIndex];
      if (!step || !fragment) {
        return next;
      }
      const expectedChoiceKey = choiceIndex === null ? null : String(choiceIndex);
      if (fragment.step_key !== step.step_key || (fragment.choice_temp_key ?? null) !== expectedChoiceKey) {
        return next;
      }
      next.fragments[fragmentGlobalIndex] = updater(fragment);
      return next;
    });
  };

  const deleteChoiceFragment = (
    stepIndex: number,
    choiceIndex: number | null,
    fragmentGlobalIndex: number,
  ) => {
    updateActiveTemplate((current) => {
      const next = structuredClone(current);
      const step = next.steps[stepIndex];
      const fragment = next.fragments[fragmentGlobalIndex];
      if (!step || !fragment) {
        return next;
      }
      const expectedChoiceKey = choiceIndex === null ? null : String(choiceIndex);
      if (fragment.step_key !== step.step_key || (fragment.choice_temp_key ?? null) !== expectedChoiceKey) {
        return next;
      }
      next.fragments.splice(fragmentGlobalIndex, 1);
      return next;
    });
  };

  const saveTemplate = async () => {
    try {
      await saveTemplateMetaState();
    } catch {
      // errors are handled inside saveTemplateMetaState
    }
  };

  const buildGenerationContext = (
    template: StoryBuilderTemplate,
    stepIndex: number,
    path: StoryPath,
    options?: { choiceIndex?: number; choiceText?: string | null },
  ) => {
    const step = template.steps[stepIndex];
    const nextRole = getNextStoryRole(step.step_key);
    const selectedChoiceText =
      options?.choiceText?.trim() ||
      (typeof options?.choiceIndex === "number"
        ? step.choices[options.choiceIndex]?.text?.trim() || ""
        : "");
    const introChoiceDirection =
      step.step_key === "intro" && typeof options?.choiceIndex === "number"
        ? options.choiceIndex === 0
          ? "Сделай исследовательское направление: странное место, звук, след, карта, находка."
          : options.choiceIndex === 1
            ? "Сделай игровое или социальное направление: помощь, игра, встреча, приглашение, подготовка к событию."
            : "Сделай необычное или любопытное направление: странный предмет, смешная случайность, волшебная деталь, неожиданный гость."
        : null;
    const introFragmentTone =
      step.step_key === "intro"
        ? "Для intro fragment добавь короткую деталь настроения, образ или ощущение. Не пересказывай choice."
        : null;
    const narrationText = getNarrationStepText(template);
    const heroContext = inferHeroContext(template);
    const currentStoryText = buildStoryPreviewText(template, path, stepIndex);
    const selectedPath = summarizeSelectedPath(path, stepIndex);

    return [
      `Название шаблона: ${template.name || "Новая история"}.`,
      `Главный герой: ${heroContext}.`,
      `Текст открытия истории: ${narrationText || "Начало истории ещё не заполнено."}`,
      "Не предполагай заранее тип героя. Опирайся только на название шаблона и текст начала истории.",
      `Текущий шаг: ${step.step_key}.`,
      `Цель шага: ${ROLE_HINTS[step.step_key]}`,
      `Выбранная ветка: ${selectedPath || "ветка пока не выбрана"}.`,
      `Полный текущий текст истории:\n${currentStoryText || narrationText || "Текст истории пока не заполнен."}`,
      `Текущий вопрос шага: ${step.question || "Вопрос ещё не заполнен."}`,
      selectedChoiceText
        ? `Выбранный choice: ${selectedChoiceText}`
        : "Выбранный choice: ещё не задан.",
      "Продолжай именно текущую ветку истории.",
      "Не начинай историю заново и не меняй героя без причины.",
      introChoiceDirection ?? "",
      introFragmentTone ?? "",
      nextRole
        ? `Следующий шаг должен логично подготовить роль: ${nextRole}.`
        : "Это финальный шаг, он должен мягко завершить историю.",
    ].filter(Boolean).join("\n\n");
  };

  const generateTemplate = async () => {
    if (!activeTemplate) {
      return;
    }

    setBusyKey("template-generate");
    setError(null);
    try {
      const data = await fetchJson<{
        title: string;
        steps: Array<{
          step_key: StoryRoleKey;
          question?: string;
          short_text?: string;
          narration?: string;
          choices?: Array<{ text: string; short_text: string }>;
        }>;
        fragments: Array<{
          step_key: StoryRoleKey;
          choice_index: number;
          text: string;
        }>;
        twists: Array<{ text: string }>;
      }>("/api/admin/generate-story-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: activeTemplate.name || "",
          description: `Шаблон детской интерактивной истории: ${activeTemplate.name}`,
          ageGroup: null,
          templateName: activeTemplate.name,
          templateSlug: activeTemplate.slug,
        }),
      });

      updateActiveTemplate((current) => ({
        ...current,
        name: data.title,
        slug: isSlugManuallyEdited ? current.slug : generateSlug(data.title),
        steps: STORY_ROLE_KEYS.map((role, index) => {
          const generatedStep = data.steps.find((item) => item.step_key === role);
          const currentStep = current.steps.find((item) => item.step_key === role);
          return {
            id: currentStep?.id,
            step_key: role,
            question:
              role === "narration"
                ? NARRATION_QUESTION
                : generatedStep?.question ?? ROLE_QUESTIONS_RU[role],
            short_text:
              role === "narration"
                ? null
                : currentStep?.short_text ?? null,
            narration:
              role === "narration"
                ? generatedStep?.narration ?? currentStep?.narration ?? ""
                : currentStep?.narration ?? null,
            sort_order: index,
            choices:
              role === "narration"
                ? []
                : (generatedStep?.choices ?? []).map((choice, choiceIndex) => ({
                    text: choice.text,
                    short_text: choice.short_text,
                    sort_order: choiceIndex,
                  })),
          };
        }),
        fragments: data.fragments.map((fragment, index) => ({
          step_key: fragment.step_key,
          choice_id: null,
          choice_temp_key: String(fragment.choice_index),
          text: fragment.text,
          sort_order: index,
        })),
        hero_name: data.steps.find((item) => item.step_key === "narration")?.question ?? current.hero_name ?? "",
        twists: data.twists.map((twist, index) => ({
          id: current.twists[index]?.id,
          text: twist.text,
          age_group: current.twists[index]?.age_group ?? null,
          is_published: current.twists[index]?.is_published ?? true,
        })),
      }));
      markDirty("template");
      STORY_ROLE_KEYS.forEach((role) => {
        markDirty(`step:${role}`);
        if (role !== "narration") {
          markDirty(`fragments:${role}`);
        }
      });
      markDirty("twists");
      showSuccess("Шаблон истории сгенерирован.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveStep = async () => {
    try {
      await saveStepState(selectedStep);
    } catch {
      // errors are handled inside saveStepState
    }
  };

  const generateChoice = async (choiceIndex: number) => {
    if (!activeTemplate) {
      return;
    }

    const step = activeTemplate.steps[selectedStep];
    if (!step) {
      return;
    }

    setBusyKey(`choice-generate:${step.step_key}:${choiceIndex}`);
    setError(null);
    try {
      const roleFragments = activeTemplate.fragments.filter(
        (fragment) => fragment.step_key === step.step_key,
      );
      const filledChoices = step.choices
        .map((choice, index) => ({
          text: choice.text.trim(),
          short_text: choice.short_text?.trim() ?? "",
          fragment:
            roleFragments.find(
              (fragment) =>
                fragment.choice_temp_key === String(index) &&
                fragment.text.trim().length > 0,
            )?.text ?? "",
        }))
        .filter((choice) => choice.text.length > 0);
      const emptyChoiceIndexes = step.choices
        .map((choice, index) => (choice.text.trim() ? null : index))
        .filter((index): index is number => index !== null);
      const targetChoiceIndexes =
        emptyChoiceIndexes.length > 0 ? emptyChoiceIndexes : [choiceIndex];
      const currentStoryText = buildStoryPreviewText(activeTemplate, previewPath, selectedStep);
      const selectedPath = summarizeSelectedPath(previewPath, selectedStep);
      const data = await fetchJson<{
        choices: Array<{ text: string; fragment: string; short_text: string }>;
      }>(
        "/api/admin/generate-story-step-choices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeTemplate.name,
            stepKey: step.step_key,
            narrationText: getNarrationStepText(activeTemplate),
            currentStoryText,
            selectedPath,
            roleDescription: ROLE_HINTS[step.step_key],
            question: step.question,
            existingChoices: filledChoices,
            count: targetChoiceIndexes.length,
          }),
        },
      );

      if (!Array.isArray(data.choices) || data.choices.length === 0) {
        console.error("EMPTY_STEP_CHOICES_RESPONSE", {
          step: step.step_key,
          choiceIndex,
          response: data,
        });
        throw new Error("Не удалось сгенерировать недостающие варианты.");
      }

      updateActiveTemplate((current) => ({
        ...current,
        steps: current.steps.map((item, index) =>
          index === selectedStep
            ? {
                ...item,
                choices: item.choices.map((choice, itemIndex) =>
                  targetChoiceIndexes.includes(itemIndex)
                    ? {
                        ...choice,
                        text:
                          data.choices[targetChoiceIndexes.indexOf(itemIndex)]?.text ?? choice.text,
                        short_text:
                          data.choices[targetChoiceIndexes.indexOf(itemIndex)]?.short_text ?? choice.short_text,
                      }
                    : choice,
                ),
              }
            : item,
        ),
        fragments: (() => {
          const nextFragments = [...current.fragments];
          let nextSortOrder = nextFragments.filter(
            (fragment) => fragment.step_key === step.step_key,
          ).length;

          targetChoiceIndexes.forEach((targetIndex, generatedIndex) => {
            const generatedChoice = data.choices[generatedIndex];
            if (!generatedChoice) {
              return;
            }

            const existingFragmentIndex = nextFragments.findIndex(
              (fragment) =>
                fragment.step_key === step.step_key &&
                fragment.choice_temp_key === String(targetIndex),
            );

            if (existingFragmentIndex >= 0) {
              nextFragments[existingFragmentIndex] = {
                ...nextFragments[existingFragmentIndex],
                text: generatedChoice.fragment,
              };
              return;
            }

            nextFragments.push({
              step_key: step.step_key,
              choice_id: null,
              choice_temp_key: String(targetIndex),
              text: generatedChoice.fragment,
              sort_order: nextSortOrder,
            });
            nextSortOrder += 1;
          });

          return nextFragments;
        })(),
      }));
      setSelectedChoiceIndex(step.step_key, targetChoiceIndexes[0] ?? choiceIndex);
      markDirty(`fragments:${step.step_key}`);
      markDirty(`step:${step.step_key}`);
      showSuccess(
        targetChoiceIndexes.length > 1
          ? `Для шага ${step.step_key} добавлены недостающие варианты.`
          : `Вариант для шага ${step.step_key} сгенерирован.`,
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateFragment = async (fragmentIndex: number) => {
    if (!activeTemplate) {
      return;
    }

    const step = activeTemplate.steps[selectedStep];
    const fragment = activeTemplate.fragments[fragmentIndex];
    if (!step || !fragment) {
      return;
    }

    const choiceIndex =
      fragment.choice_temp_key !== null &&
      fragment.choice_temp_key !== undefined &&
      fragment.choice_temp_key !== ""
        ? Number(fragment.choice_temp_key)
        : undefined;
    const choiceText =
      typeof choiceIndex === "number" && choiceIndex >= 0
        ? step.choices[choiceIndex]?.text ?? ""
        : "";

    setBusyKey(`fragment-generate:${step.step_key}:${fragmentIndex}`);
    setError(null);
    try {
      const data = await fetchJson<{ text: string; short_text: string }>(
        "/api/admin/generate-story-part",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeTemplate.name,
            description: `Роль истории ${step.step_key}. ${ROLE_HINTS[step.step_key]}`,
            ageGroup: null,
            templateName: activeTemplate.name,
            kind: "fragment",
            storyRole: step.step_key,
            previousRole:
              selectedStep > 0 ? STORY_ROLE_KEYS[selectedStep - 1] : null,
            context: buildGenerationContext(activeTemplate, selectedStep, previewPath, {
              choiceIndex,
              choiceText,
            }),
          }),
        },
      );

      updateActiveTemplate((current) => ({
        ...current,
        fragments: current.fragments.map((item, index) =>
          index === fragmentIndex
            ? {
                ...item,
                text: data.text,
              }
            : item,
        ),
      }));
      markDirty(`fragments:${step.step_key}`);
      markDirty(`step:${step.step_key}`);
      showSuccess("Фрагмент сгенерирован.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const addFragment = (choiceIndex: number | null) => {
    if (!activeTemplate) {
      return;
    }

    const step = activeTemplate.steps[selectedStep];
    if (!step) {
      return;
    }

    const nextFragment: StoryFragmentInput = {
      step_key: step.step_key,
      choice_id: null,
      choice_temp_key: choiceIndex === null ? null : String(choiceIndex),
      text: "",
      sort_order: activeTemplate.fragments.filter(
        (fragment) => fragment.step_key === step.step_key,
      ).length,
    };

    updateActiveTemplate((current) => ({
      ...current,
      fragments: [...current.fragments, nextFragment],
    }));
    markDirty(`fragments:${step.step_key}`);
    markDirty(`step:${step.step_key}`);
  };

  const upsertNarrationStep = (value: string) => {
    setActiveTemplate((prev) => {
      if (!prev) {
        return prev;
      }
      const next = structuredClone(prev);
      const narrationIndex = next.steps.findIndex((step) => step.step_key === "narration");
      if (narrationIndex === -1) {
        return prev;
      }
      next.steps[narrationIndex].narration = value;
      return next;
    });
    markDirty("step:narration");
  };

  const upsertNarrationHero = (value: string) => {
    setActiveTemplate((prev) => {
      if (!prev) {
        return prev;
      }
      const next = structuredClone(prev);
      const narrationIndex = next.steps.findIndex((step) => step.step_key === "narration");
      if (narrationIndex === -1) {
        return prev;
      }
      next.hero_name = value;
      return next;
    });
    markDirty("template");
  };

  const generateNarrationStep = async () => {
    if (!activeTemplate) {
      return;
    }

    setBusyKey("narration-generate:narration");
    setError(null);
    try {
      const narrationStep = activeTemplate.steps.find((step) => step.step_key === "narration");
      if (!narrationStep) {
        throw new Error("Не найден шаг narration.");
      }
      const data = await fetchJson<{ text: string; short_text: string }>(
        "/api/admin/generate-story-part",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: activeTemplate.name,
            description: `Начало истории: первый рассказный абзац до вопроса ребёнку.`,
            ageGroup: null,
            templateName: activeTemplate.name,
            kind: "fragment",
            storyRole: "narration",
            previousRole: null,
            context: [
              buildGenerationContext(activeTemplate, 0, previewPath),
              "Это основной текст начала истории.",
              "Он должен идти до вопроса ребёнку.",
              "Представь героя, место и стартовую ситуацию.",
              "Пиши только по-русски.",
              "Сделай 1-2 коротких предложения, тёплых и понятных детям.",
            ].join("\n\n"),
          }),
        },
      );

      updateActiveTemplate((current) => ({
        ...current,
        steps: current.steps.map((step) =>
          step.step_key === "narration"
            ? {
                ...step,
                narration: data.text,
              }
            : step,
        ),
      }));
      markDirty(`step:${narrationStep.step_key}`);
      showSuccess("Начало истории сгенерировано.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateTwist = async (index: number) => {
    setBusyKey(`twist-generate:${index}`);
    setError(null);
    try {
      const data = await fetchJson<{ text: string }>(
        "/api/admin/generate-story-part",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Неожиданный поворот",
            description: "Смешной поворот для любой детской истории.",
            ageGroup: null,
            templateName: "Глобальные повороты",
            kind: "twist",
            storyRole: "ending",
            previousRole: "solution",
            context: "Короткий неожиданный, но добрый поворот для истории.",
          }),
        },
      );
      setTwists((current) =>
        current.map((twist, twistIndex) =>
          twistIndex === index
            ? { ...twist, text: data.text }
            : twist,
        ),
      );
      markDirty("twists");
      showSuccess("Неожиданный поворот сгенерирован.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveTwists = async () => {
    setBusyKey("twists-save");
    setError(null);
    try {
      const data = await fetchJson<{ twists: StoryBuilderResponse["twists"] }>(
        "/api/admin/story-builder/twists",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ twists }),
        },
      );
      setTwists(data.twists);
      markSaved("twists");
      showSuccess("Неожиданные повороты сохранены.");
    } catch (fetchError) {
      showSaveError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const runTemplateValidation = () => {
    if (!activeTemplate) {
      return;
    }
    const warnings = collectTemplateWarnings(activeTemplate);
    setTemplateWarnings(warnings);
    if (warnings.length === 0) {
      showSuccess("Шаблон выглядит понятно и заполнен без явных проблем.");
    }
  };

  const activeStep = activeTemplate?.steps[selectedStep] ?? null;
  const selectedChoiceIndex = activeStep ? previewPath[activeStep.step_key] ?? 0 : 0;
  const activeStepKey = activeStep ? `step:${activeStep.step_key}` : "";
  const fullTemplatePrompt = useMemo(() => (
    activeTemplate
      ? buildStoryTemplatePrompt({
          title: activeTemplate.name,
          description: `Шаблон детской интерактивной истории: ${activeTemplate.name}`,
          ageGroup: null,
          templateName: activeTemplate.name,
          templateSlug: activeTemplate.slug,
        })
      : ""
  ), [activeTemplate]);
  const variantPrompt = useMemo(() => (
    activeTemplate
      ? buildStoryPartPrompt({
          title: activeTemplate.name,
          description: `Шаблон истории ${activeTemplate.name}`,
          ageGroup: null,
          templateName: activeTemplate.name,
          kind: "fragment",
          storyRole: activeStep?.step_key ?? "narration",
          previousRole: selectedStep > 0 ? STORY_ROLE_KEYS[selectedStep - 1] : null,
          context: "Оцени стоимость генерации одного варианта истории.",
        })
      : ""
  ), [activeStep?.step_key, activeTemplate, selectedStep]);
  const variantEstimate = useMemo(() => (
    activeTemplate ? estimateStoryVariantCost(variantPrompt) : null
  ), [activeTemplate, variantPrompt]);
  const fullStoryEstimate = useMemo(() => (
    activeTemplate ? estimateFullStoryCost(variantPrompt) : null
  ), [activeTemplate, variantPrompt]);
  const templateEstimate = useMemo(() => (
    activeTemplate ? estimateFullStoryCost(fullTemplatePrompt) : null
  ), [activeTemplate, fullTemplatePrompt]);
  const isTemplateCostHigh = (templateEstimate?.ils ?? 0) > MAX_TEMPLATE_GENERATION_COST_ILS;

  const stepValidation = useMemo(() => (
    activeTemplate && activeStep
      ? validateStoryTemplateSource(
          {
            steps: activeTemplate.steps,
            fragments: activeTemplate.fragments,
            twists: activeTemplate.twists,
          },
          { scope: activeStep.step_key },
        )
      : null
  ), [activeStep, activeTemplate]);

  const roleFragmentEntries = useMemo(() => (
    activeTemplate && activeStep
      ? activeTemplate.fragments
          .map((fragment, globalIndex) => ({ fragment, globalIndex }))
          .filter(({ fragment }) => fragment.step_key === activeStep.step_key)
      : []
  ), [activeStep, activeTemplate]);
  const roleFragments = roleFragmentEntries.map(({ fragment }) => fragment);
  const generalFragments = roleFragmentEntries.filter(
    ({ fragment }) => !fragment.choice_temp_key,
  );
  const advancedGeneralFragments = generalFragments;
  const choiceFragments =
    activeStep === null
      ? []
      : roleFragmentEntries
          .filter(
            ({ fragment }) =>
              fragment.choice_temp_key === String(selectedChoiceIndex),
          );
  const stepStats = useMemo(() => (
    activeTemplate && activeStep
      ? getStepCompletionStats(activeStep, activeTemplate.fragments, activeTemplate.hero_name)
      : null
  ), [activeStep, activeTemplate]);
  const similarChoiceIndexes = useMemo(() => (
    activeStep ? getSimilarChoiceIndexes(activeStep) : new Set<number>()
  ), [activeStep]);
  const editorPreviewSegments = useMemo(() => (
    activeTemplate && activeStep
      ? buildEditorPreviewSegments(activeTemplate, selectedStep, selectedChoiceIndex)
      : []
  ), [activeStep, activeTemplate, selectedChoiceIndex, selectedStep]);
  const narrationStepValue = activeTemplate ? getNarrationStepText(activeTemplate) : "";
  const narrationHeroValue = activeTemplate ? getNarrationHeroText(activeTemplate) : "";

  const twistsPanel = twists.map((twist, twistIndex) => (
    <div className="books-question" key={twist.id ?? `twist-${twistIndex}`}>
      <div className="books-section-head">
        <div>
          <strong>Поворот {twistIndex + 1}</strong>
          <div className="books-section-help">Используется во всех историях</div>
        </div>
        <button
          type="button"
          className="books-button books-button--secondary"
          disabled={busyKey === `twist-generate:${twistIndex}`}
          onClick={() => {
            void generateTwist(twistIndex);
          }}
        >
          {busyKey === `twist-generate:${twistIndex}`
            ? "Генерация..."
            : "Сгенерировать"}
        </button>
      </div>

      <div className="books-grid books-grid--2">
        <label className="books-field">
          {helperLabel(
            "Текст поворота",
            "Короткий неожиданный поворот истории.",
            "Например: Вдруг на дороге появился поющий чайник.",
          )}
          <input
            className="books-input"
            value={twist.text}
            placeholder="Короткий неожиданный поворот"
            onChange={(event) => {
              setTwists((current) =>
                current.map((item, index) =>
                  index === twistIndex
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              );
              markDirty("twists");
            }}
          />
        </label>

      </div>
    </div>
  ));

  if (!sessionChecked || loadingOverview) {
    return (
      <p style={{ padding: 24 }}>
        {loadingOverview
          ? "Загрузка конструктора историй..."
          : "Проверка сессии..."}
      </p>
    );
  }

  return (
    <div className="books-admin-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <header className="books-admin-header">
        <div>
          <h1 className="books-admin-title">Конструктор историй</h1>
          <p className="books-admin-subtitle">
            Фокусный режим: список шаблонов отдельно, редактор отдельно, в памяти
            только один активный шаблон.
          </p>
          {isDirty ? (
            <p
              className="books-section-help"
              style={{ color: "#a33a3a", fontWeight: 600, marginTop: 8 }}
            >
              ● Несохранено
            </p>
          ) : null}
        </div>
        {selectedTemplateId ? (
          <div className="books-actions books-actions--compact">
            <button
              type="button"
              className="books-button books-button--ghost"
              onClick={() => {
                void safeReturnToTemplateList();
              }}
            >
              ← К списку шаблонов
            </button>
          </div>
        ) : (
          <div className="books-actions books-actions--compact">
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={openNewTemplate}
            >
              Добавить шаблон
            </button>
          </div>
        )}
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      {!selectedTemplateId && (
        <>
          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Шаблоны</h2>
                <p className="books-section-help">
                  Список и прогресс. Редактор открывается на отдельном экране.
                </p>
              </div>
            </div>

            {overviewStats.length === 0 ? (
              <div className="books-section-help">
                Сохранённые конструкторы ещё не найдены.
              </div>
            ) : (
              <div className="story-overview-grid">
                {overviewStats.map((stats) => {
                  const percent = completionPercent(stats);
                  const total = totalVariants(stats);

                  return (
                    <article className="story-overview-card" key={stats.id}>
                      <div className="books-section-head">
                        <div>
                          <h3 className="books-subpanel__title">{stats.name}</h3>
                          <p className="books-section-help">
                            {stats.description?.trim() || "Без описания"}
                          </p>
                          <p className="books-section-help">
                            Главный герой:{" "}
                            <span
                              style={{
                                color: stats.hasHero ? "#2e7d32" : "#b23b3b",
                                fontWeight: 600,
                              }}
                            >
                              {stats.hasHero ? "есть" : "нет"}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          disabled={editorLoading}
                          onClick={() => {
                            void loadTemplate(stats.id);
                          }}
                        >
                          {editorLoading && selectedTemplateId === stats.id
                            ? "Загрузка..."
                            : "Открыть"}
                        </button>
                      </div>

                      <div className="story-overview-steps">
                        {STORY_ROLE_KEYS.map((role) => {
                          const count = stats.steps[role] ?? 0;
                          return (
                            <div className="story-overview-step" key={`${stats.id}:${role}`}>
                              <span className="story-overview-step__role">
                                {ROLE_LABELS_RU[role]}
                              </span>
                              <span className="story-overview-step__count">
                                {overviewStepCountLabel(role, count)}
                              </span>
                              {showOverviewStepWarning(role, count) ? (
                                <span className="story-overview-step__warning">
                                  {overviewStepWarningLabel(role)}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      <div className="story-overview-progress">
                        <div className="story-overview-progress__meta">
                          <span>Заполненность</span>
                          <span>
                            {percent}% · {total}/16
                          </span>
                        </div>
                        <div className="story-progress">
                          <div
                            className="story-progress__bar"
                            style={{
                              width: `${percent}%`,
                              background: `linear-gradient(90deg, ${progressTone(percent)}, ${progressTone(percent)})`,
                            }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Глобальные неожиданные повороты</h2>
                <p className="books-section-help">
                  Эти повороты могут появляться в любой истории. Генератор случайно
                  вставляет их в сюжет.
                </p>
              </div>
              <div className="books-actions books-actions--compact">
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => {
                    setTwists((current) => [...current, emptyTwist()]);
                    markDirty("twists");
                  }}
                >
                  Добавить поворот
                </button>
                <button
                  type="button"
                  className={saveButtonClass(saveState, "twists")}
                  disabled={busyKey === "twists-save"}
                  onClick={() => {
                    void saveTwists();
                  }}
                >
                  {busyKey === "twists-save"
                    ? "Сохраняю повороты..."
                    : saveState.twists === "saved"
                      ? "Повороты сохранены"
                      : "Сохранить повороты"}
                </button>
              </div>
            </div>

            <div
              style={{
                marginBottom: 16,
                borderTop: "1px solid #e6ddcf",
                paddingTop: 16,
              }}
            >
              <div
                className="books-section-help"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fff8ec",
                }}
              >
                Общий пул поворотов. Этот блок не относится к какому-то одному шаблону.
              </div>
            </div>

            {/* future: allow template-specific twists */}
            {twistsPanel}
          </section>
        </>
      )}

      {selectedTemplateId && activeTemplate && (
        <>
          <section className="books-panel">
            <div
              style={{
                marginBottom: 16,
                padding: 16,
                borderRadius: 16,
                border: "1px solid #dbe8ff",
                background: "#f7faff",
              }}
            >
              <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>
                Как работает генератор историй
              </h3>
              <div className="books-section-help" style={{ display: "grid", gap: 8 }}>
                <div>1. История состоит из 6 этапов: Завязка, Начало, Путь, Проблема, Решение, Финал</div>
                <div>2. В каждом шаге есть несколько вариантов.</div>
                <div>
                  3. Генератор выбирает один вариант из каждого шага, добавляет
                  неожиданные события и собирает финальную историю.
                </div>
              </div>
            </div>

            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Информация о шаблоне</h2>
                <p className="books-section-help">
                  Эта кнопка сохраняет только поля шаблона: название, slug и героя.
                </p>
              </div>
              <div className="books-actions books-actions--compact">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={busyKey === "template-generate"}
                  onClick={() => {
                    void generateTemplate();
                  }}
                >
                  {busyKey === "template-generate"
                    ? "Генерация..."
                    : "Сгенерировать всё"}
                </button>
                <button
                  type="button"
                  className={saveButtonClass(saveState, "template")}
                  disabled={busyKey === "template-save" || busyKey === "template-delete"}
                  onClick={() => {
                    void saveTemplate();
                  }}
                >
                  {busyKey === "template-save"
                    ? "Сохраняю шаблон..."
                    : saveState.template === "saved"
                      ? "Шаблон сохранён"
                      : "Сохранить шаблон"}
                </button>
                <button
                  type="button"
                  className="books-button books-button--delete"
                  disabled={busyKey === "template-delete" || busyKey === "template-save"}
                  onClick={() => {
                    void deleteActiveTemplate();
                  }}
                >
                  {busyKey === "template-delete" ? "Удаляю шаблон..." : "Удалить шаблон"}
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)",
              }}
            >
              <div className="books-grid books-grid--2">
                <label className="books-field">
                  {helperLabel(
                    "Название шаблона",
                    "Введите название шаблона истории.",
                    "Публичное название шаблона для CMS.",
                  )}
                  <input
                    className="books-input"
                    value={activeTemplate.name}
                    placeholder="Тайна фонаря на чердаке"
                    onChange={(event) => {
                      const nextName = event.target.value;
                      const nextSlug = generateSlug(nextName);
                      updateActiveTemplate((current) => {
                        return {
                          ...current,
                          name: nextName,
                          slug: isSlugManuallyEdited ? current.slug : nextSlug,
                        };
                      });
                      markDirty("template");
                    }}
                  />
                </label>

                <label className="books-field">
                  {helperLabel(
                    "Slug шаблона",
                    "Slug можно редактировать вручную.",
                    "Автоматически создаётся из названия, но поле остаётся редактируемым.",
                  )}
                  <input
                    className="books-input"
                    value={activeTemplate.slug}
                    placeholder="priklyucheniya-kapibary"
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      setIsSlugManuallyEdited(true);
                      updateActiveTemplate((current) => {
                        return {
                          ...current,
                          slug: generateSlug(rawValue),
                        };
                      });
                      markDirty("template");
                    }}
                    onBlur={() => {
                      const normalized = generateSlug(activeTemplate.slug);
                      updateActiveTemplate((current) => {
                        return {
                          ...current,
                          slug: normalized,
                        };
                      });
                    }}
                  />
                </label>
              </div>

              {variantEstimate && fullStoryEstimate && templateEstimate && (
                <div className="books-subpanel">
                  <div className="books-section-head">
                    <div>
                      <h3 className="books-subpanel__title">Стоимость генерации</h3>
                      <p className="books-section-help">
                        Оценка только для активного шаблона.
                      </p>
                    </div>
                    <strong>{formatIls(templateEstimate.ils)}</strong>
                  </div>
                  <div className="story-overview-steps">
                    <div className="story-overview-step">
                      <span className="story-overview-step__role">1 вариант</span>
                      <span className="story-overview-step__count">
                        {variantEstimate.inputTokens} in / {variantEstimate.outputTokens} out
                      </span>
                      <span>{formatIls(variantEstimate.ils)}</span>
                    </div>
                    <div className="story-overview-step">
                      <span className="story-overview-step__role">7 вариантов</span>
                      <span className="story-overview-step__count">
                        {fullStoryEstimate.inputTokens} in / {fullStoryEstimate.outputTokens} out
                      </span>
                      <span>{formatIls(fullStoryEstimate.ils)}</span>
                    </div>
                    <div className="story-overview-step">
                      <span className="story-overview-step__role">Весь шаблон</span>
                      <span className="story-overview-step__count">
                        {templateEstimate.inputTokens} in / {templateEstimate.outputTokens} out
                      </span>
                      <span>{formatIls(templateEstimate.ils)}</span>
                    </div>
                  </div>
                  {isTemplateCostHigh ? (
                    <div
                      className="books-section-help"
                      style={{
                        marginTop: 12,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "#fff5d6",
                        color: "#725300",
                      }}
                    >
                      Стоимость выше рекомендуемого лимита {formatIls(MAX_TEMPLATE_GENERATION_COST_ILS)}.
                      Генерацию можно запускать, но лучше проверить объём шаблона.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>

          <section
            style={{
              display: "grid",
              gap: 16,
              alignItems: "start",
              gridTemplateColumns: "280px minmax(0, 1fr)",
            }}
          >
            <aside className="books-panel">
              <div className="books-section-head">
                <div>
                  <h2 className="books-panel__title">Шаги</h2>
                  <p className="books-section-help">
                    Слева навигация, справа только активный редактор шага.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 10,
                }}
              >
                {activeTemplate.steps.map((step, index) => {
                  const stats = getStepCompletionStats(
                    step,
                    activeTemplate.fragments,
                    activeTemplate.hero_name,
                  );
                  const isActive = index === selectedStep;

                  return (
                    <button
                      key={step.step_key}
                      type="button"
                      className={
                        isActive
                          ? "books-button books-button--primary"
                          : saveState[`step:${step.step_key}`] === "saved"
                            ? "books-button books-button--success"
                            : "books-button books-button--ghost"
                      }
                      style={{
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        padding: "12px 14px",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        void switchStep(index);
                      }}
                      >
                      <span
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <span>{ROLE_LABELS_RU[step.step_key]}</span>
                        <span style={{ fontSize: 12, opacity: 0.65 }}>
                          {ROLE_SUBTITLES_RU[step.step_key]}
                        </span>
                        <span style={{ fontSize: 12, opacity: 0.8 }}>
                          {stats.stepComplete
                            ? "готов"
                            : step.step_key === "narration"
                              ? `${
                                  stats.questionComplete ? "герой готов" : "нужен герой"
                                } · ${
                                  stats.narrationComplete ? "начало готово" : "нет начала истории"
                                }`
                              : `${stats.filledChoicesCount}/3 choices · ${stats.choiceFragmentsCount}/3 fragments`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="books-panel">
              {activeStep && (
                <>
                  <div className="books-section-head">
                    <div>
                      <h2 className="books-panel__title">
                        {ROLE_LABELS_RU[activeStep.step_key]}
                      </h2>
                      <p className="books-section-help">
                        {ROLE_SUBTITLES_RU[activeStep.step_key]}. При переходе на другой шаг текущий шаг сохраняется автоматически.
                      </p>
                    </div>
                    <div className="books-actions books-actions--compact">
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={runTemplateValidation}
                      >
                        Проверить шаблон
                      </button>
                      <button
                        type="button"
                        className={saveButtonClass(saveState, activeStepKey)}
                        disabled={busyKey === `step-save:${activeStep.step_key}`}
                        onClick={() => {
                          void saveStep();
                        }}
                      >
                        {busyKey === `step-save:${activeStep.step_key}`
                          ? "Сохраняю шаг..."
                          : saveState[activeStepKey] === "saved"
                            ? "Шаг сохранён"
                            : activeStep.step_key === "narration"
                              ? "Сохранить вступление"
                              : "Сохранить шаг"}
                      </button>
                    </div>
                  </div>

                  {stepValidation?.errors.length ? (
                    <div className="books-alert books-alert--error">
                      {stepValidation.errors[0]}
                    </div>
                  ) : null}

                  {stepValidation?.warnings.length ? (
                    <div
                      className="books-section-help"
                      style={{
                        marginBottom: 16,
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: "#fff5d6",
                        color: "#725300",
                      }}
                    >
                      <strong>Flow warnings:</strong>{" "}
                      {stepValidation.warnings
                        .slice(0, 3)
                        .map(formatStoryWarning)
                        .join(" ")}
                    </div>
                  ) : null}

                  {templateWarnings.length > 0 ? (
                    <div
                      className="books-section-help"
                      style={{
                        marginBottom: 16,
                        padding: "12px 14px",
                        borderRadius: 12,
                        background: "#fff7e8",
                        color: "#725300",
                      }}
                    >
                      <strong>Предупреждения по шаблону:</strong>
                      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        {templateWarnings.map((warning) => (
                          <div key={warning}>• {warning}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="books-subpanel"
                    style={{ marginBottom: 16, background: "#fffdf8" }}
                  >
                    <div className="books-section-head">
                      <div>
                        <h3 className="books-subpanel__title">
                          {ROLE_LABELS_RU[activeStep.step_key]}
                        </h3>
                        <p className="books-section-help">
                          {ROLE_EDITOR_HELP[activeStep.step_key].description}
                        </p>
                      </div>
                    </div>
                    <div className="books-section-help">
                      <strong>Пример:</strong> {ROLE_EDITOR_HELP[activeStep.step_key].example}
                    </div>
                  </div>

                  {stepStats && variantEstimate && (
                    <div className="books-subpanel" style={{ marginBottom: 16 }}>
                      <div className="books-section-head">
                        <div>
                          <h3 className="books-subpanel__title">Статус шага</h3>
                          <p className="books-section-help">
                            В редакторе смонтирован только этот шаг.
                          </p>
                        </div>
                        <span>
                          {variantEstimate.inputTokens} in / {variantEstimate.outputTokens} out ·{" "}
                          {formatIls(variantEstimate.ils)}
                        </span>
                      </div>
                      <div className="story-overview-steps">
                        <div className="story-overview-step">
                          <span className="story-overview-step__role">
                            {activeStep.step_key === "narration" ? "Главный герой" : "Вопрос ребёнку"}
                          </span>
                          <span>{stepStats.questionComplete ? "готов" : "пусто"}</span>
                        </div>
                        {activeStep.step_key === "narration" ? (
                          <div className="story-overview-step">
                            <span className="story-overview-step__role">Начало истории</span>
                            <span>{stepStats.narrationComplete ? "готово" : "пусто"}</span>
                          </div>
                        ) : (
                          <>
                            <div className="story-overview-step">
                              <span className="story-overview-step__role">Choices</span>
                              <span>{stepStats.filledChoicesCount}/3</span>
                            </div>
                            <div className="story-overview-step">
                              <span className="story-overview-step__role">Fragments</span>
                              <span>{stepStats.choiceFragmentsCount}/3</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {activeStep.step_key === "narration" ? (
                    <div className="books-subpanel" style={{ marginBottom: 16 }}>
                      <div className="books-section-head">
                        <div>
                          <h3 className="books-subpanel__title">
                            Открытие истории
                          </h3>
                          <p className="books-section-help">
                            Отдельный narration-этап до первого вопроса ребёнку.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          disabled={busyKey === "narration-generate:narration"}
                          onClick={() => {
                            void generateNarrationStep();
                          }}
                        >
                          {busyKey === "narration-generate:narration"
                            ? "Генерация..."
                            : "Сгенерировать"}
                        </button>
                      </div>

                      <label className="books-field">
                        {helperLabel(
                          "Кто главный герой?",
                          "Короткое имя или описание главного героя.",
                          "Например: Аня, маленький лисёнок, смелый поварёнок",
                        )}
                        <input
                          className="books-input"
                          value={narrationHeroValue}
                          placeholder="Аня"
                          onChange={(event) => {
                            upsertNarrationHero(event.target.value);
                          }}
                        />
                      </label>

                      <label className="books-field">
                        <span className="books-field__help">
                          Пример: Жила-была Аня, девочка 10 лет. Она очень любила приключения.
                        </span>
                        <textarea
                          className="books-input books-input--textarea books-input--small-textarea"
                          value={narrationStepValue}
                          placeholder="Жила-была Аня, девочка 10 лет. Она очень любила приключения."
                          onChange={(event) => {
                            upsertNarrationStep(event.target.value);
                          }}
                        />
                      </label>
                    </div>
                  ) : null}

                  {activeStep.step_key !== "narration" ? (
                    <>
                      <label className="books-field">
                    {helperLabel(
                      "Вопрос для ребёнка",
                      "Вопрос, который помогает выбрать следующий шаг истории.",
                      'Этот вопрос задаётся ребёнку, чтобы он выбрал следующий шаг истории. Пример: "Куда Капи отправится сегодня?"',
                    )}
                    <input
                      className="books-input"
                      value={activeStep.question}
                      placeholder="Куда Капи отправится сегодня?"
                      onChange={(event) => {
                        updateActiveTemplate((current) => ({
                          ...current,
                          steps: current.steps.map((item, index) =>
                            index === selectedStep
                              ? { ...item, question: event.target.value }
                              : item,
                          ),
                        }));
                        markDirty(activeStepKey);
                      }}
                    />
                  </label>

                  <div className="books-subpanel" style={{ marginTop: 16 }}>
                    <div className="books-section-head">
                      <div>
                        <h3 className="books-subpanel__title">Варианты</h3>
                        <p className="books-section-help">
                          Загружен только активный шаг, а смонтирован только активный
                          редактор варианта.
                        </p>
                      </div>
                    </div>

                    <div className="story-overview-steps">
                      {activeStep.choices.map((choice, choiceIndex) => {
                        const isSelected = selectedChoiceIndex === choiceIndex;
                        const hasFragment = roleFragments.some(
                          (fragment) =>
                            fragment.choice_temp_key === String(choiceIndex) &&
                            fragment.text.trim().length > 0,
                        );
                        const isComplete =
                          choice.text.trim().length > 0 && hasFragment;

                        return (
                          <button
                            key={`${activeStep.step_key}:choice:${choiceIndex}`}
                            type="button"
                            className={
                              isSelected
                                ? "books-button books-button--primary"
                                : isComplete
                                  ? "books-button books-button--success"
                                  : "books-button books-button--ghost"
                            }
                            onClick={() => setSelectedChoiceIndex(activeStep.step_key, choiceIndex)}
                          >
                            <span
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              <span>Вариант {choiceIndex + 1}</span>
                              <span style={{ fontSize: 11, opacity: 0.85 }}>
                                {isComplete ? "готов" : "нужно заполнить"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {activeStep.choices[selectedChoiceIndex] && (
                      <div className="books-question" style={{ marginTop: 16 }}>
                        <div className="books-section-head">
                          <div>
                            <strong>Вариант {selectedChoiceIndex + 1}</strong>
                            {similarChoiceIndexes.has(selectedChoiceIndex) ? (
                              <div className="books-section-help" style={{ color: "#725300" }}>
                                Вариант слишком похож на другой choice.
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="books-button books-button--secondary"
                            disabled={
                              busyKey ===
                              `choice-generate:${activeStep.step_key}:${selectedChoiceIndex}`
                            }
                            onClick={() => {
                              void generateChoice(selectedChoiceIndex);
                            }}
                          >
                            {busyKey ===
                            `choice-generate:${activeStep.step_key}:${selectedChoiceIndex}`
                              ? "Генерация..."
                              : "Сгенерировать"}
                          </button>
                        </div>

                        <label className="books-field" style={{ marginTop: 4 }}>
                          <span className="books-field__label">
                            Предпросмотр истории на этом шаге
                          </span>
                          <span className="books-field__help">
                            Текст ниже показывает накопленную историю от начала до текущего шага для этого варианта.
                          </span>
                          <div
                            style={{
                              display: "grid",
                              gap: 10,
                              marginTop: 8,
                              marginBottom: 16,
                            }}
                          >
                            {editorPreviewSegments.length === 0 ? (
                              <div className="books-section-help">
                                Для этого варианта пока нет текста предпросмотра.
                              </div>
                            ) : (
                              editorPreviewSegments.map((segment, index) => (
                                <div
                                  key={`preview-segment:${selectedStep}:${selectedChoiceIndex}:${index}`}
                                  style={{
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: segment.isActive
                                      ? "1px solid #b7e4c7"
                                      : "1px solid #dbe8ff",
                                    background: segment.isActive ? "#eefbf1" : "#f8fbff",
                                  }}
                                >
                                  {segment.text}
                                </div>
                              ))
                            )}
                          </div>
                        </label>

                        <div className="books-grid books-grid--2">
                        <label className="books-field">
                          {helperLabel(
                            "Что произойдёт",
                            "Введите вариант выбора для ребёнка.",
                            'Короткое действие или выбор (одна мысль, 5–10 слов). Пример: "Пойдёт к пруду купаться".',
                            )}
                            <input
                              className="books-input"
                              value={activeStep.choices[selectedChoiceIndex].text}
                              placeholder="Пойдёт к пруду купаться"
                              onChange={(event) => {
                                updateActiveTemplate((current) => ({
                                  ...current,
                                  steps: current.steps.map((item, index) =>
                                    index === selectedStep
                                      ? {
                                          ...item,
                                          choices: item.choices.map(
                                            (choiceItem, itemIndex) =>
                                              itemIndex === selectedChoiceIndex
                                                ? {
                                                    ...choiceItem,
                                                    text: event.target.value,
                                                  }
                                                : choiceItem,
                                          ),
                                        }
                                      : item,
                                  ),
                                }));
                              markDirty(activeStepKey);
                            }}
                          />
                        </label>

                        <label className="books-field">
                          {helperLabel(
                            "Короткий ответ",
                            "Краткий ответ ребёнка к этому варианту.",
                            "Краткий ответ ребёнка (1 действие, 3–6 слов)",
                          )}
                          <input
                            className="books-input"
                            value={activeStep.choices[selectedChoiceIndex].short_text ?? ""}
                            placeholder="пойдёт к пруду"
                            onChange={(event) => {
                              const value = event.target.value;
                              updateActiveTemplate((current) => {
                                const next = structuredClone(current);
                                const targetChoice =
                                  next.steps[selectedStep]?.choices[selectedChoiceIndex];
                                if (targetChoice) {
                                  targetChoice.short_text = value;
                                }
                                return next;
                              });
                              markDirty(activeStepKey);
                            }}
                          />
                        </label>

                        </div>

                        <div className="books-subpanel">
                          <div className="books-section-head">
                            <div>
                              <h5 className="books-subpanel__title">
                                Фрагменты для варианта
                              </h5>
                              <button
                                type="button"
                                className="books-button books-button--ghost"
                                style={{ paddingLeft: 0 }}
                                onClick={() => setShowFragmentHint((current) => !current)}
                              >
                                {showFragmentHint ? "Скрыть пояснение" : "Что такое фрагменты?"}
                              </button>
                            </div>
                            <button
                              type="button"
                              className="books-button books-button--ghost"
                              onClick={() => addFragment(selectedChoiceIndex)}
                            >
                              Добавить фрагмент
                            </button>
                          </div>

                          {showFragmentHint ? (
                            <div
                              className="books-section-help"
                              style={{
                                marginBottom: 12,
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#f7f4ff",
                              }}
                            >
                              <strong>
                                Фрагменты — это дополнительные детали, которые добавляются к варианту
                              </strong>
                              <div style={{ marginTop: 6 }}>
                                Пример: Капи прыгнула в прохладную воду и засмеялась
                              </div>
                            </div>
                          ) : null}

                          {choiceFragments.length === 0 ? (
                            <div className="books-section-help">
                              Для этого варианта ещё нет фрагментов.
                            </div>
                          ) : null}

                          {choiceFragments.map(({ fragment, globalIndex: fragmentIndex }, relatedIndex) => (
                            <div
                              key={getFragmentRenderKey(fragment, fragmentIndex)}
                              className="books-question"
                            >
                              <div className="books-section-head">
                                <strong>Фрагмент {relatedIndex + 1}</strong>
                                <div className="books-actions books-actions--compact">
                                  <button
                                    type="button"
                                    className="books-button books-button--secondary"
                                    disabled={
                                      busyKey ===
                                      `fragment-generate:${activeStep.step_key}:${fragmentIndex}`
                                    }
                                    onClick={() => {
                                      void generateFragment(fragmentIndex);
                                    }}
                                  >
                                    {busyKey ===
                                    `fragment-generate:${activeStep.step_key}:${fragmentIndex}`
                                      ? "Генерация..."
                                      : "Сгенерировать"}
                                  </button>
                                  <button
                                    type="button"
                                    className="books-button books-button--ghost"
                                    onClick={() => {
                                      deleteChoiceFragment(selectedStep, selectedChoiceIndex, fragmentIndex);
                                      markDirty(`fragments:${activeStep.step_key}`);
                                      markDirty(activeStepKey);
                                    }}
                                  >
                                    ✖ удалить
                                  </button>
                                </div>
                              </div>

                              <label className="books-field">
                                {helperLabel(
                                  "Фрагменты",
                                  "Фраза, которая будет частью истории.",
                                  "Одна короткая фраза, логически связанная с предыдущим шагом.",
                                )}
                                <textarea
                                  className="books-input books-input--textarea books-input--small-textarea"
                                  value={fragment.text}
                                  placeholder="Фраза, которая будет частью истории"
                                  onChange={(event) => {
                                    updateChoiceFragment(
                                      selectedStep,
                                      selectedChoiceIndex,
                                      fragmentIndex,
                                      (currentFragment) => ({
                                        ...currentFragment,
                                        text: event.target.value,
                                      }),
                                    );
                                    markDirty(`fragments:${activeStep.step_key}`);
                                    markDirty(activeStepKey);
                                  }}
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                    </>
                  ) : null}

                  {activeStep.step_key !== "narration" ? (
                    <div className="books-subpanel" style={{ marginTop: 16 }}>
                    <div className="books-section-head">
                      <div>
                        <h3 className="books-subpanel__title">Общие фрагменты</h3>
                        <p className="books-section-help">
                          Общие фрагменты — это дополнительные короткие вставки, которые можно
                          добавить к любому варианту этого шага. Они помогают сделать текст
                          живее и разнообразнее.
                        </p>
                        <p className="books-section-help">
                          Примеры: &quot;Утро было тихим, и листья едва шевелились.&quot;,
                          &quot;Где-то неподалёку послышался смешной звук.&quot;,
                          &quot;Капа вдруг почувствовала, что день будет необычным.&quot;
                        </p>
                      </div>
                      <div className="books-actions books-actions--compact">
                        <button
                          type="button"
                          className="books-button books-button--ghost"
                          onClick={() => setShowSharedFragments((current) => !current)}
                        >
                          {showSharedFragments ? "Скрыть" : "Показать"}
                        </button>
                        {showSharedFragments ? (
                          <button
                            type="button"
                            className="books-button books-button--ghost"
                            onClick={() => addFragment(null)}
                          >
                            Добавить фрагмент
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {showSharedFragments ? (
                      advancedGeneralFragments.length === 0 ? (
                        <div
                          className="books-section-help"
                          style={{
                            padding: "12px 14px",
                            borderRadius: 12,
                            background: "#fffdf8",
                          }}
                        >
                          <div>
                            Пока общих фрагментов нет. Это необязательный расширенный слой:
                            можно оставить пустым или добавить короткие универсальные вставки
                            для шага.
                          </div>
                        </div>
                      ) : (
                        advancedGeneralFragments.map(({ fragment, globalIndex: fragmentIndex }) => {
                          return (
                            <div
                              key={getFragmentRenderKey(fragment, fragmentIndex)}
                              className="books-question"
                            >
                              <div className="books-section-head">
                                <strong>Общий фрагмент</strong>
                                <div className="books-actions books-actions--compact">
                                  <button
                                    type="button"
                                    className="books-button books-button--secondary"
                                    disabled={
                                      busyKey ===
                                      `fragment-generate:${activeStep.step_key}:${fragmentIndex}`
                                    }
                                    onClick={() => {
                                      void generateFragment(fragmentIndex);
                                    }}
                                  >
                                    {busyKey ===
                                    `fragment-generate:${activeStep.step_key}:${fragmentIndex}`
                                      ? "Генерация..."
                                      : "Сгенерировать"}
                                  </button>
                                  <button
                                    type="button"
                                    className="books-button books-button--ghost"
                                    onClick={() => {
                                      deleteChoiceFragment(selectedStep, null, fragmentIndex);
                                      markDirty(`fragments:${activeStep.step_key}`);
                                      markDirty(activeStepKey);
                                    }}
                                  >
                                    ✖ удалить
                                  </button>
                                </div>
                              </div>

                              <label className="books-field">
                                {helperLabel(
                                  "Фрагменты",
                                  "Фраза, которая будет частью истории.",
                                  "Одна короткая фраза, логически связанная с предыдущим шагом.",
                                )}
                                <textarea
                                  className="books-input books-input--textarea books-input--small-textarea"
                                  value={fragment.text}
                                  placeholder="Фраза, которая будет частью истории"
                                  onChange={(event) => {
                                    updateChoiceFragment(
                                      selectedStep,
                                      null,
                                      fragmentIndex,
                                      (currentFragment) => ({
                                        ...currentFragment,
                                        text: event.target.value,
                                      }),
                                    );
                                    markDirty(`fragments:${activeStep.step_key}`);
                                    markDirty(activeStepKey);
                                  }}
                                />
                              </label>
                            </div>
                          );
                        })
                      )
                    ) : null}
                  </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
