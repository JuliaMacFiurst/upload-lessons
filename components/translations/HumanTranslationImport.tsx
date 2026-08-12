import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HumanTranslationImportPreview,
  HumanTranslationImportPreviewItem,
} from "../../lib/server/human-translation-import";

type PreviewResponse = { preview: HumanTranslationImportPreview };
type SaveResponse = PreviewResponse & {
  savedObjects: number;
  savedRows: number;
  remainingBatch: unknown | null;
};

function itemLabel(item: HumanTranslationImportPreviewItem): string {
  if (item.content_type && item.content_id) return `${item.content_type}:${item.content_id}`;
  return `Item ${item.index + 1}`;
}

function statusLabel(item: HumanTranslationImportPreviewItem): string {
  if (item.status === "ready") return "✓ Ready";
  if (item.status === "outdated_source") return "⚠ Source changed";
  if (item.status === "not_found") return "✕ Not found";
  return "✕ Invalid";
}

export function HumanTranslationImport() {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<HumanTranslationImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef(0);

  const validate = useCallback(async (value: string) => {
    if (!value.trim()) {
      setPreview(null);
      setError(null);
      return;
    }
    const currentRequest = ++requestId.current;
    setValidating(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/translation/human-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ json: value }),
      });
      const data = await response.json() as PreviewResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Validation failed");
      if (currentRequest === requestId.current) setPreview(data.preview);
    } catch (validationError) {
      if (currentRequest === requestId.current) {
        setPreview(null);
        setError(validationError instanceof Error ? validationError.message : String(validationError));
      }
    } finally {
      if (currentRequest === requestId.current) setValidating(false);
    }
  }, []);

  const saveReady = async () => {
    if (!preview?.can_save || saving) return;
    const confirmOverwrite = preview.overwrite_objects > 0;
    if (confirmOverwrite && !window.confirm(
      `${preview.overwrite_objects} objects already have translations in the database.\n\nSaving will overwrite the existing EN and/or HE translations. Continue?`,
    )) return;
    const currentRequest = ++requestId.current;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/translation/human-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "save", json, confirmOverwrite }),
      });
      const data = await response.json() as Partial<SaveResponse> & { error?: string };
      if (!response.ok) {
        if (data.preview && currentRequest === requestId.current) setPreview(data.preview);
        throw new Error(data.error ?? "Save failed");
      }
      if (currentRequest !== requestId.current) return;
      const savedObjects = data.savedObjects ?? 0;
      setNotice(`Saved ${savedObjects} objects (${data.savedRows ?? savedObjects * 2} language rows).`);
      window.dispatchEvent(new CustomEvent("human-translations-saved"));
      if (data.remainingBatch) {
        setJson(JSON.stringify(data.remainingBatch, null, 2));
      } else {
        setJson("");
        setPreview(null);
      }
    } catch (saveError) {
      if (currentRequest === requestId.current) {
        setError(saveError instanceof Error ? saveError.message : String(saveError));
      }
    } finally {
      if (currentRequest === requestId.current) setSaving(false);
    }
  };

  useEffect(() => {
    if (!json.trim()) {
      requestId.current += 1;
      setPreview(null);
      setError(null);
      setValidating(false);
      return;
    }
    const timeout = window.setTimeout(() => void validate(json), 600);
    return () => window.clearTimeout(timeout);
  }, [json, validate]);

  return (
    <section className="translations-panel human-translation-import">
      <h2 className="translations-title">Translation Import</h2>
      <p className="translations-hint">
        Paste the completed EN + HE batch. Validation runs automatically; only objects marked ready can be saved.
      </p>
      <textarea
        className="human-translation-import__textarea"
        value={json}
        onChange={(event) => { setJson(event.target.value); setNotice(null); }}
        placeholder="Paste translated JSON"
        spellCheck={false}
        disabled={saving}
      />
      <div className="human-translation-import__actions">
        <button
          className="translations-button translations-button--secondary"
          type="button"
          onClick={() => void validate(json)}
          disabled={!json.trim() || validating}
        >
          {validating ? "Validating..." : "Validate now"}
        </button>
        <button
          className="translations-button translations-button--secondary"
          type="button"
          onClick={() => { setJson(""); setNotice(null); }}
          disabled={(!json && !preview) || saving}
        >
          Clear
        </button>
      </div>

      {error && <div className="translations-alert translations-alert--error">{error}</div>}
      {notice && <div className="translations-alert translations-alert--success">{notice}</div>}
      {preview && preview.errors.length > 0 && (
        <div className="translations-alert translations-alert--error">
          {preview.errors.map((issue, index) => (
            <div key={`${issue.path ?? "envelope"}-${index}`}>
              {issue.path ? `${issue.path}: ` : ""}{issue.message}
            </div>
          ))}
        </div>
      )}

      {preview && preview.errors.length === 0 && (
        <div className="human-translation-import__preview">
          <div className="human-translation-import__summary">
            <strong>{preview.detected} objects detected</strong>
            <span className="human-translation-import__summary-ready">✓ {preview.ready} ready to save</span>
            {preview.outdated_source > 0 && <span>⚠ {preview.outdated_source} outdated source</span>}
            {preview.invalid > 0 && <span>✕ {preview.invalid} invalid</span>}
            {preview.not_found > 0 && <span>✕ {preview.not_found} not found</span>}
            {preview.overwrite_objects > 0 && <span>⚠ {preview.overwrite_objects} will overwrite stored translations</span>}
          </div>
          <div className="human-translation-import__results">
            {preview.items.map((item) => (
              <div className={`human-translation-import__result human-translation-import__result--${item.status}`} key={`${item.index}-${itemLabel(item)}`}>
                <div>
                  <strong>{itemLabel(item)}</strong>
                  <span>{statusLabel(item)}</span>
                </div>
                {item.requires_overwrite_confirmation && (
                  <p className="human-translation-import__overwrite-warning">
                    Existing {item.existing_languages.map((language) => language.toUpperCase()).join(" + ")} will be overwritten after confirmation.
                  </p>
                )}
                {item.errors.map((issue, index) => (
                  <p key={`${issue.kind}-${issue.language ?? "item"}-${index}`}>
                    {issue.language ? `${issue.language.toUpperCase()}: ` : ""}{issue.message}
                    {issue.path ? ` (${issue.path})` : ""}
                  </p>
                ))}
              </div>
            ))}
          </div>
          {preview.ready > 0 && (
            <div className="human-translation-import__save-bar">
              <p className="translations-hint">
                Invalid objects will remain in the textarea after the ready objects are saved.
              </p>
              <button
                className="translations-button translations-button--primary"
                type="button"
                onClick={() => void saveReady()}
                disabled={saving || validating}
              >
                {saving ? "Revalidating and saving..." : `Save ${preview.ready} ready objects (EN + HE)`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
