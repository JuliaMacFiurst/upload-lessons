import type { ProgressResponse } from "./types";

type Props = {
  progress: ProgressResponse | null;
};

export function TranslationProgress({ progress }: Props) {
  if (!progress) {
    return null;
  }

  const denominator = Math.max(progress.totalItems, 1);
  const percent = Math.min(100, Math.round((progress.processedItems / denominator) * 100));

  return (
    <section className="translations-panel">
      <h2 className="translations-title">Translation Progress</h2>
      <div className="translations-progress-meta">
        <span>Current item: {progress.currentItem ?? "Idle"}</span>
        <span>
          Tokens: {progress.tokensProcessed.toLocaleString()} /{" "}
          {progress.tokenBudget.toLocaleString()}
        </span>
      </div>
      <div className="translations-progress">
        <div className="translations-progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <div className="translations-grid translations-grid--4">
        <div className="translations-pill">Processed: {progress.processedItems}</div>
        <div className="translations-pill">Translated: {progress.translatedItems}</div>
        <div className="translations-pill">Failed: {progress.failedItems}</div>
        <div className="translations-pill">Has more: {progress.hasMore ? "Yes" : "No"}</div>
      </div>
    </section>
  );
}

