/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type { ArtworkListItem } from "../../../lib/artworks/types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

export default function ArtworksAdminIndexPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [artworks, setArtworks] = useState<ArtworkListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    return `/api/admin/artworks${params.toString() ? `?${params.toString()}` : ""}`;
  }, [search]);

  const loadArtworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ artworks: ArtworkListItem[] }>(listUrl);
      setArtworks(data.artworks);
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
    void loadArtworks();
  }, [loadArtworks, sessionChecked]);

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
          <h1 className="books-admin-title">Художники</h1>
          <p className="books-admin-subtitle">
            Таблица `artworks`: список, поиск, переход в редактор и управление несколькими изображениями.
          </p>
        </div>
        <div className="books-actions">
          <Link href="/admin/artworks/new" className="books-button books-button--primary">
            Добавить художника
          </Link>
        </div>
      </header>

      <section className="books-panel">
        <div className="books-grid books-grid--2">
          <label className="books-field books-field--wide">
            <span className="books-field__label">Поиск</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ищите по имени, slug или категории"
            />
          </label>
        </div>
        {error ? <p className="books-error-text">{error}</p> : null}
        <div className="artworks-table-wrap">
          <table className="artworks-table">
            <thead>
              <tr>
                <th>Preview</th>
                <th>Artist name</th>
                <th>Slug</th>
                <th>Category</th>
                <th>Tags</th>
                <th>Images</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {artworks.map((artwork) => (
                <tr key={artwork.id}>
                  <td>
                    {artwork.image_url[0] ? (
                      <img src={artwork.image_url[0]} alt={artwork.title} className="artworks-table__thumb" />
                    ) : (
                      <div className="artworks-table__empty">No image</div>
                    )}
                  </td>
                  <td>{artwork.title}</td>
                  <td>{artwork.artist}</td>
                  <td>{artwork.category_slug}</td>
                  <td>{artwork.tags.join(", ") || "—"}</td>
                  <td>{artwork.image_url.length}</td>
                  <td>
                    <Link href={`/admin/artworks/${artwork.id}`} className="books-button books-button--ghost">
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && artworks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="artworks-table__empty-row">
                    Художники не найдены.
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
