"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import type { CatQuestionListItem } from "../../lib/cat-questions/types";

type CatQuestionsResponse = {
  questions: CatQuestionListItem[];
  total: number;
  page: number;
  limit: number;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

const sampleJson = `{
  "base_key": "why-sky-blue",
  "kind": "text",
  "prompt": "Почему небо голубое?",
  "category": "Физика",
  "slides": [
    { "order": 1, "text": "Мяу! Свет солнца кажется белым, но внутри него спрятаны разные цвета." },
    { "order": 2, "text": "Воздух сильнее рассеивает голубые лучи, поэтому они летят к нашим глазам со всех сторон." }
  ],
  "translations": {
    "en": {
      "prompt": "Why is the sky blue?",
      "slides": [
        { "order": 1, "text": "Meow! Sunlight looks white, but it contains many colors." },
        { "order": 2, "text": "Air scatters blue light more strongly, so blue reaches our eyes from every direction." }
      ]
    }
  }
}`;

const emptyQuestionJsonTemplate = `{
  "base_key": "",
  "kind": "text",
  "prompt": "",
  "category": "",
  "slides": [
    { "order": 1, "text": "" },
    { "order": 2, "text": "" },
    { "order": 3, "text": "" }
  ],
  "translations": {
    "en": {
      "prompt": "",
      "slides": [
        { "order": 1, "text": "" },
        { "order": 2, "text": "" },
        { "order": 3, "text": "" }
      ]
    },
    "he": {
      "prompt": "",
      "slides": [
        { "order": 1, "text": "" },
        { "order": 2, "text": "" },
        { "order": 3, "text": "" }
      ]
    }
  }
}`;

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function CatQuestionsAdminPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [questions, setQuestions] = useState<CatQuestionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [jsonImportValue, setJsonImportValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "100");
    if (search.trim()) {
      params.set("q", search.trim());
    }
    return `/api/admin/cat-questions?${params.toString()}`;
  }, [page, search]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<CatQuestionsResponse>(listUrl);
      setQuestions(data.questions);
      setTotal(data.total);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadQuestions();
  }, [sessionChecked, loadQuestions]);

  const importQuestion = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ question: { id: string; prompt: string } }>("/api/admin/cat-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: jsonImportValue }),
      });
      setJsonImportValue("");
      setSuccess(`Вопрос создан: ${data.question.prompt}`);
      await router.push(`/admin/cat-questions/${data.question.id}`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setImporting(false);
    }
  };

  const copyJsonTemplate = async () => {
    setError(null);
    setSuccess(null);
    try {
      await copyTextToClipboard(emptyQuestionJsonTemplate);
      setSuccess("Пустой пример JSON скопирован в буфер обмена.");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Не удалось скопировать JSON.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 100));

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
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
          <h1 className="books-admin-title">Вопросы</h1>
          <p className="books-admin-subtitle">
            База научных вопросов для раздела «Котики объяснят»: импорт JSON, поиск, проверка похожих формулировок и редактирование ответов по слайдам.
          </p>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Импорт готового JSON</h2>
            <p className="books-section-help">
              Вставьте один вопрос. Русский текст сохраняется как canonical, переводы en/he уйдут в `content_translations`.
            </p>
          </div>
          <div className="books-actions">
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={() => {
                void copyJsonTemplate();
              }}
            >
              Скопировать пример JSON
            </button>
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={importing || !jsonImportValue.trim()}
              onClick={() => {
                void importQuestion();
              }}
            >
              {importing ? "Импорт..." : "Импортировать"}
            </button>
          </div>
        </div>

        <label className="books-field">
          <span className="books-field__label">JSON вопроса</span>
          <textarea
            className="books-input books-input--textarea books-input--json"
            value={jsonImportValue}
            onChange={(event) => setJsonImportValue(event.target.value)}
            placeholder={sampleJson}
          />
        </label>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Существующие вопросы</h2>
            <p className="books-section-help">Показывается по 100 вопросов за страницу. Поиск работает по названию вопроса.</p>
          </div>
          <label className="books-field cat-questions-search">
            <span className="books-field__label">Поиск</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="слово из вопроса"
            />
          </label>
        </div>

        <div className="cat-questions-table">
          <div className="cat-questions-table__head">
            <span>Название вопроса</span>
            <span>Слайды</span>
            <span>Категория</span>
            <span>Действие</span>
          </div>
          {loading ? (
            <div className="books-table__empty">Загрузка...</div>
          ) : questions.length === 0 ? (
            <div className="books-table__empty">Вопросов пока нет.</div>
          ) : (
            questions.map((question) => (
              <div className="cat-questions-table__row" key={question.id}>
                <span>
                  <strong>{question.prompt}</strong>
                  {question.duplicate_warning && (
                    <small className="cat-questions-duplicate">{question.duplicate_warning}</small>
                  )}
                </span>
                <span>{question.slide_count}</span>
                <span>{question.category || "—"}</span>
                <span>
                  <Link href={`/admin/cat-questions/${question.id}`} className="books-button books-button--secondary">
                    Открыть
                  </Link>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="books-actions cat-questions-pagination">
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Назад
          </button>
          <span className="books-field__help">
            Страница {page} из {totalPages}, всего {total}
          </span>
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Вперед
          </button>
        </div>
      </section>
    </div>
  );
}
