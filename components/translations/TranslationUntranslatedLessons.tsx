import { useEffect, useMemo, useState } from "react";
import { USD_TO_ILS } from "../../lib/ai/pricing";
import {
  TranslationActivityOverlay,
  type OverlayLog,
} from "./TranslationActivityOverlay";
import { TranslationConfirmModal } from "./TranslationConfirmModal";
import type { TranslationScope, UntranslatedLesson } from "./types";

type Props = {
  lang: string;
  scope: TranslationScope;
  onMessage: (message: string, type: "success" | "error") => void;
  onTranslationComplete?: () => Promise<void> | void;
};

type ConfirmState = {
  items: UntranslatedLesson[];
};

type ManualProgressState = {
  running: boolean;
  processed: number;
  total: number;
  translated: number;
  failed: number;
  currentItem: string | null;
  logs: OverlayLog[];
  finished: boolean;
};

const GEMINI_INPUT_COST_PER_1M = 0.1;
const GEMINI_OUTPUT_COST_PER_1M = 0.4;
const OUTPUT_TOKEN_FACTOR = 1.05;

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

function estimateTranslationCostUsd(tokens: number): number {
  const inputCost = (tokens / 1_000_000) * GEMINI_INPUT_COST_PER_1M;
  const outputCost =
    ((tokens * OUTPUT_TOKEN_FACTOR) / 1_000_000) * GEMINI_OUTPUT_COST_PER_1M;
  return inputCost + outputCost;
}

function displayItemName(item: UntranslatedLesson): string {
  return item.title?.trim() || `${item.content_type}:${item.id}`;
}

function buildFinishedProgress(): ManualProgressState {
  return {
    running: false,
    processed: 0,
    total: 0,
    translated: 0,
    failed: 0,
    currentItem: null,
    logs: [],
    finished: false,
  };
}

export function TranslationUntranslatedLessons({
  lang,
  scope,
  onMessage,
  onTranslationComplete,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<UntranslatedLesson[]>([]);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [manualProgress, setManualProgress] = useState<ManualProgressState>(buildFinishedProgress);

  useEffect(() => {
    setExpanded(false);
    setItems([]);
    setSelected({});
    setPreviewJson(null);
    setConfirmState(null);
  }, [lang, scope]);

  const loadLessons = async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ items: UntranslatedLesson[] }>(
        `/api/admin/translation/untranslated?lang=${encodeURIComponent(lang)}&scope=${encodeURIComponent(scope)}`,
      );
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

  const appendLog = (message: string, level: OverlayLog["level"]) => {
    setManualProgress((prev) => ({
      ...prev,
      logs: [...prev.logs, { message, level }],
    }));
  };

  const removeItem = (contentType: UntranslatedLesson["content_type"], id: string) => {
    setItems((prev) => prev.filter((item) => !(item.id === id && item.content_type === contentType)));
    setSelected((prev) => {
      const copy = { ...prev };
      delete copy[`${contentType}:${id}`];
      return copy;
    });
  };

  const previewOne = async (item: Pick<UntranslatedLesson, "id" | "content_type">) => {
    const key = itemKey(item);
    setBusy(key, true);
    setPreviewJson(null);
    try {
      const data = await fetchJson<{
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
          preview: true,
        }),
      });

      if (data.preview) {
        setPreviewJson(JSON.stringify(data.translation, null, 2));
        onMessage("Preview translation ready", "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onMessage(message, "error");
    } finally {
      setBusy(key, false);
    }
  };

  const runManualTranslation = async (itemsToTranslate: UntranslatedLesson[]) => {
    setConfirmLoading(true);
    setConfirmState(null);
    setPreviewJson(null);
    setManualProgress({
      running: true,
      processed: 0,
      total: itemsToTranslate.length,
      translated: 0,
      failed: 0,
      currentItem: null,
      logs: [],
      finished: false,
    });

    appendLog(
      `Translation started for ${itemsToTranslate.length} item${itemsToTranslate.length === 1 ? "" : "s"}.`,
      "info",
    );

    try {
      let translatedCount = 0;
      let failedCount = 0;

      for (const item of itemsToTranslate) {
        const key = itemKey(item);
        const label = displayItemName(item);
        setBusy(key, true);
        setManualProgress((prev) => ({
          ...prev,
          currentItem: label,
        }));
        appendLog(`Preparing source payload for ${label}.`, "info");
        appendLog(`Sending ${label} to Gemini for translation.`, "info");

        try {
          const data = await fetchJson<{
            ok?: boolean;
            alreadyTranslated?: boolean;
            upToDate?: boolean;
          }>("/api/admin/translation/translate-one", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content_type: item.content_type,
              content_id: item.id,
              lang,
              preview: false,
            }),
          });

          if (data.alreadyTranslated || data.upToDate) {
            appendLog(`Gemini request finished for ${label}. Translation was already up to date.`, "success");
          } else {
            appendLog(`Gemini request finished for ${label}. Translation saved successfully.`, "success");
          }

          removeItem(item.content_type, item.id);
          translatedCount += 1;
          setManualProgress((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            translated: prev.translated + 1,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          appendLog(`Failed to translate ${label}: ${message}`, "error");
          failedCount += 1;
          setManualProgress((prev) => ({
            ...prev,
            processed: prev.processed + 1,
            failed: prev.failed + 1,
          }));
        } finally {
          setBusy(key, false);
        }
      }

      setManualProgress((prev) => ({
        ...prev,
        running: false,
        currentItem: null,
        finished: true,
      }));

      appendLog(
        `Translation finished. Success: ${translatedCount}. Failed: ${failedCount}.`,
        failedCount > 0 ? "error" : "success",
      );

      await onTranslationComplete?.();

      if (failedCount > 0) {
        onMessage("Translation finished with errors. Review the overlay logs.", "error");
      } else {
        onMessage("Translation finished successfully.", "success");
      }
    } finally {
      setConfirmLoading(false);
    }
  };

  const translateSelected = () => {
    const selectedItems = items.filter((item) => !!selected[itemKey(item)]);
    if (selectedItems.length === 0) {
      onMessage("Select at least one item", "error");
      return;
    }
    setConfirmState({ items: selectedItems });
  };

  const openSingleTranslateConfirm = (item: UntranslatedLesson) => {
    setConfirmState({ items: [item] });
  };

  const totalSelectedTokens = items
    .filter((item) => !!selected[itemKey(item)])
    .reduce((sum, item) => sum + (item.source_tokens ?? 0), 0);

  const confirmTokens = useMemo(
    () => (confirmState?.items ?? []).reduce((sum, item) => sum + (item.source_tokens ?? 0), 0),
    [confirmState],
  );
  const confirmCostUsd = estimateTranslationCostUsd(confirmTokens);
  const confirmCostIls = confirmCostUsd * USD_TO_ILS;

  return (
    <section className="translations-panel">
      <button className="translations-collapse" onClick={toggle}>
        {expanded ? "▾" : "▸"} Просмотреть непереведенные объекты
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
                <span>Title</span>
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
                        disabled={manualProgress.running}
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
                        disabled={!!busyIds[key] || manualProgress.running}
                        onClick={() => {
                          void previewOne(item);
                        }}
                      >
                        Preview translation
                      </button>
                      <button
                        className="translations-button translations-button--primary"
                        disabled={!!busyIds[key] || manualProgress.running}
                        onClick={() => {
                          openSingleTranslateConfirm(item);
                        }}
                      >
                        Перевести
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="translations-selected-bar">
              <span>Total selected tokens: {totalSelectedTokens}</span>
              <button
                className="translations-button translations-button--primary"
                disabled={manualProgress.running}
                onClick={translateSelected}
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

      <TranslationConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.items.length === 1 ? "Confirm Single Translation" : "Confirm Selected Translation"}
        description={
          confirmState?.items.length === 1
            ? "One selected object will be sent to Gemini for translation."
            : "Only the checked objects will be sent to Gemini for translation."
        }
        items={confirmState?.items.length ?? 0}
        tokens={confirmTokens}
        cost={confirmCostUsd}
        costIls={confirmCostIls}
        lang={lang}
        loading={confirmLoading}
        confirmLabel={confirmState?.items.length === 1 ? "Translate item" : "Translate selected"}
        onCancel={() => {
          if (!confirmLoading) {
            setConfirmState(null);
          }
        }}
        onConfirm={() => {
          if (confirmState) {
            void runManualTranslation(confirmState.items);
          }
        }}
      />

      <TranslationActivityOverlay
        open={manualProgress.running || manualProgress.finished}
        title="Selected Items Translation"
        running={manualProgress.running}
        currentItem={manualProgress.currentItem}
        processed={manualProgress.processed}
        total={manualProgress.total}
        translated={manualProgress.translated}
        failed={manualProgress.failed}
        logs={manualProgress.logs}
        closeDisabled={manualProgress.running}
        onClose={
          manualProgress.running
            ? undefined
            : () => {
                void onTranslationComplete?.();
                setManualProgress(buildFinishedProgress());
              }
        }
      />
    </section>
  );
}
