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
type ConfirmAction = { kind: "reparse" | "auto" | "remove" | "delete"; index?: number } | null;
type Draft = { version: 1; savedAt: number; slides: EditableMapSlide[]; queries: Record<string, string>; content: string };

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: "include" });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Не удалось выполнить действие.");
  return data;
}

function snapshot(slides: EditableMapSlide[], content: string) {
  return JSON.stringify({ slides: slides.map(({ text, image_url, credit_line }) => ({ text, image_url, credit_line })), content });
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
  const [slides, setSlides] = useState<EditableMapSlide[]>([]);
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [serverSnapshot, setServerSnapshot] = useState("");
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
  const dirty = useMemo(() => Boolean(serverSnapshot) && snapshot(slides, content) !== serverSnapshot, [content, serverSnapshot, slides]);

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
      setServerSnapshot(snapshot(data.slides, data.story?.content ?? ""));
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
      if (draft.version === 1 && snapshot(draft.slides, draft.content) !== serverSnapshot) setDraftCandidate(draft);
    } catch { localStorage.removeItem(draftKey); }
  }, [draftKey, loading, serverSnapshot]);
  useEffect(() => {
    if (!draftKey || !dirty || loading) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const draft: Draft = { version: 1, savedAt: Date.now(), slides, queries, content };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 700);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [content, dirty, draftKey, loading, queries, slides]);
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
      setStory(data.story); setMessage("Текст и ссылки истории сохранены.");
    } catch { setMessage("Не удалось сохранить текст истории."); }
    finally { setSavingStory(false); }
  };
  const saveAllSlides = async () => {
    if (savingSlides) return;
    if (!online) { setSaveState("error"); setNetworkMessage("Нет интернета. Изменения сохранены на телефоне"); return; }
    setSavingSlides(true); setSaveState("idle");
    try {
      await fetchJson("/api/admin/map-story-slides/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      setServerSnapshot(snapshot(slides, content)); setSaveState("saved"); setMessage(null); localStorage.removeItem(draftKey);
    } catch { setSaveState("error"); }
    finally { setSavingSlides(false); }
  };
  const reparse = async () => {
    setReparsing(true);
    try { await fetchJson("/api/admin/map-story-slides/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mapType, targetId, content }) }); await load(); localStorage.removeItem(draftKey); }
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
          <section className="map-editor-story"><label><span>Текст истории</span><textarea value={content} onChange={(event) => { setContent(event.target.value); setSaveState("idle"); }} /></label><details><summary>Дополнительные ссылки истории</summary><div className="map-editor-story-links"><label><span>YouTube RU</span><input value={youtubeUrlRu} onChange={(event) => setYoutubeUrlRu(event.target.value)} /></label><label><span>YouTube HE</span><input value={youtubeUrlHe} onChange={(event) => setYoutubeUrlHe(event.target.value)} /></label><label><span>YouTube EN</span><input value={youtubeUrlEn} onChange={(event) => setYoutubeUrlEn(event.target.value)} /></label><label><span>Google Maps</span><input value={googleMapsUrl} onChange={(event) => setGoogleMapsUrl(event.target.value)} /></label></div></details><div><button type="button" disabled={savingStory || !content.trim()} onClick={() => void saveStory()}>{savingStory ? "Сохраняем…" : "Сохранить текст и ссылки"}</button><button type="button" disabled={reparsing} onClick={() => setConfirmAction({ kind: "reparse" })}>{reparsing ? "Перераспарсиваем…" : "Перераспарсить текст"}</button><button type="button" disabled={autoSelectingMedia} onClick={() => setConfirmAction({ kind: "auto" })}>{autoSelectingMedia ? "Подбираем…" : "Подобрать медиа автоматически"}</button></div></section>
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
      <ConfirmationDialog open={Boolean(confirmAction)} title={confirmAction?.kind === "reparse" ? "Перераспарсить текст?" : confirmAction?.kind === "auto" ? "Подобрать медиа автоматически?" : confirmAction?.kind === "delete" ? "Удалить слайд?" : `Удалить ${confirmAction?.index !== undefined && /\.(mp4|webm|mov)(\?.*)?$/i.test(slides[confirmAction.index]?.image_url ?? "") ? "видео" : "изображение"} из этого слайда?`} description={confirmAction?.kind === "reparse" ? "Текущая структура слайдов и несохранённые ручные изменения могут быть заменены." : confirmAction?.kind === "auto" ? "Существующие медиа в слайдах могут быть заменены." : confirmAction?.kind === "delete" ? "Слайд будет убран из локального черновика и исчезнет из базы после сохранения." : "Файл останется во внешнем источнике; из слайда будет удалена только ссылка."} confirmLabel={confirmAction?.kind === "reparse" ? "Перераспарсить" : confirmAction?.kind === "auto" ? "Подобрать" : "Удалить"} busy={reparsing || autoSelectingMedia} destructive={confirmAction?.kind === "remove" || confirmAction?.kind === "delete"} onCancel={() => setConfirmAction(null)} onConfirm={applyConfirmation} />
      <ConfirmationDialog open={Boolean(draftCandidate)} title="Найдены несохранённые изменения" description="На этом устройстве есть локальный черновик этой истории." confirmLabel="Восстановить" onCancel={() => { localStorage.removeItem(draftKey); setDraftCandidate(null); }} onConfirm={() => { if (draftCandidate) { setSlides(draftCandidate.slides); setQueries(draftCandidate.queries); setContent(draftCandidate.content); } setDraftCandidate(null); }} />
    </div>
  );
}
