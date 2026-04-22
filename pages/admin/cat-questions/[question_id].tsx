"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type { CatQuestionEditor, CatSlideInput } from "../../../lib/cat-questions/types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function emptySlide(order: number): CatSlideInput & { id: string } {
  return {
    id: `new-${order}-${Date.now()}`,
    order,
    text: "",
    mediaUrl: null,
    mediaType: null,
  };
}

export default function CatQuestionEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const questionId = typeof router.query.question_id === "string" ? router.query.question_id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [question, setQuestion] = useState<CatQuestionEditor | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  useEffect(() => {
    if (!sessionChecked || !questionId) {
      return;
    }

    setLoading(true);
    setError(null);
    fetchJson<{ question: CatQuestionEditor }>(`/api/admin/cat-questions/${questionId}`)
      .then((data) => setQuestion(data.question))
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
      .finally(() => setLoading(false));
  }, [questionId, sessionChecked]);

  const updateSlide = (index: number, patch: Partial<CatSlideInput>) => {
    setQuestion((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: current.slides.map((slide, slideIndex) => (
          slideIndex === index ? { ...slide, ...patch } : slide
        )),
      };
    });
  };

  const removeSlide = (index: number) => {
    setQuestion((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: current.slides
          .filter((_, slideIndex) => slideIndex !== index)
          .map((slide, slideIndex) => ({ ...slide, order: slideIndex + 1 })),
      };
    });
  };

  const addSlide = () => {
    setQuestion((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: [...current.slides, emptySlide(current.slides.length + 1)],
      };
    });
  };

  const saveQuestion = async () => {
    if (!question) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ question: CatQuestionEditor }>(`/api/admin/cat-questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: {
            legacy_id: question.legacy_id,
            base_key: question.base_key,
            kind: question.kind,
            prompt: question.prompt,
            category: question.category,
            is_active: question.is_active,
            sort_order: question.sort_order,
            slides: question.slides.map((slide, index) => ({
              order: index + 1,
              text: slide.text,
              mediaUrl: question.kind === "full" ? slide.mediaUrl : null,
              mediaType: question.kind === "full" ? slide.mediaType : null,
            })),
            translations: {},
          },
        }),
      });
      setQuestion(data.question);
      setSuccess("Вопрос сохранен.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async () => {
    if (!question) {
      return;
    }
    const confirmed = window.confirm(`Удалить вопрос «${question.prompt}» из базы?`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/cat-questions/${question.id}`, { method: "DELETE" });
      await router.push("/admin/cat-questions");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setDeleting(false);
    }
  };

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
          <h1 className="books-admin-title">{question?.prompt ?? "Вопрос"}</h1>
          <p className="books-admin-subtitle">Редактирование формулировки, категории и текстов слайдов ответа.</p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--ghost"
            onClick={() => {
              void router.push("/admin/cat-questions");
            }}
          >
            К списку
          </button>
          <button
            type="button"
            className="books-button books-button--danger"
            disabled={!question || deleting}
            onClick={() => {
              void deleteQuestion();
            }}
          >
            {deleting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}
      {loading && <div className="books-panel">Загрузка...</div>}

      {question && (
        <section className="books-panel">
          <div className="books-grid books-grid--3">
            <label className="books-field">
              <span className="books-field__label">Название вопроса</span>
              <input
                className="books-input"
                value={question.prompt}
                onChange={(event) => setQuestion({ ...question, prompt: event.target.value })}
              />
            </label>
            <label className="books-field">
              <span className="books-field__label">Категория</span>
              <input
                className="books-input"
                value={question.category ?? ""}
                onChange={(event) => setQuestion({ ...question, category: event.target.value })}
                placeholder="Физика"
              />
            </label>
            <label className="books-field">
              <span className="books-field__label">base_key</span>
              <input
                className="books-input"
                value={question.base_key}
                onChange={(event) => setQuestion({ ...question, base_key: event.target.value })}
              />
            </label>
          </div>

          <div className="books-actions">
            <label className="books-checkbox books-checkbox--inline">
              <input
                type="checkbox"
                checked={question.is_active}
                onChange={(event) => setQuestion({ ...question, is_active: event.target.checked })}
              />
              <span>
                Активен
                <small>Публичный сайт будет читать только активные вопросы.</small>
              </span>
            </label>
          </div>

          <div className="books-section-head">
            <div>
              <h2 className="books-panel__title">Слайды ответа</h2>
              <p className="books-section-help">Номера пересчитываются автоматически при сохранении.</p>
            </div>
            <button type="button" className="books-button books-button--secondary" onClick={addSlide}>
              Добавить слайд
            </button>
          </div>

          <div className="cat-slide-list">
            {question.slides.map((slide, index) => (
              <div className="cat-slide-editor" key={slide.id}>
                <label className="books-field cat-slide-editor__order">
                  <span className="books-field__label">Слайд</span>
                  <input className="books-input" type="number" value={index + 1} readOnly />
                </label>
                <label className="books-field">
                  <span className="books-field__label">Текст</span>
                  <textarea
                    className="books-input books-input--textarea books-input--small-textarea"
                    value={slide.text}
                    onChange={(event) => updateSlide(index, { text: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="books-button books-button--danger cat-slide-editor__delete"
                  disabled={question.slides.length <= 1}
                  onClick={() => removeSlide(index)}
                >
                  Удалить слайд
                </button>
              </div>
            ))}
          </div>

          <div className="books-actions books-actions--compact">
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={saving}
              onClick={() => {
                void saveQuestion();
              }}
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
