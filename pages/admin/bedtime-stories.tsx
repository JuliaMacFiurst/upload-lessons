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
      "illustration_prompt": "watercolor moon train at a quiet silver road, storybook, soft night, asymmetrical composition, illustration occupies only the left side, large untouched blank watercolor paper space on the right side for text, vertical 4:5 aspect ratio",
      "stamp_prompt": "tiny moon ticket stamp",
      "marker_prompt": "silver rail marker",
      "image_url": "",
      "layers": []
    }
  ]
}`;

const bedtimeStoryProductionPrompt = `# LapLapLa Emotional Bedtime Story Prompt

Create a short bedtime carousel story for Instagram.

The story should feel like:
- a remembered dream
- an emotional travel memory
- a peaceful strange moment from another world
- a quiet emotional refuge before sleep

The story must combine:

1. Physical detail  
(real places, weather, sounds, textures, geography, objects)

2. Emotional resonance  
(a feeling reflected through the environment)

3. Unexplained strange behavior of the world  
(the world behaves emotionally, poetically, or mysteriously without explanation)

The mysteries should NEVER be fully explained.

The atmosphere is more important than plot.

---

# Emotional Tone

The story should feel:
- emotionally comforting
- quiet
- cinematic
- dreamy
- intimate
- slightly melancholic
- peaceful
- emotionally immersive
- warm but lonely

The story should NOT feel:
- childish
- loud
- comedic
- motivational
- hyperactive
- horror-focused
- overexplained
- fake-deep
- AI-generated

---

# Audience

The audience:
- emotionally tired adults
- teenagers who love atmospheric worlds
- people who save comforting nighttime content
- lovers of cozy fantasy
- lovers of illustrated books
- lovers of emotional travel aesthetics
- people who enjoy quiet emotional internet spaces

---

# Writing Style

The prose should feel like:
- emotional travel literature
- fragments from a dream journal
- poetic geography
- magical realism written softly
- emotional memories attached to places

Writing style rules:
- simple English
- short emotionally visual sentences
- minimal exposition
- no long dialogue
- no moral lessons
- no direct explanation of emotions

The writing should leave emotional space for the reader.

---

# Emotional Structure

The pacing should feel like:

1. emotional interruption
2. immersion into atmosphere
3. strange emotional detail
4. quiet emotional realization
5. lingering emotional ending

The story should breathe slowly.

---

# Story Themes

Possible themes:
- homesickness
- wandering
- memory
- emotional distance
- quiet wonder
- peaceful loneliness
- strange comfort
- longing
- forgotten places
- nighttime travel
- oceans
- trains
- forests
- islands
- observatories
- volcanoes
- sleeping cities
- distant lights
- rain
- stars

---

# Important Rules

Avoid:
- generic fantasy writing
- generic poetic quotes
- abstract emotional language without physical grounding
- excessive plot
- dramatic twists
- action-heavy storytelling

Always anchor emotions inside physical sensory reality.

GOOD:
“The train windows trembled softly during the storm.”

BAD:
“Sadness floated through the night.”

GOOD:
“The ocean sounded warmer near homesick travelers.”

BAD:
“The ocean understood sadness.”

---

# Ending Style

The ending should feel:
- emotionally open
- dreamlike
- quietly unresolved
- lingering
- reflective

The final emotion should feel like:
waking slowly from a beautiful strange dream.

---

# Output Format

Return:
- title
- emotional theme
- 6–8 short slides

Each slide should contain:
- one short emotional sentence
- one clear emotional image or feeling
- one illustration_prompt ending exactly with: "asymmetrical composition, illustration occupies only the left side, large untouched blank watercolor paper space on the right side for text, vertical 4:5 aspect ratio"

Also return one stamp_prompt for the first slide only.
The stamp_prompt should describe a small stamp that looks like a natural ink impression on watercolor paper: slightly aged, softly blurred, not digital-clean, and containing one recognizable detail from the specific story. If the story is about countries or travel, the stamp may include the word "countries" plus one concrete visual clue from the story.
Do not add stamp prompts to slides after the first slide.

The result should feel:
saveable, emotionally immersive, and quietly unforgettable.`;

function languageAvailability(story: BedtimeStoryListItem) {
  return (["en", "ru", "he"] as BedtimeStoryLanguage[])
    .filter((language) => story.title?.[language])
    .map((language) => language.toUpperCase())
    .join(" / ");
}

function imageStatus(story: BedtimeStoryListItem) {
  const total = story.slides.length;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  const deleteStory = async (story: BedtimeStoryListItem) => {
    const confirmed = window.confirm(`Delete bedtime story "${story.title.en || story.slug}" from the database? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(story.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/bedtime-stories/${story.id}`, { method: "DELETE" });
      if (selectedStory?.id === story.id) {
        setSelectedStory(null);
      }
      setSuccess(`Deleted story: ${story.title.en || story.slug}`);
      await loadStories();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setDeletingId(null);
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
                        disabled={deletingId === story.id}
                        onClick={() => {
                          void openPreview(story.id);
                        }}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="books-button books-button--danger"
                        disabled={deletingId === story.id}
                        onClick={() => {
                          void deleteStory(story);
                        }}
                      >
                        {deletingId === story.id ? "Deleting..." : "Delete"}
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
