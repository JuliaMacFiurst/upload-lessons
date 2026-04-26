"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type { ParrotMusicStyleListItem } from "../../../lib/parrot-music-styles/types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

export default function ParrotMusicStylesIndexPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [styles, setStyles] = useState<ParrotMusicStyleListItem[]>([]);
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
    if (search.trim()) {
      params.set("q", search.trim());
    }
    return `/api/admin/parrot-music-styles${params.toString() ? `?${params.toString()}` : ""}`;
  }, [search]);

  const loadStyles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ styles: ParrotMusicStyleListItem[] }>(listUrl);
      setStyles(data.styles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadStyles();
  }, [loadStyles, sessionChecked]);

  const importInitialStyles = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await fetchJson<{ imported: number; slugs: string[] }>(
        "/api/admin/parrot-music-styles/import",
        { method: "POST" },
      );
      setSuccess(`Imported ${result.imported} styles from capybara_tales.`);
      await loadStyles();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImporting(false);
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
          <h1 className="books-admin-title">Музыка</h1>
          <p className="books-admin-subtitle">
            Редактор музыкальных стилей для `/parrots`: метаданные, инструменты, аудио, слайды истории и `content_translations`.
          </p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--secondary"
            onClick={() => {
              void importInitialStyles();
            }}
            disabled={importing}
          >
            {importing ? "Импорт..." : "Import initial styles"}
          </button>
          <Link href="/admin/parrot-music-styles/new" className="books-button books-button--primary">
            Добавить стиль
          </Link>
        </div>
      </header>

      {error ? <div className="books-alert books-alert--error">{error}</div> : null}
      {success ? <div className="books-alert books-alert--success">{success}</div> : null}

      <section className="books-panel">
        <div className="books-grid books-grid--2">
          <label className="books-field books-field--wide">
            <span className="books-field__label">Поиск</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="По slug, названию, артисту или жанру"
            />
          </label>
        </div>
        <div className="artworks-table-wrap">
          <table className="artworks-table">
            <thead>
              <tr>
                <th>Slug</th>
                <th>Название</th>
                <th>Артист</th>
                <th>Жанр</th>
                <th>Инструменты</th>
                <th>Слайды</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {styles.map((style) => (
                <tr key={style.id}>
                  <td>{style.slug}</td>
                  <td>{style.title}</td>
                  <td>{style.search_artist || "—"}</td>
                  <td>{style.search_genre || "—"}</td>
                  <td>{style.preset_count}</td>
                  <td>{style.slide_count}</td>
                  <td>{style.is_active ? "active" : "inactive"}</td>
                  <td>
                    <Link href={`/admin/parrot-music-styles/${style.id}`} className="books-button books-button--ghost">
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && styles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="artworks-table__empty-row">
                    Стили не найдены.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
