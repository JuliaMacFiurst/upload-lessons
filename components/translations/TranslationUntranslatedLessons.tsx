import { useState } from "react";
import type { TranslationScope, UntranslatedLesson } from "./types";

type Props = {
  lang: string;
  scope: TranslationScope;
  onMessage: (message: string, type: "success" | "error") => void;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }
  return data;
}

function itemKey(item: Pick<UntranslatedLesson, "id" | "content_type">): string {
  return `${item.content_type}:${item.id}`;
}

export function TranslationUntranslatedLessons({ lang, scope, onMessage }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UntranslatedLesson[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewJson, setPreviewJson] = useState<string | null>(null);

  const loadLessons = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ items: UntranslatedLesson[] }>(
        `/api/admin/translation/untranslated?lang=${encodeURIComponent(lang)}&scope=${encodeURIComponent(scope === "all" ? "lessons" : scope)}`,
      );
      console.debug("[translations] untranslated lessons response", data);
      setItems(data.items ?? []);
      setSelected({});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      void loadLessons();
    }
  };

  const setBusy = (id: string, value: boolean) => {
    setBusyIds((prev) => ({ ...prev, [id]: value }));
  };

  const removeItem = (contentType: UntranslatedLesson["content_type"], id: string) => {
    setItems((prev) => prev.filter((item) => !(item.id === id && item.content_type === contentType)));
    setSelected((prev) => {
      const copy = { ...prev };
      delete copy[`${contentType}:${id}`];
      return copy;
    });
  };

  const translateOne = async (
    item: Pick<UntranslatedLesson, "id" | "content_type">,
    preview: boolean,
  ) => {
    const key = itemKey(item);
    setBusy(key, true);
    setPreviewJson(null);
    try {
      const data = await fetchJson<{
        ok?: boolean;
        alreadyTranslated?: boolean;
        upToDate?: boolean;
        preview?: boolean;
        translation?: unknown;
      }>("/api/admin/translation/translate-one", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content_type: item.content_type,
          content_id: item.id,
          lang,
          preview,
        }),
      });

      if (data.alreadyTranslated) {
        onMessage("Item already translated", "success");
        removeItem(item.content_type, item.id);
        return;
      }
      if (data.upToDate) {
        onMessage("Item translation is up to date", "success");
        removeItem(item.content_type, item.id);
        return;
      }

      if (data.preview) {
        setPreviewJson(JSON.stringify(data.translation, null, 2));
        onMessage("Preview translation ready", "success");
        return;
      }

      removeItem(item.content_type, item.id);
      onMessage("Item translated successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage(message, "error");
    } finally {
      setBusy(key, false);
    }
  };

  const translateSelected = async () => {
    const selectedItems = items.filter((item) => !!selected[itemKey(item)]);
    if (selectedItems.length === 0) {
      onMessage("Select at least one item", "error");
      return;
    }

    for (const item of selectedItems) {
      // Sequential requests keep API usage predictable.
      await translateOne(item, false);
    }
  };

  const totalSelectedTokens = items
    .filter((item) => !!selected[itemKey(item)])
    .reduce((sum, item) => sum + (item.source_tokens ?? 0), 0);

  return (
    <section className="translations-panel">
      <button className="translations-collapse" onClick={toggle}>
        {expanded ? "▾" : "▸"} Просмотреть непереведенные уроки
      </button>

      {expanded && (
        <div className="translations-untranslated">
          {loading && <p className="translations-hint">Loading...</p>}
          {!loading && items.length === 0 && (
            <p className="translations-hint">No untranslated items.</p>
          )}
          {!loading && items.length > 0 && (
            <div className="translations-list">
              <div className="translations-list__header">
                <span>Select</span>
                <span>Lesson title</span>
                <span>Type</span>
                <span>Source tokens</span>
                <span>Actions</span>
              </div>
              {items.map((item) => {
                const key = itemKey(item);
                return (
                <div className="translations-list__row" key={key}>
                  <span>
                    <input
                      type="checkbox"
                      checked={!!selected[key]}
                      onChange={(e) => {
                        setSelected((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }));
                      }}
                    />
                  </span>
                  <span>{item.title ?? "Untitled"}</span>
                  <span>{item.content_type}</span>
                  <span>{item.source_tokens ?? 0}</span>
                  <div className="translations-list__actions">
                    <button
                      className="translations-button translations-button--secondary"
                      disabled={!!busyIds[key]}
                      onClick={() => {
                        void translateOne(item, true);
                      }}
                    >
                      Preview translation
                    </button>
                    <button
                      className="translations-button translations-button--primary"
                      disabled={!!busyIds[key]}
                      onClick={() => {
                        void translateOne(item, false);
                      }}
                    >
                      Перевести
                    </button>
                  </div>
                </div>
              )})}
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="translations-selected-bar">
              <span>Total selected tokens: {totalSelectedTokens}</span>
              <button
                className="translations-button translations-button--primary"
                onClick={() => {
                  void translateSelected();
                }}
              >
                Translate selected
              </button>
            </div>
          )}
          {previewJson && (
            <pre className="translations-preview">{previewJson}</pre>
          )}
        </div>
      )}
    </section>
  );
}
