import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TRANSLATION_CONTENT_TYPES,
  type TranslationContentType,
} from "../../lib/translations/content-types";
import { MAX_HUMAN_TRANSLATION_BATCH } from "../../lib/translations/human-loop-contract";
import type {
  HumanTranslationIdentity,
  HumanTranslationLanguageStatus,
  HumanTranslationRow,
  HumanTranslationStatusFilter,
  HumanTranslationSummary,
} from "../../lib/translations/human-loop-queue";

type QueueResponse = {
  items: HumanTranslationRow[];
  selectionItems: HumanTranslationIdentity[];
  selectableTotal: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: HumanTranslationSummary;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function identityKey(identity: HumanTranslationIdentity): string {
  return `${identity.content_type}\u0000${identity.content_id}`;
}

function statusLabel(status: HumanTranslationLanguageStatus): string {
  if (status === "current") return "✓ Current";
  if (status === "outdated") return "⚠ Outdated";
  return "— Missing";
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Could not copy translation batch.");
}

export function HumanTranslationQueue() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [status, setStatus] = useState<HumanTranslationStatusFilter>("needs_translation");
  const [contentType, setContentType] = useState<TranslationContentType | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<HumanTranslationIdentity[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      status,
    });
    if (contentType) params.set("content_type", contentType);
    if (search) params.set("search", search);
    try {
      const response = await fetchJson<QueueResponse>(`/api/admin/translation/human-queue?${params}`);
      setData(response);
      if (response.page !== page) setPage(response.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [contentType, page, pageSize, search, status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [contentType, pageSize, search, status]);
  useEffect(() => {
    const handleSaved = () => {
      setSelected([]);
      void load();
    };
    window.addEventListener("human-translations-saved", handleSaved);
    return () => window.removeEventListener("human-translations-saved", handleSaved);
  }, [load]);

  const selectedKeys = useMemo(() => new Set(selected.map(identityKey)), [selected]);

  const toggle = (identity: HumanTranslationIdentity) => {
    setNotice(null);
    setSelected((current) => {
      const key = identityKey(identity);
      if (current.some((item) => identityKey(item) === key)) {
        return current.filter((item) => identityKey(item) !== key);
      }
      if (current.length >= MAX_HUMAN_TRANSLATION_BATCH) {
        setNotice(`Maximum batch is ${MAX_HUMAN_TRANSLATION_BATCH} objects.`);
        return current;
      }
      return [...current, identity];
    });
  };

  const selectAllMatching = () => {
    if (!data) return;
    setSelected(data.selectionItems);
    setNotice(
      data.selectableTotal > data.selectionItems.length
        ? `Selected the first ${data.selectionItems.length} matching objects (batch limit).`
        : `Selected ${data.selectionItems.length} matching objects.`,
    );
  };

  const copySelected = async () => {
    if (selected.length === 0) return;
    setCopying(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetchJson<{ contract: unknown }>("/api/admin/translation/human-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: selected }),
      });
      await copyText(JSON.stringify(response.contract, null, 2));
      setNotice(`Copied ${selected.length} objects with English and Hebrew templates.`);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : String(copyError));
    } finally {
      setCopying(false);
    }
  };

  const summary = data?.summary;

  return (
    <section className="translations-panel human-translation-queue">
      <h2 className="translations-title">Human Translation Queue</h2>
      <p className="translations-hint">
        Select mixed content types and copy one self-contained, source-hashed EN + HE request for an external LLM.
      </p>

      {summary && (
        <div className="translations-grid translations-grid--4 translations-grid--summary">
          <div className="translations-card"><div className="translations-card__label">Needs translation</div><div className="translations-card__value">{summary.needs_translation}</div></div>
          <div className="translations-card"><div className="translations-card__label">Missing any</div><div className="translations-card__value">{summary.missing_any}</div></div>
          <div className="translations-card"><div className="translations-card__label">Outdated any</div><div className="translations-card__value">{summary.outdated_any}</div></div>
          <div className="translations-card"><div className="translations-card__label">Complete</div><div className="translations-card__value">{summary.complete}</div></div>
        </div>
      )}

      <div className="human-translation-queue__filters">
        <label className="translations-label">Status
          <select className="translations-input" value={status} onChange={(event) => setStatus(event.target.value as HumanTranslationStatusFilter)}>
            <option value="needs_translation">Needs translation</option>
            <option value="missing_any">Missing any language</option>
            <option value="outdated_any">Outdated source</option>
            <option value="missing_both">Missing both languages</option>
            <option value="complete">Complete</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="translations-label">Content type
          <select className="translations-input" value={contentType} onChange={(event) => setContentType(event.target.value as TranslationContentType | "")}>
            <option value="">All types</option>
            {TRANSLATION_CONTENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="translations-label">Rows
          <select className="translations-input" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value) as 25 | 50 | 100)}>
            <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </label>
        <form className="human-translation-queue__search" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput); }}>
          <label className="translations-label">Search
            <input className="translations-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Title, type or ID" />
          </label>
          <button className="translations-button translations-button--secondary" type="submit">Search</button>
        </form>
      </div>

      <div className="human-translation-queue__batch-bar">
        <strong>Selected: {selected.length} / {MAX_HUMAN_TRANSLATION_BATCH}</strong>
        <button className="translations-button translations-button--secondary" type="button" onClick={selectAllMatching} disabled={!data?.selectionItems.length}>Select all matching</button>
        <button className="translations-button translations-button--secondary" type="button" onClick={() => setSelected([])} disabled={!selected.length}>Clear</button>
        <button className="translations-button translations-button--primary" type="button" onClick={() => void copySelected()} disabled={!selected.length || copying}>
          {copying ? "Preparing batch..." : "Copy selected for LLM"}
        </button>
      </div>

      {error && <div className="translations-alert translations-alert--error">{error}</div>}
      {notice && <div className="translations-alert translations-alert--success">{notice}</div>}
      {loading && <p className="translations-hint">Loading queue...</p>}

      {!loading && data && (
        <>
          <div className="human-translation-queue__table-wrap">
            <table className="human-translation-queue__table">
              <thead><tr><th /><th>Object</th><th>Type</th><th>Source size</th><th>English</th><th>Hebrew</th></tr></thead>
              <tbody>{data.items.map((row) => {
                const identity = { content_type: row.content_type, content_id: row.content_id };
                return <tr key={identityKey(identity)}>
                  <td data-label="Select"><input type="checkbox" checked={selectedKeys.has(identityKey(identity))} disabled={!row.selectable} onChange={() => toggle(identity)} aria-label={`Select ${row.content_type}:${row.content_id}`} /></td>
                  <td data-label="Object"><strong>{row.title}</strong><small>{row.content_id}</small></td>
                  <td data-label="Type">{row.content_type}</td>
                  <td data-label="Source size">{row.source_characters.toLocaleString()} chars</td>
                  <td data-label="English"><span className={`human-translation-status human-translation-status--${row.en_status}`}>{statusLabel(row.en_status)}</span></td>
                  <td data-label="Hebrew"><span className={`human-translation-status human-translation-status--${row.he_status}`}>{statusLabel(row.he_status)}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="human-translation-queue__pagination">
            <span>{data.total} matching objects · page {data.page} of {data.totalPages}</span>
            <button className="translations-button translations-button--secondary" disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="translations-button translations-button--secondary" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  );
}
