import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { AdminLogout } from "../../AdminLogout";
import { AdminTabs } from "../../AdminTabs";
import type { MediaSearchItem } from "../../../lib/media-search/types";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { MapStorySlideEditor, type EditableMapSlide } from "./MapStorySlideEditor";
import { MediaPickerModal } from "./MediaPickerModal";

type Story = { id: string; type: string; target_id: string; language: string; content: string; youtube_url_ru?: string | null; youtube_url_he?: string | null; youtube_url_en?: string | null; google_maps_url?: string | null } | null;
type StoryResponse = { story: Story; slides: EditableMapSlide[] };
type ConfirmAction = { kind: "save-story" | "reparse" | "auto" | "remove" | "delete"; index?: number } | null;
type StoryFields = { content: string; youtubeUrlRu: string; youtubeUrlHe: string; youtubeUrlEn: string; googleMapsUrl: string };
type Draft = { version: 1 | 2; savedAt: number; slides: EditableMapSlide[]; queries: Record<string, string>; content: string; youtubeUrlRu?: string; youtubeUrlHe?: string; youtubeUrlEn?: string; googleMapsUrl?: string };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: "include" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Не удалось выполнить действие.");
  return data;
}

function slidesSnapshot(slides: EditableMapSlide[]) {
  return JSON.stringify(slides.map(({ text, image_url, credit_line }) => ({ text, image_url, credit_line })));
}

function storySnapshot(fields: StoryFields) {
  return JSON.stringify(fields);
}

export default function MapTargetEditorPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const mapType = typeof router.query.map_type === "string" ? router.query.map_type : "";
  const targetId = typeof router.query.target_id === "string" ? router.query.target_id : "";
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState<Story>(null);
  const [content, setContent] = useState("");
  const [youtubeUrlRu, setYoutubeUrlRu] = useState("");
  const [youtubeUrlHe, setYoutubeUrlHe] = useState("");
  const [youtubeUrlEn, setYoutubeUrlEn] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [savingStory, setSavingStory] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [slides, setSlides] = useState<EditableMapSlide[]>([]);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [serverSlidesSnapshot, setServerSlidesSnapshot] = useState("");
  const [serverStorySnapshot, setServerStorySnapshot] = useState("");
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [draftCandidate, setDraftCandidate] = useState<Draft | null>(null);
  const [savingSlides, setSavingSlides] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [reparsing, setReparsing] = useState(false);
  const [autoSelectingMedia, setAutoSelectingMedia] = useState(false);
  const [online, setOnline] = useState(true);
  const [networkMessage, setNetworkMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const slideKey = useCallback((slide: EditableMapSlide, index: number) => slide.id || `${story?.id ?? "draft"}-${index}`, [story?.id]);
  const draftKey = useMemo(() => mapType && targetId ? `map-story-draft:${mapType}:${targetId}:${story?.language ?? "ru"}:${story?.id ?? "new"}` : "", [mapType, targetId, story]);
  const currentStoryFields = useMemo(() => ({ content, youtubeUrlRu, youtubeUrlHe, youtubeUrlEn, googleMapsUrl }), [content, googleMapsUrl, youtubeUrlEn, youtubeUrlHe, youtubeUrlRu]);
  const dirty = useMemo(() => Boolean(serverSlidesSnapshot || serverStorySnapshot) && (slidesSnapshot(slides) !== serverSlidesSnapshot || storySnapshot(currentStoryFields) !== serverStorySnapshot), [currentStoryFields, serverSlidesSnapshot, serverStorySnapshot, slides]);
  const slideTextsDirty = useMemo(() => {
    if (!serverSlidesSnapshot) return false;
    const serverSlides = JSON.parse(serverSlidesSnapshot) as Array<{ text: string }>;
    return JSON.stringify(slides.map(({ text }) => text)) !== JSON.stringify(serverSlides.map(({ text }) => text));
  }, [serverSlidesSnapshot, slides]);

  useEffect(() => { supabase.auth.getSession().then(({ data }) => data.session ? setSessionChecked(true) : void router.replace("/login")); }, [router, supabase]);
  const load = useCallback(async () => {
    if (!sessionChecked || !mapType || !targetId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ mapType, targetId });
      const data = await fetchJson<StoryResponse>(`/api/admin/map-story?${params}`);
      setStory(data.story); setContent(data.story?.content ?? ""); setSlides(data.slides);
      setYoutubeUrlRu(data.story?.youtube_url_ru ?? ""); setYoutubeUrlHe(data.story?.youtube_url_he ?? "");
      setYoutubeUrlEn(data.story?.youtube_url_en ?? ""); setGoogleMapsUrl(data.story?.google_maps_url ?? "");
      setServerSlidesSnapshot(slidesSnapshot(data.slides));
      setServerStorySnapshot(storySnapshot({ content: data.story?.content ?? "", youtubeUrlRu: data.story?.youtube_url_ru ?? "", youtubeUrlHe: data.story?.youtube_url_he ?? "", youtubeUrlEn: data.story?.youtube_url_en ?? "", googleMapsUrl: data.story?.google_maps_url ?? "" }));
    } catch { setMessage("Не удалось загрузить историю."); }
    finally { setLoading(false); }
  }, [mapType, sessionChecked, targetId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!draftKey || loading) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      const serverStory = JSON.parse(serverStorySnapshot) as StoryFields;
      const draftStory = { content: draft.content, youtubeUrlRu: draft.version === 2 ? draft.youtubeUrlRu ?? "" : serverStory.youtubeUrlRu, youtubeUrlHe: draft.version === 2 ? draft.youtubeUrlHe ?? "" : serverStory.youtubeUrlHe, youtubeUrlEn: draft.version === 2 ? draft.youtubeUrlEn ?? "" : serverStory.youtubeUrlEn, googleMapsUrl: draft.version === 2 ? draft.googleMapsUrl ?? "" : serverStory.googleMapsUrl };
      if ((draft.version === 1 || draft.version === 2) && (slidesSnapshot(draft.slides) !== serverSlidesSnapshot || storySnapshot(draftStory) !== serverStorySnapshot)) setDraftCandidate(draft);
    } catch { localStorage.removeItem(draftKey); }
  }, [draftKey, loading, serverSlidesSnapshot, serverStorySnapshot]);
  useEffect(() => {
    if (!draftKey || !dirty || loading) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const draft: Draft = { version: 2, savedAt: Date.now(), slides, queries, ...currentStoryFields };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 700);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [currentStoryFields, dirty, draftKey, loading, queries, slides]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const offline = () => { setOnline(false); setNetworkMessage("Нет интернета. Изменения сохранены на телефоне"); };
    const restored = () => { setOnline(true); setNetworkMessage("Интернет восстановлен. Можно сохранить"); };
    window.addEventListener("offline", offline); window.addEventListener("online", restored);
    return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", restored); };
  }, []);

  const payload = useCallback((items = slides) => ({ mapType, targetId, content, slides: items.map(({ text, image_url, credit_line }) => ({ text, image_url, credit_line })) }), [content, mapType, slides, targetId]);
  const saveStory = async () => {
    if (!content.trim() || savingStory) return;
    setSavingStory(true);
    try {
      const data = await fetchJson<StoryResponse>("/api/admin/map-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapType, targetId, content, youtube_url_ru: youtubeUrlRu, youtube_url_he: youtubeUrlHe, youtube_url_en: youtubeUrlEn, google_maps_url: googleMapsUrl }) });
      setStory(data.story);
      const savedFields = { content: data.story?.content ?? "", youtubeUrlRu: data.story?.youtube_url_ru ?? "", youtubeUrlHe: data.story?.youtube_url_he ?? "", youtubeUrlEn: data.story?.youtube_url_en ?? "", googleMapsUrl: data.story?.google_maps_url ?? "" };
      setContent(savedFields.content); setYoutubeUrlRu(savedFields.youtubeUrlRu); setYoutubeUrlHe(savedFields.youtubeUrlHe); setYoutubeUrlEn(savedFields.youtubeUrlEn); setGoogleMapsUrl(savedFields.googleMapsUrl);
      setServerStorySnapshot(storySnapshot(savedFields)); setMessage("Текст и ссылки истории сохранены.");
    } catch { setMessage("Не удалось сохранить текст истории."); }
    finally { setSavingStory(false); setConfirmAction(null); }
  };
  const saveLinks = async () => {
    if (savingLinks) return;
    setSavingLinks(true);
    try {
      const data = await fetchJson<StoryResponse>("/api/admin/map-story", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "links_only", mapType, targetId, youtube_url_ru: youtubeUrlRu, youtube_url_he: youtubeUrlHe, youtube_url_en: youtubeUrlEn, google_maps_url: googleMapsUrl }) });
      setStory(data.story);
      const savedLinks = { youtubeUrlRu: data.story?.youtube_url_ru ?? "", youtubeUrlHe: data.story?.youtube_url_he ?? "", youtubeUrlEn: data.story?.youtube_url_en ?? "", googleMapsUrl: data.story?.google_maps_url ?? "" };
      setYoutubeUrlRu(savedLinks.youtubeUrlRu); setYoutubeUrlHe(savedLinks.youtubeUrlHe); setYoutubeUrlEn(savedLinks.youtubeUrlEn); setGoogleMapsUrl(savedLinks.googleMapsUrl);
      setServerStorySnapshot(storySnapshot({ content: data.story?.content ?? "", ...savedLinks }));
      setMessage("Ссылки истории сохранены.");
    } catch { setMessage("Не удалось сохранить ссылки истории."); }
    finally { setSavingLinks(false); }
  };
  const saveAllSlides = async () => {
    if (savingSlides) return;
    if (!online) { setSaveState("error"); setNetworkMessage("Нет интернета. Изменения сохранены на телефоне"); return; }
    setSavingSlides(true); setSaveState("idle");
    try {
      await fetchJson("/api/admin/map-story-slides/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      setServerSlidesSnapshot(slidesSnapshot(slides)); setSaveState("saved"); setMessage(null); localStorage.removeItem(draftKey);
    } catch { setSaveState("error"); }
    finally { setSavingSlides(false); }
  };
  const reparse = async () => {
    setReparsing(true);
    try {
      await fetchJson("/api/admin/map-story-slides/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapType, targetId, content }) });
      const params = new URLSearchParams({ mapType, targetId });
      const data = await fetchJson<StoryResponse>(`/api/admin/map-story?${params}`);
      setStory(data.story); setSlides(data.slides); setServerSlidesSnapshot(slidesSnapshot(data.slides)); localStorage.removeItem(draftKey);
    }
    catch { setMessage("Не удалось перераспарсить текст."); }
    finally { setReparsing(false); setConfirmAction(null); }
  };
  const autoSelect = async () => {
    setAutoSelectingMedia(true);
    try {
      const next = [...slides];
      for (let index = 0; index < next.length; index += 1) {
        if ((mapType === "flag" && index === 0) || !next[index].text.trim()) continue;
        const result = await fetchJson<{ url: string; creditLine: string }>("/api/admin/resolve-media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slideText: next[index].text, targetId, mapType, existingUrls: next.map((slide) => slide.image_url).filter(Boolean) }) });
        next[index] = { ...next[index], image_url: result.url, credit_line: result.creditLine };
      }
      setSlides(next); setMessage("Медиа подобраны. Проверьте и сохраните изменения.");
    } catch { setMessage("Не удалось подобрать медиа автоматически."); }
    finally { setAutoSelectingMedia(false); setConfirmAction(null); }
  };
  const applyConfirmation = () => {
    if (confirmAction?.kind === "save-story") return void saveStory();
    if (confirmAction?.kind === "reparse") return void reparse();
    if (confirmAction?.kind === "auto") return void autoSelect();
    if (confirmAction?.kind === "remove" && confirmAction.index !== undefined) setSlides((current) => current.map((slide, index) => index === confirmAction.index ? { ...slide, image_url: null, credit_line: null } : slide));
    if (confirmAction?.kind === "delete" && confirmAction.index !== undefined) setSlides((current) => current.filter((_, index) => index !== confirmAction.index));
    setConfirmAction(null); setSaveState("idle");
  };

  if (!sessionChecked) return <p className="map-editor-loading">Проверяем доступ…</p>;
  return (
    <div className="books-admin-page map-editor-page">
      <div className="admin-top-bar"><div className="admin-top-bar__row admin-top-bar__row--right"><AdminLogout /></div><div className="admin-top-bar__row"><AdminTabs /></div></div>
      <header className="map-editor-header"><Link href="/admin/map-targets">← Все карты</Link><h1>{mapType} / {targetId}</h1><p>Изменения сохраняются одной кнопкой на любом слайде.</p></header>
      {networkMessage ? <div className={`map-editor-status ${online ? "is-online" : "is-offline"}`}>{networkMessage}</div> : null}
      {message ? <div className="map-editor-status">{message}</div> : null}
      {loading ? <p>Загрузка…</p> : (
        <>
          <section className="map-editor-story">
            <label><span>Текст истории</span><textarea value={content} onChange={(event) => { setContent(event.target.value); setSaveState("idle"); }} /></label>
            <div className="map-editor-story-links" aria-labelledby="story-links-title">
              <strong id="story-links-title">Ссылки истории</strong>
              <label><span>YouTube RU</span><input value={youtubeUrlRu} onChange={(event) => setYoutubeUrlRu(event.target.value)} /></label>
              <label><span>YouTube HE</span><input value={youtubeUrlHe} onChange={(event) => setYoutubeUrlHe(event.target.value)} /></label>
              <label><span>YouTube EN</span><input value={youtubeUrlEn} onChange={(event) => setYoutubeUrlEn(event.target.value)} /></label>
              <label><span>Google Earth / большая карта Google</span><input value={googleMapsUrl} onChange={(event) => setGoogleMapsUrl(event.target.value)} /></label>
              <button className="map-editor-save-links" type="button" disabled={savingLinks} onClick={() => void saveLinks()}>{savingLinks ? "Сохраняем…" : "Сохранить ссылки"}</button>
            </div>
            <div className="map-editor-story-actions">
              <button type="button" disabled={savingStory || !content.trim()} onClick={() => setConfirmAction({ kind: "save-story" })}>{savingStory ? "Сохраняем…" : "Сохранить текст и ссылки"}</button>
              <button type="button" disabled={reparsing} onClick={() => setConfirmAction({ kind: "reparse" })}>{reparsing ? "Перераспарсиваем…" : "Перераспарсить текст"}</button>
              <button type="button" disabled={autoSelectingMedia} onClick={() => setConfirmAction({ kind: "auto" })}>{autoSelectingMedia ? "Подбираем…" : "Подобрать медиа автоматически"}</button>
            </div>
          </section>
          <section className="map-editor-slides">
            {slides.map((slide, index) => (
              <MapStorySlideEditor key={slideKey(slide, index)} slide={slide} index={index} query={queries[slideKey(slide, index)] ?? ""} locked={mapType === "flag" && index === 0} saving={savingSlides} saveState={saveState}
                onTextChange={(value) => { setSlides((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: value } : item)); setSaveState("idle"); }}
                onQueryChange={(value) => setQueries((current) => ({ ...current, [slideKey(slide, index)]: value }))}
                onSearch={() => setPickerIndex(index)} onRemoveMedia={() => setConfirmAction({ kind: "remove", index })}
                onInsert={() => setSlides((current) => [...current.slice(0, index), { id: `draft-${Date.now()}`, story_id: story?.id ?? null, text: "", image_url: null, credit_line: null }, ...current.slice(index)])}
                onDelete={() => setConfirmAction({ kind: "delete", index })} onSave={() => void saveAllSlides()} />
            ))}
            <button className="map-editor-add-slide" type="button" onClick={() => setSlides((current) => [...current, { id: `draft-${Date.now()}`, story_id: story?.id ?? null, text: "", image_url: null, credit_line: null }])}>+ Добавить слайд</button>
          </section>
        </>
      )}
      {pickerIndex !== null && slides[pickerIndex] ? <MediaPickerModal open slideId={slideKey(slides[pickerIndex], pickerIndex)} query={queries[slideKey(slides[pickerIndex], pickerIndex)] ?? ""} onQueryChange={(value) => setQueries((current) => ({ ...current, [slideKey(slides[pickerIndex], pickerIndex)]: value }))} onClose={() => setPickerIndex(null)} onSelect={async (item: MediaSearchItem) => { setSlides((current) => current.map((slide, index) => index === pickerIndex ? { ...slide, image_url: item.originalUrl, credit_line: item.creditLine } : slide)); setMessage(item.kind === "video" ? "Видео добавлено" : "Изображение добавлено"); setSaveState("idle"); setPickerIndex(null); }} /> : null}
      <ConfirmationDialog open={Boolean(confirmAction)} title={confirmAction?.kind === "save-story" ? "Сохранить текст истории и ссылки?" : confirmAction?.kind === "reparse" ? "Перераспарсить текст истории?" : confirmAction?.kind === "auto" ? "Подобрать медиа автоматически?" : confirmAction?.kind === "delete" ? "Удалить слайд?" : `Удалить ${confirmAction?.index !== undefined && /\.(mp4|webm|mov)(\?.*)?$/i.test(slides[confirmAction.index]?.image_url ?? "") ? "видео" : "изображение"} из этого слайда?`} description={confirmAction?.kind === "save-story" ? "Тексты и медиа уже существующих слайдов останутся без изменений." : confirmAction?.kind === "reparse" ? `${slideTextsDirty ? "Внимание: тексты слайдов отличаются от сохранённой на сервере версии. " : ""}Это действие заново создаст слайды из текста истории наверху и может перезаписать вручную отредактированные тексты слайдов. Текущие изменения в слайдах имеют приоритет. Продолжайте только если действительно хотите заменить их текстом истории.` : confirmAction?.kind === "auto" ? "Автоматический подбор может заменить уже выбранные изображения или видео в слайдах. Тексты слайдов изменяться не будут." : confirmAction?.kind === "delete" ? "Слайд будет убран из локального черновика и исчезнет из базы после сохранения." : "Файл останется во внешнем источнике; из слайда будет удалена только ссылка."} confirmLabel={confirmAction?.kind === "save-story" ? "Сохранить" : confirmAction?.kind === "reparse" ? "Да, перераспарсить" : confirmAction?.kind === "auto" ? "Да, подобрать медиа" : "Удалить"} busy={savingStory || reparsing || autoSelectingMedia} destructive={confirmAction?.kind === "reparse" || confirmAction?.kind === "remove" || confirmAction?.kind === "delete"} onCancel={() => setConfirmAction(null)} onConfirm={applyConfirmation} />
      <ConfirmationDialog open={Boolean(draftCandidate)} title="Найдены несохранённые изменения" description="На этом устройстве есть локальный черновик этой истории." confirmLabel="Восстановить" onCancel={() => { localStorage.removeItem(draftKey); setDraftCandidate(null); }} onConfirm={() => { if (draftCandidate) { setSlides(draftCandidate.slides); setQueries(draftCandidate.queries); setContent(draftCandidate.content); if (draftCandidate.version === 2) { setYoutubeUrlRu(draftCandidate.youtubeUrlRu ?? ""); setYoutubeUrlHe(draftCandidate.youtubeUrlHe ?? ""); setYoutubeUrlEn(draftCandidate.youtubeUrlEn ?? ""); setGoogleMapsUrl(draftCandidate.googleMapsUrl ?? ""); } } setDraftCandidate(null); }} />
    </div>
  );
}
