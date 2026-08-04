import { useEffect, useRef, useState } from "react";
import { dedupeMediaItems } from "../../../lib/media-search/normalize";
import type { MediaKind, MediaProvider, MediaSearchItem, MediaSearchResponse } from "../../../lib/media-search/types";

type ResultsBySource = Record<MediaProvider, MediaSearchItem[]>;
type PaginationBySource = Record<MediaProvider, { cursor: string | null; hasMore: boolean }>;
type LoadingBySource = Record<MediaProvider, boolean>;
type ErrorsBySource = Record<MediaProvider, string | null>;

const SOURCES: Array<{ value: MediaProvider; label: string }> = [
  { value: "wikimedia", label: "Wikimedia" },
  { value: "pexels", label: "Pexels" },
  { value: "giphy", label: "Giphy" },
];
const emptyResults = (): ResultsBySource => ({ wikimedia: [], pexels: [], giphy: [] });
const emptyPagination = (): PaginationBySource => ({
  wikimedia: { cursor: null, hasMore: false },
  pexels: { cursor: null, hasMore: false },
  giphy: { cursor: null, hasMore: false },
});
const emptyLoading = (): LoadingBySource => ({ wikimedia: false, pexels: false, giphy: false });
const emptyErrors = (): ErrorsBySource => ({ wikimedia: null, pexels: null, giphy: null });

export function MediaPickerModal(props: {
  open: boolean;
  slideId: string;
  query: string;
  initialSource?: MediaProvider;
  initialMediaType?: MediaKind;
  onQueryChange: (query: string) => void;
  onSelect: (item: MediaSearchItem) => Promise<void> | void;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState(props.query);
  const [activeSource, setActiveSource] = useState<MediaProvider>(props.initialSource ?? "pexels");
  const [mediaKind, setMediaKind] = useState<MediaKind>(props.initialMediaType ?? "image");
  const [resultsBySource, setResultsBySource] = useState<ResultsBySource>(emptyResults);
  const [paginationBySource, setPaginationBySource] = useState<PaginationBySource>(emptyPagination);
  const [loadingBySource, setLoadingBySource] = useState<LoadingBySource>(emptyLoading);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorsBySource, setErrorsBySource] = useState<ErrorsBySource>(emptyErrors);
  const [selectingMediaId, setSelectingMediaId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);

  const visibleResults = resultsBySource[activeSource];
  const activePagination = paginationBySource[activeSource];
  const searchingMedia = loadingBySource[activeSource];
  const activeError = errorsBySource[activeSource];
  const unsupported = activeSource === "wikimedia" && mediaKind === "video";

  const runSearch = async (options?: {
    source?: MediaProvider;
    kind?: MediaKind;
    query?: string;
    append?: boolean;
  }) => {
    const source = options?.source ?? activeSource;
    const kind = options?.kind ?? mediaKind;
    const query = (options?.query ?? searchQuery).trim();
    const append = options?.append ?? false;
    if (!query || (source === "wikimedia" && kind === "video")) return;

    const requestId = ++requestRef.current;
    if (append) setLoadingMore(true);
    else setLoadingBySource((current) => ({ ...current, [source]: true }));
    setErrorsBySource((current) => ({ ...current, [source]: null }));
    props.onQueryChange(query);

    try {
      const params = new URLSearchParams({
        q: query,
        source,
        kind,
        cursor: append ? paginationBySource[source].cursor ?? "1" : "1",
      });
      const response = await fetch(`/api/admin/media-search?${params}`, { credentials: "include" });
      const data = await response.json() as MediaSearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Не удалось загрузить медиа из ${SOURCES.find((item) => item.value === source)?.label}.`);
      if (requestId !== requestRef.current) return;
      setResultsBySource((current) => ({
        ...current,
        [source]: dedupeMediaItems(append ? [...current[source], ...data.items] : data.items)
          .filter((item) => item.source === source),
      }));
      setPaginationBySource((current) => ({ ...current, [source]: { cursor: data.nextCursor, hasMore: data.hasMore } }));
    } catch {
      if (requestId === requestRef.current) {
        const label = SOURCES.find((item) => item.value === source)?.label ?? source;
        setErrorsBySource((current) => ({ ...current, [source]: `Не удалось загрузить медиа из ${label}` }));
      }
    } finally {
      if (requestId === requestRef.current) setLoadingBySource((current) => ({ ...current, [source]: false }));
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!props.open) return;
    const source = props.initialSource ?? "pexels";
    const kind = props.initialMediaType ?? "image";
    setSearchQuery(props.query);
    setActiveSource(source);
    setMediaKind(kind);
    setResultsBySource(emptyResults());
    setPaginationBySource(emptyPagination());
    setLoadingBySource(emptyLoading());
    setErrorsBySource(emptyErrors());
    setSelectingMediaId(null);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !selectingMediaId) props.onClose(); };
    document.addEventListener("keydown", onKeyDown);
    const timer = window.setTimeout(() => void runSearch({ source, kind, query: props.query }), 0);
    return () => {
      window.clearTimeout(timer);
      requestRef.current += 1;
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
    // Opening identity intentionally resets and performs exactly one request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.slideId]);

  if (!props.open) return null;

  const switchSource = (source: MediaProvider) => {
    if (source === activeSource) return;
    requestRef.current += 1;
    setActiveSource(source);
    setResultsBySource((current) => ({ ...current, [source]: [] }));
    setPaginationBySource((current) => ({ ...current, [source]: { cursor: null, hasMore: false } }));
    setErrorsBySource((current) => ({ ...current, [source]: null }));
    void runSearch({ source, kind: mediaKind, query: searchQuery });
  };

  const switchKind = (kind: MediaKind) => {
    if (kind === mediaKind) return;
    requestRef.current += 1;
    setMediaKind(kind);
    setResultsBySource(emptyResults());
    setPaginationBySource(emptyPagination());
    setErrorsBySource(emptyErrors());
    void runSearch({ source: activeSource, kind, query: searchQuery });
  };

  const choose = async (item: MediaSearchItem) => {
    if (selectingMediaId) return;
    setSelectingMediaId(item.id);
    try {
      await props.onSelect(item);
    } catch {
      setErrorsBySource((current) => ({ ...current, [activeSource]: "Не удалось добавить медиа. Попробуйте ещё раз" }));
      setSelectingMediaId(null);
    }
  };

  return (
    <div className="map-dialog-backdrop map-media-picker-backdrop" role="presentation">
      <section className="map-media-picker" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
        <header className="map-media-picker__header">
          <div className="map-media-picker__title-row">
            <h2 id="media-picker-title">Подбор медиа</h2>
            <button ref={closeRef} className="map-media-picker__close" type="button" aria-label="Закрыть подбор медиа" onClick={props.onClose}>×</button>
          </div>
          <div className="map-media-search-row">
            <input className="map-media-search-input" type="search" aria-label="Ключевое слово" placeholder="Введите ключевое слово" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); props.onQueryChange(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(); } }} />
            <button type="button" disabled={searchingMedia || !searchQuery.trim()} onClick={() => void runSearch()}>{searchingMedia ? "Ищем…" : "Найти"}</button>
          </div>
          <div className="map-media-picker__segmented" aria-label="Тип медиа">
            <button type="button" className={mediaKind === "image" ? "is-active" : ""} onClick={() => switchKind("image")}>Картинки</button>
            <button type="button" className={mediaKind === "video" ? "is-active" : ""} onClick={() => switchKind("video")}>Видео</button>
          </div>
          <div className="map-media-source-tabs" role="tablist" aria-label="Источник медиа">
            {SOURCES.map((tab) => (
              <button key={tab.value} type="button" role="tab" aria-selected={activeSource === tab.value} className={`map-media-source-tab${activeSource === tab.value ? " is-active" : ""}`} onClick={() => switchSource(tab.value)}>{tab.label}</button>
            ))}
          </div>
        </header>
        <div className="map-media-picker__body">
          {unsupported ? <p className="map-media-picker__empty">Этот источник не поддерживает выбранный тип медиа</p> : null}
          {activeError ? <div className="map-media-picker__error"><p>{activeError}</p><button type="button" onClick={() => void runSearch()}>Повторить</button></div> : null}
          {searchingMedia ? <div className="map-media-picker__empty">Загружаем {mediaKind === "image" ? "изображения" : "видео"}…</div> : null}
          {!searchingMedia && !activeError && !unsupported && visibleResults.length === 0 ? <div className="map-media-picker__empty">Ничего не найдено. Попробуйте другой запрос.</div> : null}
          <div className="map-media-picker__grid">
            {visibleResults.map((item) => (
              <button key={item.id} type="button" className="map-media-result" aria-label={`Выбрать ${item.kind === "video" ? "видео" : item.animated ? "GIF" : "изображение"} из ${item.source}`} disabled={Boolean(selectingMediaId)} onClick={() => void choose(item)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbnailUrl || item.originalUrl} alt="" loading="lazy" />
                <span className="map-media-result__source">{item.source}</span>
                <span className="map-media-result__type">{item.kind === "video" ? "▶" : item.animated ? "GIF" : "Фото"}</span>
                {item.duration ? <span className="map-media-result__duration">{Math.round(item.duration)}с</span> : null}
                {selectingMediaId === item.id ? <span className="map-media-result__loading">Добавляем…</span> : null}
              </button>
            ))}
          </div>
          {visibleResults.length ? activePagination.hasMore && activePagination.cursor ? <button className="map-media-picker__more" type="button" disabled={loadingMore} onClick={() => void runSearch({ append: true })}>{loadingMore ? "Загружаем…" : "Загрузить ещё"}</button> : <p className="map-media-picker__end">Больше результатов нет</p> : null}
        </div>
      </section>
    </div>
  );
}
