"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type {
  BedtimeStoryAsset,
  BedtimeStoryLanguage,
  BedtimeStoryPayload,
  BedtimeStoryRecord,
  BedtimeStorySlide,
  BedtimeStoryStatus,
} from "../../../lib/bedtime-stories/types";

const LANGUAGES: BedtimeStoryLanguage[] = ["en", "ru", "he"];
const STATUSES: BedtimeStoryStatus[] = ["draft", "ready", "exported", "scheduled", "published", "archived"];

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string; issues?: Array<{ message: string; path: Array<string | number> }> };
  if (!response.ok) {
    const issueText = data.issues?.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(issueText || data.error || "Request failed.");
  }
  return data;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image blob."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function storyToPayload(story: BedtimeStoryRecord): BedtimeStoryPayload {
  return {
    slug: story.slug,
    status: story.status,
    title: story.title,
    emotional_theme: story.emotional_theme,
    full_json: {
      ...story.full_json,
      title: story.title,
      emotional_theme: story.emotional_theme,
      collection_tags: story.collection_tags,
      visual_tags: story.visual_tags,
      instagram_caption: story.instagram_caption,
      hashtags: story.instagram_hashtags,
      slides: story.slides,
    },
    slides: story.slides,
    images: story.images,
    cover_image_url: story.cover_image_url,
    instagram_caption: story.instagram_caption,
    instagram_hashtags: story.instagram_hashtags,
    collection_tags: story.collection_tags,
    visual_tags: story.visual_tags,
    stamp_assets: story.stamp_assets,
    marker_assets: story.marker_assets,
    exported_image_urls: story.exported_image_urls,
    publish_date: story.publish_date,
    is_published: story.is_published,
  };
}

function captionText(story: BedtimeStoryRecord, language: BedtimeStoryLanguage) {
  return [story.instagram_caption[language], story.instagram_hashtags.join(" ")].filter(Boolean).join("\n\n");
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function SlideCanvas({
  slide,
  language,
  stamps,
  markers,
  captureRef,
}: {
  slide: BedtimeStorySlide;
  language: BedtimeStoryLanguage;
  stamps: BedtimeStoryAsset[];
  markers: BedtimeStoryAsset[];
  captureRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={captureRef} className="bedtime-canvas" dir={language === "he" ? "rtl" : "ltr"}>
      {slide.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.image_url} alt="" className="bedtime-canvas__image" />
      ) : (
        <div className="bedtime-canvas__empty">Upload slide image</div>
      )}
      {slide.slide_number === 1 ? (
        <div className="bedtime-canvas__assets" aria-hidden="true">
          {[...stamps.slice(0, 3), ...markers.slice(0, 2)].map((asset) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={asset.id} src={asset.url} alt="" />
          ))}
        </div>
      ) : null}
      <div className="bedtime-canvas__text">{slide.text[language]}</div>
      <div className="bedtime-canvas__brand">LapLapLa</div>
      <div className="bedtime-canvas__number">{String(slide.slide_number).padStart(2, "0")}</div>
    </div>
  );
}

export default function BedtimeStoryEditorPage() {
  const router = useRouter();
  const storyId = typeof router.query.story_id === "string" ? router.query.story_id : "";
  const supabase = createClientComponentClient();
  const slideRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [sessionChecked, setSessionChecked] = useState(false);
  const [story, setStory] = useState<BedtimeStoryRecord | null>(null);
  const [language, setLanguage] = useState<BedtimeStoryLanguage>("en");
  const [activeSlide, setActiveSlide] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadStory = useCallback(async () => {
    if (!storyId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${storyId}`);
      setStory(data.story);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    if (!sessionChecked || !storyId) {
      return;
    }
    void loadStory();
  }, [sessionChecked, storyId, loadStory]);

  const selectedSlide = useMemo(
    () => story?.slides.find((slide) => slide.slide_number === activeSlide) ?? story?.slides[0] ?? null,
    [story, activeSlide],
  );

  const updateStory = (updater: (current: BedtimeStoryRecord) => BedtimeStoryRecord) => {
    setStory((current) => (current ? updater(current) : current));
  };

  const saveStory = async (nextStory = story) => {
    if (!nextStory) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${nextStory.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: storyToPayload(nextStory) }),
      });
      setStory(data.story);
      setSuccess("Story saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const uploadMedia = async (kind: "slide" | "stamp" | "marker", file: File | null, slideNumber?: number) => {
    if (!story || !file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Only image files can be uploaded.");
      return;
    }

    setUploading(kind === "slide" ? `slide-${slideNumber}` : kind);
    setError(null);
    setSuccess(null);
    try {
      const imageBase64 = await blobToDataUrl(file);
      const data = await fetchJson<{ publicUrl: string; story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${story.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          language,
          slideNumber,
          imageBase64,
          fileName: file.name,
        }),
      });
      setStory(data.story);
      setSuccess(`Uploaded: ${data.publicUrl}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(null);
    }
  };

  const deleteStory = async () => {
    if (!story) {
      return;
    }
    const confirmed = window.confirm(`Delete bedtime story "${story.title.en || story.slug}" from the database? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/bedtime-stories/${story.id}`, { method: "DELETE" });
      await router.push("/admin/bedtime-stories");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  const renderSlideBlob = async (slideNumber: number): Promise<Blob> => {
    const node = slideRefs.current[slideNumber];
    if (!node) {
      throw new Error(`Slide ${slideNumber} is not available.`);
    }

    await document.fonts.ready;
    await nextAnimationFrame();
    const rect = node.getBoundingClientRect();
    const scale = 1080 / rect.width;
    const blob = await toBlob(node, {
      cacheBust: true,
      includeQueryParams: true,
      pixelRatio: scale,
      backgroundColor: "#fff8ed",
    });
    if (!blob) {
      throw new Error("Failed to export slide PNG.");
    }
    return blob;
  };

  const downloadSlides = async (slideNumbers: number[]) => {
    if (!story) {
      return;
    }
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      for (const slideNumber of slideNumbers) {
        setActiveSlide(slideNumber);
        await nextAnimationFrame();
        const blob = await renderSlideBlob(slideNumber);
        downloadBlob(blob, `${story.slug}-${language}-slide-${String(slideNumber).padStart(2, "0")}.png`);
      }
      setSuccess(`Downloaded ${slideNumbers.length} PNG slide(s).`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setExporting(false);
    }
  };

  const uploadExports = async (slideNumbers: number[]) => {
    if (!story) {
      return;
    }
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      let currentStory = story;
      await saveStory(currentStory);
      for (const slideNumber of slideNumbers) {
        setActiveSlide(slideNumber);
        await nextAnimationFrame();
        const blob = await renderSlideBlob(slideNumber);
        const imageBase64 = await blobToDataUrl(blob);
        const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${currentStory.id}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            slideNumber,
            contentType: "image/png",
            imageBase64,
          }),
        });
        currentStory = data.story;
        setStory(data.story);
      }
      setSuccess(`Uploaded ${slideNumbers.length} exported PNG slide(s) to R2.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="books-admin-page bedtime-admin-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <header className="books-admin-header">
        <div>
          <h1 className="books-admin-title">{story?.title.en ?? "Bedtime Story"}</h1>
          <p className="books-admin-subtitle">
            Instagram carousel editor for 1080 x 1350 slides. Images and exports use `bedtime_story/{story?.slug || "slug"}/...` in R2.
          </p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--ghost"
            onClick={() => {
              void router.push("/admin/bedtime-stories");
            }}
          >
            Back to list
          </button>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={!story || saving || exporting || deleting}
            onClick={() => {
              void saveStory();
            }}
          >
            {saving ? "Saving..." : "Save story"}
          </button>
          <button
            type="button"
            className="books-button books-button--danger"
            disabled={!story || deleting || saving || exporting}
            onClick={() => {
              void deleteStory();
            }}
          >
            {deleting ? "Deleting..." : "Delete story"}
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}
      {loading && <div className="books-panel">Loading...</div>}

      {story ? (
        <>
          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Story metadata</h2>
                <p className="books-section-help">English stays primary for Instagram; Russian and Hebrew are stored in the same story record.</p>
              </div>
              <div className="books-actions">
                {LANGUAGES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={language === item ? "books-button books-button--primary" : "books-button books-button--ghost"}
                    onClick={() => setLanguage(item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="books-grid books-grid--3">
              <label className="books-field">
                <span className="books-field__label">Slug</span>
                <input
                  className="books-input"
                  value={story.slug}
                  onChange={(event) => updateStory((current) => ({ ...current, slug: event.target.value }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Status</span>
                <select
                  className="books-input"
                  value={story.status}
                  onChange={(event) => updateStory((current) => ({ ...current, status: event.target.value as BedtimeStoryStatus }))}
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="books-field">
                <span className="books-field__label">Publish date</span>
                <input
                  className="books-input"
                  type="datetime-local"
                  value={story.publish_date ? story.publish_date.slice(0, 16) : ""}
                  onChange={(event) => updateStory((current) => ({ ...current, publish_date: event.target.value || null }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Title {language.toUpperCase()}</span>
                <input
                  className="books-input"
                  value={story.title[language]}
                  onChange={(event) => updateStory((current) => ({ ...current, title: { ...current.title, [language]: event.target.value } }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Theme {language.toUpperCase()}</span>
                <input
                  className="books-input"
                  value={story.emotional_theme[language]}
                  onChange={(event) => updateStory((current) => ({ ...current, emotional_theme: { ...current.emotional_theme, [language]: event.target.value } }))}
                />
              </label>
              <label className="books-checkbox books-checkbox--inline">
                <input
                  type="checkbox"
                  checked={story.is_published}
                  onChange={(event) => updateStory((current) => ({ ...current, is_published: event.target.checked }))}
                />
                <span>Published on LapLapLa</span>
              </label>
              <label className="books-field books-field--wide">
                <span className="books-field__label">Instagram caption {language.toUpperCase()}</span>
                <textarea
                  className="books-input books-input--textarea"
                  value={story.instagram_caption[language]}
                  onChange={(event) => updateStory((current) => ({
                    ...current,
                    instagram_caption: { ...current.instagram_caption, [language]: event.target.value },
                  }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Hashtags</span>
                <textarea
                  className="books-input books-input--small-textarea"
                  value={story.instagram_hashtags.join("\n")}
                  onChange={(event) => updateStory((current) => ({
                    ...current,
                    instagram_hashtags: event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
                  }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Collection tags</span>
                <textarea
                  className="books-input books-input--small-textarea"
                  value={story.collection_tags.join("\n")}
                  onChange={(event) => updateStory((current) => ({
                    ...current,
                    collection_tags: event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
                  }))}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Visual tags</span>
                <textarea
                  className="books-input books-input--small-textarea"
                  value={story.visual_tags.join("\n")}
                  onChange={(event) => updateStory((current) => ({
                    ...current,
                    visual_tags: event.target.value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
                  }))}
                />
              </label>
            </div>
            <div className="books-actions">
              <button
                type="button"
                className="books-button books-button--secondary"
                onClick={() => {
                  void copyTextToClipboard(captionText(story, language));
                  setSuccess("Caption copied.");
                }}
              >
                Copy caption
              </button>
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={exporting}
                onClick={() => {
                  void downloadSlides([activeSlide]);
                }}
              >
                Download current PNG
              </button>
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={exporting}
                onClick={() => {
                  void downloadSlides(story.slides.map((slide) => slide.slide_number));
                }}
              >
                Download all PNG
              </button>
              <button
                type="button"
                className="books-button books-button--success"
                disabled={exporting}
                onClick={() => {
                  void uploadExports([activeSlide]);
                }}
              >
                Upload current export
              </button>
              <button
                type="button"
                className="books-button books-button--success"
                disabled={exporting}
                onClick={() => {
                  void uploadExports(story.slides.map((slide) => slide.slide_number));
                }}
              >
                Upload all exports
              </button>
              <button type="button" className="books-button books-button--ghost" disabled title="Layered Procreate export is planned for the next iteration.">
                Export layered folder
              </button>
            </div>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Slide editor</h2>
                <p className="books-section-help">Upload a background image per slide. The preview and PNG export share this same 4:5 layout.</p>
              </div>
            </div>
            <div className="bedtime-editor-grid">
              <aside className="bedtime-slide-list">
                {story.slides.map((slide) => (
                  <button
                    key={slide.slide_number}
                    type="button"
                    className={activeSlide === slide.slide_number ? "bedtime-slide-button bedtime-slide-button--active" : "bedtime-slide-button"}
                    onClick={() => setActiveSlide(slide.slide_number)}
                  >
                    <span>{String(slide.slide_number).padStart(2, "0")}</span>
                    <strong>{slide.image_url ? "Image ready" : "Missing image"}</strong>
                    <small>{slide.text[language]}</small>
                  </button>
                ))}
              </aside>
              <div className="bedtime-preview-column">
                {selectedSlide ? (
                  <SlideCanvas
                    slide={selectedSlide}
                    language={language}
                    stamps={story.stamp_assets}
                    markers={story.marker_assets}
                    captureRef={(node) => {
                      slideRefs.current[selectedSlide.slide_number] = node;
                    }}
                  />
                ) : null}
              </div>
              <div className="bedtime-slide-tools">
                {selectedSlide ? (
                  <>
                    <label className="books-field">
                      <span className="books-field__label">Slide image</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploading !== null}
                        onChange={(event) => {
                          void uploadMedia("slide", event.target.files?.[0] ?? null, selectedSlide.slide_number);
                          event.currentTarget.value = "";
                        }}
                      />
                      <span className="books-field__help">R2: bedtime_story/{story.slug}/{language}/slide-{String(selectedSlide.slide_number).padStart(2, "0")}.webp</span>
                    </label>
                    <label className="books-field">
                      <span className="books-field__label">Text {language.toUpperCase()}</span>
                      <textarea
                        className="books-input books-input--textarea"
                        value={selectedSlide.text[language]}
                        onChange={(event) => updateStory((current) => ({
                          ...current,
                          slides: current.slides.map((slide) => (
                            slide.slide_number === selectedSlide.slide_number
                              ? { ...slide, text: { ...slide.text, [language]: event.target.value } }
                              : slide
                          )),
                        }))}
                      />
                    </label>
                    <label className="books-field">
                      <span className="books-field__label">Illustration prompt</span>
                      <textarea
                        className="books-input books-input--small-textarea"
                        value={selectedSlide.illustration_prompt}
                        onChange={(event) => updateStory((current) => ({
                          ...current,
                          slides: current.slides.map((slide) => (
                            slide.slide_number === selectedSlide.slide_number
                              ? { ...slide, illustration_prompt: event.target.value }
                              : slide
                          )),
                        }))}
                      />
                    </label>
                    <label className="books-field">
                      <span className="books-field__label">Stamp prompt</span>
                      <input
                        className="books-input"
                        value={selectedSlide.stamp_prompt}
                        onChange={(event) => updateStory((current) => ({
                          ...current,
                          slides: current.slides.map((slide) => (
                            slide.slide_number === selectedSlide.slide_number
                              ? { ...slide, stamp_prompt: event.target.value }
                              : slide
                          )),
                        }))}
                      />
                    </label>
                    <label className="books-field">
                      <span className="books-field__label">Marker prompt</span>
                      <input
                        className="books-input"
                        value={selectedSlide.marker_prompt}
                        onChange={(event) => updateStory((current) => ({
                          ...current,
                          slides: current.slides.map((slide) => (
                            slide.slide_number === selectedSlide.slide_number
                              ? { ...slide, marker_prompt: event.target.value }
                              : slide
                          )),
                        }))}
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Stamps and markers</h2>
                <p className="books-section-help">Small collectable visual assets are attached to this story and shown on the first slide.</p>
              </div>
              <div className="books-actions">
                <label className="books-button books-button--secondary">
                  Upload stamp
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={uploading !== null}
                    onChange={(event) => {
                      void uploadMedia("stamp", event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <label className="books-button books-button--secondary">
                  Upload marker
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={uploading !== null}
                    onChange={(event) => {
                      void uploadMedia("marker", event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <div className="bedtime-asset-grid">
              {[...story.stamp_assets, ...story.marker_assets].map((asset) => (
                <article key={asset.id} className="bedtime-asset-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.url} alt="" />
                  <strong>{asset.name}</strong>
                  <small>{asset.kind}</small>
                </article>
              ))}
              {story.stamp_assets.length + story.marker_assets.length === 0 ? (
                <p className="books-section-help">No stamp or marker assets uploaded yet.</p>
              ) : null}
            </div>
          </section>

          <div className="bedtime-export-bank" aria-hidden="true">
            {story.slides.map((slide) => (
              <SlideCanvas
                key={slide.slide_number}
                slide={slide}
                language={language}
                stamps={story.stamp_assets}
                markers={story.marker_assets}
                captureRef={(node) => {
                  slideRefs.current[slide.slide_number] = node;
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
