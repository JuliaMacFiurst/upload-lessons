"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../../components/AdminTabs";
import { AdminLogout } from "../../../components/AdminLogout";
import {
  buildBookPayloadFromImportedJson,
  extractBookSeedFromImportedJson,
} from "../../../lib/books/book-json-import";
import type { BookEditorResponse, BookListItem, CategoryOption } from "../../../lib/books/types";

type BatchPlannedBook = {
  title: string;
  author: string | null;
};

function progressColor(percent: number) {
  if (percent >= 100) {
    return "#4caf50";
  }
  if (percent > 80) {
    return "#d4b106";
  }
  if (percent > 40) {
    return "#f0ad4e";
  }
  return "#d9534f";
}

function formatIls(value: number) {
  return `${value.toFixed(3)} ₪`;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

export default function AdminBooksIndexPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [search, setSearch] = useState("");
  const [books, setBooks] = useState<BookListItem[]>([]);
  const [bookCategories, setBookCategories] = useState<CategoryOption[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [checkingBook, setCheckingBook] = useState(false);
  const [importingBookJson, setImportingBookJson] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [jsonImportValue, setJsonImportValue] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [batchAgeGroup, setBatchAgeGroup] = useState("8-10");
  const [batchGenre, setBatchGenre] = useState("");
  const [batchCount, setBatchCount] = useState(5);
  const [batchPlan, setBatchPlan] = useState<BatchPlannedBook[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchEstimate, setBatchEstimate] = useState<{ estimated_tokens: number; estimated_cost_ils: number } | null>(null);
  const [planningBatch, setPlanningBatch] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "pending">("all");
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

  const searchUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("q", search.trim());
    }
    return `/api/admin/books${params.toString() ? `?${params.toString()}` : ""}`;
  }, [search]);

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    setError(null);
    try {
      const data = await fetchJson<{ books: BookListItem[] }>(searchUrl);
      setBooks(data.books);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoadingBooks(false);
    }
  }, [searchUrl]);

  const loadBookCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const data = await fetchJson<{ categories: CategoryOption[] }>("/api/admin/book-categories");
      setBookCategories(data.categories);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const filteredBooks = books.filter((book) => {
    if (statusFilter === "published") {
      return book.is_published === true;
    }
    if (statusFilter === "pending") {
      return book.is_published === false;
    }
    return true;
  });

  const formatMissingSections = (book: BookListItem) => {
    if (!book.missing_sections || book.missing_sections.length === 0) {
      return "—";
    }
    return book.missing_sections.join(", ");
  };

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadBooks();
    void loadBookCategories();
  }, [sessionChecked, loadBooks, loadBookCategories]);

  const checkBook = async () => {
    setCheckingBook(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ existing: boolean; book: BookListItem }>("/api/admin/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          author,
        }),
      });

      setSuccess(data.existing ? "Book already exists. Opening editor." : "Book created. Opening editor.");
      await router.push(`/admin/books/${data.book.id}`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setCheckingBook(false);
    }
  };

  const importBookFromJson = async () => {
    setImportingBookJson(true);
    setError(null);
    setSuccess(null);

    try {
      const seed = extractBookSeedFromImportedJson(jsonImportValue);
      const bookResult = await fetchJson<{ existing: boolean; book: BookListItem }>("/api/admin/books", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(seed),
      });

      const editor = await fetchJson<BookEditorResponse>(`/api/admin/books/${bookResult.book.id}`);
      const payload = buildBookPayloadFromImportedJson(editor, jsonImportValue);
      await fetchJson<{ ok: true; data: BookEditorResponse }>(`/api/admin/books/${bookResult.book.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await loadBooks();
      setSuccess(bookResult.existing ? "Книга обновлена из JSON. Открываю редактор." : "Книга создана из JSON. Открываю редактор.");
      await router.push(`/admin/books/${bookResult.book.id}`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setImportingBookJson(false);
    }
  };

  const createCategory = async () => {
    setCreatingCategory(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchJson<{ category: CategoryOption }>("/api/admin/book-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });

      setBookCategories((current) =>
        [...current, data.category].sort((left, right) => left.name.localeCompare(right.name, "ru")),
      );
      setNewCategoryName("");
      setSuccess(`Категория «${data.category.name}» готова. Теперь JSON можно импортировать повторно.`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setCreatingCategory(false);
    }
  };

  const planBatch = async () => {
    setPlanningBatch(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{
        batchId: string;
        books: BatchPlannedBook[];
        estimated_tokens: number;
        estimated_cost_ils: number;
      }>("/api/admin/generate-book-batch-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ageGroup: batchAgeGroup,
          genre: batchGenre || null,
          count: batchCount,
        }),
      });

      setBatchPlan(data.books);
      setBatchId(data.batchId);
      setBatchEstimate({
        estimated_tokens: data.estimated_tokens,
        estimated_cost_ils: data.estimated_cost_ils,
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setPlanningBatch(false);
    }
  };

  const runBatch = async () => {
    if (batchPlan.length === 0) {
      return;
    }

    setRunningBatch(true);
    setError(null);
    setSuccess(null);

    try {
      let generated = 0;
      let failed = 0;
      for (let index = 0; index < batchPlan.length; index += 1) {
        const book = batchPlan[index];
        setBatchProgress({ current: index + 1, total: batchPlan.length });
        const result = await fetchJson<{
          batchId: string;
          books: Array<{ id: string; title: string }>;
          generated: number;
          failed: number;
        }>("/api/admin/generate-book-batch-run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            batchId,
            books: [
              {
                ...book,
                ageGroup: batchAgeGroup,
                genre: batchGenre || null,
              },
            ],
          }),
        });
        generated += result.generated;
        failed += result.failed;
      }

      await loadBooks();
      setBatchPlan([]);
      setBatchId(null);
      setBatchEstimate(null);
      setSuccess(`Готово: ${generated} книг сгенерировано, ${failed} с ошибками`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setRunningBatch(false);
      setBatchProgress(null);
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
          <h1 className="books-admin-title">Books CMS</h1>
          <p className="books-admin-subtitle">
            Search books, create new entries, and immediately see how complete each book is.
          </p>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Категории книг</h2>
            <p className="books-section-help">
              Если импорт JSON падает из-за новой категории, добавьте её здесь и повторите импорт.
            </p>
          </div>
        </div>

        <div className="books-grid books-grid--2">
          <label className="books-field">
            <span className="books-field__label">
              Название категории
              <span className="books-field__tip" title="Категория будет создана в общем справочнике книг. Slug сформируется автоматически.">
                i
              </span>
            </span>
            <input
              className="books-input"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Приключения"
            />
            <span className="books-field__help">Пример: Приключения, Детская классика, Философская проза.</span>
          </label>
        </div>

        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={creatingCategory || !newCategoryName.trim()}
            onClick={() => {
              void createCategory();
            }}
          >
            {creatingCategory ? "Создание..." : "Добавить категорию"}
          </button>
        </div>

        <div className="books-tag-list">
          {loadingCategories ? (
            <span className="books-field__help">Загрузка категорий...</span>
          ) : bookCategories.length === 0 ? (
            <span className="books-field__help">Категории пока не добавлены.</span>
          ) : (
            bookCategories.map((category) => (
              <div className="books-tag" key={category.id}>
                <strong>{category.name}</strong>
                <small>{category.slug}</small>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Импорт готового JSON</h2>
            <p className="books-section-help">
              Вставьте полный JSON книги. Книга будет создана или найдена по `title`, затем данные сохранятся в базу.
            </p>
          </div>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={importingBookJson || !jsonImportValue.trim()}
            onClick={() => {
              void importBookFromJson();
            }}
          >
            {importingBookJson ? "Импорт..." : "Импортировать JSON"}
          </button>
        </div>

        <label className="books-field">
          <span className="books-field__label">
            JSON книги
            <span className="books-field__tip" title="Полный JSON со всеми данными книги, который будет автоматически разложен по полям и таблицам.">
              i
            </span>
          </span>
          <textarea
            className="books-input books-input--textarea books-input--json"
            value={jsonImportValue}
            placeholder='{"title":"Волшебник Земноморья","plot_slides":["..."]}'
            onChange={(event) => setJsonImportValue(event.target.value)}
          />
          <span className="books-field__help">
            Поддерживаются поля title, author, year, description, keywords, age, reading_time, categories, *_slides и test.
          </span>
        </label>

        <div className="books-import-help">
          <strong>Поддерживаемый формат</strong>
          <pre className="books-import-help__code">{`{
  "title": "Волшебник Земноморья",
  "author": "Урсула Ле Гуин",
  "year": 1968,
  "description": "Короткое описание книги",
  "keywords": "магия, взросление, тень",
  "age": "10–14 лет",
  "reading_time": "6–8 часов",
  "categories": ["фэнтези", "классика"],
  "plot_slides": ["...", "..."],
  "characters_slides": ["...", "..."],
  "idea_slides": ["...", "..."],
  "philosophy_slides": ["...", "..."],
  "conflicts_slides": ["...", "..."],
  "author_message_slides": ["...", "..."],
  "ending_meaning_slides": ["...", "..."],
  "book_in_20_sec_slides": ["...", "..."],
  "test": {
    "title": "Название теста",
    "description": "Короткое описание",
    "questions": [
      {
        "question": "Вопрос",
        "options": ["A", "B", "C"],
        "correct_answer": 2
      }
    ]
  }
}`}</pre>
          <p className="books-section-help">
            `correct_answer` указывается как номер ответа, начиная с 1. `reading_time` можно вставлять числом или строкой
            вроде `45 мин` или `6–8 часов`.
          </p>
        </div>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Пакетная генерация книг</h2>
            <p className="books-section-help">
              Сначала создаётся список книг, затем показывается стоимость, и только после подтверждения запускается последовательная генерация.
            </p>
          </div>
        </div>

        <div className="books-grid books-grid--3">
          <label className="books-field">
            <span className="books-field__label">Возрастная группа</span>
            <select className="books-input" value={batchAgeGroup} onChange={(event) => setBatchAgeGroup(event.target.value)}>
              <option value="5-7">5-7</option>
              <option value="8-10">8-10</option>
              <option value="10-12">10-12</option>
            </select>
          </label>

          <label className="books-field">
            <span className="books-field__label">Жанр</span>
            <select className="books-input" value={batchGenre} onChange={(event) => setBatchGenre(event.target.value)}>
              <option value="">Любой</option>
              <option value="приключения">приключения</option>
              <option value="фантастика">фантастика</option>
              <option value="сказка">сказка</option>
              <option value="детектив">детектив</option>
              <option value="юмор">юмор</option>
            </select>
          </label>

          <label className="books-field">
            <span className="books-field__label">Количество книг</span>
            <input
              className="books-input"
              type="number"
              min={1}
              max={20}
              value={batchCount}
              onChange={(event) => setBatchCount(Number(event.target.value) || 1)}
            />
          </label>
        </div>

        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={planningBatch || runningBatch}
            onClick={() => {
              void planBatch();
            }}
          >
            {planningBatch ? "Расчёт..." : "Рассчитать"}
          </button>
        </div>

        {batchEstimate && batchPlan.length > 0 ? (
          <div className="books-subpanel">
            <div className="books-section-head">
              <div>
                <h3 className="books-subpanel__title">Подтверждение генерации</h3>
                <p className="books-section-help">Будет сгенерировано книг: {batchPlan.length}</p>
              </div>
            </div>

            <div className="story-overview-steps">
              {batchPlan.map((book) => (
                <div className="story-overview-step" key={book.title}>
                  <span className="story-overview-step__role">{book.title}</span>
                  <span className="story-overview-step__count">{book.author ?? "Автор не указан"}</span>
                  <span />
                </div>
              ))}
              <div className="story-overview-step">
                <span className="story-overview-step__role">Токены</span>
                <span className="story-overview-step__count">{batchEstimate.estimated_tokens} токенов</span>
                <span />
              </div>
              <div className="story-overview-step">
                <span className="story-overview-step__role">Стоимость</span>
                <span className="story-overview-step__count">Примерная стоимость</span>
                <span>{formatIls(batchEstimate.estimated_cost_ils)}</span>
              </div>
            </div>

            <div className="books-actions">
              <button
                type="button"
                className="books-button books-button--ghost"
                disabled={runningBatch}
                onClick={() => {
                  setBatchPlan([]);
                  setBatchId(null);
                  setBatchEstimate(null);
                  setBatchProgress(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="books-button books-button--primary"
                disabled={runningBatch}
                onClick={() => {
                  void runBatch();
                }}
              >
                {runningBatch ? "Генерация..." : "Запустить генерацию"}
              </button>
            </div>

            {batchProgress ? (
              <div className="books-progress-block">
                <div className="books-progress-block__meta">
                  <strong>Генерируется книга {batchProgress.current} / {batchProgress.total}</strong>
                  <span>{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                </div>
                <div className="book-progress">
                  <div
                    className="book-progress__bar"
                    style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="books-panel">
        <h2 className="books-panel__title">Check Book</h2>
        <div className="books-grid books-grid--2">
          <label className="books-field">
            <span className="books-field__label">
              Title
              <span className="books-field__tip" title="Write the exact book title. This is used for duplicate checking and slug creation.">
                i
              </span>
            </span>
            <input
              className="books-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Charlotte's Web"
            />
            <span className="books-field__help">Exact book title. The duplicate check compares titles case-insensitively.</span>
          </label>

          <label className="books-field">
            <span className="books-field__label">
              Author
              <span className="books-field__tip" title="Write the primary author name. This field is optional during creation.">
                i
              </span>
            </span>
            <input
              className="books-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="E. B. White"
            />
            <span className="books-field__help">Primary author name. Use standard display formatting.</span>
          </label>
        </div>

        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={checkingBook || !title.trim()}
            onClick={() => {
              void checkBook();
            }}
          >
            {checkingBook ? "Checking..." : "Check book"}
          </button>
        </div>
      </section>

      <section className="books-panel">
        <h2 className="books-panel__title">Book Search</h2>
        <div className="books-actions">
          <button
            type="button"
            className={statusFilter === "all" ? "books-button books-button--primary" : "books-button books-button--ghost"}
            onClick={() => setStatusFilter("all")}
          >
            Все книги
          </button>
          <button
            type="button"
            className={statusFilter === "published" ? "books-button books-button--primary" : "books-button books-button--ghost"}
            onClick={() => setStatusFilter("published")}
          >
            Опубликованные
          </button>
          <button
            type="button"
            className={statusFilter === "pending" ? "books-button books-button--primary" : "books-button books-button--ghost"}
            onClick={() => setStatusFilter("pending")}
          >
            Требуют одобрения
          </button>
        </div>
        <label className="books-field">
          <span className="books-field__label">
            Search books
            <span className="books-field__tip" title="Search by title, author, or slug to open an existing editor.">
              i
            </span>
          </span>
          <input
            className="books-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title, author, or slug"
          />
          <span className="books-field__help">Filter the latest 50 books by title, author, or slug.</span>
        </label>

        <div className="books-table">
          <div className="books-table__head">
            <span>Title</span>
            <span>Author</span>
            <span>Progress</span>
            <span>Missing</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {loadingBooks && <div className="books-table__empty">Loading books...</div>}
          {!loadingBooks && filteredBooks.length === 0 && <div className="books-table__empty">No books found.</div>}
          {!loadingBooks &&
            filteredBooks.map((book) => (
              <div className="books-table__row" key={book.id}>
                <span>
                  <strong>{book.title}</strong>
                  <small>{book.slug}</small>
                </span>
                <span>{book.author || "—"}</span>
                <span className="books-progress-cell">
                  <strong>{book.progress_percent ?? 0}%</strong>
                  <div className="books-progress-inline">
                    <div
                      className="books-progress-inline__fill"
                      style={{
                        width: `${book.progress_percent ?? 0}%`,
                        background: progressColor(book.progress_percent ?? 0),
                      }}
                    />
                  </div>
                </span>
                <span>
                  <small>{formatMissingSections(book)}</small>
                </span>
                <span>
                  {book.is_published ? (
                    "Published"
                  ) : (
                    <strong className="books-badge books-badge--pending">⚠ Требует одобрения</strong>
                  )}
                </span>
                <span>
                  <Link className="books-link" href={`/admin/books/${book.id}`}>
                    Edit book
                  </Link>
                </span>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
