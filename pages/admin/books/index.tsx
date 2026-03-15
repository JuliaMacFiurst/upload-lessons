"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../../components/AdminTabs";
import { AdminLogout } from "../../../components/AdminLogout";
import type { BookListItem } from "../../../lib/books/types";

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
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [checkingBook, setCheckingBook] = useState(false);
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

  const loadBooks = async () => {
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
  };

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadBooks();
  }, [sessionChecked, searchUrl]);

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
            Search books, create new entries, and open the full editor for explanations, tests, and capybara stories.
          </p>
        </div>
      </header>

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

        {error && <div className="books-alert books-alert--error">{error}</div>}
        {success && <div className="books-alert books-alert--success">{success}</div>}

        <div className="books-table">
          <div className="books-table__head">
            <span>Title</span>
            <span>Author</span>
            <span>Year</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {loadingBooks && <div className="books-table__empty">Loading books...</div>}
          {!loadingBooks && books.length === 0 && <div className="books-table__empty">No books found.</div>}
          {!loadingBooks &&
            books.map((book) => (
              <div className="books-table__row" key={book.id}>
                <span>
                  <strong>{book.title}</strong>
                  <small>{book.slug}</small>
                </span>
                <span>{book.author || "—"}</span>
                <span>{book.year ?? "—"}</span>
                <span>{book.is_published ? "Published" : "Draft"}</span>
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
