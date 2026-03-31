"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";

type MapTargetStatusItem = {
  map_type: string;
  target_id: string;
  has_story: boolean;
  has_slides: boolean;
  slides_count: number;
  has_youtube_links: boolean;
  has_google_maps_url: boolean;
  has_slide_images: boolean;
};

type FilterMode = "all" | "missing-story" | "missing-slides" | "ready";
const PAGE_SIZE = 100;

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function getStatusMeta(item: MapTargetStatusItem) {
  if (!item.has_story) {
    return {
      icon: "❌",
      label: "Без story",
      tone: "danger",
    } as const;
  }

  if (!item.has_slides) {
    return {
      icon: "⚠",
      label: "Есть story, нет slides",
      tone: "warning",
    } as const;
  }

  return {
    icon: "✅",
    label: "Готово",
    tone: "success",
  } as const;
}

function getPresenceMeta(isPresent: boolean) {
  return isPresent
    ? {
        icon: "✅",
        label: "Есть",
        tone: "success",
      }
    : {
        icon: "❌",
        label: "Нет",
        tone: "danger",
      };
}

export default function AdminMapTargetsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [items, setItems] = useState<MapTargetStatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [page, setPage] = useState(1);

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

    let isActive = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchJson<{ items: MapTargetStatusItem[] }>("/api/admin/map-targets-status");
        if (isActive) {
          setItems(data.items);
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [sessionChecked]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (query && !item.target_id.toLowerCase().includes(query)) {
        return false;
      }

      if (filter === "missing-story") {
        return !item.has_story;
      }

      if (filter === "missing-slides") {
        return item.has_story && !item.has_slides;
      }

      if (filter === "ready") {
        return item.has_slides;
      }

      return true;
    });
  }, [filter, items, search]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, safePage]);

  const stats = useMemo(() => {
    let missingStory = 0;
    let missingSlides = 0;
    let ready = 0;

    for (const item of items) {
      if (!item.has_story) {
        missingStory += 1;
      } else if (!item.has_slides) {
        missingSlides += 1;
      } else {
        ready += 1;
      }
    }

    return {
      total: items.length,
      missingStory,
      missingSlides,
      ready,
    };
  }, [items]);

  const statsByMapType = useMemo(() => {
    const grouped = new Map<
      string,
      { map_type: string; total: number; missingStory: number; missingSlides: number; ready: number }
    >();

    for (const item of items) {
      const group = grouped.get(item.map_type) ?? {
        map_type: item.map_type,
        total: 0,
        missingStory: 0,
        missingSlides: 0,
        ready: 0,
      };

      group.total += 1;

      if (!item.has_story) {
        group.missingStory += 1;
      } else if (!item.has_slides) {
        group.missingSlides += 1;
      } else {
        group.ready += 1;
      }

      grouped.set(item.map_type, group);
    }

    return Array.from(grouped.values()).sort((a, b) => a.map_type.localeCompare(b.map_type));
  }, [items]);

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="map-targets-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <header className="map-targets-header">
        <div>
          <h1 className="map-targets-title">Покрытие карты</h1>
          <p className="map-targets-subtitle">
            Список всех `map_targets` с проверкой story, slides, YouTube, Google Maps/Earth и изображений в слайдах.
          </p>
        </div>
        <div className="map-targets-summary">
          <div className="map-targets-summary__card">
            <span className="map-targets-summary__value">{stats.total}</span>
            <span className="map-targets-summary__label">Всего</span>
          </div>
          <div className="map-targets-summary__card">
            <span className="map-targets-summary__value">{stats.missingStory}</span>
            <span className="map-targets-summary__label">Без story</span>
          </div>
          <div className="map-targets-summary__card">
            <span className="map-targets-summary__value">{stats.missingSlides}</span>
            <span className="map-targets-summary__label">Без slides</span>
          </div>
          <div className="map-targets-summary__card">
            <span className="map-targets-summary__value">{stats.ready}</span>
            <span className="map-targets-summary__label">Готово</span>
          </div>
        </div>
      </header>

      <section className="map-targets-panel">
        <div className="map-targets-section">
          <div className="map-targets-section__header">
            <h2 className="map-targets-section__title">Покрытие по map_type</h2>
          </div>

          {statsByMapType.length === 0 ? (
            <div className="map-targets-state">Пока нет данных по map_type.</div>
          ) : (
            <div className="map-targets-type-grid">
              {statsByMapType.map((group) => (
                <div key={group.map_type} className="map-targets-type-card">
                  <div className="map-targets-type-card__name">{group.map_type}</div>
                  <div className="map-targets-type-card__stats">
                    <span>Всего: {group.total}</span>
                    <span>Без story: {group.missingStory}</span>
                    <span>Без slides: {group.missingSlides}</span>
                    <span>Готово: {group.ready}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="map-targets-controls">
          <label className="map-targets-field map-targets-field--search">
            <span className="map-targets-field__label">Поиск по target_id</span>
            <input
              className="map-targets-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Например: brazil или nile"
            />
          </label>

          <div className="map-targets-field">
            <span className="map-targets-field__label">Фильтр</span>
            <div className="map-targets-filters">
              <button
                type="button"
                className={`map-targets-filter ${filter === "all" ? "is-active" : ""}`}
                onClick={() => setFilter("all")}
              >
                Все
              </button>
              <button
                type="button"
                className={`map-targets-filter ${filter === "missing-story" ? "is-active" : ""}`}
                onClick={() => setFilter("missing-story")}
              >
                Только без story
              </button>
              <button
                type="button"
                className={`map-targets-filter ${filter === "missing-slides" ? "is-active" : ""}`}
                onClick={() => setFilter("missing-slides")}
              >
                Только без slides
              </button>
              <button
                type="button"
                className={`map-targets-filter ${filter === "ready" ? "is-active" : ""}`}
                onClick={() => setFilter("ready")}
              >
                Только готовые
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="map-targets-error">{error}</p> : null}
        {loading ? <div className="map-targets-state">Загрузка покрытия карты...</div> : null}
        {!loading && !error && filteredItems.length === 0 ? (
          <div className="map-targets-state">
            {items.length === 0 ? "Данные по map_targets пока отсутствуют." : "Ничего не найдено по текущему фильтру."}
          </div>
        ) : null}

        {!loading && !error && filteredItems.length > 0 ? (
          <div className="map-targets-table-wrap">
            <div className="map-targets-pagination">
              <div className="map-targets-pagination__meta">
                Показано {paginatedItems.length} из {filteredItems.length}
                {filteredItems.length !== items.length ? `, всего записей: ${items.length}` : ""}
              </div>
              <div className="map-targets-pagination__actions">
                <button
                  type="button"
                  className="map-targets-pagination__button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={safePage <= 1}
                >
                  Назад
                </button>
                <span className="map-targets-pagination__page">
                  Страница {safePage} из {totalPages}
                </span>
                <button
                  type="button"
                  className="map-targets-pagination__button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={safePage >= totalPages}
                >
                  Вперёд
                </button>
              </div>
            </div>
            <table className="map-targets-table">
              <thead>
                <tr>
                  <th>map_type</th>
                  <th>target_id</th>
                  <th>Статус</th>
                  <th>YouTube</th>
                  <th>Google Maps / Earth</th>
                  <th>Изображения в slides</th>
                  <th>slides_count</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((item) => {
                  const status = getStatusMeta(item);
                  const youtubeStatus = getPresenceMeta(item.has_youtube_links);
                  const mapsStatus = getPresenceMeta(item.has_google_maps_url);
                  const imagesStatus = getPresenceMeta(item.has_slide_images);

                  return (
                    <tr key={`${item.map_type}:${item.target_id}`}>
                      <td>{item.map_type}</td>
                      <td className="map-targets-table__target">{item.target_id}</td>
                      <td>
                        <span className={`map-targets-badge map-targets-badge--${status.tone}`}>
                          <span>{status.icon}</span>
                          <span>{status.label}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`map-targets-badge map-targets-badge--${youtubeStatus.tone}`}>
                          <span>{youtubeStatus.icon}</span>
                          <span>{youtubeStatus.label}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`map-targets-badge map-targets-badge--${mapsStatus.tone}`}>
                          <span>{mapsStatus.icon}</span>
                          <span>{mapsStatus.label}</span>
                        </span>
                      </td>
                      <td>
                        <span className={`map-targets-badge map-targets-badge--${imagesStatus.tone}`}>
                          <span>{imagesStatus.icon}</span>
                          <span>{imagesStatus.label}</span>
                        </span>
                      </td>
                      <td>{item.slides_count}</td>
                      <td>
                        <Link
                          href={`/admin/map-target/${encodeURIComponent(item.map_type)}/${encodeURIComponent(item.target_id)}`}
                          className="map-targets-open"
                        >
                          Открыть
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <style jsx>{`
        .map-targets-page {
          padding: 24px;
        }

        .map-targets-header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .map-targets-title {
          margin: 0 0 8px;
          font-size: 32px;
        }

        .map-targets-subtitle {
          margin: 0;
          max-width: 720px;
          color: #5f6368;
          line-height: 1.5;
        }

        .map-targets-summary {
          display: grid;
          grid-template-columns: repeat(4, minmax(96px, 1fr));
          gap: 12px;
          min-width: min(100%, 440px);
        }

        .map-targets-summary__card {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 16px;
          background: #ffffff;
          border: 1px solid #dde3ea;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(20, 28, 45, 0.06);
        }

        .map-targets-summary__value {
          font-size: 24px;
          font-weight: 700;
        }

        .map-targets-summary__label {
          font-size: 13px;
          color: #667085;
        }

        .map-targets-panel {
          background: #ffffff;
          border: 1px solid #dde3ea;
          border-radius: 16px;
          box-shadow: 0 12px 32px rgba(20, 28, 45, 0.06);
          overflow: hidden;
        }

        .map-targets-section {
          padding: 20px;
          border-bottom: 1px solid #edf1f5;
        }

        .map-targets-section__header {
          margin-bottom: 16px;
        }

        .map-targets-section__title {
          margin: 0;
          font-size: 18px;
          color: #101828;
        }

        .map-targets-type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .map-targets-type-card {
          border: 1px solid #eaecf0;
          border-radius: 14px;
          background: #fcfcfd;
          padding: 14px;
        }

        .map-targets-type-card__name {
          margin-bottom: 10px;
          font-size: 16px;
          font-weight: 700;
          color: #101828;
        }

        .map-targets-type-card__stats {
          display: grid;
          gap: 6px;
          font-size: 14px;
          color: #475467;
        }

        .map-targets-controls {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          padding: 20px;
          border-bottom: 1px solid #edf1f5;
          align-items: end;
        }

        .map-targets-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 0;
        }

        .map-targets-field--search {
          flex: 1;
          max-width: 420px;
        }

        .map-targets-field__label {
          font-size: 13px;
          font-weight: 600;
          color: #475467;
        }

        .map-targets-input {
          width: 100%;
          margin: 0;
          padding: 10px 12px;
          border: 1px solid #cfd8e3;
          border-radius: 10px;
          background: #fbfcfe;
        }

        .map-targets-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .map-targets-filter {
          width: auto;
          margin: 0;
          padding: 10px 14px;
          border: 1px solid #d0d7e2;
          border-radius: 999px;
          background: #ffffff;
          color: #344054;
          cursor: pointer;
          transition: all 0.16s ease;
        }

        .map-targets-filter.is-active {
          background: #1f4b99;
          border-color: #1f4b99;
          color: #ffffff;
        }

        .map-targets-error,
        .map-targets-state {
          margin: 0;
          padding: 20px;
        }

        .map-targets-error {
          color: #b42318;
          border-bottom: 1px solid #edf1f5;
          background: #fff4f2;
        }

        .map-targets-state {
          color: #475467;
        }

        .map-targets-table-wrap {
          overflow: auto;
        }

        .map-targets-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 20px 20px 0;
          flex-wrap: wrap;
        }

        .map-targets-pagination__meta {
          color: #667085;
          font-size: 14px;
        }

        .map-targets-pagination__actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .map-targets-pagination__button {
          border: 1px solid #d0d5dd;
          background: #fff;
          color: #101828;
          border-radius: 10px;
          padding: 8px 12px;
          font: inherit;
          cursor: pointer;
        }

        .map-targets-pagination__button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .map-targets-pagination__page {
          color: #344054;
          font-size: 14px;
          font-weight: 600;
        }

        .map-targets-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1260px;
        }

        .map-targets-table th,
        .map-targets-table td {
          padding: 14px 16px;
          text-align: left;
          border-top: 1px solid #edf1f5;
          vertical-align: middle;
        }

        .map-targets-table thead th {
          border-top: none;
          background: #f8fafc;
          color: #475467;
          font-size: 13px;
          font-weight: 700;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .map-targets-table tbody tr:hover {
          background: #f9fbff;
        }

        .map-targets-table__target {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        .map-targets-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
        }

        .map-targets-badge--danger {
          background: #fff1f3;
          color: #b42318;
        }

        .map-targets-badge--warning {
          background: #fffaeb;
          color: #b54708;
        }

        .map-targets-badge--success {
          background: #ecfdf3;
          color: #027a48;
        }

        .map-targets-open {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 92px;
          padding: 10px 14px;
          border-radius: 10px;
          background: #111827;
          color: #ffffff;
          text-decoration: none;
          font-weight: 600;
        }

        @media (max-width: 900px) {
          .map-targets-page {
            padding: 16px;
          }

          .map-targets-header {
            flex-direction: column;
          }

          .map-targets-summary {
            width: 100%;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .map-targets-controls {
            flex-direction: column;
            align-items: stretch;
          }

          .map-targets-pagination {
            flex-direction: column;
            align-items: stretch;
          }

          .map-targets-pagination__actions {
            justify-content: space-between;
          }

          .map-targets-field--search {
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}
