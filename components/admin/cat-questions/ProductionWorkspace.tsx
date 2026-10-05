import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
  buildProductionBrief,
  calculateNarrationReadiness,
  type CatQuestionProductionManifest,
  type NarrationAsset,
  type VoiceProcessingSettings,
} from "../../../lib/cat-questions/production";
import { saveDirtyNarrations } from "../../../lib/cat-questions/narration-batch";
import {
  LAPLAPLA_VOICE_PARAMETERS,
  configureStudioRecordingChain,
  pickSupportedAudioRecorderMimeType,
  processLapLapLaVoice,
} from "../../../lib/client/laplapla-voice-processing";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-10000px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read processed audio."));
    reader.readAsDataURL(blob);
  });
}

type RecorderState = "idle" | "requesting" | "recording" | "processing" | "processed_unsaved" | "saving" | "saved" | "failed" | "deleting";
type RecorderHandle = { saveIfDirty: () => Promise<boolean> };
type RecorderSummary = { state: RecorderState; dirty: boolean };

const SlideNarrationRecorder = forwardRef<RecorderHandle, {
  questionId: string;
  slideId: string;
  existing?: NarrationAsset;
  onSaved: (asset: NarrationAsset) => void;
  onDeleted: () => void;
  onStatusChange: (slideId: string, summary: RecorderSummary) => void;
}>(function SlideNarrationRecorder({
  questionId,
  slideId,
  existing,
  onSaved,
  onDeleted,
  onStatusChange,
}, ref) {
  const [state, setState] = useState<RecorderState>("idle");
  const [settings, setSettings] = useState<VoiceProcessingSettings>({ ...DEFAULT_RU_SCIENTIFIC_VOICE_PRESET });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rawBlobRef = useRef<Blob | null>(null);
  const processedBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  }, []);

  const releaseCapture = useCallback(() => {
    rawStreamRef.current?.getTracks().forEach((track) => track.stop());
    processedStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawStreamRef.current = null;
    processedStreamRef.current = null;
    if (contextRef.current) void contextRef.current.close().catch(() => undefined);
    contextRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseCapture();
    if (previewUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewUrlRef.current);
  }, [releaseCapture]);

  const processTake = useCallback(async (blob: Blob, nextSettings: VoiceProcessingSettings) => {
    setState("processing");
    setError(null);
    try {
      const result = await processLapLapLaVoice(blob, nextSettings);
      processedBlobRef.current = result.blob;
      setDurationMs(result.durationMs);
      revokePreview();
      const nextUrl = URL.createObjectURL(result.blob);
      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
      setState("processed_unsaved");
    } catch (processingError) {
      setState("idle");
      setError(processingError instanceof Error ? processingError.message : "Не удалось обработать запись.");
    }
  }, [revokePreview]);

  const startRecording = async () => {
    if (["requesting", "recording", "processing", "saving", "deleting"].includes(state)) return;
    setError(null);
    setState("requesting");
    cancelledRef.current = false;
    rawBlobRef.current = null;
    processedBlobRef.current = null;
    setDurationMs(null);
    revokePreview();
    try {
      if (!window.isSecureContext) throw new Error("Микрофон доступен только через HTTPS или localhost.");
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Этот браузер не поддерживает запись с микрофона.");
      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
        sampleRate: LAPLAPLA_VOICE_PARAMETERS.sampleRate,
      } });
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio не поддерживается этим браузером.");
      const context = new AudioContextClass({ sampleRate: LAPLAPLA_VOICE_PARAMETERS.sampleRate });
      await context.resume();
      const stream = configureStudioRecordingChain(context, rawStream);
      const mimeType = pickSupportedAudioRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 192_000 }) : new MediaRecorder(stream);
      rawStreamRef.current = rawStream;
      processedStreamRef.current = stream;
      contextRef.current = context;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        releaseCapture();
        setState("idle");
        setError("Браузер не смог завершить запись.");
      };
      recorder.onstop = () => {
        const cancelled = cancelledRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        releaseCapture();
        if (cancelled) {
          chunksRef.current = [];
          setState("idle");
          return;
        }
        if (blob.size === 0) {
          setState("idle");
          setError("Запись пуста. Попробуйте ещё раз.");
          return;
        }
        rawBlobRef.current = blob;
        void processTake(blob, settings);
      };
      recorder.start(250);
      setState("recording");
    } catch (recordError) {
      releaseCapture();
      setState("idle");
      const denied = recordError instanceof DOMException && (recordError.name === "NotAllowedError" || recordError.name === "SecurityError");
      setError(denied ? "Доступ к микрофону не разрешён. Разрешите его в настройках браузера." : recordError instanceof Error ? recordError.message : "Не удалось открыть микрофон.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") {
      setState("processing");
      recorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else { releaseCapture(); setState("idle"); }
  };

  const toggleEffect = async (key: keyof VoiceProcessingSettings) => {
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    if (rawBlobRef.current) await processTake(rawBlobRef.current, next);
  };

  const save = async () => {
    if (!processedBlobRef.current) return false;
    setState("saving");
    setError(null);
    try {
      const response = await fetchJson<{ narration: NarrationAsset }>(`/api/admin/cat-questions/${questionId}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideId,
          locale: "ru",
          audioBase64: await blobToDataUrl(processedBlobRef.current),
          mimeType: "audio/wav",
          processingSettings: settings,
        }),
      });
      rawBlobRef.current = null;
      processedBlobRef.current = null;
      chunksRef.current = [];
      revokePreview();
      setState("saved");
      onSaved(response.narration);
      return true;
    } catch (saveError) {
      setState("failed");
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить озвучку.");
      return false;
    }
  };

  useImperativeHandle(ref, () => ({ saveIfDirty: save }));

  useEffect(() => {
    onStatusChange(slideId, { state, dirty: Boolean(processedBlobRef.current) });
  }, [onStatusChange, slideId, state]);

  const deleteSaved = async () => {
    if (!existing || !window.confirm("Удалить сохранённую озвучку?")) return;
    setState("deleting");
    setError(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/cat-questions/${questionId}/narration`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId, locale: "ru" }),
      });
      setState(processedBlobRef.current ? "processed_unsaved" : "idle");
      onDeleted();
    } catch (deleteError) {
      setState(processedBlobRef.current ? "processed_unsaved" : "idle");
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить озвучку.");
    }
  };

  const shownUrl = previewUrl ?? existing?.publicUrl ?? null;
  return (
    <div className="cat-narration-recorder">
      <div className="cat-narration-recorder__status">
        <strong>{existing ? `RU saved: ${(existing.durationMs / 1000).toFixed(1)} сек.` : "RU: нет сохранённой записи"}</strong>
        {existing && <small>SHA {existing.sha256.slice(0, 12)}…</small>}
        {processedBlobRef.current && <small className="cat-narration-unsaved">Новая processed-версия ещё не сохранена</small>}
      </div>
      <div className="books-actions books-actions--compact">
        {state === "recording" ? (
          <>
            <button type="button" className="books-button books-button--primary" onClick={stopRecording}>Остановить</button>
            <button type="button" className="books-button books-button--ghost" onClick={cancelRecording}>Отменить</button>
          </>
        ) : (
          <button type="button" className="books-button books-button--secondary" disabled={["requesting", "processing", "saving", "deleting"].includes(state)} onClick={() => void startRecording()}>
            {state === "requesting" ? "Открываем микрофон…" : existing || rawBlobRef.current ? "Перезаписать" : "Записать"}
          </button>
        )}
      </div>
      {state === "recording" && <div className="cat-narration-recording" role="status">● Идёт запись</div>}
      {state === "processing" && <div className="books-field__help">Обрабатываем запись…</div>}
      {shownUrl && <audio className="cat-narration-audio" src={shownUrl} controls preload="metadata" />}
      {rawBlobRef.current && (
        <>
          <div className="cat-voice-effects" aria-label="Обработка голоса">
            {(["enhance", "louder", "child"] as const).map((key) => (
              <button key={key} type="button" className={`books-button ${settings[key] ? "books-button--primary" : "books-button--ghost"}`} disabled={state === "processing" || state === "saving" || state === "deleting"} onClick={() => void toggleEffect(key)}>
                {settings[key] ? "✓ " : ""}{key === "enhance" ? "Улучшить" : key === "louder" ? "Громче" : "Детский голос"}
              </button>
            ))}
          </div>
          <div className="books-actions books-actions--compact">
            <button type="button" className="books-button books-button--primary" disabled={state === "processing" || state === "saving" || state === "deleting"} onClick={() => void save()}>{state === "saving" ? "Сохранение…" : "Сохранить final audio"}</button>
            {durationMs && <span className="books-field__help">Processed: {(durationMs / 1000).toFixed(1)} сек.</span>}
          </div>
        </>
      )}
      {existing && <button type="button" className="books-button books-button--danger" disabled={state === "saving" || state === "deleting"} onClick={() => void deleteSaved()}>{state === "deleting" ? "Удаление…" : "Удалить saved narration"}</button>}
      {error && <div className="books-alert books-alert--error">{error}</div>}
    </div>
  );
});

export function ProductionWorkspace({ questionId }: { questionId: string }) {
  const [manifest, setManifest] = useState<CatQuestionProductionManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [productionImport, setProductionImport] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [recorderStatuses, setRecorderStatuses] = useState<Record<string, RecorderSummary>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRefs = useRef(new Map<string, RecorderHandle>());
  const endpoint = `/api/admin/cat-questions/${questionId}/production`;

  const load = useCallback(async () => {
    const value = await fetchJson<CatQuestionProductionManifest>(endpoint);
    setManifest(value);
  }, [endpoint]);

  const handleRecorderStatus = useCallback((slideId: string, summary: RecorderSummary) => {
    setRecorderStatuses((current) => current[slideId]?.state === summary.state && current[slideId]?.dirty === summary.dirty
      ? current
      : { ...current, [slideId]: summary });
  }, []);

  useEffect(() => {
    setLoading(true);
    load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError))).finally(() => setLoading(false));
  }, [load]);

  if (loading) return <section className="books-panel">Загрузка production data…</section>;
  if (!manifest) return <section className="books-panel"><div className="books-alert books-alert--error">{error ?? "Production data недоступны."}</div></section>;
  const ru = manifest.readiness.ru ?? { recorded: 0, total: manifest.slides.length, ready: false };

  const updateQuestionDirection = (key: keyof typeof manifest.direction, value: string) => setManifest({ ...manifest, direction: { ...manifest.direction, [key]: value } });
  const updateSceneDirection = (slideId: string, key: keyof (typeof manifest.slides)[number]["direction"], value: string) => setManifest({
    ...manifest,
    slides: manifest.slides.map((slide) => slide.id === slideId ? { ...slide, direction: { ...slide.direction, [key]: value } } : slide),
  });

  const saveDirections = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const updated = await fetchJson<CatQuestionProductionManifest>(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: manifest.direction, slides: manifest.slides.map((slide) => ({ slideId: slide.id, ...slide.direction })) }),
      });
      setManifest(updated); setMessage("Production brief сохранён.");
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : String(saveError)); }
    finally { setSaving(false); }
  };

  const copyBrief = async () => {
    setError(null); setMessage(null);
    try { await copyText(buildProductionBrief(manifest, "ru")); setMessage("Production Brief скопирован."); }
    catch (copyError) { setError(copyError instanceof Error ? copyError.message : "Не удалось скопировать brief."); }
  };

  const copyProductionJson = async () => {
    setError(null); setMessage(null);
    try { await copyText(JSON.stringify(manifest, null, 2)); setMessage("Production JSON скопирован."); }
    catch (copyError) { setError(copyError instanceof Error ? copyError.message : "Не удалось скопировать JSON."); }
  };

  const importProductionBrief = async () => {
    setImporting(true); setError(null); setMessage(null);
    try {
      let brief: unknown;
      try { brief = JSON.parse(productionImport); }
      catch { throw new Error("Production Brief содержит malformed JSON. Проверьте кавычки и запятые."); }
      const updated = await fetchJson<CatQuestionProductionManifest>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      setManifest(updated);
      setProductionImport("");
      setMessage("Production Brief импортирован. Отсутствующие поля сохранены без изменений.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Не удалось импортировать Production Brief.");
    } finally { setImporting(false); }
  };

  const saveAllRecordings = async () => {
    setBatchSaving(true); setBatchMessage(null); setError(null);
    const result = await saveDirtyNarrations(manifest.slides.map((slide) => ({
      slideId: slide.id,
      dirty: Boolean(recorderStatuses[slide.id]?.dirty),
      save: () => recorderRefs.current.get(slide.id)?.saveIfDirty() ?? Promise.resolve(false),
    })));
    setBatchSaving(false);
    if (result.attempted === 0) setBatchMessage("Нет новых processed-записей для сохранения.");
    else if (result.failed.length === 0) setBatchMessage(`${result.saved.length} recordings saved.`);
    else setBatchMessage(`${result.saved.length} saved, ${result.failed.length} failed. Повторите Save All для failed/dirty.`);
  };

  const updateNarrationAsset = (slideId: string, asset?: NarrationAsset) => {
    setManifest((current) => {
      if (!current) return current;
      const slides = current.slides.map((item) => {
        if (item.id !== slideId) return item;
        const narrationAssets = { ...item.narrationAssets };
        if (asset) narrationAssets.ru = asset;
        else delete narrationAssets.ru;
        return { ...item, narrationAssets };
      });
      return { ...current, slides, readiness: calculateNarrationReadiness(slides, current.locales) };
    });
  };

  const dirtyCount = Object.values(recorderStatuses).filter((status) => status.dirty).length;
  const failedCount = Object.values(recorderStatuses).filter((status) => status.state === "failed").length;

  return (
    <>
      <section className="books-panel">
        <div className="books-section-head">
          <div><h2 className="books-panel__title">Video Production Brief</h2><p className="books-section-help">Все поля необязательны. Сценарий остаётся в существующих слайдах.</p></div>
          <div className="cat-readiness" data-ready={ru.ready}>{ru.ready ? "RU narration: READY" : `RU narration: ${ru.recorded} / ${ru.total}`}</div>
        </div>
        <div className="books-grid books-grid--2">
          {([
            ["videoConcept", "Концепция видео"], ["productionMode", "Production mode"], ["overallVisualDirection", "Общее визуальное направление"],
            ["mood", "Mood"], ["pacing", "Pacing"], ["musicDirection", "Music direction"], ["continuityIdea", "Continuity idea"], ["productionNotes", "Заметки Production Director"],
          ] as const).map(([key, label]) => <label className="books-field" key={key}><span className="books-field__label">{label}</span><textarea className="books-input books-input--textarea books-input--small-textarea" value={manifest.direction[key] ?? ""} onChange={(event) => updateQuestionDirection(key, event.target.value)} /></label>)}
        </div>
        <div className="books-actions"><button type="button" className="books-button books-button--primary" disabled={saving} onClick={() => void saveDirections()}>{saving ? "Сохранение…" : "Сохранить production direction"}</button><button type="button" className="books-button books-button--secondary" onClick={() => void copyBrief()}>Copy Production Brief</button><button type="button" className="books-button books-button--ghost" onClick={() => void copyProductionJson()}>Copy Production JSON</button></div>
        <details className="cat-production-import">
          <summary>Import Production Brief</summary>
          <p className="books-section-help">Отдельный JSON для режиссуры. Он не изменяет question JSON или локализованные тексты. Можно импортировать только нужные поля.</p>
          <textarea className="books-input books-input--textarea cat-production-import__textarea" value={productionImport} onChange={(event) => setProductionImport(event.target.value)} placeholder={'{"production":{"video_concept":"..."},"slides":[{"slide_number":1,"visual_idea":"..."}]}'} />
          <div className="books-actions"><button type="button" className="books-button books-button--secondary" disabled={importing || !productionImport.trim()} onClick={() => void importProductionBrief()}>{importing ? "Импорт…" : "Import Production Brief"}</button></div>
        </details>
        {message && <div className="books-alert books-alert--success">{message}</div>}
        {error && <div className="books-alert books-alert--error">{error}</div>}
      </section>

      <section className="books-panel">
        <div className="books-section-head"><div><h2 className="books-panel__title">Озвучка и режиссура по слайдам</h2><p className="books-section-help">Raw take живёт только в памяти вкладки до успешного сохранения final WAV.</p></div></div>
        <div className="cat-narration-batch" role="status">
          <strong>RU Narration: {ru.recorded} / {ru.total} saved</strong>
          <span>{dirtyCount} unsaved{failedCount ? ` · ${failedCount} failed` : ""}</span>
          <button type="button" className="books-button books-button--primary" disabled={batchSaving || dirtyCount === 0} onClick={() => void saveAllRecordings()}>{batchSaving ? "Сохраняем…" : failedCount ? "Retry failed / Save All" : "Save All Recordings"}</button>
        </div>
        {batchMessage && <div className={failedCount ? "books-alert books-alert--error" : "books-alert books-alert--success"}>{batchMessage}</div>}
        <div className="cat-production-scenes">
          {manifest.slides.map((slide) => (
            <article className="cat-production-scene" key={slide.id}>
              <div><strong>Слайд {slide.order}</strong><p>{slide.narrationText.ru}</p><small>{slide.id}</small></div>
              <SlideNarrationRecorder
                ref={(handle) => { if (handle) recorderRefs.current.set(slide.id, handle); else recorderRefs.current.delete(slide.id); }}
                questionId={questionId}
                slideId={slide.id}
                existing={slide.narrationAssets.ru}
                onSaved={(asset) => {
                  updateNarrationAsset(slide.id, asset);
                  setMessage(`Озвучка слайда ${slide.order} сохранена.`);
                }}
                onDeleted={() => { updateNarrationAsset(slide.id); setMessage(`Озвучка слайда ${slide.order} удалена.`); }}
                onStatusChange={handleRecorderStatus}
              />
              <details className="cat-scene-direction"><summary>Scene direction (необязательно)</summary><div className="books-grid books-grid--2">
                {([
                  ["sceneIntent", "Scene intent"], ["visualIdea", "Visual idea"], ["importantConstraints", "Important constraints"], ["thingsToAvoid", "Things to avoid"],
                  ["assetSearchHints", "Asset/search hints"], ["visualStyleHint", "Visual style hint"], ["continuityTransitionHint", "Continuity/transition"], ["generationNotes", "Generation notes"], ["productionNotes", "Additional notes"],
                ] as const).map(([key, label]) => <label className="books-field" key={key}><span className="books-field__label">{label}</span><textarea className="books-input books-input--textarea books-input--small-textarea" value={slide.direction[key] ?? ""} onChange={(event) => updateSceneDirection(slide.id, key, event.target.value)} /></label>)}
              </div></details>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
