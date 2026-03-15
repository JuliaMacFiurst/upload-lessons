"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import slugify from "slugify";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../../components/AdminTabs";
import { AdminLogout } from "../../../components/AdminLogout";
import type {
  BookEditorResponse,
  BookExplanationInput,
  BookTestInput,
} from "../../../lib/books/types";

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

export default function BookEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bookId, setBookId] = useState("");
  const [editor, setEditor] = useState<BookEditorResponse | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
      const data = await fetchJson<BookEditorResponse>(`/api/admin/books/${bookId}`);
      setEditor(data);
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
  };

  const updateTests = (tests: BookTestInput[]) => {
    setEditor((current) => (current ? { ...current, tests } : current));
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
      showSuccess(`Тест ${index + 1} удалён.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setBusyKey(null);
    }
  };

  if (!sessionChecked || loading || !editor) {
    return <p style={{ padding: 24 }}>{loading ? "Загрузка редактора..." : "Проверка сессии..."}</p>;
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
          <h1 className="books-admin-title">{editor.book.title}</h1>
          <p className="books-admin-subtitle">
            Редактор книги: метаданные, категории, объяснения и тесты. Конструктор историй вынесен в отдельный раздел.
          </p>
        </div>
        <div className="books-actions books-actions--compact">
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
            <h2 className="books-panel__title">Данные книги</h2>
            <p className="books-section-help">Заполните основные поля книги и сохраните только этот блок.</p>
          </div>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={busyKey === "meta"}
            onClick={() => {
              void saveMeta();
            }}
          >
            {busyKey === "meta" ? "Сохранение..." : "Сохранить"}
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
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Категории</h2>
            <p className="books-section-help">Выберите категории книги и сохраните только этот блок.</p>
          </div>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={busyKey === "categories"}
            onClick={() => {
              void saveCategories();
            }}
          >
            {busyKey === "categories" ? "Сохранение..." : "Сохранить"}
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
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Объяснения</h2>
            <p className="books-section-help">Каждый блок можно сгенерировать и сохранить отдельно.</p>
          </div>
        </div>

        {editor.explanations.map((explanation, explanationIndex) => (
          <div className="books-subpanel" key={explanation.mode_id}>
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
              <label className="books-field" key={`${explanation.mode_id}-${slideIndex}`}>
                {helperLabel(
                  `Слайд ${slideIndex + 1}`,
                  "Напишите короткое предложение для ребёнка.",
                  "Короткая понятная фраза о книге. Без длинных академических формулировок.",
                )}
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
              </label>
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
                className="books-button books-button--primary"
                disabled={busyKey === `save-explanation:${explanation.mode_id}`}
                onClick={() => {
                  void saveExplanation(explanationIndex);
                }}
              >
                {busyKey === `save-explanation:${explanation.mode_id}` ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Тесты</h2>
            <p className="books-section-help">Каждый тест можно редактировать, генерировать и сохранять отдельно.</p>
          </div>
          <button
            type="button"
            className="books-button books-button--secondary"
            onClick={() => updateTests([...editor.tests, emptyTest(editor.tests.length)])}
          >
            Добавить тест
          </button>
        </div>

        {editor.tests.map((test, testIndex) => (
          <div className="books-subpanel" key={test.id ?? `test-${testIndex}`}>
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
                  }}
                />
              </label>
            </div>

            {test.quiz.map((question, questionIndex) => (
              <div className="books-question" key={`${testIndex}-${questionIndex}`}>
                <label className="books-field">
                  {helperLabel(
                    `Вопрос ${questionIndex + 1}`,
                    "Введите вопрос по книге.",
                    "Короткий и понятный вопрос для ребёнка.",
                  )}
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
                }}
              >
                Добавить вопрос
              </button>
              <button
                type="button"
                className="books-button books-button--primary"
                disabled={busyKey === `save-test:${testIndex}`}
                onClick={() => {
                  void saveTest(testIndex);
                }}
              >
                {busyKey === `save-test:${testIndex}` ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
