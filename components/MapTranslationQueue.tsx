import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MapTranslationQueueRow,
  MapTranslationSummary,
  MapTranslationValidationReport,
  TranslationStatusFilter,
} from "../lib/server/map-translations";
import { MAP_TRANSLATION_TYPES, MAX_MAP_TRANSLATION_BATCH } from "../lib/map-translations/contract";
import {
  calculateMapTranslationTextareaHeight,
  canUploadMapTranslations,
  findMapTranslationIssueSelection,
  getMapTranslationImportState,
  MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT,
} from "../lib/map-translations/import-ui";

type QueueResponse = {
  items: MapTranslationQueueRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: MapTranslationSummary;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

function statusLabel(status: MapTranslationQueueRow["en_status"]) {
  if (status === "translated") return { text: "✓", tone: "success", title: "Translated" };
  if (status === "stale") return { text: "!", tone: "warning", title: "Stale translation" };
  return { text: "—", tone: "neutral", title: "Missing" };
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied ? Promise.resolve() : Promise.reject(new Error("Could not copy JSON."));
}

export function MapTranslationQueue() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [mapType, setMapType] = useState("");
  const [status, setStatus] = useState<TranslationStatusFilter>("missing_any");
  const [approval, setApproval] = useState<"approved" | "all">("approved");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copying, setCopying] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [validatedJson, setValidatedJson] = useState<string | null>(null);
  const [validation, setValidation] = useState<MapTranslationValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      status,
      approval,
    });
    if (mapType) params.set("map_type", mapType);
    if (search) params.set("search", search);
    try {
      const response = await fetchJson<QueueResponse>(`/api/admin/map-translations/queue?${params}`);
      setData(response);
      if (response.page !== page) setPage(response.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [approval, mapType, page, pageSize, refreshKey, search, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [approval, mapType, pageSize, search, status]);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const height = calculateMapTranslationTextareaHeight(textarea.scrollHeight);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAP_TRANSLATION_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [jsonInput]);

  const importState = getMapTranslationImportState({
    jsonInput,
    validating,
    validationValid: validation?.valid ?? null,
    validatedJson,
  });

  const visibleSelectableIds = useMemo(
    () => data?.items.filter((item) => item.selectable).map((item) => item.content_id) ?? [],
    [data],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (contentId: string) => {
    setNotice(null);
    setSelectedIds((current) => {
      if (current.includes(contentId)) return current.filter((id) => id !== contentId);
      if (current.length >= MAX_MAP_TRANSLATION_BATCH) {
        setNotice(`Maximum translation batch is ${MAX_MAP_TRANSLATION_BATCH} stories.`);
        return current;
      }
      return [...current, contentId];
    });
  };

  const selectVisible = () => {
    const available = visibleSelectableIds.filter((id) => !selectedSet.has(id));
    const slots = Math.max(0, MAX_MAP_TRANSLATION_BATCH - selectedIds.length);
    const next = available.slice(0, slots);
    setSelectedIds((current) => [...current, ...next]);
    if (available.length > slots) setNotice(`Maximum translation batch is ${MAX_MAP_TRANSLATION_BATCH} stories.`);
  };

  const handleCopy = async () => {
    if (selectedIds.length > MAX_MAP_TRANSLATION_BATCH) {
      setError(`Maximum translation batch is ${MAX_MAP_TRANSLATION_BATCH} stories.`);
      return;
    }
    setCopying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchJson<{ contract: unknown }>("/api/admin/map-translations/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_ids: selectedIds }),
      });
      await copyText(JSON.stringify(response.contract, null, 2));
      setNotice(`Copied ${selectedIds.length} stories for translation.`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    } finally {
      setCopying(false);
    }
  };

  const validate = async () => {
    setValidating(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const response = await fetchJson<{ report: MapTranslationValidationReport; repaired?: boolean; repaired_json?: string | null }>("/api/admin/map-translations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate", json: jsonInput }),
      });
      const validatedInput = response.repaired && response.repaired_json ? response.repaired_json : jsonInput;
      if (response.repaired && response.repaired_json) {
        setJsonInput(response.repaired_json);
        setImportNotice("JSON formatting was automatically repaired before validation.");
      }
      setValidation(response.report);
      setValidatedJson(validatedInput);
    } catch (validationError) {
      setImportError(validationError instanceof Error ? validationError.message : "Unable to validate this JSON.");
      setValidation(null);
      setValidatedJson(null);
    } finally {
      setValidating(false);
    }
  };

  const upload = async () => {
    if (!canUploadMapTranslations(importState, uploading) || !validation) return;
    setUploading(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const response = await fetchJson<{ inserted: number }>("/api/admin/map-translations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", json: jsonInput }),
      });
      setImportNotice(`Uploaded ${response.inserted} translations for ${validation.stories_detected} stories.`);
      setJsonInput("");
      setValidatedJson(null);
      setValidation(null);
      setSelectedIds([]);
      setRefreshKey((value) => value + 1);
    } catch (uploadError) {
      setImportError(uploadError instanceof Error ? uploadError.message : "Unable to upload translations.");
    } finally {
      setUploading(false);
    }
  };

  const jumpToIssue = (problem: MapTranslationValidationReport["problems"][number]) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selection = findMapTranslationIssueSelection({
      json: jsonInput,
      contentId: problem.content_id,
      language: problem.language,
      fragment: problem.fragment,
    });
    textarea.focus();
    if (!selection) return;
    textarea.setSelectionRange(selection.start, selection.end);
    const progress = selection.start / Math.max(1, textarea.value.length);
    textarea.scrollTop = Math.max(0, textarea.scrollHeight * progress - textarea.clientHeight / 2);
  };

  const copyIssue = async (problem: MapTranslationValidationReport["problems"][number]) => {
    const lines = [
      `content_id: ${problem.content_id ?? "unknown"}`,
      `language: ${problem.language ?? "unknown"}`,
      `problem: unexpected ${problem.unexpected_script ?? "script"} text`,
      `fragment: ${problem.fragment ?? "unknown"}`,
      `context: ${problem.context ?? "unknown"}`,
    ];
    try {
      await copyText(lines.join("\n"));
      setImportNotice("Issue copied.");
    } catch (copyError) {
      setImportError(copyError instanceof Error ? copyError.message : "Could not copy issue.");
    }
  };

  const summary = data?.summary;

  return (
    <>
      {summary ? (
        <>
          <div className="translation-summary">
            {[
              ["Russian stories", summary.russian_stories],
              ["Approved RU", summary.approved_russian_stories],
              ["EN translated", summary.en_translated],
              ["HE translated", summary.he_translated],
              ["Both complete", summary.both_complete],
              ["Still requiring", summary.still_requiring_translation],
            ].map(([label, value]) => (
              <div className="translation-summary__card" key={label}>
                <strong>{value}</strong><span>{label}</span>
              </div>
            ))}
          </div>
          <div className="type-progress-grid">
            {summary.by_map_type.map((bucket) => (
              <div className="type-progress" key={bucket.map_type}>
                <strong>{bucket.map_type}</strong>
                <span>RU: {bucket.russian_stories}</span>
                <span>EN: {bucket.en_translated} / {bucket.russian_stories}</span>
                <span>HE: {bucket.he_translated} / {bucket.russian_stories}</span>
                <span>Complete: {bucket.both_complete}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <section className="translation-panel import-panel">
        <h2>Import completed translations</h2>
        <p>Paste the compact v2 response from the external translator: each item should contain only content_id, source_hash, and translations. Validation reloads the Russian source from Supabase and never writes.</p>
        <textarea
          ref={textareaRef}
          value={jsonInput}
          onChange={(event) => {
            setJsonInput(event.target.value);
            setValidation(null);
            setValidatedJson(null);
            setImportError(null);
            setImportNotice(null);
          }}
          spellCheck={false}
          placeholder='Paste compact contract_version 2 JSON here: { "content_id": "…", "source_hash": "…", "translations": { "en": { "content": "…" }, "he": { "content": "…" } } }'
          aria-label="Completed translation JSON"
        />
        <div className="import-actions">
          <button type="button" onClick={() => { setJsonInput(""); setValidation(null); setValidatedJson(null); setImportError(null); setImportNotice(null); }} disabled={!jsonInput}>Clear</button>
          <button type="button" onClick={() => void validate()} disabled={!jsonInput || validating || uploading}>{validating ? "Validating..." : "Validate JSON"}</button>
          <button className="primary" type="button" onClick={() => void upload()} disabled={!canUploadMapTranslations(importState, uploading)}>{uploading ? "Uploading..." : "Upload translations"}</button>
        </div>
        <p className="import-state" aria-live="polite">Status: {importState === "empty" ? "waiting for JSON" : importState}</p>
        {importError ? <p className="message error">{importError}</p> : null}
        {importNotice ? <p className="message success">{importNotice}</p> : null}
        {validation ? <div className={`validation ${validation.valid ? "valid" : "invalid"}`}>
          <div className="validation-counts"><strong>{validation.stories_detected} stories</strong><span>{validation.english_translations} English translations</span><span>{validation.hebrew_translations} Hebrew translations</span><span>{validation.ready_rows} rows ready to insert</span><span>{validation.problems.length} problems</span></div>
          {validation.problems.length ? <ul className="validation-problems">{validation.problems.map((problem, index) => {
            const scriptIssue = problem.code === "UNEXPECTED_SCRIPT_HE" || problem.code === "UNEXPECTED_SCRIPT_EN";
            if (scriptIssue) return <li className="script-issue" key={`${problem.content_id}-${problem.code}-${index}`}>
              <strong>{problem.language === "he" ? "Hebrew" : "English"} translation needs attention</strong>
              <span className="issue-target">{problem.target_id ?? problem.content_id ?? "Unknown story"}</span>
              <span>Unexpected {problem.unexpected_script ?? "script"} characters: <code>“{problem.fragment}”</code></span>
              {problem.context ? <small>Context: …{problem.context}…</small> : null}
              {typeof problem.character_index === "number" ? <small>Character position: {problem.character_index}</small> : null}
              <div className="issue-actions">
                <button type="button" onClick={() => jumpToIssue(problem)}>Jump to error</button>
                <button type="button" onClick={() => void copyIssue(problem)}>Copy issue</button>
              </div>
            </li>;
            return <li key={`${problem.content_id}-${problem.code}-${index}`}><strong>{problem.map_type ?? "payload"} / {problem.target_id ?? problem.content_id ?? "—"}</strong> — {problem.message} <code>{problem.code}</code></li>;
          })}</ul> : <p>Complete batch is ready for insert-only upload.</p>}
        </div> : null}
      </section>

      <section className="translation-panel">
        <div className="filters">
          <label>Map type<select value={mapType} onChange={(event) => setMapType(event.target.value)}>
            <option value="">All</option>{MAP_TRANSLATION_TYPES.map((value) => <option key={value}>{value}</option>)}
          </select></label>
          <label>Translation status<select value={status} onChange={(event) => setStatus(event.target.value as TranslationStatusFilter)}>
            <option value="all">All</option><option value="missing_any">Missing any translation</option>
            <option value="missing_en">Missing EN</option><option value="missing_he">Missing HE</option>
            <option value="missing_both">Missing both</option><option value="complete">Complete</option>
          </select></label>
          <label>Approval<select value={approval} onChange={(event) => setApproval(event.target.value as "approved" | "all")}>
            <option value="approved">Approved</option><option value="all">All Russian stories</option>
          </select></label>
          <label>Rows<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as 25 | 50 | 100)}>
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select></label>
          <form className="search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput); }}>
            <label>Search<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="target_id, title or story" /></label>
            <button type="submit">Search</button>
          </form>
        </div>

        <div className="batch-bar">
          <strong>Selected: {selectedIds.length} / {MAX_MAP_TRANSLATION_BATCH}</strong>
          <button type="button" onClick={selectVisible} disabled={!visibleSelectableIds.length}>Select visible (up to 15)</button>
          <button type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length}>Clear selection</button>
          <button className="primary" type="button" onClick={() => void handleCopy()} disabled={selectedIds.length < 1 || selectedIds.length > 15 || copying}>
            {copying ? "Preparing JSON..." : "Copy JSON format"}
          </button>
        </div>

        {error ? <p className="message error">{error}</p> : null}
        {notice ? <p className="message success">{notice}</p> : null}
        {loading ? <p className="state">Loading translation queue…</p> : null}
        {!loading && data ? (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th /><th>map_type</th><th>target_id / title</th><th>Russian story</th><th>Approval</th><th>RU</th><th>EN</th><th>HE</th></tr></thead>
              <tbody>{data.items.map((row) => {
                const en = statusLabel(row.en_status); const he = statusLabel(row.he_status);
                return <tr key={row.content_id} className={row.target_metadata_missing ? "metadata-missing" : ""}>
                  <td><input type="checkbox" checked={selectedSet.has(row.content_id)} disabled={!row.selectable} onChange={() => toggle(row.content_id)} aria-label={`Select ${row.target_id}`} /></td>
                  <td>{row.map_type}<small>#{row.content_id}</small></td>
                  <td><strong>{row.target_id}</strong>{row.title_ru ? <span>{row.title_ru}</span> : <span className="warning-text">Target metadata missing</span>}</td>
                  <td><details><summary>{row.source_content.slice(0, 150)}{row.source_content.length > 150 ? "…" : ""}</summary><p>{row.source_content}</p></details></td>
                  <td><span className={`badge ${row.is_approved ? "success" : "warning"}`}>{row.is_approved ? "Approved" : "Draft"}</span></td>
                  <td><span className="badge success">✓</span></td>
                  <td><span className={`badge ${en.tone}`} title={en.title}>{en.text}</span></td>
                  <td><span className={`badge ${he.tone}`} title={he.title}>{he.text}</span></td>
                </tr>;
              })}</tbody>
            </table></div>
            <div className="pagination"><span>{data.total} matching stories · page {data.page} of {data.totalPages}</span>
              <button disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <button disabled={data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </>
        ) : null}
      </section>

      <style jsx>{`
        .translation-summary{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:12px;margin:20px 0}.translation-summary__card,.type-progress{background:#fffdf5;border:1px solid #ffe5b4;border-radius:14px;padding:14px}.translation-summary__card{display:flex;flex-direction:column}.translation-summary__card strong{font-size:26px}.translation-summary__card span,.type-progress span{color:#667085;font-size:13px}.type-progress-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}.type-progress{display:grid;grid-template-columns:1fr 1fr;gap:4px}.type-progress strong{grid-column:1/-1}.translation-panel{background:white;border:1px solid #eee2ca;border-radius:18px;padding:18px;margin:18px 0;box-shadow:0 8px 24px rgba(77,54,18,.06)}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.filters label,.search label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700}.filters select,.filters input{min-height:38px;border:1px solid #d0d5dd;border-radius:9px;padding:7px 10px;background:white}.search{display:flex;gap:6px;align-items:flex-end}.batch-bar,.pagination,.import-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0}.batch-bar strong{margin-right:auto}button{border:1px solid #d0d5dd;background:#fffdf5;border-radius:9px;padding:9px 13px;cursor:pointer}button.primary{background:#f5a623;border-color:#e4930d;color:#2d210a;font-weight:800}button:disabled{opacity:.5;cursor:not-allowed}.table-wrap{overflow:auto;border:1px solid #eaecf0;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:1120px}th,td{padding:11px;border-bottom:1px solid #eaecf0;text-align:left;vertical-align:top;font-size:13px}th{background:#fffaf0;position:sticky;top:0;z-index:1}td small,td span{display:block;margin-top:3px}details{max-width:430px}summary{cursor:pointer;line-height:1.45}details p{white-space:pre-wrap;line-height:1.5}.badge{display:inline-flex!important;align-items:center;justify-content:center;min-width:28px;border-radius:999px;padding:4px 8px;font-weight:800}.badge.success{background:#ecfdf3;color:#027a48}.badge.warning{background:#fffaeb;color:#b54708}.badge.neutral{background:#f2f4f7;color:#667085}.metadata-missing{background:#fffaf0}.warning-text{color:#b54708}.pagination span{margin-right:auto}.message,.state{border-radius:9px;padding:10px 12px}.message.error{background:#fef3f2;color:#b42318}.message.success{background:#ecfdf3;color:#027a48}.import-panel{overflow:hidden}.import-panel textarea{box-sizing:border-box;display:block;width:100%;min-width:0;min-height:140px;max-height:620px;resize:none;overflow-y:hidden;border:1px solid #d0d5dd;border-radius:12px;padding:14px;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.import-state{margin:0 0 12px;color:#667085;font-size:13px}.validation{padding:14px;border-radius:12px}.validation.valid{background:#ecfdf3;border:1px solid #abefc6}.validation.invalid{background:#fef3f2;border:1px solid #fecdca}.validation-counts{display:flex;gap:16px;flex-wrap:wrap}.validation-problems{list-style:none;padding:0!important}.validation li{margin:6px 0}.validation code{font-size:11px}.script-issue{display:flex;flex-direction:column;gap:5px;background:white;border:1px solid #fda29b;border-radius:10px;padding:12px}.script-issue .issue-target{font-size:16px;font-weight:800;text-transform:capitalize}.script-issue small{color:#667085}.issue-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px}@media(max-width:1000px){.translation-summary{grid-template-columns:repeat(3,1fr)}.type-progress-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.translation-summary,.type-progress-grid{grid-template-columns:1fr 1fr}.import-actions{align-items:stretch}.import-actions button{flex:1 1 100%}}
      `}</style>
    </>
  );
}
