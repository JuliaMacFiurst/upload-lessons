"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import type { BedtimeStoryLanguage, BedtimeStoryListItem, BedtimeStoryRecord } from "../../lib/bedtime-stories/types";

type StoriesResponse = {
  stories: BedtimeStoryListItem[];
  total: number;
  page: number;
  limit: number;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string; issues?: Array<{ message: string; path: Array<string | number> }> };
  if (!response.ok) {
    const issueText = data.issues?.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(issueText || data.error || "Request failed.");
  }
  return data;
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

const bedtimeStoryJsonTemplate = `{
  "slug": "moon-train-memory",
  "status": "draft",
  "title": {
    "en": "The Moon Train Remembered My Name",
    "ru": "Лунный поезд помнил мое имя",
    "he": "רכבת הירח זכרה את שמי"
  },
  "emotional_theme": {
    "en": "A remembered journey that feels almost real.",
    "ru": "Вспомненное путешествие, которое почти было настоящим.",
    "he": "מסע זכור שמרגיש כמעט אמיתי."
  },
  "collection_tags": ["dream travel", "moon"],
  "visual_tags": ["watercolor", "night train"],
  "instagram_caption": {
    "en": "A tiny bedtime carousel about a soft moon train and the names it keeps.",
    "ru": "Маленькая bedtime-карусель про мягкий лунный поезд и имена, которые он хранит.",
    "he": "קרוסלת לילה קטנה על רכבת ירח רכה והשמות שהיא שומרת."
  },
  "hashtags": ["#bedtimestory", "#illustratedstory", "#laplapla"],
  "slides": [
    {
      "slide_number": 1,
      "text": {
        "en": "I found the moon train waiting where the road became silver.",
        "ru": "Я нашла лунный поезд там, где дорога стала серебряной.",
        "he": "מצאתי את רכבת הירח במקום שבו הדרך הפכה כסופה."
      },
      "illustration_prompt": "watercolor moon train at a quiet silver road, storybook, soft night",
      "stamp_prompt": "tiny moon ticket stamp",
      "marker_prompt": "silver rail marker",
      "image_url": "",
      "layers": []
    }
  ]
}`;

const bedtimeStoryProductionPrompt = `LapLapLa Emotional Bedtime Carousel Stories

Create one Instagram bedtime carousel story as valid JSON only.
Format: 10 slides, emotional illustrated story, primary language English with Russian and Hebrew versions.
Style: remembered dream, emotional travel memory, strange peaceful moment from another world, physical detail plus emotional resonance, unexplained gentle behavior, atmosphere over plot, comfort plus ache, emotional geography, recurring motifs, watercolor storybook illustrations, ending without full resolution.
Canvas intent: 1080 x 1350 Instagram carousel, Amatic text overlay, clean readable text area.
Required JSON fields: title, emotional_theme, collection_tags, visual_tags, instagram_caption, hashtags, slides. Each slide requires slide_number, text.en, text.ru, text.he, illustration_prompt, stamp_prompt, marker_prompt, image_url, layers.`;

function languageAvailability(story: BedtimeStoryListItem) {
  return (["en", "ru", "he"] as BedtimeStoryLanguage[])
    .filter((language) => story.title?.[language])
    .map((language) => language.toUpperCase())
    .join(" / ");
}

function imageStatus(story: BedtimeStoryListItem) {
  const total = story.slides.length || 10;
  const ready = story.slides.filter((slide) => Boolean(slide.image_url)).length;
  return `${ready}/${total}`;
}

export default function BedtimeStoriesAdminPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stories, setStories] = useState<BedtimeStoryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [jsonImportValue, setJsonImportValue] = useState("");
  const [selectedStory, setSelectedStory] = useState<BedtimeStoryRecord | null>(null);
  const [previewLanguage, setPreviewLanguage] = useState<BedtimeStoryLanguage>("en");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");
    if (search.trim()) {
      params.set("q", search.trim());
    }
    return `/api/admin/bedtime-stories?${params.toString()}`;
  }, [page, search]);

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<StoriesResponse>(listUrl);
      setStories(data.stories);
      setTotal(data.total);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadStories();
  }, [sessionChecked, loadStories]);

  const importStory = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>("/api/admin/bedtime-stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: jsonImportValue }),
      });
      setJsonImportValue("");
      setSuccess(`Story created: ${data.story.title.en}`);
      setSelectedStory(data.story);
      await loadStories();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setImporting(false);
    }
  };

  const openPreview = async (storyId: string) => {
    setError(null);
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${storyId}`);
      setSelectedStory(data.story);
      setPreviewLanguage("en");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 10));

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
          <h1 className="books-admin-title">Bedtime Stories</h1>
          <p className="books-admin-subtitle">
            Instagram-oriented bedtime carousel stories: JSON import, R2 images, multilingual captions, and 1080 x 1350 slide preparation.
          </p>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Create from JSON</h2>
            <p className="books-section-help">
              Paste the full generated story JSON. Images can stay empty here and be uploaded per slide in the editor.
            </p>
          </div>
          <div className="books-actions">
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={() => {
                void copyTextToClipboard(bedtimeStoryJsonTemplate);
                setSuccess("Example JSON copied.");
              }}
            >
              Copy JSON example
            </button>
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={() => {
                void copyTextToClipboard(bedtimeStoryProductionPrompt);
                setSuccess("Production prompt copied.");
              }}
            >
              Copy prompt
            </button>
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={importing || !jsonImportValue.trim()}
              onClick={() => {
                void importStory();
              }}
            >
              {importing ? "Creating..." : "Create story"}
            </button>
          </div>
        </div>
        <label className="books-field">
          <span className="books-field__label">Full story JSON</span>
          <textarea
            className="books-input books-input--textarea books-input--json"
            value={jsonImportValue}
            onChange={(event) => setJsonImportValue(event.target.value)}
            placeholder={bedtimeStoryJsonTemplate}
          />
        </label>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Stories</h2>
            <p className="books-section-help">Shows 10 stories per page. Search checks slug and title fields.</p>
          </div>
          <label className="books-field cat-questions-search">
            <span className="books-field__label">Search</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="moon train"
            />
          </label>
        </div>

        <div className="artworks-table-wrap">
          <table className="artworks-table">
            <thead>
              <tr>
                <th>Publish date</th>
                <th>Title</th>
                <th>Status</th>
                <th>Languages</th>
                <th>Images</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="artworks-table__empty-row">Loading...</td>
                </tr>
              ) : stories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="artworks-table__empty-row">No bedtime stories yet.</td>
                </tr>
              ) : (
                stories.map((story) => (
                  <tr key={story.id}>
                    <td>{story.publish_date ? new Date(story.publish_date).toLocaleDateString("en-US") : "—"}</td>
                    <td>
                      <strong>{story.title.en}</strong>
                      <br />
                      <small>{story.slug}</small>
                    </td>
                    <td>{story.is_published ? "published" : story.status}</td>
                    <td>{languageAvailability(story)}</td>
                    <td>{imageStatus(story)}</td>
                    <td>{story.created_at ? new Date(story.created_at).toLocaleDateString("en-US") : "—"}</td>
                    <td>
                      <Link href={`/admin/bedtime-stories/${story.id}`} className="books-button books-button--secondary">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={() => {
                          void openPreview(story.id);
                        }}
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="books-actions cat-questions-pagination">
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Back
          </button>
          <span className="books-field__help">
            Page {page} of {totalPages}, total {total}
          </span>
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      </section>

      {selectedStory ? (
        <section className="books-panel">
          <div className="books-section-head">
            <div>
              <h2 className="books-panel__title">Carousel preview</h2>
              <p className="books-section-help">Quick check before opening the full editor.</p>
            </div>
            <div className="books-actions">
              {(["en", "ru", "he"] as BedtimeStoryLanguage[]).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={previewLanguage === language ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setPreviewLanguage(language)}
                >
                  {language.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="bedtime-slide-strip">
            {selectedStory.slides.map((slide) => (
              <article key={slide.slide_number} className="bedtime-mini-slide" dir={previewLanguage === "he" ? "rtl" : "ltr"}>
                {slide.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.image_url} alt="" />
                ) : (
                  <div className="bedtime-mini-slide__empty">image</div>
                )}
                <div className="bedtime-mini-slide__text">{slide.text[previewLanguage]}</div>
                <span>{String(slide.slide_number).padStart(2, "0")}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
