"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import { estimateMapTargetBatchCost } from "../../lib/ai/mapTargetGenerationProfile";

type MapTargetStatusItem = {
  map_type: string;
  target_id: string;
  has_story: boolean;
  has_slides: boolean;
  slides_count: number;
  has_youtube_links: boolean;
  has_google_maps_url: boolean;
  has_slide_images: boolean;
  is_approved: boolean;
  auto_generated: boolean;
};

type BulkMapStoryJsonItem = {
  map_type: string;
  target_id: string;
  content: string;
};

type FilterMode = "all" | "missing-story" | "missing-slides" | "ready";
const PAGE_SIZE = 100;

function getResponseErrorMessage(raw: string, status: number): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return `Request failed with status ${status}.`;
  }

  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return `Server returned HTML instead of JSON (status ${status}). Check server logs for the underlying error.`;
  }

  return trimmed.slice(0, 300);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(getResponseErrorMessage(raw, response.status));
  }

  const data = JSON.parse(raw) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? getResponseErrorMessage(raw, response.status));
  }
  return data;
}

function getStatusMeta(item: MapTargetStatusItem) {
  if (item.auto_generated && !item.is_approved) {
    return {
      icon: "🤖",
      label: "Автогенерация ждёт одобрения",
      tone: "warning",
    } as const;
  }

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

function getSlidesCountTone(count: number): "danger" | "warning" | "neutral" {
  if (count > 35) {
    return "danger";
  }

  if (count > 25) {
    return "warning";
  }

  return "neutral";
}

export default function AdminMapTargetsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [items, setItems] = useState<MapTargetStatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [parsingSelectedSlides, setParsingSelectedSlides] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkJsonInput, setBulkJsonInput] = useState("");
  const [savingBulkJson, setSavingBulkJson] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const copiedJsonTimerRef = useRef<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchJson<{ items: MapTargetStatusItem[] }>("/api/admin/map-targets-status");
      setItems(data.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    void loadItems();
  }, [loadItems, sessionChecked]);

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

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const selectedItems = useMemo(
    () =>
      items.filter((item) => selectedKeySet.has(`${item.map_type}::${item.target_id}`)),
    [items, selectedKeySet],
  );

  const batchEstimate = useMemo(
    () =>
      selectedItems.length > 0
        ? estimateMapTargetBatchCost(
            selectedItems.map((item) => ({
              map_type: item.map_type,
              target_id: item.target_id,
            })),
          )
        : null,
    [selectedItems],
  );

  const selectedItemsWithStoryWithoutSlides = useMemo(
    () => selectedItems.filter((item) => item.has_story && !item.has_slides),
    [selectedItems],
  );

  const paginatedKeys = useMemo(
    () => paginatedItems.map((item) => `${item.map_type}::${item.target_id}`),
    [paginatedItems],
  );

  const allPageSelected =
    paginatedKeys.length > 0 && paginatedKeys.every((key) => selectedKeySet.has(key));

  const toggleSelected = (mapType: string, targetId: string) => {
    const key = `${mapType}::${targetId}`;
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const toggleSelectPage = () => {
    setSelectedKeys((current) => {
      if (allPageSelected) {
        return current.filter((key) => !paginatedKeys.includes(key));
      }

      return Array.from(new Set([...current, ...paginatedKeys]));
    });
  };

  const handleCopySelectedAsJson = async () => {
    if (selectedItems.length === 0) {
      setError("Выберите хотя бы один объект в таблице.");
      return;
    }

    setError(null);
    setSuccess(null);
    setCopiedJson(false);

    try {
      const payload = selectedItems.map((item) => ({
        map_type: item.map_type,
        target_id: item.target_id,
        content: "",
      }));
      const text = JSON.stringify(payload, null, 2);

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "true");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          textarea.style.pointerEvents = "none";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const copied = document.execCommand("copy");
          document.body.removeChild(textarea);

          if (!copied) {
            throw new Error("Не удалось скопировать JSON в буфер обмена.");
          }
        }
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.pointerEvents = "none";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error("Не удалось скопировать JSON в буфер обмена.");
        }
      }

      setSuccess(`Скопировано ${payload.length} объектов в JSON с пустым шаблоном content.`);
      setCopiedJson(true);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    }
  };

  useEffect(() => {
    if (!copiedJson) {
      return;
    }

    if (copiedJsonTimerRef.current !== null) {
      window.clearTimeout(copiedJsonTimerRef.current);
    }

    copiedJsonTimerRef.current = window.setTimeout(() => {
      setCopiedJson(false);
      copiedJsonTimerRef.current = null;
    }, 1800);

    return () => {
      if (copiedJsonTimerRef.current !== null) {
        window.clearTimeout(copiedJsonTimerRef.current);
        copiedJsonTimerRef.current = null;
      }
    };
  }, [copiedJson]);

  const handleBulkJsonSave = async () => {
    if (!bulkJsonInput.trim()) {
      setError("Вставьте JSON для массового сохранения.");
      return;
    }

    setSavingBulkJson(true);
    setError(null);
    setSuccess(null);

    try {
      const parsed = JSON.parse(bulkJsonInput) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("JSON должен быть массивом объектов.");
      }

      const items = parsed.map((item) => {
        const record = item as Partial<BulkMapStoryJsonItem>;
        return {
          map_type: typeof record.map_type === "string" ? record.map_type.trim() : "",
          target_id: typeof record.target_id === "string" ? record.target_id.trim() : "",
          content: typeof record.content === "string" ? record.content : "",
        };
      });

      if (items.some((item) => !item.map_type || !item.target_id || !item.content.trim())) {
        throw new Error("Каждый объект должен содержать map_type, target_id и непустой content.");
      }

      const data = await fetchJson<{
        saved: number;
        failed: number;
        failures: Array<{ mapType: string; targetId: string; error: string }>;
      }>("/api/admin/map-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      });

      await loadItems();
      setSelectedKeys(data.failures.map((item) => `${item.mapType}::${item.targetId}`));

      setSuccess(
        data.failed > 0
          ? `Массовое сохранение завершено: успешно ${data.saved}, с ошибками ${data.failed}.`
          : `Массовое сохранение завершено: сохранено ${data.saved} записей.`,
      );

      if (data.failed > 0) {
        setError(
          data.failures
            .slice(0, 3)
            .map((item) => `${item.mapType}/${item.targetId}: ${item.error}`)
            .join(" | "),
        );
      } else {
        setBulkJsonInput("");
      }
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : String(bulkError));
    } finally {
      setSavingBulkJson(false);
    }
  };

  const handleGenerateBatch = async () => {
    if (selectedItems.length === 0) {
      setError("Выберите хотя бы один объект в таблице.");
      return;
    }

    setGeneratingBatch(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchJson<{
        total: number;
        generated: number;
        failed: number;
        failures: Array<{ mapType: string; targetId: string; error: string }>;
      }>("/api/admin/map-story/generate-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targets: selectedItems.map((item) => ({
            mapType: item.map_type,
            targetId: item.target_id,
          })),
        }),
      });

      await loadItems();
      setSelectedKeys(data.failures.map((item) => `${item.mapType}::${item.targetId}`));
      setSuccess(
        data.failed > 0
          ? `Автогенерация завершена: успешно ${data.generated}, с ошибками ${data.failed}. Неуспешные строки оставлены выделенными.`
          : `Автогенерация завершена: создано ${data.generated} story.`,
      );
      if (data.failed > 0) {
        setError(
          data.failures
            .slice(0, 3)
            .map((item) => `${item.mapType}/${item.targetId}: ${item.error}`)
            .join(" | "),
        );
      }
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : String(batchError));
    } finally {
      setGeneratingBatch(false);
    }
  };

  const handleParseSelectedStoriesToSlides = async () => {
    if (selectedItemsWithStoryWithoutSlides.length === 0) {
      setError("Среди выделенных объектов нет story без slides.");
      return;
    }

    setParsingSelectedSlides(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchJson<{
        parsed: number;
        failed: number;
        failures: Array<{ mapType: string; targetId: string; error: string }>;
      }>("/api/admin/map-story/parse-slides-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targets: selectedItemsWithStoryWithoutSlides.map((item) => ({
            mapType: item.map_type,
            targetId: item.target_id,
          })),
        }),
      });

      await loadItems();
      setSelectedKeys(data.failures.map((item) => `${item.mapType}::${item.targetId}`));
      setSuccess(
        data.failed > 0
          ? `Парсинг story в slides завершён: успешно ${data.parsed}, с ошибками ${data.failed}.`
          : `Парсинг story в slides завершён: обработано ${data.parsed}.`,
      );

      if (data.failed > 0) {
        setError(
          data.failures
            .slice(0, 3)
            .map((item) => `${item.mapType}/${item.targetId}: ${item.error}`)
            .join(" | "),
        );
      }
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    } finally {
      setParsingSelectedSlides(false);
    }
  };

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

        <div className="map-targets-batch-bar">
          <div className="map-targets-batch-bar__meta">
            <strong>Выбрано:</strong> {selectedItems.length}
            {batchEstimate ? (
              <>
                <span>Токены: {batchEstimate.inputTokens + batchEstimate.outputTokens}</span>
                <span>USD: ${batchEstimate.usd.toFixed(4)}</span>
                <span>ILS: ₪{batchEstimate.ils.toFixed(3)}</span>
                <span>Модель: {batchEstimate.model}</span>
              </>
            ) : (
              <span>Выделите строки для оценки и автогенерации.</span>
            )}
            <span>Story без slides: {selectedItemsWithStoryWithoutSlides.length}</span>
          </div>
          <div className="map-targets-batch-bar__actions">
            <button
              type="button"
              className="map-targets-pagination__button"
              onClick={() => void handleCopySelectedAsJson()}
              disabled={selectedItems.length === 0 || generatingBatch || parsingSelectedSlides || savingBulkJson}
            >
              {copiedJson ? "Скопировано" : "Копировать JSON"}
            </button>
            <button
              type="button"
              className="map-targets-pagination__button"
              onClick={() => setSelectedKeys([])}
              disabled={selectedItems.length === 0 || generatingBatch || parsingSelectedSlides || savingBulkJson}
            >
              Снять выделение
            </button>
            <button
              type="button"
              className="map-targets-pagination__button"
              onClick={() => void handleParseSelectedStoriesToSlides()}
              disabled={
                selectedItemsWithStoryWithoutSlides.length === 0 ||
                generatingBatch ||
                parsingSelectedSlides ||
                savingBulkJson
              }
            >
              {parsingSelectedSlides ? "Парсим story..." : "Распарсить story в slides"}
            </button>
            <button
              type="button"
              className="map-targets-generate"
              onClick={() => void handleGenerateBatch()}
              disabled={selectedItems.length === 0 || generatingBatch || parsingSelectedSlides || savingBulkJson}
            >
              {generatingBatch ? "Генерируем..." : "Сгенерировать автоматически"}
            </button>
          </div>
        </div>

        <div className="map-targets-section map-targets-section--bulk-json">
          <div className="map-targets-section__header">
            <h2 className="map-targets-section__title">Массовая загрузка content через JSON</h2>
          </div>
          <p className="map-targets-bulk-json__hint">
            Вставь JSON-массив объектов. Для каждого элемента будет сохранён `content` в `map_stories`
            строго по паре `map_type + target_id`.
          </p>
          <textarea
            className="map-targets-bulk-json__textarea"
            value={bulkJsonInput}
            onChange={(event) => setBulkJsonInput(event.target.value)}
            placeholder='[{"map_type":"country","target_id":"brazil","content":"..."}]'
            spellCheck={false}
          />
          <div className="map-targets-bulk-json__actions">
            <button
              type="button"
              className="map-targets-pagination__button"
              onClick={() => setBulkJsonInput("")}
              disabled={!bulkJsonInput || savingBulkJson}
            >
              Очистить
            </button>
            <button
              type="button"
              className="map-targets-generate"
              onClick={() => void handleBulkJsonSave()}
              disabled={!bulkJsonInput.trim() || generatingBatch || parsingSelectedSlides || savingBulkJson}
            >
              {savingBulkJson ? "Сохраняем JSON..." : "Сохранить JSON в map_stories"}
            </button>
          </div>
          <div className="map-targets-bulk-json__example-label">Пример JSON, который принимается:</div>
          <pre className="map-targets-bulk-json__example">{`[
  {
    "map_type": "country",
    "target_id": "brazil",
    "content": "Brazil is the largest country in South America. It is famous for the Amazon rainforest and long Atlantic beaches."
  },
  {
    "map_type": "river",
    "target_id": "nile",
    "content": "The Nile is one of the longest rivers in the world. It flows through northeastern Africa and has been important for people for thousands of years."
  }
]`}</pre>
        </div>

        {error ? <p className="map-targets-error">{error}</p> : null}
        {success ? <p className="map-targets-success">{success}</p> : null}
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
                  onClick={toggleSelectPage}
                  disabled={paginatedKeys.length === 0 || generatingBatch || parsingSelectedSlides}
                >
                  {allPageSelected ? "Снять страницу" : "Выделить страницу"}
                </button>
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
                  <th>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label="Выбрать текущую страницу"
                    />
                  </th>
                  <th>map_type</th>
                  <th>target_id</th>
                  <th>Статус</th>
                  <th>Маркер</th>
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
                  const slidesCountTone = getSlidesCountTone(item.slides_count);

                  return (
                    <tr key={`${item.map_type}:${item.target_id}`}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedKeySet.has(`${item.map_type}::${item.target_id}`)}
                          onChange={() => toggleSelected(item.map_type, item.target_id)}
                          aria-label={`Выбрать ${item.map_type} ${item.target_id}`}
                        />
                      </td>
                      <td>{item.map_type}</td>
                      <td className="map-targets-table__target">{item.target_id}</td>
                      <td>
                        <span className={`map-targets-badge map-targets-badge--${status.tone}`}>
                          <span>{status.icon}</span>
                          <span>{status.label}</span>
                        </span>
                      </td>
                      <td>
                        {item.auto_generated && !item.is_approved ? (
                          <span className="map-targets-badge map-targets-badge--warning">
                            <span>🤖</span>
                            <span>Автоматическая генерация</span>
                          </span>
                        ) : item.auto_generated ? (
                          <span className="map-targets-badge map-targets-badge--success">
                            <span>✅</span>
                            <span>Автогенерация одобрена</span>
                          </span>
                        ) : (
                          <span className="map-targets-badge map-targets-badge--neutral">
                            <span>—</span>
                            <span>Без маркера</span>
                          </span>
                        )}
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
                      <td>
                        <span
                          className={`map-targets-slides-count map-targets-slides-count--${slidesCountTone}`}
                        >
                          {item.slides_count}
                        </span>
                      </td>
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

        .map-targets-batch-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid #edf1f5;
          background: #f8fafc;
        }

        .map-targets-batch-bar__meta {
          display: flex;
          gap: 14px;
          align-items: center;
          flex-wrap: wrap;
          color: #344054;
          font-size: 14px;
        }

        .map-targets-batch-bar__actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .map-targets-section--bulk-json {
          display: grid;
          gap: 12px;
        }

        .map-targets-bulk-json__hint {
          margin: 0;
          color: #5f6368;
          line-height: 1.5;
        }

        .map-targets-bulk-json__textarea {
          width: 100%;
          min-height: 220px;
          resize: vertical;
          margin: 0;
          padding: 14px 16px;
          border: 1px solid #cfd8e3;
          border-radius: 12px;
          background: #fbfcfe;
          font: inherit;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          line-height: 1.5;
        }

        .map-targets-bulk-json__actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .map-targets-bulk-json__example-label {
          font-size: 13px;
          font-weight: 600;
          color: #475467;
        }

        .map-targets-bulk-json__example {
          margin: 0;
          padding: 14px 16px;
          border-radius: 12px;
          background: #101828;
          color: #f8fafc;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
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
        .map-targets-success,
        .map-targets-state {
          margin: 0;
          padding: 20px;
        }

        .map-targets-error {
          color: #b42318;
          border-bottom: 1px solid #edf1f5;
          background: #fff4f2;
        }

        .map-targets-success {
          color: #027a48;
          border-bottom: 1px solid #edf1f5;
          background: #ecfdf3;
        }

        .map-targets-state {
          color: #475467;
        }

        .map-targets-table-wrap {
          overflow: auto;
        }

        .map-targets-generate {
          width: auto;
          margin: 0;
          padding: 11px 16px;
          border: 1px solid #1f4b99;
          border-radius: 10px;
          background: #1f4b99;
          color: #ffffff;
          cursor: pointer;
        }

        .map-targets-generate:hover:not(:disabled) {
          background: #173b78;
          border-color: #173b78;
        }

        .map-targets-generate:active:not(:disabled) {
          transform: translateY(1px);
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

        .map-targets-pagination__button:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #b8c1cc;
        }

        .map-targets-pagination__button:active:not(:disabled) {
          background: #eef2f6;
          transform: translateY(1px);
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

        .map-targets-badge--neutral {
          background: #f2f4f7;
          color: #475467;
        }

        .map-targets-slides-count {
          display: inline-flex;
          min-width: 44px;
          justify-content: center;
          padding: 6px 10px;
          border-radius: 999px;
          font-weight: 700;
          background: #f2f4f7;
          color: #344054;
        }

        .map-targets-slides-count--warning {
          background: #fffaeb;
          color: #b54708;
        }

        .map-targets-slides-count--danger {
          background: #fff1f3;
          color: #b42318;
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

          .map-targets-batch-bar {
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

          .map-targets-bulk-json__actions {
            justify-content: stretch;
            flex-direction: column;
          }

          .map-targets-field--search {
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}
