"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import slugify from "slugify";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../../components/AdminTabs";
import { AdminLogout } from "../../../components/AdminLogout";
import {
  buildExplanationPrompt,
  buildTestPrompt,
} from "../../../lib/ai/prompts";
import {
  estimateBatchBooksCost,
  estimateBookSectionCost,
  estimateFullBookCost,
  type BookGenerationSection,
} from "../../../lib/ai/bookGenerationProfile";
import type {
  BookEditorResponse,
  BookExplanationInput,
  BookTestInput,
} from "../../../lib/books/types";

type BookCompletionOverview = {
  id: string;
  title: string;
  author: string | null;
  filled_blocks: number;
  total_blocks: number;
  progress_percent: number;
};

type BookMissingSectionRow = {
  section: string;
  is_filled: boolean;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function emptyQuestion() {
  return {
    question: "",
    options: ["", "", ""],
    correctAnswerIndex: 0,
  };
}

function emptyTest(order: number): BookTestInput {
  return {
    title: "",
    description: "",
    is_published: false,
    sort_order: order,
    quiz: [emptyQuestion()],
  };
}

function toSlug(value: string) {
  return slugify(value, { lower: true, strict: true, trim: true });
}

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

function progressColor(percent: number) {
  if (percent < 40) {
    return "#d9534f";
  }
  if (percent <= 70) {
    return "#f0ad4e";
  }
  return "#4caf50";
}

function sectionLabel(section: string) {
  const labels: Record<string, string> = {
    meta: "Данные книги",
    categories: "Категории",
    plot: "Сюжет",
    main_idea: "Главная идея",
    author_message: "Что хотел сказать автор",
    ending_meaning: "Смысл финала",
    twenty_seconds: "Книга за 20 секунд",
    characters: "Персонажи",
    philosophy: "Философия книги",
    conflicts: "Конфликты",
    tests: "Тест",
  };
  return labels[section] ?? section;
}

function formatIls(value: number) {
  return `${value.toFixed(3)} ₪`;
}

export default function BookEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookId, setBookId] = useState("");
  const [editor, setEditor] = useState<BookEditorResponse | null>(null);
  const [progress, setProgress] = useState<BookCompletionOverview | null>(null);
  const [missingSections, setMissingSections] = useState<BookMissingSectionRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<Record<string, "saved" | "dirty">>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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
    if (!router.isReady) {
      return;
    }
    setBookId(typeof router.query.book_id === "string" ? router.query.book_id : "");
  }, [router.isReady, router.query.book_id]);

  const loadEditor = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, status] = await Promise.all([
        fetchJson<BookEditorResponse>(`/api/admin/books/${bookId}`),
        fetchJson<{ progress: BookCompletionOverview; sections: BookMissingSectionRow[] }>(
          `/api/admin/books/${bookId}/status`,
        ),
      ]);
      setEditor(data);
      setProgress(status.progress);
      setMissingSections(status.sections);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (!sessionChecked || !bookId) {
      return;
    }
    void loadEditor();
  }, [sessionChecked, bookId, loadEditor]);

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
  };

  const refreshStatus = useCallback(async () => {
    if (!bookId) {
      return;
    }
    const status = await fetchJson<{ progress: BookCompletionOverview; sections: BookMissingSectionRow[] }>(
      `/api/admin/books/${bookId}/status`,
    );
    setProgress(status.progress);
    setMissingSections(status.sections);
  }, [bookId]);

  const markDirty = (key: string) => {
    setSaveState((current) => ({ ...current, [key]: "dirty" }));
  };

  const markSaved = (key: string) => {
    setSaveState((current) => ({ ...current, [key]: "saved" }));
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  };

  const collapseSection = (key: string) => {
    setCollapsedSections((current) => ({ ...current, [key]: true }));
  };

  const sectionStatus = (key: string) => {
    if (key === "meta") {
      return Boolean(editor?.book.title.trim() && editor.book.description?.trim());
    }
    const row = missingSections.find((item) => item.section === key);
    return row?.is_filled ?? false;
  };

  const updateBook = <K extends keyof BookEditorResponse["book"]>(key: K, value: BookEditorResponse["book"][K]) => {
    setEditor((current) =>
      current
        ? {
            ...current,
            book: {
              ...current.book,
              [key]: value,
            },
          }
        : current,
    );
    markDirty("meta");
  };

  const updateExplanation = (index: number, explanation: BookExplanationInput) => {
    setEditor((current) => {
      if (!current) {
        return current;
      }
      const explanations = [...current.explanations];
      explanations[index] = explanation;
      return { ...current, explanations };
    });
    markDirty(explanation.mode_slug);
  };

  const updateTests = (tests: BookTestInput[]) => {
    setEditor((current) => (current ? { ...current, tests } : current));
    markDirty("tests");
  };

  const removeSlide = (explanationIndex: number, slideIndex: number) => {
    if (!editor) {
      return;
    }
    const explanation = editor.explanations[explanationIndex];
    if (!explanation || explanation.slides.length <= 1) {
      return;
    }
    updateExplanation(explanationIndex, {
      ...explanation,
      slides: explanation.slides.filter((_, index) => index !== slideIndex),
    });
  };

  const removeQuestion = (testIndex: number, questionIndex: number) => {
    if (!editor) {
      return;
    }
    const test = editor.tests[testIndex];
    if (!test || test.quiz.length <= 1) {
      return;
    }
    const tests = [...editor.tests];
    tests[testIndex] = {
      ...test,
      quiz: test.quiz.filter((_, index) => index !== questionIndex),
    };
    updateTests(tests);
    markDirty(`test:${testIndex}`);
  };

  const saveMeta = async () => {
    if (!editor) {
      return;
    }
    setBusyKey("meta");
    setError(null);
    try {
      const data = await fetchJson<{ book: BookEditorResponse["book"] }>(`/api/admin/books/${bookId}/meta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor.book),
      });
      updateBook("title", data.book.title);
      setEditor((current) => (current ? { ...current, book: data.book } : current));
      markSaved("meta");
      collapseSection("meta");
      await refreshStatus();
      showSuccess("Данные книги сохранены.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveCategories = async () => {
    if (!editor) {
      return;
    }
    setBusyKey("categories");
    setError(null);
    try {
      const data = await fetchJson<{ categoryIds: string[] }>(`/api/admin/books/${bookId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: editor.categoryIds }),
      });
      setEditor((current) => (current ? { ...current, categoryIds: data.categoryIds } : current));
      markSaved("categories");
      collapseSection("categories");
      await refreshStatus();
      showSuccess("Категории сохранены.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateExplanation = async (index: number) => {
    if (!editor) {
      return;
    }
    const explanation = editor.explanations[index];
    setBusyKey(`generate-explanation:${explanation.mode_id}`);
    setError(null);
    try {
      const data = await fetchJson<{ slides: Array<{ text: string }> }>("/api/admin/generate-book-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editor.book.title,
          author: editor.book.author,
          description: editor.book.description,
          mode: explanation.mode_slug,
        }),
      });
      updateExplanation(index, { ...explanation, slides: data.slides });
      showSuccess(`Блок «${explanation.mode_name}» сгенерирован.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveExplanation = async (index: number) => {
    if (!editor) {
      return;
    }
    const explanation = editor.explanations[index];
    setBusyKey(`save-explanation:${explanation.mode_id}`);
    setError(null);
    try {
      const data = await fetchJson<{ explanation: BookExplanationInput }>(
        `/api/admin/books/${bookId}/explanations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(explanation),
        },
      );
      updateExplanation(index, data.explanation);
      markSaved(explanation.mode_slug);
      collapseSection(explanation.mode_slug);
      await refreshStatus();
      showSuccess(`Блок «${explanation.mode_name}» сохранён.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateTest = async (index: number) => {
    if (!editor) {
      return;
    }
    setBusyKey(`generate-test:${index}`);
    setError(null);
    try {
      const data = await fetchJson<{
        title: string;
        description?: string | null;
        quiz: BookTestInput["quiz"];
      }>("/api/admin/generate-book-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editor.book.title,
          author: editor.book.author,
          description: editor.book.description,
          ageGroup: editor.book.age_group,
        }),
      });
      const tests = [...editor.tests];
      tests[index] = {
        ...tests[index],
        title: data.title,
        description: data.description ?? "",
        quiz: data.quiz,
      };
      updateTests(tests);
      showSuccess(`Тест ${index + 1} сгенерирован.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const saveTest = async (index: number) => {
    if (!editor) {
      return;
    }
    setBusyKey(`save-test:${index}`);
    setError(null);
    try {
      const data = await fetchJson<{ test: BookTestInput }>(`/api/admin/books/${bookId}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor.tests[index]),
      });
      const tests = [...editor.tests];
      tests[index] = data.test;
      updateTests(tests);
      markSaved(`test:${index}`);
      markSaved("tests");
      collapseSection(`test:${index}`);
      await refreshStatus();
      showSuccess(`Тест ${index + 1} сохранён.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteTest = async (index: number) => {
    if (!editor) {
      return;
    }
    const target = editor.tests[index];
    if (!target.id) {
      updateTests(editor.tests.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    setBusyKey(`delete-test:${index}`);
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/books/${bookId}/tests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: target.id }),
      });
      updateTests(editor.tests.filter((_, itemIndex) => itemIndex !== index));
      await refreshStatus();
      showSuccess(`Тест ${index + 1} удалён.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const approveCurrentBook = async () => {
    setBusyKey("approve-book");
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/books/${bookId}/approve`, {
        method: "POST",
      });
      setEditor((current) =>
        current
          ? {
              ...current,
              book: {
                ...current.book,
                is_published: true,
              },
            }
          : current,
      );
      await refreshStatus();
      showSuccess("Книга одобрена.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const deleteCurrentBook = async () => {
    setBusyKey("delete-book");
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/books/${bookId}/delete`, {
        method: "DELETE",
      });
      await router.push("/admin/books");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  const generateFullBook = async () => {
    if (!editor) {
      return;
    }
    setBusyKey("generate-full-book");
    setError(null);
    try {
      const data = await fetchJson<{ data: BookEditorResponse }>("/api/admin/generate-book-full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          title: editor.book.title,
          author: editor.book.author,
          description: editor.book.description,
          ageGroup: editor.book.age_group,
        }),
      });
      setEditor(data.data);
      await refreshStatus();
      showSuccess("Вся книга успешно сгенерирована.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  if (!sessionChecked || loading || !editor) {
    return <p style={{ padding: 24 }}>{loading ? "Загрузка редактора..." : "Проверка сессии..."}</p>;
  }

  const bookGenerationSections = editor.explanations.map((explanation) => ({
    key: explanation.mode_slug,
    label: explanation.mode_name,
    estimate: estimateBookSectionCost(
      buildExplanationPrompt({
        title: editor.book.title,
        author: editor.book.author,
        description: editor.book.description,
        mode: explanation.mode_slug,
      }),
      explanation.mode_slug as BookGenerationSection,
    ),
  }));

  const testEstimate = estimateBookSectionCost(
    buildTestPrompt({
      title: editor.book.title,
      author: editor.book.author,
      description: editor.book.description,
      ageGroup: editor.book.age_group,
    }),
    "test",
  );

  const fullBookEstimate = estimateFullBookCost({
    ...Object.fromEntries(
      editor.explanations.map((explanation) => [
        explanation.mode_slug,
        buildExplanationPrompt({
          title: editor.book.title,
          author: editor.book.author,
          description: editor.book.description,
          mode: explanation.mode_slug,
        }),
      ]),
    ),
    test: buildTestPrompt({
      title: editor.book.title,
      author: editor.book.author,
      description: editor.book.description,
      ageGroup: editor.book.age_group,
    }),
  } as Partial<Record<BookGenerationSection, string>>);

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
          <h1 className="books-admin-title">{editor.book.title}</h1>
          {!editor.book.is_published ? (
            <div style={{ marginTop: 8 }}>
              <strong className="books-badge books-badge--pending">⚠ Требует одобрения</strong>
            </div>
          ) : null}
          <p className="books-admin-subtitle">
            Редактор книги: метаданные, категории, объяснения и тесты. Конструктор историй вынесен в отдельный раздел.
          </p>
        </div>
        <div className="books-actions books-actions--compact">
          {!editor.book.is_published ? (
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={busyKey === "approve-book"}
              onClick={() => {
                void approveCurrentBook();
              }}
            >
              {busyKey === "approve-book" ? "Одобрение..." : "Одобрить книгу"}
            </button>
          ) : null}
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={busyKey === "delete-book"}
            onClick={() => {
              void deleteCurrentBook();
            }}
          >
            {busyKey === "delete-book" ? "Удаление..." : "Удалить книгу"}
          </button>
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={busyKey === "generate-full-book"}
            onClick={() => {
              void generateFullBook();
            }}
          >
            {busyKey === "generate-full-book" ? "Генерация..." : "Сгенерировать всю книгу"}
          </button>
          <button
            type="button"
            className="books-button books-button--secondary"
            onClick={() => {
              void router.push("/admin/books");
            }}
          >
            Назад к книгам
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Стоимость генерации книги</h2>
            <p className="books-section-help">
              Оценка токенов и стоимости до запуска Gemini для каждого блока и для всей книги целиком.
            </p>
          </div>
          <strong>{formatIls(fullBookEstimate.ils)}</strong>
        </div>

        <div className="story-overview-steps">
          {bookGenerationSections.map((section) => (
            <div className="story-overview-step" key={section.key}>
              <span className="story-overview-step__role">{section.label}</span>
              <span className="story-overview-step__count">
                {section.estimate.inputTokens} in / {section.estimate.outputTokens} out
              </span>
              <span>{formatIls(section.estimate.ils)}</span>
            </div>
          ))}
          <div className="story-overview-step">
            <span className="story-overview-step__role">Тест</span>
            <span className="story-overview-step__count">
              {testEstimate.inputTokens} in / {testEstimate.outputTokens} out
            </span>
            <span>{formatIls(testEstimate.ils)}</span>
          </div>
        </div>

        <div className="story-overview-progress">
          <div className="story-overview-progress__meta">
            <span>Полная генерация книги</span>
            <span>
              {fullBookEstimate.inputTokens} in / {fullBookEstimate.outputTokens} out · {formatIls(fullBookEstimate.ils)}
            </span>
          </div>
        </div>

        <div className="story-overview-steps">
          {[5, 10, 20].map((count) => (
            <div className="story-overview-step" key={`batch-${count}`}>
              <span className="story-overview-step__role">{count} книг</span>
              <span className="story-overview-step__count">Пакетная генерация</span>
              <span>{formatIls(estimateBatchBooksCost(count, fullBookEstimate.ils))}</span>
            </div>
          ))}
        </div>
      </section>

      {progress ? (
        <section className="books-panel">
          <div className="books-section-head">
            <div>
              <h2 className="books-panel__title">Статус книги</h2>
              <p className="books-section-help">
                {progress.filled_blocks} / {progress.total_blocks} разделов заполнено
              </p>
            </div>
            <strong>{progress.progress_percent}%</strong>
          </div>
          <div className="book-progress">
            <div
              className="book-progress__bar"
              style={{
                width: `${progress.progress_percent}%`,
                background: `linear-gradient(90deg, ${progressColor(progress.progress_percent)}, ${progressColor(progress.progress_percent)})`,
              }}
            />
          </div>
          <div className="book-section-status-list">
            {missingSections.map((item) => (
              <div className="book-section-status" key={item.section}>
                <span className={item.is_filled ? "book-section-status__ok" : "book-section-status__warning"}>
                  {item.is_filled ? "✔" : "⚠"}
                </span>
                <span>{sectionLabel(item.section)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="books-panel">
        <button type="button" className="books-collapse" onClick={() => toggleSection("meta")}>
          <span>{collapsedSections.meta ? "▶" : "▼"}</span>
          <span>
            Данные книги {sectionStatus("meta") ? "✔" : "⚠ не заполнено"}
          </span>
        </button>

        {!collapsedSections.meta && (
          <>
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Данные книги</h2>
                <p className="books-section-help">Заполните основные поля книги и сохраните только этот блок.</p>
              </div>
              <button
                type="button"
                className={saveButtonClass(saveState, "meta")}
                disabled={busyKey === "meta"}
                onClick={() => {
                  void saveMeta();
                }}
              >
                {busyKey === "meta" ? "Сохранение..." : saveButtonLabel(saveState, "meta")}
              </button>
            </div>

            <div className="books-grid books-grid--2">
              <label className="books-field">
                {helperLabel("Название", "Введите название книги так, как оно должно отображаться в CMS.", "Обязательное поле. Используйте финальный вариант названия.")}
                <input
                  className="books-input"
                  value={editor.book.title}
                  placeholder="Маленький принц"
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    updateBook("title", nextTitle);
                    if (!editor.book.slug || editor.book.slug === toSlug(editor.book.title)) {
                      updateBook("slug", toSlug(nextTitle));
                    }
                  }}
                />
              </label>

              <label className="books-field">
                {helperLabel("Slug", "URL-адрес в нижнем регистре, только буквы, цифры и дефисы.", "Формат: malenkiy-princ")}
                <input
                  className="books-input"
                  value={editor.book.slug}
                  placeholder="malenkiy-princ"
                  onChange={(event) => updateBook("slug", toSlug(event.target.value))}
                />
              </label>

              <label className="books-field">
                {helperLabel("Автор", "Укажите основного автора книги.", "Необязательное поле. Пример: Антуан де Сент-Экзюпери.")}
                <input
                  className="books-input"
                  value={editor.book.author ?? ""}
                  placeholder="Антуан де Сент-Экзюпери"
                  onChange={(event) => updateBook("author", event.target.value)}
                />
              </label>

              <label className="books-field">
                {helperLabel("Год", "Год публикации книги.", "Необязательное числовое поле. Пример: 1943.")}
                <input
                  className="books-input"
                  type="number"
                  value={editor.book.year ?? ""}
                  placeholder="1943"
                  onChange={(event) => updateBook("year", event.target.value ? Number(event.target.value) : null)}
                />
              </label>

              <label className="books-field books-field--wide">
                {helperLabel("Описание", "Короткое объяснение книги для ребёнка.", "Напишите 1–2 простых предложения о книге.")}
                <textarea
                  className="books-input books-input--textarea"
                  value={editor.book.description ?? ""}
                  placeholder="Короткое описание книги для детей."
                  onChange={(event) => updateBook("description", event.target.value)}
                />
              </label>

              <label className="books-field">
                {helperLabel("Ключевые слова", "Ключевые темы книги через запятую.", "Формат: дружба, смелость, путешествие")}
                <input
                  className="books-input"
                  value={editor.book.keywords.join(", ")}
                  placeholder="дружба, смелость, путешествие"
                  onChange={(event) =>
                    updateBook(
                      "keywords",
                      event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    )
                  }
                />
              </label>

              <label className="books-field">
                {helperLabel("Возраст", "Рекомендуемая возрастная группа.", "Пример: 6-8 или 8-10.")}
                <input
                  className="books-input"
                  value={editor.book.age_group ?? ""}
                  placeholder="6-8"
                  onChange={(event) => updateBook("age_group", event.target.value)}
                />
              </label>

              <label className="books-field">
                {helperLabel("Время чтения", "Примерное время чтения в минутах.", "Целое число минут. Пример: 12.")}
                <input
                  className="books-input"
                  type="number"
                  value={editor.book.reading_time ?? ""}
                  placeholder="12"
                  onChange={(event) =>
                    updateBook("reading_time", event.target.value ? Number(event.target.value) : null)
                  }
                />
              </label>

              <label className="books-checkbox">
                <input
                  type="checkbox"
                  checked={editor.book.is_published}
                  onChange={(event) => updateBook("is_published", event.target.checked)}
                />
                <span>
                  <strong>Опубликовано</strong>
                  <small>Включайте публикацию только после проверки метаданных и учебных материалов.</small>
                </span>
              </label>
            </div>
          </>
        )}
      </section>

      <section className="books-panel">
        <button type="button" className="books-collapse" onClick={() => toggleSection("categories")}>
          <span>{collapsedSections.categories ? "▶" : "▼"}</span>
          <span>
            Категории {sectionStatus("categories") ? "✔" : "⚠ не заполнено"}
          </span>
        </button>

        {!collapsedSections.categories && (
          <>
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Категории</h2>
                <p className="books-section-help">Выберите категории книги и сохраните только этот блок.</p>
              </div>
              <button
                type="button"
                className={saveButtonClass(saveState, "categories")}
                disabled={busyKey === "categories"}
                onClick={() => {
                  void saveCategories();
                }}
              >
                {busyKey === "categories" ? "Сохранение..." : saveButtonLabel(saveState, "categories")}
              </button>
            </div>

            <div className="books-checkbox-grid">
              {editor.categories.map((category) => {
                const checked = editor.categoryIds.includes(category.id);
                return (
                  <label className="books-checkbox" key={category.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setEditor((current) => {
                          if (!current) {
                            return current;
                          }
                          markDirty("categories");
                          return {
                            ...current,
                            categoryIds: event.target.checked
                              ? [...current.categoryIds, category.id]
                              : current.categoryIds.filter((item) => item !== category.id),
                          };
                        })
                      }
                    />
                    <span>
                      <strong>{category.name}</strong>
                      <small>{category.slug}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </section>

      {editor.explanations.map((explanation, explanationIndex) => (
        <section className="books-panel" key={explanation.mode_id}>
          <button type="button" className="books-collapse" onClick={() => toggleSection(explanation.mode_slug)}>
            <span>{collapsedSections[explanation.mode_slug] ? "▶" : "▼"}</span>
            <span>
              {explanation.mode_name} {sectionStatus(explanation.mode_slug) ? "✔" : "⚠ не заполнено"}
            </span>
          </button>

          {!collapsedSections[explanation.mode_slug] && (
            <div className="books-subpanel">
              <div className="books-section-head">
                <div>
                  <h3 className="books-subpanel__title">{explanation.mode_name}</h3>
                  <p className="books-section-help">Короткие слайды, объясняющие книгу детям простым языком.</p>
                </div>
                <label className="books-checkbox books-checkbox--inline">
                  <input
                    type="checkbox"
                    checked={explanation.is_published}
                    onChange={(event) =>
                      updateExplanation(explanationIndex, {
                        ...explanation,
                        is_published: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Опубликовано</strong>
                    <small>Управляет публикацией только этого объяснения.</small>
                  </span>
                </label>
              </div>

              {explanation.slides.map((slide, slideIndex) => (
                <div className="books-block" key={`${explanation.mode_id}-${slideIndex}`}>
                  <div className="books-block__header">
                    <div className="books-field">
                      {helperLabel(
                        `Слайд ${slideIndex + 1}`,
                        "Напишите короткое предложение для ребёнка.",
                        "Короткая понятная фраза о книге. Без длинных академических формулировок.",
                      )}
                    </div>
                    <button
                      type="button"
                      className="delete-button"
                      disabled={explanation.slides.length <= 1}
                      onClick={() => removeSlide(explanationIndex, slideIndex)}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    className="books-input books-input--textarea books-input--small-textarea"
                    value={slide.text}
                    placeholder="Короткая фраза для объяснения."
                    onChange={(event) => {
                      const slides = explanation.slides.map((item, index) =>
                        index === slideIndex ? { text: event.target.value } : item,
                      );
                      updateExplanation(explanationIndex, { ...explanation, slides });
                    }}
                  />
                </div>
              ))}

              <div className="books-actions books-actions--compact">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={busyKey === `generate-explanation:${explanation.mode_id}`}
                  onClick={() => {
                    void generateExplanation(explanationIndex);
                  }}
                >
                  {busyKey === `generate-explanation:${explanation.mode_id}` ? "Генерация..." : "Сгенерировать"}
                </button>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() =>
                    updateExplanation(explanationIndex, {
                      ...explanation,
                      slides: [...explanation.slides, { text: "" }],
                    })
                  }
                >
                  Добавить слайд
                </button>
                <button
                  type="button"
                  className={saveButtonClass(saveState, explanation.mode_slug)}
                  disabled={busyKey === `save-explanation:${explanation.mode_id}`}
                  onClick={() => {
                    void saveExplanation(explanationIndex);
                  }}
                >
                  {busyKey === `save-explanation:${explanation.mode_id}`
                    ? "Сохранение..."
                    : saveButtonLabel(saveState, explanation.mode_slug)}
                </button>
              </div>
            </div>
          )}
        </section>
      ))}

      <section className="books-panel">
        <button type="button" className="books-collapse" onClick={() => toggleSection("tests")}>
          <span>{collapsedSections.tests ? "▶" : "▼"}</span>
          <span>
            Тесты {sectionStatus("tests") ? "✔" : "⚠ не заполнено"}
          </span>
        </button>

        {!collapsedSections.tests && (
          <>
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Тесты</h2>
                <p className="books-section-help">Каждый тест можно редактировать, генерировать и сохранять отдельно.</p>
              </div>
              <button
                type="button"
                className="books-button books-button--secondary"
                onClick={() => {
                  updateTests([...editor.tests, emptyTest(editor.tests.length)]);
                  markDirty(`test:${editor.tests.length}`);
                  setCollapsedSections((current) => ({ ...current, tests: false, [`test:${editor.tests.length}`]: false }));
                }}
              >
                Добавить тест
              </button>
            </div>

            {editor.tests.map((test, testIndex) => (
              <div className="books-subpanel" key={test.id ?? `test-${testIndex}`}>
                <button type="button" className="books-collapse" onClick={() => toggleSection(`test:${testIndex}`)}>
                  <span>{collapsedSections[`test:${testIndex}`] ? "▶" : "▼"}</span>
                  <span>
                    Тест {testIndex + 1} {saveState[`test:${testIndex}`] === "saved" ? "✔" : ""}
                  </span>
                </button>

                {!collapsedSections[`test:${testIndex}`] && (
                  <>
                    <div className="books-section-head">
                      <h3 className="books-subpanel__title">Тест {testIndex + 1}</h3>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        disabled={busyKey === `delete-test:${testIndex}`}
                        onClick={() => {
                          void deleteTest(testIndex);
                        }}
                      >
                        {busyKey === `delete-test:${testIndex}` ? "Удаление..." : "Удалить"}
                      </button>
                    </div>

                    <div className="books-grid books-grid--2">
                      <label className="books-field">
                        {helperLabel("Название теста", "Короткое название блока теста.", "Пример: Тест по сюжету.")}
                        <input
                          className="books-input"
                          value={test.title}
                          placeholder="Тест по сюжету"
                          onChange={(event) => {
                            const tests = [...editor.tests];
                            tests[testIndex] = { ...test, title: event.target.value };
                            updateTests(tests);
                            markDirty(`test:${testIndex}`);
                          }}
                        />
                      </label>

                      <label className="books-field">
                        {helperLabel("Описание", "Короткая инструкция для ребёнка.", "Необязательное поле. Одно короткое предложение.")}
                        <input
                          className="books-input"
                          value={test.description ?? ""}
                          placeholder="Ответь на вопросы по книге"
                          onChange={(event) => {
                            const tests = [...editor.tests];
                            tests[testIndex] = { ...test, description: event.target.value };
                            updateTests(tests);
                            markDirty(`test:${testIndex}`);
                          }}
                        />
                      </label>
                    </div>

                    {test.quiz.map((question, questionIndex) => (
                      <div className="books-question" key={`${testIndex}-${questionIndex}`}>
                        <div className="books-block__header">
                          <div className="books-field">
                            {helperLabel(
                              `Вопрос ${questionIndex + 1}`,
                              "Введите вопрос по книге.",
                              "Короткий и понятный вопрос для ребёнка.",
                            )}
                          </div>
                          <button
                            type="button"
                            className="delete-button"
                            disabled={test.quiz.length <= 1}
                            onClick={() => removeQuestion(testIndex, questionIndex)}
                          >
                            ×
                          </button>
                        </div>
                        <label className="books-field">
                          <input
                            className="books-input"
                            value={question.question}
                            placeholder="Кто главный герой книги?"
                            onChange={(event) => {
                              const tests = [...editor.tests];
                              const quiz = [...test.quiz];
                              quiz[questionIndex] = { ...question, question: event.target.value };
                              tests[testIndex] = { ...test, quiz };
                              updateTests(tests);
                              markDirty(`test:${testIndex}`);
                            }}
                          />
                        </label>

                        <div className="books-grid books-grid--2">
                          {question.options.map((option, optionIndex) => (
                            <label className="books-field" key={`${questionIndex}-${optionIndex}`}>
                              {helperLabel(
                                `Ответ ${optionIndex + 1}`,
                                "Введите вариант ответа.",
                                "Используйте 3–4 варианта ответа.",
                              )}
                              <input
                                className="books-input"
                                value={option}
                                placeholder="Вариант ответа"
                                onChange={(event) => {
                                  const tests = [...editor.tests];
                                  const quiz = [...test.quiz];
                                  const options = [...question.options];
                                  options[optionIndex] = event.target.value;
                                  quiz[questionIndex] = { ...question, options };
                                  tests[testIndex] = { ...test, quiz };
                                  updateTests(tests);
                                  markDirty(`test:${testIndex}`);
                                }}
                              />
                            </label>
                          ))}
                        </div>

                        <label className="books-field">
                          {helperLabel("Правильный ответ", "Выберите правильный вариант.", "Выберите номер правильного ответа из списка.")}
                          <select
                            className="books-input"
                            value={question.correctAnswerIndex}
                            onChange={(event) => {
                              const tests = [...editor.tests];
                              const quiz = [...test.quiz];
                              quiz[questionIndex] = { ...question, correctAnswerIndex: Number(event.target.value) };
                              tests[testIndex] = { ...test, quiz };
                              updateTests(tests);
                              markDirty(`test:${testIndex}`);
                            }}
                          >
                            {question.options.map((_, optionIndex) => (
                              <option key={optionIndex} value={optionIndex}>
                                Вариант {optionIndex + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}

                    <div className="books-actions books-actions--compact">
                      <button
                        type="button"
                        className="books-button books-button--secondary"
                        disabled={busyKey === `generate-test:${testIndex}`}
                        onClick={() => {
                          void generateTest(testIndex);
                        }}
                      >
                        {busyKey === `generate-test:${testIndex}` ? "Генерация..." : "Сгенерировать"}
                      </button>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={() => {
                          const tests = [...editor.tests];
                          tests[testIndex] = { ...test, quiz: [...test.quiz, emptyQuestion()] };
                          updateTests(tests);
                          markDirty(`test:${testIndex}`);
                        }}
                      >
                        Добавить вопрос
                      </button>
                      <button
                        type="button"
                        className={saveButtonClass(saveState, `test:${testIndex}`)}
                        disabled={busyKey === `save-test:${testIndex}`}
                        onClick={() => {
                          void saveTest(testIndex);
                        }}
                      >
                        {busyKey === `save-test:${testIndex}`
                          ? "Сохранение..."
                          : saveButtonLabel(saveState, `test:${testIndex}`)}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
