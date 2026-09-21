"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import { BedtimeStoryPreviewModal } from "../../components/admin/bedtime/BedtimeStoryPreviewModal";
import type {
  BedtimeStoryLanguage,
  BedtimeStoryListItem,
  BedtimeStoryPatch,
  BedtimeStoryRecord,
  BedtimeStorySlidePatch,
  BedtimeStoryStatus,
} from "../../lib/bedtime-stories/types.ts";

const LANGUAGES: BedtimeStoryLanguage[] = ["ru", "en", "he"];
const STATUSES: BedtimeStoryStatus[] = ["draft", "ready", "exported", "scheduled", "published", "archived"];
const MAX_UPLOAD_IMAGE_SIDE = 2600;
const UPLOAD_WEBP_QUALITY = 0.9;

type StoriesResponse = {
  stories: BedtimeStoryListItem[];
  total: number;
  page: number;
  limit: number;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data: T & { error?: string; issues?: Array<{ message: string; path: Array<string | number> }> };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(raw.slice(0, 300) || `Request failed with status ${response.status}.`);
  }
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "bedtime-story";
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

async function imageFileToUploadFile(file: File): Promise<File> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to process image."));
      nextImage.src = imageUrl;
    });

    const maxSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = maxSide > MAX_UPLOAD_IMAGE_SIDE ? MAX_UPLOAD_IMAGE_SIDE / maxSide : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas context is not available.");
    }

    context.drawImage(image, 0, 0, width, height);

    const webpBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Failed to convert image to webp."));
            return;
          }
          resolve(result);
        },
        "image/webp",
        UPLOAD_WEBP_QUALITY,
      );
    });

    const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";
    return new File([webpBlob], `${baseName}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
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

const bedtimeStoryProductionPrompt = `# LapLapLa Emotional Bedtime Story Prompt

Create a short bedtime carousel story for Instagram.
The story should feel like:
- a remembered dream
- an emotional travel memory
- a peaceful strange moment from another world
- a quiet emotional refuge before sleep

Format:
- title (en, ru, he)
- 1–2 illustrated pages / slides
- prose combining physical sensory details and quiet wonder.`;

function createEmptyDraft(): BedtimeStoryRecord {
  return {
    id: "",
    slug: "",
    status: "draft",
    title: { ru: "", en: "", he: "" },
    emotional_theme: { ru: "", en: "", he: "" },
    full_json: {},
    slides: [
      {
        slide_number: 1,
        text: { ru: "", en: "", he: "" },
        illustration_prompt: "",
        stamp_prompt: "",
        marker_prompt: "",
        image_url: "",
        layers: [],
      },
    ],
    images: {},
    cover_image_url: null,
    instagram_caption: { ru: "", en: "", he: "" },
    instagram_hashtags: [],
    collection_tags: [],
    visual_tags: [],
    stamp_assets: [],
    marker_assets: [],
    exported_image_urls: {},
    publish_date: null,
    is_published: false,
    created_at: null,
    updated_at: null,
  };
}

function languageAvailability(story: BedtimeStoryListItem) {
  return (["ru", "en", "he"] as BedtimeStoryLanguage[])
    .filter((language) => story.title?.[language])
    .map((language) => language.toUpperCase())
    .join(" / ") || "—";
}

function slidesCountBadge(story: BedtimeStoryListItem) {
  const count = story.slides?.length || 0;
  if (count === 1) return "1 page";
  if (count === 2) return "2 pages";
  return `${count} slides`;
}

function getSlideImageUrl(
  story: BedtimeStoryRecord,
  slideNumber: number,
  lang: BedtimeStoryLanguage,
): string {
  const pad = String(slideNumber).padStart(2, "0");
  const langKey = `${lang}-${pad}`;
  const exportedUrl = story.exported_image_urls?.[langKey]?.trim();
  if (exportedUrl) {
    return exportedUrl;
  }

  // Only Russian allows legacy fallback to slide.image_url / images[pad],
  // provided it does not contain an English or Hebrew storage path
  if (lang === "ru") {
    const slide = story.slides?.find((s) => s.slide_number === slideNumber);
    const slideImg = slide?.image_url?.trim();
    if (slideImg && !slideImg.includes("/en/") && !slideImg.includes("/he/")) {
      return slideImg;
    }
    const legacyImg = story.images?.[pad]?.trim();
    if (legacyImg && !legacyImg.includes("/en/") && !legacyImg.includes("/he/")) {
      return legacyImg;
    }
  }

  // Strictly no fallback for EN and HE, or RU if none exists
  return "";
}

export default function BedtimeStoriesAdminPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [stories, setStories] = useState<BedtimeStoryListItem[]>([]);
  const [total, setTotal] = useState(0);

  // Authoring Editor State
  const [activeStory, setActiveStory] = useState<BedtimeStoryRecord>(createEmptyDraft);
  const [editLanguage, setEditLanguage] = useState<BedtimeStoryLanguage>("ru");
  const [includePage2, setIncludePage2] = useState(false);
  const [jsonImportValue, setJsonImportValue] = useState("");
  const [jsonPanelOpen, setJsonPanelOpen] = useState(false);

  // Modal / Preview state
  const [previewModalStory, setPreviewModalStory] = useState<BedtimeStoryRecord | null>(null);

  // Loading & Operation state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadingSlide, setUploadingSlide] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(createEmptyDraft()));
  const hasUnsavedChanges = JSON.stringify(activeStory) !== savedSnapshot;

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

  // If query string contains ?storyId=..., load it into the editor
  useEffect(() => {
    if (!sessionChecked || !router.isReady) {
      return;
    }
    const queryStoryId = typeof router.query.storyId === "string" ? router.query.storyId : "";
    if (queryStoryId && queryStoryId !== activeStory.id) {
      void loadStoryIntoEditor(queryStoryId, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked, router.isReady, router.query.storyId]);

  const loadStoryIntoEditor = async (storyId: string, scroll = true) => {
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${storyId}`);
      setActiveStory(data.story);
      setSavedSnapshot(JSON.stringify(data.story));
      setIncludePage2(data.story.slides.length >= 2);
      if (scroll && editorRef.current) {
        editorRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      void router.push({ pathname: "/admin/bedtime-stories", query: { storyId: data.story.id } }, undefined, { shallow: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const resetToNewStory = () => {
    setActiveStory(createEmptyDraft());
    setSavedSnapshot(JSON.stringify(createEmptyDraft()));
    setIncludePage2(false);
    setError(null);
    setSuccess("Editor reset to new story draft.");
    void router.push("/admin/bedtime-stories", undefined, { shallow: true });
  };

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
      setJsonPanelOpen(false);
      setActiveStory(data.story);
      setSavedSnapshot(JSON.stringify(data.story));
      setIncludePage2(data.story.slides.length >= 2);
      setSuccess(`Story imported from JSON: ${data.story.title.ru || data.story.title.en || data.story.slug}`);
      await loadStories();
      void router.push({ pathname: "/admin/bedtime-stories", query: { storyId: data.story.id } }, undefined, { shallow: true });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setImporting(false);
    }
  };

  // Upload an image for a specific slide number (1 or 2) using existing [storyId]/media.ts
  const handleUploadSlideImage = async (slideNumber: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = "";

    setUploadingSlide(slideNumber);
    setError(null);
    setSuccess(null);
    try {
      // 1. Ensure we have a persisted draft with a storyId
      const currentStory = await saveStory();
      if (!currentStory) throw new Error("Save the story before uploading an image.");

      // 2. Prepare WebP image payload
      const uploadFile = await imageFileToUploadFile(file);
      const imageBase64 = await blobToDataUrl(uploadFile);

      // 3. Upload through existing [storyId]/media endpoint
      const uploadLanguage = editLanguage;
      const mediaData = await fetchJson<{ publicUrl: string; story: BedtimeStoryRecord }>(
        `/api/admin/bedtime-stories/${currentStory.id}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "slide",
            language: uploadLanguage,
            slideNumber,
            imageBase64,
            fileName: uploadFile.name,
          }),
        },
      );

      setActiveStory(mediaData.story);
      setSavedSnapshot(JSON.stringify(mediaData.story));
      setSuccess(`Page ${slideNumber} image (${uploadLanguage.toUpperCase()}) uploaded.`);
      await loadStories();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploadingSlide(null);
    }
  };

  // Change or clear image URL for the active language strictly
  const handleSlideImageUrlChange = (slideNumber: number, url: string) => {
    const pad = String(slideNumber).padStart(2, "0");
    const trimmed = url.trim();
    setActiveStory((prev) => {
      const nextExported = { ...prev.exported_image_urls };
      if (trimmed) {
        nextExported[`${editLanguage}-${pad}`] = trimmed;
      } else {
        delete nextExported[`${editLanguage}-${pad}`];
      }

      const nextSlides = [...prev.slides];
      const slideIdx = nextSlides.findIndex((s) => s.slide_number === slideNumber);
      if (editLanguage === "ru") {
        if (slideIdx !== -1) {
          nextSlides[slideIdx] = { ...nextSlides[slideIdx], image_url: trimmed };
        }
      }

      let nextCover = prev.cover_image_url;
      const nextImages = { ...prev.images };
      if (editLanguage === "ru") {
        if (trimmed) nextImages[pad] = trimmed;
        else delete nextImages[pad];
      }
      if (slideNumber === 1 && editLanguage === "ru") {
        nextCover = trimmed || null;
      }

      return {
        ...prev,
        exported_image_urls: nextExported,
        slides: nextSlides,
        images: nextImages,
        cover_image_url: nextCover,
      };
    });
  };

  const handleClearSlideImage = (slideNumber: number) => {
    handleSlideImageUrlChange(slideNumber, "");
  };

  // Save changes to story (draft or updated) without creating duplicates
  const saveStory = async (statusOverride?: BedtimeStoryStatus): Promise<BedtimeStoryRecord | null> => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const targetStatus = statusOverride ?? activeStory.status;

      const titleRu = activeStory.title.ru.trim();
      const titleEn = activeStory.title.en.trim() || titleRu || "Bedtime Story";
      const title = {
        ru: titleRu || titleEn,
        en: titleEn,
        he: activeStory.title.he || "",
      };
      const slug = activeStory.slug.trim() || slugify(titleEn || titleRu);

      const ruPage1 = getSlideImageUrl(activeStory, 1, "ru");
      const ruPage2 = getSlideImageUrl(activeStory, 2, "ru");

      const slidesPayload: BedtimeStorySlidePatch[] = [
        {
          slide_number: 1,
          illustration_prompt: activeStory.slides[0]?.illustration_prompt ?? "",
          stamp_prompt: activeStory.slides[0]?.stamp_prompt ?? "",
          marker_prompt: activeStory.slides[0]?.marker_prompt ?? "",
          image_url: ruPage1 || activeStory.slides[0]?.image_url || "",
          layers: activeStory.slides[0]?.layers ?? [],
          text: activeStory.slides[0]?.text || { ru: "", en: "", he: "" },
        },
      ];

      if (includePage2) {
        slidesPayload.push({
          slide_number: 2,
          illustration_prompt: activeStory.slides[1]?.illustration_prompt ?? "",
          stamp_prompt: activeStory.slides[1]?.stamp_prompt ?? "",
          marker_prompt: activeStory.slides[1]?.marker_prompt ?? "",
          image_url: ruPage2 || activeStory.slides[1]?.image_url || "",
          layers: activeStory.slides[1]?.layers ?? [],
          text: activeStory.slides[1]?.text || { ru: "", en: "", he: "" },
        });
      }

      // If existing story had > 2 slides, preserve slides 3..N
      if (activeStory.slides.length > 2) {
        for (let i = 2; i < activeStory.slides.length; i++) {
          const s = activeStory.slides[i];
          slidesPayload.push({
            slide_number: s.slide_number,
            text: s.text,
            illustration_prompt: s.illustration_prompt,
            stamp_prompt: s.stamp_prompt,
            marker_prompt: s.marker_prompt,
            image_url: s.image_url,
            layers: s.layers,
          });
        }
      }

      // If the author deliberately removed Page 2 on a 2-page story:
      const deleteSlideNumbers: number[] = [];
      if (!includePage2 && activeStory.slides.some((s) => s.slide_number === 2)) {
        deleteSlideNumbers.push(2);
      }

      const patch: BedtimeStoryPatch = {
        title,
        slug,
        status: targetStatus,
        is_published: targetStatus === "draft" || targetStatus === "archived" ? false : activeStory.is_published,
        publish_date: targetStatus === "draft" || targetStatus === "archived" ? null : activeStory.publish_date,
        slides: slidesPayload,
        cover_image_url: ruPage1 || activeStory.cover_image_url || null,
        emotional_theme: activeStory.emotional_theme,
        exported_image_urls: activeStory.exported_image_urls,
        replaceExportedImageUrls: true,
        ...(deleteSlideNumbers.length > 0 ? { deleteSlideNumbers } : {}),
      };

      let updatedRecord: BedtimeStoryRecord;

      if (!activeStory.id) {
        // Create brand new story record
        const res = await fetchJson<{ story: BedtimeStoryRecord }>("/api/admin/bedtime-stories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story: patch }),
        });
        updatedRecord = res.story;
      } else {
        // Update existing story via safe non-destructive update
        const res = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${activeStory.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story: patch }),
        });
        updatedRecord = res.story;
      }

      setActiveStory(updatedRecord);
      setSavedSnapshot(JSON.stringify(updatedRecord));
      setSuccess(targetStatus === "draft" ? "Draft saved successfully." : "Story changes saved.");
      await loadStories();
      void router.push({ pathname: "/admin/bedtime-stories", query: { storyId: updatedRecord.id } }, undefined, { shallow: true });
      return updatedRecord;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return null;
    } finally {
      setSaving(false);
    }
  };

  // Explicit action: Publish Finished Story
  // Copies finished page image URLs into exported_image_urls for the active language,
  // sets status = "exported", preserves other language exports, is_published, and publish_date.
  const publishFinishedStory = async () => {
    const page1Url = getSlideImageUrl(activeStory, 1, editLanguage);
    if (!page1Url) {
      setError(`Cannot publish story without a Page 1 finished image for ${editLanguage.toUpperCase()}. Please upload or set Page 1 image first.`);
      return;
    }

    const confirmed = window.confirm(
      `Publish this bedtime story (${editLanguage.toUpperCase()}) to the public app?\n\nThis will copy finished page images to exported pages and mark the story as exported. Proceed?`,
    );
    if (!confirmed) {
      return;
    }

    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      // 1. Ensure saved draft
      const currentStory = await saveStory();
      if (!currentStory) throw new Error("Story could not be saved before publishing.");

      // Update exported_image_urls strictly for the active editing language,
      // preserving existing exports for other languages (e.g. en-01, he-01).
      const updatedExportedUrls: Record<string, string> = { ...currentStory.exported_image_urls };

      for (const slide of currentStory.slides) {
        const url = getSlideImageUrl(currentStory, slide.slide_number, editLanguage);
        if (!url) throw new Error(`Page ${slide.slide_number} has no ${editLanguage.toUpperCase()} image.`);
        updatedExportedUrls[`${editLanguage}-${String(slide.slide_number).padStart(2, "0")}`] = url;
      }

      const patch: BedtimeStoryPatch = {
        status: "exported",
        is_published: true,
        publish_date: currentStory.publish_date || new Date().toISOString(),
        cover_image_url: currentStory.cover_image_url || (editLanguage === "ru" ? page1Url : currentStory.cover_image_url),
        exported_image_urls: updatedExportedUrls,
      };

      const res = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${currentStory.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: patch }),
      });

      setActiveStory(res.story);
      setSavedSnapshot(JSON.stringify(res.story));
      setSuccess(`Story published for ${editLanguage.toUpperCase()}! It is now marked as exported and available in the public reader.`);
      await loadStories();
    } catch (pubError) {
      setError(pubError instanceof Error ? pubError.message : String(pubError));
    } finally {
      setPublishing(false);
    }
  };

  const deleteStory = async (story: BedtimeStoryListItem) => {
    const confirmed = window.confirm(`Delete bedtime story "${story.title.ru || story.title.en || story.slug}" from the database? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setDeletingId(story.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/bedtime-stories/${story.id}`, { method: "DELETE" });
      if (activeStory.id === story.id) {
        resetToNewStory();
      }
      setSuccess(`Deleted story: ${story.title.ru || story.title.en || story.slug}`);
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

  const slide1 = activeStory.slides[0] || { slide_number: 1, text: { ru: "", en: "", he: "" }, image_url: "" };
  const slide2 = activeStory.slides[1] || { slide_number: 2, text: { ru: "", en: "", he: "" }, image_url: "" };
  const page1ImageUrl = getSlideImageUrl(activeStory, 1, editLanguage);
  const page2ImageUrl = getSlideImageUrl(activeStory, 2, editLanguage);

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
          <h1 className="books-admin-title">Bedtime Stories Workshop</h1>
          <p className="books-admin-subtitle">
            Author, edit, and publish 1–2 page illustrated bedtime stories, or import JSON carousels for the public reader.
          </p>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      {/* ========================================================================= */}
      {/* 1. CREATE / EDIT STORY WORKSPACE                                          */}
      {/* ========================================================================= */}
      <section className="books-panel" ref={editorRef}>
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">
              {activeStory.id ? (
                <>
                  Edit Story: <span style={{ color: "#2b6cb0" }}>{activeStory.title[editLanguage] || activeStory.slug}</span>
                </>
              ) : (
                "New Bedtime Story"
              )}
            </h2>
            <p className="books-section-help">
              Prepare 1 or 2 finished illustrated pages. Changes are saved server-side to Supabase.
            </p>
          </div>
          <div className="books-actions">
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={resetToNewStory}
              title="Create a fresh blank story draft"
            >
              + New Story
            </button>
            <button
              type="button"
              className="books-button books-button--ghost"
              onClick={() => setJsonPanelOpen((prev) => !prev)}
            >
              {jsonPanelOpen ? "Close JSON Import" : "Import from JSON"}
            </button>
            {activeStory.id ? (
              <Link
                href={`/admin/bedtime-stories/${activeStory.id}`}
                className="books-button books-button--ghost"
                title="Open 1080x1350 canvas typography studio and PSD export"
              >
                Open Advanced Studio ↗
              </Link>
            ) : null}
          </div>
        </div>

        {/* Collapsible JSON Import Panel */}
        {jsonPanelOpen ? (
          <div
            style={{
              padding: 16,
              background: "#f7fafc",
              borderRadius: 8,
              border: "1px dashed #cbd5e0",
              marginBottom: 20,
            }}
          >
            <div className="books-section-head" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Paste Full Story JSON</h3>
                <p className="books-section-help" style={{ margin: "4px 0 0" }}>
                  Imports multi-slide carousel JSON into the database and loads it into the editor.
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
                  {importing ? "Importing..." : "Create from JSON"}
                </button>
              </div>
            </div>
            <textarea
              className="books-input books-input--textarea books-input--json"
              value={jsonImportValue}
              onChange={(event) => setJsonImportValue(event.target.value)}
              placeholder={bedtimeStoryJsonTemplate}
              style={{ minHeight: 140 }}
            />
          </div>
        ) : null}

        {/* Notice for multi-slide stories */}
        {activeStory.slides.length > 2 ? (
          <div
            className="books-alert"
            style={{ background: "#ebf8ff", borderColor: "#90cdf4", color: "#2b6cb0", marginBottom: 16 }}
          >
            <strong>Multi-Slide Story:</strong> This story has {activeStory.slides.length} slides. Pages 1 and 2 can be
            edited below. Slides 3–{activeStory.slides.length} and all canvas layers are safely preserved upon saving.{" "}
            {activeStory.id ? (
              <Link href={`/admin/bedtime-stories/${activeStory.id}`} style={{ fontWeight: 700, textDecoration: "underline" }}>
                Open Advanced Studio
              </Link>
            ) : null}{" "}
            to arrange text boxes or reorder all slides.
          </div>
        ) : null}

        {/* Story Metadata Form */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="books-field__label" style={{ margin: 0, fontWeight: 700 }}>
            Editing Language: {hasUnsavedChanges ? "Unsaved changes" : "Saved"}
          </span>
          <div className="books-actions">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                className={editLanguage === lang ? "books-button books-button--primary" : "books-button books-button--ghost"}
                onClick={() => setEditLanguage(lang)}
              >
                {lang.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="books-grid books-grid--3" style={{ marginBottom: 20 }}>
          <label className="books-field">
            <span className="books-field__label">
              Title ({editLanguage.toUpperCase()}) <strong style={{ color: "#e53e3e" }}>*</strong>
            </span>
            <input
              className="books-input"
              value={activeStory.title[editLanguage] || ""}
              placeholder="e.g. Лунный поезд"
              onChange={(e) => {
                const nextTitle = e.target.value;
                setActiveStory((prev) => {
                  const updatedTitle = { ...prev.title, [editLanguage]: nextTitle };
                  // If new story and slug empty, auto-generate slug
                  const nextSlug = !prev.id && (!prev.slug || prev.slug === slugify(prev.title[editLanguage] || ""))
                    ? slugify(nextTitle)
                    : prev.slug;
                  return { ...prev, title: updatedTitle, slug: nextSlug };
                });
              }}
            />
          </label>

          <label className="books-field">
            <span className="books-field__label">
              Slug <strong style={{ color: "#e53e3e" }}>*</strong>
            </span>
            <input
              className="books-input"
              value={activeStory.slug}
              placeholder="e.g. moon-train"
              onChange={(e) => setActiveStory((prev) => ({ ...prev, slug: e.target.value }))}
            />
          </label>

          <label className="books-field">
            <span className="books-field__label">Status</span>
            <select
              className="books-input"
              value={activeStory.status}
              onChange={(e) => setActiveStory((prev) => ({ ...prev, status: e.target.value as BedtimeStoryStatus }))}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Finished Illustrated Pages */}
        {/* Finished Illustrated Pages */}
        <div style={{ display: "grid", gridTemplateColumns: includePage2 ? "1fr 1fr" : "minmax(320px, 540px)", gap: 20, marginBottom: includePage2 ? 20 : 12 }}>
          {/* PAGE 1 CARD */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "1.05rem", color: "#2d3748" }}>PAGE 1</strong>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "#2b6cb0",
                    background: "#ebf8ff",
                    padding: "2px 6px",
                    borderRadius: 4,
                    marginLeft: 8,
                  }}
                >
                  {editLanguage.toUpperCase()}
                </span>
              </div>
              <span style={{ fontSize: "0.78rem", color: "#718096" }}>Primary cover & first story page</span>
            </div>

            {page1ImageUrl ? (
              /* Compact thumbnail state when image exists (height ~185px, object-fit: contain) */
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div
                  style={{
                    width: 140,
                    height: 185,
                    maxHeight: 195,
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                    padding: 4,
                    boxSizing: "border-box",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={page1ImageUrl}
                    alt={`Page 1 (${editLanguage.toUpperCase()})`}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <label
                      className="books-button books-button--secondary"
                      style={{ cursor: "pointer", padding: "4px 10px", fontSize: "0.82rem", height: 30 }}
                    >
                      {uploadingSlide === 1 ? "Uploading..." : "Replace Page 1"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        disabled={uploadingSlide !== null}
                        onChange={(e) => void handleUploadSlideImage(1, e)}
                      />
                    </label>
                    <button
                      type="button"
                      className="books-button books-button--ghost"
                      style={{ padding: "4px 8px", fontSize: "0.8rem", height: 30, color: "#e53e3e" }}
                      onClick={() => handleClearSlideImage(1)}
                    >
                      Clear Image
                    </button>
                  </div>

                  <input
                    className="books-input"
                    style={{ fontSize: "0.82rem", height: 32 }}
                    placeholder="Or paste image URL"
                    value={page1ImageUrl}
                    onChange={(e) => handleSlideImageUrlChange(1, e.target.value)}
                  />

                  <small style={{ color: "#718096", fontSize: "0.74rem", lineHeight: 1.3 }}>
                    Thumbnail for {editLanguage.toUpperCase()}. Full-resolution image is saved in storage.
                  </small>
                </div>
              </div>
            ) : (
              /* Compact empty / upload dropzone state when no image exists (~115px height) */
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label
                  style={{
                    width: "100%",
                    height: 115,
                    background: "#f8fafc",
                    borderRadius: 8,
                    border: "2px dashed #cbd5e0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: uploadingSlide !== null ? "not-allowed" : "pointer",
                    padding: 12,
                    boxSizing: "border-box",
                    textAlign: "center",
                    transition: "border-color 0.15s ease, background-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#4299e1";
                    e.currentTarget.style.backgroundColor = "#ebf8ff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#cbd5e0";
                    e.currentTarget.style.backgroundColor = "#f8fafc";
                  }}
                >
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    disabled={uploadingSlide !== null}
                    onChange={(e) => void handleUploadSlideImage(1, e)}
                  />
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#718096"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ marginBottom: 4 }}
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <strong style={{ fontSize: "0.86rem", color: "#2d3748" }}>
                    {uploadingSlide === 1 ? "Uploading Page 1..." : `Upload Page 1 (${editLanguage.toUpperCase()}) illustration`}
                  </strong>
                  <small style={{ color: "#718096", marginTop: 2, fontSize: "0.75rem" }}>
                    Click to select PNG, JPEG, or WebP (compact thumbnail)
                  </small>
                </label>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label
                    className="books-button books-button--secondary"
                    style={{ cursor: "pointer", flexShrink: 0, padding: "4px 10px", fontSize: "0.82rem", height: 32 }}
                  >
                    {uploadingSlide === 1 ? "Uploading..." : "Upload Page 1"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      disabled={uploadingSlide !== null}
                      onChange={(e) => void handleUploadSlideImage(1, e)}
                    />
                  </label>
                  <input
                    className="books-input"
                    style={{ fontSize: "0.82rem", height: 32 }}
                    placeholder="Or paste image URL"
                    value=""
                    onChange={(e) => handleSlideImageUrlChange(1, e.target.value)}
                  />
                </div>
              </div>
            )}

            <label className="books-field" style={{ margin: 0 }}>
              <span className="books-field__label">Page 1 Text ({editLanguage.toUpperCase()})</span>
              <textarea
                className="books-input books-input--textarea"
                style={{ minHeight: 65 }}
                placeholder="Enter story text for Page 1..."
                value={slide1.text?.[editLanguage] || ""}
                onChange={(e) => {
                  const text = e.target.value;
                  setActiveStory((prev) => {
                    const slides = [...prev.slides];
                    slides[0] = {
                      ...slides[0],
                      text: { ...slides[0].text, [editLanguage]: text },
                    };
                    return { ...prev, slides };
                  });
                }}
              />
            </label>
          </div>

          {/* PAGE 2 CARD (WHEN INCLUDED) */}
          {includePage2 && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "1.05rem", color: "#2d3748" }}>PAGE 2</strong>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "#2b6cb0",
                      background: "#ebf8ff",
                      padding: "2px 6px",
                      borderRadius: 4,
                      marginLeft: 8,
                    }}
                  >
                    {editLanguage.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "#718096", marginLeft: 6 }}>— optional</span>
                </div>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  style={{ padding: "3px 10px", fontSize: "0.8rem", height: 28 }}
                  disabled={activeStory.slides.length > 2}
                  title={activeStory.slides.length > 2 ? "Use Advanced Studio for stories with more than two pages" : undefined}
                  onClick={() => {
                    const confirmRemove = window.confirm("Remove Page 2 from this story?");
                    if (confirmRemove) {
                      setIncludePage2(false);
                      setActiveStory((prev) => ({
                        ...prev,
                        slides: [prev.slides[0]],
                      }));
                    }
                  }}
                >
                  Remove Page 2
                </button>
              </div>

              {page2ImageUrl ? (
                /* Compact thumbnail state when image exists (height ~185px, object-fit: contain) */
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div
                    style={{
                      width: 140,
                      height: 185,
                      maxHeight: 195,
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      padding: 4,
                      boxSizing: "border-box",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page2ImageUrl}
                      alt={`Page 2 (${editLanguage.toUpperCase()})`}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <label
                        className="books-button books-button--secondary"
                        style={{ cursor: "pointer", padding: "4px 10px", fontSize: "0.82rem", height: 30 }}
                      >
                        {uploadingSlide === 2 ? "Uploading..." : "Replace Page 2"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          disabled={uploadingSlide !== null}
                          onChange={(e) => void handleUploadSlideImage(2, e)}
                        />
                      </label>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        style={{ padding: "4px 8px", fontSize: "0.8rem", height: 30, color: "#e53e3e" }}
                        onClick={() => handleClearSlideImage(2)}
                      >
                        Clear Image
                      </button>
                    </div>

                    <input
                      className="books-input"
                      style={{ fontSize: "0.82rem", height: 32 }}
                      placeholder="Or paste image URL"
                      value={page2ImageUrl}
                      onChange={(e) => handleSlideImageUrlChange(2, e.target.value)}
                    />

                    <small style={{ color: "#718096", fontSize: "0.74rem", lineHeight: 1.3 }}>
                      Thumbnail for {editLanguage.toUpperCase()}. Original artwork preserved for reader/preview.
                    </small>
                  </div>
                </div>
              ) : (
                /* Compact empty / upload dropzone state when no image exists (~115px height) */
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label
                    style={{
                      width: "100%",
                      height: 115,
                      background: "#f8fafc",
                      borderRadius: 8,
                      border: "2px dashed #cbd5e0",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: uploadingSlide !== null ? "not-allowed" : "pointer",
                      padding: 12,
                      boxSizing: "border-box",
                      textAlign: "center",
                      transition: "border-color 0.15s ease, background-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#4299e1";
                      e.currentTarget.style.backgroundColor = "#ebf8ff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#cbd5e0";
                      e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      hidden
                      disabled={uploadingSlide !== null}
                      onChange={(e) => void handleUploadSlideImage(2, e)}
                    />
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#718096"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ marginBottom: 4 }}
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <strong style={{ fontSize: "0.86rem", color: "#2d3748" }}>
                      {uploadingSlide === 2 ? "Uploading Page 2..." : `Upload Page 2 (${editLanguage.toUpperCase()}) illustration`}
                    </strong>
                    <small style={{ color: "#718096", marginTop: 2, fontSize: "0.75rem" }}>
                      Click to select PNG, JPEG, or WebP (compact thumbnail)
                    </small>
                  </label>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label
                      className="books-button books-button--secondary"
                      style={{ cursor: "pointer", flexShrink: 0, padding: "4px 10px", fontSize: "0.82rem", height: 32 }}
                    >
                      {uploadingSlide === 2 ? "Uploading..." : "Upload Page 2"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        disabled={uploadingSlide !== null}
                        onChange={(e) => void handleUploadSlideImage(2, e)}
                      />
                    </label>
                    <input
                      className="books-input"
                      style={{ fontSize: "0.82rem", height: 32 }}
                      placeholder="Or paste image URL"
                      value=""
                      onChange={(e) => handleSlideImageUrlChange(2, e.target.value)}
                    />
                  </div>
                </div>
              )}

              <label className="books-field" style={{ margin: 0 }}>
                <span className="books-field__label">Page 2 Text ({editLanguage.toUpperCase()})</span>
                <textarea
                  className="books-input books-input--textarea"
                  style={{ minHeight: 65 }}
                  placeholder="Enter story text for Page 2..."
                  value={slide2.text?.[editLanguage] || ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    setActiveStory((prev) => {
                      const slides = [...prev.slides];
                      if (slides[1]) {
                        slides[1] = {
                          ...slides[1],
                          text: { ...slides[1].text, [editLanguage]: text },
                        };
                      }
                      return { ...prev, slides };
                    });
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* When Page 2 is not added: slim, compact strip occupying essentially no space */}
        {!includePage2 && (
          <div
            style={{
              background: "#fff",
              border: "1px dashed #cbd5e0",
              borderRadius: 12,
              padding: "10px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div>
              <strong style={{ fontSize: "0.95rem", color: "#2d3748" }}>PAGE 2 — optional</strong>
              <span style={{ fontSize: "0.8rem", color: "#718096", marginLeft: 12 }}>
                This story is currently 1 page. Add a second page if needed.
              </span>
            </div>
            <button
              type="button"
              className="books-button books-button--secondary"
              style={{ padding: "4px 12px", fontSize: "0.85rem", height: 32 }}
              onClick={() => {
                setIncludePage2(true);
                if (activeStory.slides.length < 2) {
                  setActiveStory((prev) => ({
                    ...prev,
                    slides: [
                      prev.slides[0] || {
                        slide_number: 1,
                        text: { ru: "", en: "", he: "" },
                        illustration_prompt: "",
                        stamp_prompt: "",
                        marker_prompt: "",
                        image_url: "",
                        layers: [],
                      },
                      {
                        slide_number: 2,
                        text: { ru: "", en: "", he: "" },
                        illustration_prompt: "",
                        stamp_prompt: "",
                        marker_prompt: "",
                        image_url: "",
                        layers: [],
                      },
                    ],
                  }));
                }
              }}
            >
              + Add Page 2
            </button>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="books-actions">
            <button
              type="button"
              className="books-button books-button--secondary"
              disabled={saving || publishing || uploadingSlide !== null}
              onClick={() => void saveStory("draft")}
              title="Save changes with draft status (will not appear in public reader)"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={saving || publishing || uploadingSlide !== null}
              onClick={() => void saveStory()}
              title="Save changes with current status"
            >
              {saving ? "Saving..." : activeStory.id ? "Save Changes" : "Save Story"}
            </button>
            <button
              type="button"
              className="books-button books-button--success"
              disabled={saving || publishing || uploadingSlide !== null || !page1ImageUrl}
              onClick={() => void publishFinishedStory()}
              title="Explicitly copy finished page images to exported pages and mark status as exported"
            >
              {publishing ? "Publishing..." : "Publish Finished Story 🚀"}
            </button>
          </div>

          <div className="books-actions">
            {page1ImageUrl || activeStory.slides[0]?.image_url || Object.keys(activeStory.exported_image_urls || {}).length > 0 ? (
              <button
                type="button"
                className="books-button books-button--ghost"
                onClick={() => setPreviewModalStory(activeStory)}
              >
                Preview Story 📖
              </button>
            ) : null}
            {activeStory.id ? (
              <Link href={`/admin/bedtime-stories/${activeStory.id}`} className="books-button books-button--ghost">
                Advanced Studio ↗
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 2. SAVED STORIES LIBRARY                                                  */}
      {/* ========================================================================= */}
      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Saved Stories Library</h2>
            <p className="books-section-help">
              All bedtime stories stored in Supabase. Click &quot;Edit&quot; to load a story back into the authoring workspace.
            </p>
          </div>
          <label className="books-field cat-questions-search" style={{ margin: 0 }}>
            <span className="books-field__label">Search</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="Search by slug or title..."
            />
          </label>
        </div>

        <div className="artworks-table-wrap">
          <table className="artworks-table">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Preview</th>
                <th>Title & Slug</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Languages</th>
                <th>Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="artworks-table__empty-row">
                    Loading stories...
                  </td>
                </tr>
              ) : stories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="artworks-table__empty-row">
                    No bedtime stories found.
                  </td>
                </tr>
              ) : (
                stories.map((story) => {
                  const firstImageUrl = story.slides?.[0]?.image_url;
                  const isCurrentlyEditing = activeStory.id === story.id;
                  return (
                    <tr key={story.id} style={{ background: isCurrentlyEditing ? "rgba(66, 153, 225, 0.08)" : undefined }}>
                      <td>
                        <div
                          style={{
                            width: 48,
                            height: 60,
                            borderRadius: 6,
                            overflow: "hidden",
                            background: "#e2e8f0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {firstImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={firstImageUrl}
                              alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            <span style={{ fontSize: "0.65rem", color: "#a0aec0" }}>No img</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <strong>{story.title.ru || story.title.en || story.slug}</strong>
                        {story.title.en && story.title.ru && story.title.en !== story.title.ru ? (
                          <div style={{ fontSize: "0.8rem", color: "#718096" }}>{story.title.en}</div>
                        ) : null}
                        <small style={{ color: "#a0aec0", display: "block" }}>{story.slug}</small>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            background:
                              story.status === "exported"
                                ? "#c6f6d5"
                                : story.status === "ready"
                                  ? "#feebc8"
                                  : "#edf2f7",
                            color:
                              story.status === "exported"
                                ? "#22543d"
                                : story.status === "ready"
                                  ? "#7b341e"
                                  : "#4a5568",
                          }}
                        >
                          {story.is_published ? "published" : story.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: "0.85rem", color: "#4a5568" }}>{slidesCountBadge(story)}</span>
                      </td>
                      <td>
                        <small style={{ color: "#718096" }}>{languageAvailability(story)}</small>
                      </td>
                      <td>
                        <small style={{ color: "#718096" }}>
                          {story.updated_at
                            ? new Date(story.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : story.created_at
                              ? new Date(story.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—"}
                        </small>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            className="books-button books-button--secondary"
                            style={{ padding: "4px 10px", fontSize: "0.85rem" }}
                            onClick={() => void loadStoryIntoEditor(story.id)}
                          >
                            {isCurrentlyEditing ? "Editing" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="books-button books-button--ghost"
                            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                            onClick={async () => {
                              try {
                                const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${story.id}`);
                                setPreviewModalStory(data.story);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : String(err));
                              }
                            }}
                          >
                            Preview
                          </button>
                          <Link
                            href={`/admin/bedtime-stories/${story.id}`}
                            className="books-button books-button--ghost"
                            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                            title="Open Advanced Studio"
                          >
                            Studio
                          </Link>
                          <button
                            type="button"
                            className="books-button books-button--danger"
                            style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                            disabled={deletingId === story.id}
                            onClick={() => void deleteStory(story)}
                          >
                            {deletingId === story.id ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="books-actions cat-questions-pagination" style={{ marginTop: 16 }}>
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

      {/* ========================================================================= */}
      {/* 3. PREVIEW MODAL                                                          */}
      {/* ========================================================================= */}
      {previewModalStory ? (
        <BedtimeStoryPreviewModal
          story={previewModalStory}
          initialLanguage={editLanguage}
          onClose={() => setPreviewModalStory(null)}
        />
      ) : null}
    </div>
  );
}
