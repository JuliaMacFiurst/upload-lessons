"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { formatKeywords, parseKeywords } from "../../../lib/books/keywords";
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

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

const ROLE_HINTS: Record<StoryRoleKey, string> = {
  intro: "Начало истории: знакомство с капибарой и отправная точка приключения.",
  journey: "Путь героя: куда капибара отправляется после начала истории.",
  problem: "Проблема: какое препятствие возникает в путешествии.",
  solution: "Решение: как капибара справляется с проблемой.",
  ending: "Финал: чем заканчивается история и какой остаётся вывод.",
};

const ROLE_QUESTIONS_RU: Record<StoryRoleKey, string> = {
  intro: "Как начинается приключение капибары?",
  journey: "Куда капибара отправляется дальше?",
  problem: "Какая проблема появляется в пути?",
  solution: "Как капибара решает проблему?",
  ending: "Чем заканчивается история?",
};

type StoryTemplateStats = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[] | null;
  age_group: string | null;
  steps: Record<StoryRoleKey, number>;
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
  return state[key] === "saved" ? "books-button books-button--success" : "books-button books-button--primary";
}

function saveButtonLabel(state: Record<string, "saved" | "dirty">, key: string) {
  return state[key] === "saved" ? "✔ Сохранено" : "Сохранить";
}

function makeSlug(value: string) {
  return slugifyRu(value) || slugify(value, { lower: true, strict: true, trim: true }) || "story-template";
}

function createEmptyTemplate(index: number): StoryBuilderTemplate {
  return {
    name: `Шаблон истории ${index + 1}`,
    slug: `story-template-${index + 1}`,
    is_published: true,
    steps: STORY_ROLE_KEYS.map((role, roleIndex) => ({
      step_key: role,
      question: ROLE_QUESTIONS_RU[role],
      sort_order: roleIndex,
      choices: [],
    })),
    fragments: [],
    twists: [],
  };
}

function emptyTwist(): StoryTwistInput {
  return {
    text: "",
    keywords: [],
    age_group: null,
    is_published: true,
  };
}

function hasStepData(template: StoryBuilderTemplate, role: StoryRoleKey): boolean {
  const step = template.steps.find((item) => item.step_key === role);
  const fragments = template.fragments.filter((item) => item.step_key === role);
  return Boolean(
    step &&
      (step.question.trim() !== ROLE_QUESTIONS_RU[role] ||
        step.choices.length > 0 ||
        fragments.some((fragment) => fragment.text.trim() || fragment.keywords.length > 0)),
  );
}

function hasChoiceData(
  template: StoryBuilderTemplate,
  role: StoryRoleKey,
  choiceIndex: number,
): boolean {
  const step = template.steps.find((item) => item.step_key === role);
  const choice = step?.choices[choiceIndex];
  const fragments = template.fragments.filter(
    (item) => item.step_key === role && item.choice_temp_key === String(choiceIndex),
  );
  return Boolean(choice && (choice.text.trim() || choice.keywords.length > 0 || fragments.length > 0));
}

function hasFragmentData(fragment: StoryFragmentInput): boolean {
  return Boolean(fragment.text.trim() || fragment.keywords.length > 0);
}

function buildInitialCollapsedSteps(templates: StoryBuilderTemplate[]) {
  const next: Record<string, boolean> = {};
  templates.forEach((template, templateIndex) => {
    STORY_ROLE_KEYS.forEach((role, stepIndex) => {
      next[`step:${templateIndex}:${stepIndex}`] = hasStepData(template, role);
    });
  });
  return next;
}

function buildInitialCollapsedChoices(templates: StoryBuilderTemplate[]) {
  const next: Record<string, boolean> = {};
  templates.forEach((template, templateIndex) => {
    template.steps.forEach((step, stepIndex) => {
      step.choices.forEach((_, choiceIndex) => {
        next[`choice:${templateIndex}:${stepIndex}:${choiceIndex}`] = hasChoiceData(
          template,
          step.step_key,
          choiceIndex,
        );
      });
    });
  });
  return next;
}

function buildInitialCollapsedFragments(templates: StoryBuilderTemplate[]) {
  const next: Record<string, boolean> = {};
  templates.forEach((template, templateIndex) => {
    template.fragments.forEach((fragment, fragmentIndex) => {
      next[`fragment:${templateIndex}:${fragment.step_key}:${fragmentIndex}`] = hasFragmentData(fragment);
    });
  });
  return next;
}

function groupOverviewRows(rows: StoryTemplateOverviewRow[]): StoryTemplateStats[] {
  const grouped = new Map<string, StoryTemplateStats>();

  rows.forEach((row) => {
    const current =
      grouped.get(row.id) ??
      {
        id: row.id,
        name: row.name,
        description: row.description,
        keywords: row.keywords,
        age_group: row.age_group,
        steps: {
          intro: 0,
          journey: 0,
          problem: 0,
          solution: 0,
          ending: 0,
        },
      };

    current.steps[row.step_key] = row.choices_count;
    grouped.set(row.id, current);
  });

  return Array.from(grouped.values()).sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

function totalVariants(stats: StoryTemplateStats) {
  return STORY_ROLE_KEYS.reduce((sum, role) => sum + (stats.steps[role] ?? 0), 0);
}

function completionPercent(stats: StoryTemplateStats) {
  return Math.round(Math.min(totalVariants(stats) / 15, 1) * 100);
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

function formatIls(value: number) {
  return `${value.toFixed(3)} ₪`;
}

function fragmentStateKey(templateIndex: number, role: StoryRoleKey, fragmentIndex: number) {
  return `fragment:${templateIndex}:${role}:${fragmentIndex}`;
}

function choiceStateKey(templateIndex: number, stepIndex: number, choiceIndex: number) {
  return `choice:${templateIndex}:${stepIndex}:${choiceIndex}`;
}

function stepStateKey(templateIndex: number, stepIndex: number) {
  return `step:${templateIndex}:${stepIndex}`;
}

export default function StoryBuilderPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const fragmentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const templateEditorRefs = useRef<Record<string, HTMLElement | null>>({});

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<StoryBuilderTemplate[]>([]);
  const [overviewStats, setOverviewStats] = useState<StoryTemplateStats[]>([]);
  const [twists, setTwists] = useState<StoryBuilderResponse["twists"]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<Record<string, "saved" | "dirty">>({});
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});
  const [slugDrafts, setSlugDrafts] = useState<Record<string, string>>({});
  const [collapsedSteps, setCollapsedSteps] = useState<Record<string, boolean>>({});
  const [collapsedChoices, setCollapsedChoices] = useState<Record<string, boolean>>({});
  const [collapsedFragments, setCollapsedFragments] = useState<Record<string, boolean>>({});
  const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const overview = await fetchJson<{ rows: StoryTemplateOverviewRow[] }>("/api/admin/story-builder/overview");
    setOverviewStats(groupOverviewRows(overview.rows));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, overview] = await Promise.all([
        fetchJson<StoryBuilderResponse>("/api/admin/story-builder"),
        fetchJson<{ rows: StoryTemplateOverviewRow[] }>("/api/admin/story-builder/overview"),
      ]);
      setTemplates(data.templates);
      setOverviewStats(groupOverviewRows(overview.rows));
      setTwists(data.twists);
      setCollapsedSteps(buildInitialCollapsedSteps(data.templates));
      setCollapsedChoices(buildInitialCollapsedChoices(data.templates));
      setCollapsedFragments(buildInitialCollapsedFragments(data.templates));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadData();
  }, [sessionChecked, loadData]);

  useEffect(() => {
    if (!pendingScrollKey) {
      return;
    }
    const element = fragmentRefs.current[pendingScrollKey];
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollKey(null);
    });
  }, [pendingScrollKey, templates]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
  };

  const scrollToTemplateEditor = (templateId: string) => {
    const element = templateEditorRefs.current[templateId];
    if (!element) {
      return;
    }
    element.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const updateTemplate = (templateIndex: number, next: StoryBuilderTemplate) => {
    setTemplates((current) => current.map((template, index) => (index === templateIndex ? next : template)));
  };

  const sanitizeTemplateForRequest = (template: StoryBuilderTemplate): StoryBuilderTemplate => ({
    ...template,
    slug: makeSlug(template.slug || template.name),
    fragments: template.fragments
      .filter((fragment) => fragment.text.trim().length > 0)
      .map((fragment, index) => ({
        ...fragment,
        sort_order: index,
      })),
  });

  const ensureTemplateSaved = async (templateIndex: number): Promise<StoryBuilderTemplate | null> => {
    const template = templates[templateIndex];
    if (!template) {
      return null;
    }
    if (template.id) {
      return template;
    }
    const data = await fetchJson<{ template: StoryBuilderTemplate }>("/api/admin/story-builder/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizeTemplateForRequest(template)),
    });
    const merged = { ...template, id: data.template.id, slug: data.template.slug, name: data.template.name };
    updateTemplate(templateIndex, merged);
    markSaved(`template:${templateIndex}`);
    return merged;
  };

  const saveTemplate = async (templateIndex: number) => {
    setBusyKey(`template-save:${templateIndex}`);
    setError(null);
    try {
      const template = templates[templateIndex];
      if (!template.name.trim()) {
        throw new Error("Не удалось сохранить шаблон. Заполните название.");
      }
      const data = await fetchJson<{ template: StoryBuilderTemplate }>("/api/admin/story-builder/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitizeTemplateForRequest(template)),
      });
      updateTemplate(templateIndex, {
        ...template,
        id: data.template.id,
        slug: data.template.slug,
        name: data.template.name,
      });
      markSaved(`template:${templateIndex}`);
      await loadOverview();
      showSuccess("Шаблон истории сохранён.");
    } catch (fetchError) {
      showSaveError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateTemplate = async (templateIndex: number) => {
    const template = templates[templateIndex];
    setBusyKey(`template-generate:${templateIndex}`);
    setError(null);
    try {
      const data = await fetchJson<{
        steps: Array<{ step_key: StoryRoleKey; question: string; choices: Array<{ text: string; keywords: string[] }> }>;
        fragments: Array<{ step_key: StoryRoleKey; choice_index: number; text: string; keywords: string[] }>;
      }>("/api/admin/generate-story-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.name,
          description: `Interactive capybara story template: ${template.name}`,
          ageGroup: null,
          templateName: template.name,
          templateSlug: template.slug,
        }),
      });

      updateTemplate(templateIndex, {
        ...template,
        steps: STORY_ROLE_KEYS.map((role, index) => {
          const generatedStep = data.steps.find((item) => item.step_key === role);
          return {
            id: template.steps.find((item) => item.step_key === role)?.id,
            step_key: role,
            question: generatedStep?.question ?? ROLE_QUESTIONS_RU[role],
            sort_order: index,
            choices: (generatedStep?.choices ?? []).map((choice, choiceIndex) => ({
              text: choice.text,
              keywords: choice.keywords,
              sort_order: choiceIndex,
            })),
          };
        }),
        fragments: data.fragments.map((fragment, index) => ({
          step_key: fragment.step_key,
          choice_id: null,
          choice_temp_key: String(fragment.choice_index),
          text: fragment.text,
          keywords: fragment.keywords,
          sort_order: index,
        })),
      });
      markDirty(`template:${templateIndex}`);
      showSuccess("Шаблон истории сгенерирован.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateStepQuestion = async (templateIndex: number, stepIndex: number) => {
    const template = templates[templateIndex];
    const step = template.steps[stepIndex];
    setBusyKey(`step-generate:${templateIndex}:${stepIndex}`);
    setError(null);
    try {
      const data = await fetchJson<{ question: string; step_key: StoryRoleKey }>("/api/admin/generate-story-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.name,
          description: `Шаблон истории ${template.name}`,
          ageGroup: null,
          templateName: template.name,
          kind: "step",
          storyRole: step.step_key,
          previousRole: stepIndex > 0 ? template.steps[stepIndex - 1].step_key : null,
          context: `Нужно сгенерировать вопрос для роли ${step.step_key}.`,
        }),
      });
      updateTemplate(templateIndex, {
        ...template,
        steps: template.steps.map((item, index) =>
          index === stepIndex ? { ...item, question: data.question, step_key: data.step_key } : item,
        ),
      });
      markDirty(`step:${templateIndex}:${stepIndex}`);
      setCollapsedSteps((current) => ({ ...current, [`step:${templateIndex}:${stepIndex}`]: false }));
      showSuccess(`Шаг ${step.step_key} сгенерирован.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveStep = async (templateIndex: number, stepIndex: number) => {
    setBusyKey(`step-save:${templateIndex}:${stepIndex}`);
    setError(null);
    try {
      const currentTemplate = templates[templateIndex];
      const step = currentTemplate.steps[stepIndex];
      const role = step.step_key;
      const stepSaveKey = `step:${templateIndex}:${stepIndex}`;
      const fragmentsSaveKey = `fragments:${templateIndex}:${role}`;

      if (step.choices.length < 3) {
        throw new Error("Для каждого шага нужно минимум 3 варианта.");
      }
      if (step.choices.some((choice) => choice.text.trim() === "")) {
        throw new Error("Заполните текст у всех вариантов перед сохранением.");
      }

      const savedTemplate = await ensureTemplateSaved(templateIndex);
      if (!savedTemplate?.id) {
        throw new Error("Сначала сохраните шаблон истории.");
      }

      const stepResponse = await fetchJson<{ step: StoryBuilderTemplate["steps"][number] }>("/api/admin/story-builder/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: savedTemplate.id,
          step,
        }),
      });

      const nextSteps = currentTemplate.steps.map((item, index) => (index === stepIndex ? stepResponse.step : item));
      const roleFragments = currentTemplate.fragments.filter((fragment) => fragment.step_key === role);
      const nonEmptyFragments = roleFragments.filter((fragment) => fragment.text.trim() !== "");

      if (roleFragments.some((fragment) => fragment.text.trim() === "")) {
        throw new Error("Текст фрагмента не должен быть пустым.");
      }
      if (nonEmptyFragments.length === 0) {
        throw new Error("В шаге должен быть хотя бы один фрагмент.");
      }

      const fragmentsResponse = await fetchJson<{ fragments: StoryBuilderTemplate["fragments"] }>("/api/admin/story-builder/fragments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: savedTemplate.id,
          role,
          fragments: nonEmptyFragments,
          steps: nextSteps,
        }),
      });

      updateTemplate(templateIndex, {
        ...currentTemplate,
        id: savedTemplate.id,
        steps: nextSteps,
        fragments: [
          ...currentTemplate.fragments.filter((fragment) => fragment.step_key !== role),
          ...fragmentsResponse.fragments,
        ].sort((a, b) => a.sort_order - b.sort_order),
      });

      markSaved(stepSaveKey);
      markSaved(fragmentsSaveKey);
      nextSteps[stepIndex]?.choices.forEach((_, choiceIndex) => {
        markSaved(choiceStateKey(templateIndex, stepIndex, choiceIndex));
      });
      setCollapsedSteps((current) => ({ ...current, [stepSaveKey]: true }));
      await loadOverview();
      showSuccess(`Шаг ${role} и все связанные данные сохранены.`);
    } catch (fetchError) {
      showSaveError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateChoice = async (templateIndex: number, stepIndex: number, choiceIndex: number) => {
    const template = templates[templateIndex];
    const step = template.steps[stepIndex];
    setBusyKey(`choice-generate:${templateIndex}:${stepIndex}:${choiceIndex}`);
    setError(null);
    try {
      const data = await fetchJson<{ text: string; keywords: string[] }>("/api/admin/generate-story-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.name,
          description: `Шаг ${step.step_key}: ${step.question}`,
          ageGroup: null,
          templateName: template.name,
          kind: "choice",
          storyRole: step.step_key,
          previousRole: stepIndex > 0 ? template.steps[stepIndex - 1].step_key : null,
          context: `Нужен вариант выбора для шага ${step.step_key}.`,
        }),
      });
      updateTemplate(templateIndex, {
        ...template,
        steps: template.steps.map((item, index) =>
          index === stepIndex
            ? {
                ...item,
                choices: item.choices.map((choice, itemIndex) =>
                  itemIndex === choiceIndex ? { ...choice, text: data.text, keywords: data.keywords } : choice,
                ),
              }
            : item,
        ),
      });
      setCollapsedChoices((current) => ({
        ...current,
        [`choice:${templateIndex}:${stepIndex}:${choiceIndex}`]: false,
      }));
      markDirty(`step:${templateIndex}:${stepIndex}`);
      showSuccess(`Вариант для шага ${step.step_key} сгенерирован.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateFragment = async (templateIndex: number, role: StoryRoleKey, fragmentIndex: number) => {
    const template = templates[templateIndex];
    const stepIndex = STORY_ROLE_KEYS.indexOf(role);
    const fragment = template.fragments[fragmentIndex];
    setBusyKey(`fragment-generate:${templateIndex}:${role}:${fragmentIndex}`);
    setError(null);
    try {
      const data = await fetchJson<{ text: string; keywords: string[] }>("/api/admin/generate-story-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: template.name,
          description: `Роль истории ${role}. ${ROLE_HINTS[role]}`,
          ageGroup: null,
          templateName: template.name,
          kind: "fragment",
          storyRole: role,
          previousRole: stepIndex > 0 ? STORY_ROLE_KEYS[stepIndex - 1] : null,
          context: `Нужна фраза для роли ${role}. Она должна логично продолжать историю.`,
        }),
      });

      updateTemplate(templateIndex, {
        ...template,
        fragments: template.fragments.map((item, index) =>
          index === fragmentIndex ? { ...item, text: data.text, keywords: data.keywords } : item,
        ),
      });
      setCollapsedFragments((current) => ({
        ...current,
        [fragmentStateKey(templateIndex, role, fragmentIndex)]: false,
      }));
      markDirty(`fragments:${templateIndex}:${role}`);
      markDirty(stepStateKey(templateIndex, stepIndex));
      showSuccess(
        `Фрагмент${fragment?.choice_temp_key ? ` для варианта ${Number(fragment.choice_temp_key) + 1}` : ""} сгенерирован.`,
      );
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteChoice = (templateIndex: number, stepIndex: number, choiceIndex: number) => {
    const template = templates[templateIndex];
    const step = template.steps[stepIndex];
    const role = step.step_key;

    const nextChoices = step.choices
      .filter((_, index) => index !== choiceIndex)
      .map((choice, index) => ({ ...choice, sort_order: index }));

    const nextFragments = template.fragments.flatMap((fragment) => {
      if (fragment.step_key !== role) {
        return [fragment];
      }
      const fragmentChoiceIndex =
        fragment.choice_temp_key === null || fragment.choice_temp_key === undefined
          ? null
          : Number(fragment.choice_temp_key);

      if (fragmentChoiceIndex === choiceIndex) {
        return [{ ...fragment, choice_id: null, choice_temp_key: null }];
      }

      if (fragmentChoiceIndex !== null && fragmentChoiceIndex > choiceIndex) {
        return [{ ...fragment, choice_temp_key: String(fragmentChoiceIndex - 1) }];
      }

      return [fragment];
    });

    updateTemplate(templateIndex, {
      ...template,
      steps: template.steps.map((item, index) =>
        index === stepIndex ? { ...item, choices: nextChoices } : item,
      ),
      fragments: nextFragments.map((fragment, index) => ({ ...fragment, sort_order: index })),
    });
    markDirty(`step:${templateIndex}:${stepIndex}`);
    markDirty(`fragments:${templateIndex}:${role}`);
  };

  const addFragment = (
    templateIndex: number,
    stepIndex: number,
    role: StoryRoleKey,
    choiceIndex: number | null,
  ) => {
    const template = templates[templateIndex];
    const fragmentIndex = template.fragments.length;
    const fragmentKey = fragmentStateKey(templateIndex, role, fragmentIndex);
    const nextFragment: StoryFragmentInput = {
      step_key: role,
      choice_id: null,
      choice_temp_key: choiceIndex === null ? null : String(choiceIndex),
      text: "",
      keywords: [],
      sort_order: template.fragments.filter((fragment) => fragment.step_key === role).length,
    };

    updateTemplate(templateIndex, {
      ...template,
      fragments: [...template.fragments, nextFragment],
    });
    markDirty(`fragments:${templateIndex}:${role}`);
    markDirty(stepStateKey(templateIndex, stepIndex));
    setCollapsedFragments((current) => ({ ...current, [fragmentKey]: false }));
    setPendingScrollKey(fragmentKey);
    setCollapsedSteps((current) => ({ ...current, [stepStateKey(templateIndex, stepIndex)]: false }));
    if (choiceIndex !== null) {
      setCollapsedChoices((current) => ({
        ...current,
        [choiceStateKey(templateIndex, stepIndex, choiceIndex)]: false,
      }));
    }
  };

  const generateTwist = async (index: number) => {
    setBusyKey(`twist-generate:${index}`);
    setError(null);
    try {
      const data = await fetchJson<{ text: string; keywords: string[] }>("/api/admin/generate-story-part", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Неожиданный поворот",
          description: "Смешной поворот для детской истории про капибару.",
          ageGroup: null,
          templateName: "Глобальные повороты",
          kind: "twist",
          storyRole: "ending",
          previousRole: "solution",
          context: "Короткий неожиданный, но добрый поворот для истории.",
        }),
      });
      setTwists((current) =>
        current.map((twist, twistIndex) =>
          twistIndex === index ? { ...twist, text: data.text, keywords: data.keywords } : twist,
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
      const data = await fetchJson<{ twists: StoryBuilderResponse["twists"] }>("/api/admin/story-builder/twists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twists }),
      });
      setTwists(data.twists);
      markSaved("twists");
      showSuccess("Неожиданные повороты сохранены.");
    } catch (fetchError) {
      showSaveError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const twistsPanel = twists.map((twist, twistIndex) => (
    <div className="books-question" key={twist.id ?? `twist-${twistIndex}`}>
      <div className="books-section-head">
        <strong>Поворот {twistIndex + 1}</strong>
        <button
          type="button"
          className="books-button books-button--secondary"
          disabled={busyKey === `twist-generate:${twistIndex}`}
          onClick={() => {
            void generateTwist(twistIndex);
          }}
        >
          {busyKey === `twist-generate:${twistIndex}` ? "Генерация..." : "Сгенерировать"}
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
                  index === twistIndex ? { ...item, text: event.target.value } : item,
                ),
              );
              markDirty("twists");
            }}
          />
        </label>

        <label className="books-field">
          {helperLabel(
            "Ключевые слова",
            "Можно вводить через запятую или пробел.",
            "Пример: сюрприз, смешно финал",
          )}
          <input
            className="books-input"
            value={keywordDrafts[`twist:${twistIndex}`] ?? formatKeywords(twist.keywords)}
            placeholder="сюрприз, смешно финал"
            onChange={(event) => {
              const rawValue = event.target.value;
              setKeywordDrafts((current) => ({
                ...current,
                [`twist:${twistIndex}`]: rawValue,
              }));
              setTwists((current) =>
                current.map((item, index) =>
                  index === twistIndex ? { ...item, keywords: parseKeywords(rawValue) } : item,
                ),
              );
              markDirty("twists");
            }}
            onBlur={() => {
              setKeywordDrafts((current) => ({
                ...current,
                [`twist:${twistIndex}`]: formatKeywords(twist.keywords),
              }));
            }}
          />
        </label>
      </div>
    </div>
  ));

  if (!sessionChecked || loading) {
    return <p style={{ padding: 24 }}>{loading ? "Загрузка конструктора историй..." : "Проверка сессии..."}</p>;
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
            Шаблоны историй теперь компактнее: шаги сворачиваются, фрагменты находятся рядом со своими вариантами, а сохранение шага сохраняет всё сразу.
          </p>
        </div>
        <div className="books-actions books-actions--compact">
          <button
            type="button"
            className="books-button books-button--secondary"
            onClick={() => setTemplates((current) => [createEmptyTemplate(current.length), ...current])}
          >
            Добавить шаблон
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Конструкторы историй</h2>
            <p className="books-section-help">
              Сводка по готовности шаблонов: сразу видно, где не хватает вариантов для шагов.
            </p>
          </div>
        </div>

        {overviewStats.length === 0 ? (
          <div className="books-section-help">Сохранённые конструкторы ещё не найдены.</div>
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
                        {stats.keywords?.length ? stats.keywords.join(", ") : "Без ключевых слов"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="books-button books-button--secondary"
                      onClick={() => scrollToTemplateEditor(stats.id)}
                    >
                      Редактировать
                    </button>
                  </div>

                  <div className="story-overview-steps">
                    {STORY_ROLE_KEYS.map((role) => {
                      const count = stats.steps[role] ?? 0;
                      return (
                        <div className="story-overview-step" key={`${stats.id}:${role}`}>
                          <span className="story-overview-step__role">{role}</span>
                          <span className="story-overview-step__count">
                            {count} {variantsLabel(count)}
                          </span>
                          {count < 3 ? <span className="story-overview-step__warning">⚠ мало вариантов</span> : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="story-overview-progress">
                    <div className="story-overview-progress__meta">
                      <span>Заполненность</span>
                      <span>
                        {percent}% · {total}/15
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

      {templates.map((template, templateIndex) => (
        <section
          className="books-panel"
          key={template.id ?? `template-${templateIndex}`}
          ref={(element) => {
            if (template.id) {
              templateEditorRefs.current[template.id] = element;
            }
          }}
        >
          {(() => {
            const fullTemplatePrompt = buildStoryTemplatePrompt({
              title: template.name,
              description: `Interactive capybara story template: ${template.name}`,
              ageGroup: null,
              templateName: template.name,
              templateSlug: template.slug,
            });
            const variantPrompt = buildStoryPartPrompt({
              title: template.name,
              description: `Шаблон истории ${template.name}`,
              ageGroup: null,
              templateName: template.name,
              kind: "fragment",
              storyRole: "intro",
              previousRole: null,
              context: "Оцени стоимость генерации одного варианта истории.",
            });
            const variantEstimate = estimateStoryVariantCost(variantPrompt);
            const fullStoryEstimate = estimateFullStoryCost(variantPrompt);
            const templateEstimate = estimateFullStoryCost(fullTemplatePrompt);

            return (
              <>
                <div className="books-section-head">
                  <div>
                    <h2 className="books-panel__title">Шаблон истории</h2>
                    <p className="books-section-help">Шаблон всегда открыт. Шаги ниже автоматически сворачиваются после успешного сохранения.</p>
                  </div>
                  <div className="books-actions books-actions--compact">
                    <button
                      type="button"
                      className="books-button books-button--secondary"
                      disabled={busyKey === `template-generate:${templateIndex}`}
                      onClick={() => {
                        void generateTemplate(templateIndex);
                      }}
                    >
                      {busyKey === `template-generate:${templateIndex}` ? "Генерация..." : "Сгенерировать всё"}
                    </button>
                    <button
                      type="button"
                      className={saveButtonClass(saveState, `template:${templateIndex}`)}
                      disabled={busyKey === `template-save:${templateIndex}`}
                      onClick={() => {
                        void saveTemplate(templateIndex);
                      }}
                    >
                      {busyKey === `template-save:${templateIndex}` ? "Сохранение..." : saveButtonLabel(saveState, `template:${templateIndex}`)}
                    </button>
                  </div>
                </div>

                <div className="books-subpanel">
                  <div className="books-section-head">
                    <div>
                      <h3 className="books-subpanel__title">Стоимость генерации истории</h3>
                      <p className="books-section-help">Оценка токенов и стоимости до запуска генерации.</p>
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
                </div>

                <div className="books-grid books-grid--2">
          <label className="books-field">
            {helperLabel("Название шаблона", "Введите название шаблона истории.", "Публичное название шаблона для CMS.")}
            <input
                className="books-input"
                value={template.name}
                placeholder="Приключения капибары"
                onChange={(event) => {
                  const nextName = event.target.value;
                  const currentAutoSlug = makeSlug(template.name);
                  const nextAutoSlug = makeSlug(nextName);
                  const shouldAutoUpdateSlug =
                    !template.slug.trim() ||
                    template.slug === currentAutoSlug ||
                    (slugDrafts[`template:${templateIndex}`] ?? template.slug) === currentAutoSlug;

                  updateTemplate(templateIndex, {
                    ...template,
                    name: nextName,
                    slug: shouldAutoUpdateSlug ? nextAutoSlug : template.slug,
                  });
                  if (shouldAutoUpdateSlug) {
                    setSlugDrafts((current) => ({
                      ...current,
                      [`template:${templateIndex}`]: nextAutoSlug,
                    }));
                  }
                  markDirty(`template:${templateIndex}`);
                }}
              />
            </label>

            <label className="books-field">
              {helperLabel("Slug шаблона", "Slug можно редактировать вручную.", "Автоматически создаётся из названия, но поле остаётся редактируемым.")}
              <input
                className="books-input"
                value={slugDrafts[`template:${templateIndex}`] ?? template.slug}
                placeholder="priklyucheniya-kapibary"
                onChange={(event) => {
                  const rawValue = event.target.value;
                  setSlugDrafts((current) => ({
                    ...current,
                    [`template:${templateIndex}`]: rawValue,
                  }));
                  updateTemplate(templateIndex, { ...template, slug: makeSlug(rawValue) });
                  markDirty(`template:${templateIndex}`);
                }}
                onBlur={() => {
                  const normalized = makeSlug(slugDrafts[`template:${templateIndex}`] ?? template.slug);
                  updateTemplate(templateIndex, { ...template, slug: normalized });
                  setSlugDrafts((current) => ({
                    ...current,
                    [`template:${templateIndex}`]: normalized,
                  }));
                }}
              />
            </label>
                </div>
              </>
            );
          })()}

          {template.steps.map((step, stepIndex) => {
            const roleFragments = template.fragments.filter((fragment) => fragment.step_key === step.step_key);
            const generalFragments = roleFragments.filter((fragment) => !fragment.choice_temp_key);
            const stepSaveKey = stepStateKey(templateIndex, stepIndex);
            const fragmentsSaveKey = `fragments:${templateIndex}:${step.step_key}`;
            const stepCollapsed = collapsedSteps[stepSaveKey] ?? false;
            const stepGenerationEstimate = estimateStoryVariantCost(
              buildStoryPartPrompt({
                title: template.name,
                description: `Шаблон истории ${template.name}`,
                ageGroup: null,
                templateName: template.name,
                kind: "step",
                storyRole: step.step_key,
                previousRole: stepIndex > 0 ? template.steps[stepIndex - 1].step_key : null,
                context: `Нужно сгенерировать вопрос для роли ${step.step_key}.`,
              }),
            );

            return (
              <div className="books-subpanel" key={`${template.id ?? templateIndex}-${step.step_key}`}>
                <button
                  type="button"
                  className="books-collapse"
                  onClick={() =>
                    setCollapsedSteps((current) => ({
                      ...current,
                      [stepSaveKey]: !(current[stepSaveKey] ?? false),
                    }))
                  }
                >
                  <span>{stepCollapsed ? "▶" : "▼"}</span>
                  <span>
                    Шаг {step.step_key}
                    {saveState[stepSaveKey] === "saved" ? " ✔" : ""}
                  </span>
                </button>

                {!stepCollapsed && (
                  <>
                    <div className="books-section-head">
                      <div>
                        <p className="books-section-help">{ROLE_HINTS[step.step_key]}</p>
                        <div className="books-section-help">
                          <strong>Зачем нужно несколько вариантов?</strong>
                          <br />
                          Каждый шаг истории может иметь несколько вариантов, чтобы ребёнок мог выбирать развитие сюжета.
                          <br />
                          Например: 1) Капибара нашла радугу 2) Капибара услышала странный звук 3) Капибара увидела карту.
                        </div>
                        <div className="books-section-help">
                          Стоимость генерации шага: {stepGenerationEstimate.inputTokens} in / {stepGenerationEstimate.outputTokens} out · {formatIls(stepGenerationEstimate.ils)}
                        </div>
                      </div>
                      <div className="books-actions books-actions--compact">
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          disabled={busyKey === `step-generate:${templateIndex}:${stepIndex}`}
                          onClick={() => {
                            void generateStepQuestion(templateIndex, stepIndex);
                          }}
                        >
                          {busyKey === `step-generate:${templateIndex}:${stepIndex}` ? "Генерация..." : "Сгенерировать"}
                        </button>
                        <button
                          type="button"
                          className={saveButtonClass(saveState, stepSaveKey)}
                          disabled={busyKey === `step-save:${templateIndex}:${stepIndex}`}
                          onClick={() => {
                            void saveStep(templateIndex, stepIndex);
                          }}
                        >
                          {busyKey === `step-save:${templateIndex}:${stepIndex}` ? "Сохранение..." : saveButtonLabel(saveState, stepSaveKey)}
                        </button>
                      </div>
                    </div>

                    <label className="books-field">
                      {helperLabel("Вопрос для шага", "Введите вопрос для шага истории.", "Этот вопрос будет показан ребёнку при выборе следующего хода истории.")}
                      <input
                        className="books-input"
                        value={step.question}
                        placeholder="Введите вопрос для шага истории"
                        onChange={(event) => {
                          updateTemplate(templateIndex, {
                            ...template,
                            steps: template.steps.map((item, index) =>
                              index === stepIndex ? { ...item, question: event.target.value } : item,
                            ),
                          });
                          markDirty(stepSaveKey);
                        }}
                      />
                    </label>

                    <div className="books-section-head">
                      <h4 className="books-subpanel__title">Варианты</h4>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={() => {
                          updateTemplate(templateIndex, {
                            ...template,
                            steps: template.steps.map((item, index) =>
                              index === stepIndex
                                ? {
                                    ...item,
                                    choices: [
                                      ...item.choices,
                                      { text: "", keywords: [], sort_order: item.choices.length },
                                    ],
                                  }
                                : item,
                            ),
                          });
                          setCollapsedChoices((current) => ({
                            ...current,
                            [choiceStateKey(templateIndex, stepIndex, step.choices.length)]: false,
                          }));
                          markDirty(stepSaveKey);
                        }}
                      >
                        Добавить вариант
                      </button>
                    </div>

                    {step.choices.map((choice, choiceIndex) => {
                      const choiceKey = choiceStateKey(templateIndex, stepIndex, choiceIndex);
                      const choiceCollapsed = collapsedChoices[choiceKey] ?? false;
                      const relatedFragments = roleFragments
                        .map((fragment) => ({
                          fragment,
                          fragmentIndex: template.fragments.findIndex((item) => item === fragment),
                        }))
                        .filter(({ fragment }) => fragment.choice_temp_key === String(choiceIndex));

                      return (
                        <div className="books-question" key={`${step.step_key}-${choiceIndex}`}>
                          <button
                            type="button"
                            className="books-collapse"
                            onClick={() =>
                              setCollapsedChoices((current) => ({
                                ...current,
                                [choiceKey]: !(current[choiceKey] ?? false),
                              }))
                            }
                          >
                            <span>{choiceCollapsed ? "▶" : "▼"}</span>
                            <span>Вариант {choiceIndex + 1}</span>
                          </button>

                          {!choiceCollapsed && (
                            <>
                              <div className="books-section-head">
                                <div />
                                <div className="books-actions books-actions--compact">
                                  <button
                                    type="button"
                                    className="books-button books-button--secondary"
                                    disabled={busyKey === `choice-generate:${templateIndex}:${stepIndex}:${choiceIndex}`}
                                    onClick={() => {
                                      void generateChoice(templateIndex, stepIndex, choiceIndex);
                                    }}
                                  >
                                    {busyKey === `choice-generate:${templateIndex}:${stepIndex}:${choiceIndex}` ? "Генерация..." : "Сгенерировать"}
                                  </button>
                                  <button
                                    type="button"
                                    className="books-button books-button--ghost"
                                    onClick={() => deleteChoice(templateIndex, stepIndex, choiceIndex)}
                                  >
                                    ✖ удалить
                                  </button>
                                </div>
                              </div>

                              <div className="books-grid books-grid--2">
                                <label className="books-field">
                                  {helperLabel("Текст варианта", "Введите вариант выбора для ребёнка.", "Короткая фраза, подходящая для роли шага.")}
                                  <input
                                    className="books-input"
                                    value={choice.text}
                                    placeholder="Введите вариант выбора"
                                    onChange={(event) => {
                                      updateTemplate(templateIndex, {
                                        ...template,
                                        steps: template.steps.map((item, index) =>
                                          index === stepIndex
                                            ? {
                                                ...item,
                                                choices: item.choices.map((choiceItem, itemIndex) =>
                                                  itemIndex === choiceIndex
                                                    ? { ...choiceItem, text: event.target.value }
                                                    : choiceItem,
                                                ),
                                              }
                                            : item,
                                        ),
                                      });
                                      markDirty(stepSaveKey);
                                    }}
                                  />
                                </label>

                                <label className="books-field">
                                  {helperLabel("Ключевые слова", "Можно вводить через запятую или пробел.", "Пример: радуга, капибара приключение")}
                                  <input
                                    className="books-input"
                                    value={
                                      keywordDrafts[`choice:${templateIndex}:${stepIndex}:${choiceIndex}`] ??
                                      formatKeywords(choice.keywords)
                                    }
                                    placeholder="радуга, капибара приключение"
                                    onChange={(event) => {
                                      const rawValue = event.target.value;
                                      setKeywordDrafts((current) => ({
                                        ...current,
                                        [`choice:${templateIndex}:${stepIndex}:${choiceIndex}`]: rawValue,
                                      }));
                                      updateTemplate(templateIndex, {
                                        ...template,
                                        steps: template.steps.map((item, index) =>
                                          index === stepIndex
                                            ? {
                                                ...item,
                                                choices: item.choices.map((choiceItem, itemIndex) =>
                                                  itemIndex === choiceIndex
                                                    ? { ...choiceItem, keywords: parseKeywords(rawValue) }
                                                    : choiceItem,
                                                ),
                                              }
                                            : item,
                                        ),
                                      });
                                      markDirty(stepSaveKey);
                                    }}
                                    onBlur={() => {
                                      setKeywordDrafts((current) => ({
                                        ...current,
                                        [`choice:${templateIndex}:${stepIndex}:${choiceIndex}`]: formatKeywords(choice.keywords),
                                      }));
                                    }}
                                  />
                                </label>
                              </div>

                              <div className="books-subpanel">
                                <div className="books-section-head">
                                  <h5 className="books-subpanel__title">Фрагменты для этого варианта</h5>
                                  <button
                                    type="button"
                                    className="books-button books-button--ghost"
                                    onClick={() => addFragment(templateIndex, stepIndex, step.step_key, choiceIndex)}
                                  >
                                    Добавить фрагмент
                                  </button>
                                </div>

                                {relatedFragments.length === 0 && (
                                  <div className="books-section-help">Фрагменты для этого варианта ещё не добавлены.</div>
                                )}

                                {relatedFragments.map(({ fragment, fragmentIndex }, relatedIndex) => {
                                  const fragmentKey = fragmentStateKey(templateIndex, step.step_key, fragmentIndex);
                                  const fragmentCollapsed = collapsedFragments[fragmentKey] ?? false;

                                  return (
                                    <div
                                      key={fragmentKey}
                                      className="books-question"
                                      ref={(element) => {
                                        fragmentRefs.current[fragmentKey] = element;
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="books-collapse"
                                        onClick={() =>
                                          setCollapsedFragments((current) => ({
                                            ...current,
                                            [fragmentKey]: !(current[fragmentKey] ?? false),
                                          }))
                                        }
                                      >
                                        <span>{fragmentCollapsed ? "▶" : "▼"}</span>
                                        <span>Фрагмент {relatedIndex + 1}</span>
                                      </button>

                                      {!fragmentCollapsed && (
                                        <>
                                          <div className="books-section-head">
                                            <div />
                                            <div className="books-actions books-actions--compact">
                                              <button
                                                type="button"
                                                className="books-button books-button--secondary"
                                                disabled={busyKey === `fragment-generate:${templateIndex}:${step.step_key}:${fragmentIndex}`}
                                                onClick={() => {
                                                  void generateFragment(templateIndex, step.step_key, fragmentIndex);
                                                }}
                                              >
                                                {busyKey === `fragment-generate:${templateIndex}:${step.step_key}:${fragmentIndex}` ? "Генерация..." : "Сгенерировать"}
                                              </button>
                                              <button
                                                type="button"
                                                className="books-button books-button--ghost"
                                                onClick={() => {
                                                  updateTemplate(templateIndex, {
                                                    ...template,
                                                    fragments: template.fragments.filter((_, index) => index !== fragmentIndex),
                                                  });
                                                  markDirty(fragmentsSaveKey);
                                                  markDirty(stepSaveKey);
                                                }}
                                              >
                                                ✖ удалить
                                              </button>
                                            </div>
                                          </div>

                                          <label className="books-field">
                                            {helperLabel("Текст фрагмента", "Фраза, которая будет частью истории.", "Одна короткая фраза, логически связанная с предыдущим шагом.")}
                                            <textarea
                                              className="books-input books-input--textarea books-input--small-textarea"
                                              value={fragment.text}
                                              placeholder="Фраза, которая будет частью истории"
                                              onChange={(event) => {
                                                updateTemplate(templateIndex, {
                                                  ...template,
                                                  fragments: template.fragments.map((item, index) =>
                                                    index === fragmentIndex ? { ...item, text: event.target.value } : item,
                                                  ),
                                                });
                                                markDirty(fragmentsSaveKey);
                                                markDirty(stepSaveKey);
                                              }}
                                            />
                                          </label>

                                          <label className="books-field">
                                            {helperLabel("Ключевые слова", "Можно вводить через запятую или пробел.", "Пример: радуга, карта приключение")}
                                            <input
                                              className="books-input"
                                              value={
                                                keywordDrafts[fragmentKey] ??
                                                formatKeywords(fragment.keywords)
                                              }
                                              placeholder="радуга, карта приключение"
                                              onChange={(event) => {
                                                const rawValue = event.target.value;
                                                setKeywordDrafts((current) => ({
                                                  ...current,
                                                  [fragmentKey]: rawValue,
                                                }));
                                                updateTemplate(templateIndex, {
                                                  ...template,
                                                  fragments: template.fragments.map((item, index) =>
                                                    index === fragmentIndex ? { ...item, keywords: parseKeywords(rawValue) } : item,
                                                  ),
                                                });
                                                markDirty(fragmentsSaveKey);
                                                markDirty(stepSaveKey);
                                              }}
                                              onBlur={() => {
                                                setKeywordDrafts((current) => ({
                                                  ...current,
                                                  [fragmentKey]: formatKeywords(fragment.keywords),
                                                }));
                                              }}
                                            />
                                          </label>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    <div className="books-subpanel">
                      <div className="books-section-head">
                        <h5 className="books-subpanel__title">Общие фрагменты шага</h5>
                        <button
                          type="button"
                          className="books-button books-button--ghost"
                          onClick={() => addFragment(templateIndex, stepIndex, step.step_key, null)}
                        >
                          Добавить фрагмент
                        </button>
                      </div>

                      {generalFragments.length === 0 && (
                        <div className="books-section-help">Общие фрагменты для этого шага ещё не добавлены.</div>
                      )}

                      {generalFragments.map((fragment, fragmentIndex) => {
                        const fragmentGlobalIndex = template.fragments.findIndex((item) => item === fragment);
                        const fragmentKey = fragmentStateKey(templateIndex, step.step_key, fragmentGlobalIndex);
                        const fragmentCollapsed = collapsedFragments[fragmentKey] ?? false;

                        return (
                          <div
                            key={fragmentKey}
                            className="books-question"
                            ref={(element) => {
                              fragmentRefs.current[fragmentKey] = element;
                            }}
                          >
                            <button
                              type="button"
                              className="books-collapse"
                              onClick={() =>
                                setCollapsedFragments((current) => ({
                                  ...current,
                                  [fragmentKey]: !(current[fragmentKey] ?? false),
                                }))
                              }
                            >
                              <span>{fragmentCollapsed ? "▶" : "▼"}</span>
                              <span>Общий фрагмент {fragmentIndex + 1}</span>
                            </button>

                            {!fragmentCollapsed && (
                              <>
                                <div className="books-section-head">
                                  <div />
                                  <div className="books-actions books-actions--compact">
                                    <button
                                      type="button"
                                      className="books-button books-button--secondary"
                                      disabled={busyKey === `fragment-generate:${templateIndex}:${step.step_key}:${fragmentGlobalIndex}`}
                                      onClick={() => {
                                        void generateFragment(templateIndex, step.step_key, fragmentGlobalIndex);
                                      }}
                                    >
                                      {busyKey === `fragment-generate:${templateIndex}:${step.step_key}:${fragmentGlobalIndex}` ? "Генерация..." : "Сгенерировать"}
                                    </button>
                                    <button
                                      type="button"
                                      className="books-button books-button--ghost"
                                      onClick={() => {
                                        updateTemplate(templateIndex, {
                                          ...template,
                                          fragments: template.fragments.filter((_, index) => index !== fragmentGlobalIndex),
                                        });
                                        markDirty(fragmentsSaveKey);
                                        markDirty(stepSaveKey);
                                      }}
                                    >
                                      ✖ удалить
                                    </button>
                                  </div>
                                </div>

                                <label className="books-field">
                                  {helperLabel("Текст фрагмента", "Фраза, которая будет частью истории.", "Одна короткая фраза, логически связанная с предыдущим шагом.")}
                                  <textarea
                                    className="books-input books-input--textarea books-input--small-textarea"
                                    value={fragment.text}
                                    placeholder="Фраза, которая будет частью истории"
                                    onChange={(event) => {
                                      updateTemplate(templateIndex, {
                                        ...template,
                                        fragments: template.fragments.map((item, index) =>
                                          index === fragmentGlobalIndex ? { ...item, text: event.target.value } : item,
                                        ),
                                      });
                                      markDirty(fragmentsSaveKey);
                                      markDirty(stepSaveKey);
                                    }}
                                  />
                                </label>

                                <label className="books-field">
                                  {helperLabel("Ключевые слова", "Можно вводить через запятую или пробел.", "Пример: радуга, карта приключение")}
                                  <input
                                    className="books-input"
                                    value={
                                      keywordDrafts[fragmentKey] ??
                                      formatKeywords(fragment.keywords)
                                    }
                                    placeholder="радуга, карта приключение"
                                    onChange={(event) => {
                                      const rawValue = event.target.value;
                                      setKeywordDrafts((current) => ({
                                        ...current,
                                        [fragmentKey]: rawValue,
                                      }));
                                      updateTemplate(templateIndex, {
                                        ...template,
                                        fragments: template.fragments.map((item, index) =>
                                          index === fragmentGlobalIndex ? { ...item, keywords: parseKeywords(rawValue) } : item,
                                        ),
                                      });
                                      markDirty(fragmentsSaveKey);
                                      markDirty(stepSaveKey);
                                    }}
                                    onBlur={() => {
                                      setKeywordDrafts((current) => ({
                                        ...current,
                                        [fragmentKey]: formatKeywords(fragment.keywords),
                                      }));
                                    }}
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Неожиданные повороты</h2>
            <p className="books-section-help">Глобальные неожиданные повороты для историй.</p>
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
              {busyKey === "twists-save" ? "Сохранение..." : saveButtonLabel(saveState, "twists")}
            </button>
          </div>
        </div>

        {twistsPanel}
      </section>
    </div>
  );
}
