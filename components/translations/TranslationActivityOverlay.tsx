import { useEffect, useRef } from "react";

type OverlayLog = {
  message: string;
  level: "info" | "success" | "error";
};

type Props = {
  open: boolean;
  title: string;
  running: boolean;
  currentItem: string | null;
  processed: number;
  total: number;
  translated?: number;
  failed?: number;
  logs: OverlayLog[];
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  onClose?: () => void;
};

export type { OverlayLog };

export function TranslationActivityOverlay(props: Props) {
  const logsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = logsRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [props.logs]);

  if (!props.open) {
    return null;
  }

  const denominator = Math.max(props.total, 1);
  const percent = props.total > 0 ? Math.min(100, Math.round((props.processed / denominator) * 100)) : 0;
  const hasErrors = (props.failed ?? 0) > 0;
  const statusLabel = props.running ? "Running" : hasErrors ? "Finished with errors" : "Completed";

  return (
    <div className="translations-activity-overlay" role="presentation">
      <div className="translations-activity-card" role="dialog" aria-modal="true">
        <div className="translations-activity-head">
          <div>
            <div className="translations-activity-title-row">
              <h3 className="translations-activity-title">{props.title}</h3>
              {!props.running && (
                <span
                  className={`translations-activity-badge ${
                    hasErrors
                      ? "translations-activity-badge--error"
                      : "translations-activity-badge--completed"
                  }`}
                >
                  {hasErrors ? "Completed with Errors" : "Completed"}
                </span>
              )}
            </div>
            <p className="translations-activity-subtitle">
              {props.running
                ? "Translation request is in progress."
                : "Translation request has finished."}
            </p>
          </div>
          {props.onClose && (
            <button
              className="translations-button translations-button--secondary"
              onClick={props.onClose}
              disabled={props.closeDisabled}
            >
              {props.closeLabel ?? "Close"}
            </button>
          )}
        </div>

        <div className="translations-progress-meta">
          <span>Current item: {props.currentItem ?? "Waiting..."}</span>
          <span>{props.processed} / {props.total}</span>
        </div>
        <div className="translations-progress">
          <div className="translations-progress__bar" style={{ width: `${percent}%` }} />
        </div>

        <div className="translations-grid translations-grid--4">
          <div className="translations-pill">Processed: {props.processed}</div>
          <div className="translations-pill">Translated: {props.translated ?? 0}</div>
          <div className="translations-pill">Failed: {props.failed ?? 0}</div>
          <div className="translations-pill">Status: {statusLabel}</div>
        </div>

        {!props.running && (
          <div
            className={`translations-activity-summary ${
              hasErrors
                ? "translations-activity-summary--error"
                : "translations-activity-summary--success"
            }`}
          >
            {hasErrors
              ? `Translation finished with errors. Translated: ${props.translated ?? 0}. Failed: ${props.failed ?? 0}.`
              : `Translation completed successfully. ${props.translated ?? props.processed} item${(props.translated ?? props.processed) === 1 ? "" : "s"} processed.`}
          </div>
        )}

        <div className="translations-activity-logs" ref={logsRef}>
          {props.logs.length === 0 && <div className="translations-empty">No logs yet.</div>}
          {props.logs.map((line, index) => (
            <div
              className={`translations-activity-log translations-activity-log--${line.level}`}
              key={`${line.message}-${index}`}
            >
              {line.message}
            </div>
          ))}
        </div>

        {props.onAction && (
          <div className="translations-activity-actions">
            <button
              className="translations-button translations-button--primary"
              onClick={props.onAction}
              disabled={props.actionDisabled}
            >
              {props.actionLabel ?? "Action"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
