"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../../components/AdminLogout";
import { AdminTabs } from "../../../../components/AdminTabs";
import { detectSlideIntent } from "../../../../lib/media/detectSlideIntent";

type SlideItem = {
  id: string;
  story_id: string | null;
  text: string;
  image_url: string | null;
  credit_line: string | null;
};

type StoryPayload = {
  id: string;
  type: string;
  target_id: string;
  language: string;
  content: string;
  is_approved: boolean;
  auto_generated: boolean;
  auto_generation_model: string | null;
  youtube_url_ru: string | null;
  youtube_url_he: string | null;
  youtube_url_en: string | null;
  google_maps_url: string | null;
} | null;

type StoryResponse = {
  story: StoryPayload;
  slides: SlideItem[];
};

function getResponseErrorMessage(raw: string, status: number): string {
  const trimmed = raw.trim();

  if (!trimmed) {
    return `Request failed with status ${status}.`;
  }

  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    return `Server returned HTML instead of JSON (status ${status}). Check server logs for the underlying error.`;
  }

  return trimmed.slice(0, 300);
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(getResponseErrorMessage(raw, response.status));
  }

  let data: (T & { error?: string }) | null = null;
  try {
    data = JSON.parse(raw) as T & { error?: string };
  } catch {
    throw new Error(`Invalid JSON response from ${url} (status ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data?.error ?? getResponseErrorMessage(raw, response.status));
  }
  return data as T;
}

function isDisallowedMediaUrl(url: string): boolean {
  return /\.(pdf|svg|djvu|djv|ogg|oga|tif|tiff)(\?.*)?$/i.test(url.trim());
}

function isFlagBucketSvgUrl(url: string): boolean {
  return /\/storage\/v1\/object\/public\/flags-svg\/flags-svg\/[a-z0-9_-]+\.svg(\?.*)?$/i.test(url.trim());
}

function inferMediaType(url: string | null): "image" | "video" | undefined {
  if (!url) {
    return undefined;
  }

  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url.trim())) {
    return "video";
  }

  return "image";
}

function inferMediaSource(creditLine: string | null): "wikimedia" | "pexels" | "giphy" | undefined {
  const normalized = creditLine?.toLowerCase() ?? "";

  if (normalized.includes("giphy")) {
    return "giphy";
  }

  if (normalized.includes("pexels")) {
    return "pexels";
  }

  if (normalized.includes("wikimedia")) {
    return "wikimedia";
  }

  return undefined;
}

type PreferredSource = "auto" | "wikimedia" | "pexels" | "giphy";

export default function AdminMapTargetEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const mapType = typeof router.query.map_type === "string" ? router.query.map_type : "";
  const targetId = typeof router.query.target_id === "string" ? router.query.target_id : "";

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [parsingSlides, setParsingSlides] = useState(false);
  const [savingSlides, setSavingSlides] = useState(false);
  const [approvingStory, setApprovingStory] = useState(false);
  const [resolvingAllSlides, setResolvingAllSlides] = useState(false);
  const [resolvingSlideIndex, setResolvingSlideIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slideSuccess, setSlideSuccess] = useState<{ index: number; message: string } | null>(null);
  const [story, setStory] = useState<StoryPayload>(null);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [content, setContent] = useState("");
  const [rejectedMediaBySlide, setRejectedMediaBySlide] = useState<Record<string, string[]>>({});
  const [manualSearchBySlide, setManualSearchBySlide] = useState<Record<string, string>>({});
  const [pexelsSearchBySlide, setPexelsSearchBySlide] = useState<Record<string, string>>({});
  const [pexelsTypeBySlide, setPexelsTypeBySlide] = useState<Record<string, "image" | "video">>({});
  const [giphySearchBySlide, setGiphySearchBySlide] = useState<Record<string, string>>({});
  const [giphyTypeBySlide, setGiphyTypeBySlide] = useState<Record<string, "image" | "video">>({});
  const [youtubeUrlRu, setYoutubeUrlRu] = useState("");
  const [youtubeUrlHe, setYoutubeUrlHe] = useState("");
  const [youtubeUrlEn, setYoutubeUrlEn] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadData = useCallback(async () => {
    if (!sessionChecked || !mapType || !targetId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        mapType,
        targetId,
      });
      const data = await fetchJson<StoryResponse>(`/api/admin/map-story?${params.toString()}`);
      setStory(data.story);
      setSlides(data.slides);
      setContent(data.story?.content ?? "");
      setYoutubeUrlRu(data.story?.youtube_url_ru ?? "");
      setYoutubeUrlHe(data.story?.youtube_url_he ?? "");
      setYoutubeUrlEn(data.story?.youtube_url_en ?? "");
      setGoogleMapsUrl(data.story?.google_maps_url ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [mapType, sessionChecked, targetId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const title = useMemo(() => {
    if (!mapType || !targetId) {
      return "Map target";
    }
    return `${mapType} / ${targetId}`;
  }, [mapType, targetId]);

  const getSlideKey = useCallback(
    (slide: SlideItem, index: number) => slide.id || `${slide.story_id ?? "draft"}-${index}`,
    [],
  );

  const isLockedFlagSlide = useCallback(
    (index: number) => mapType === "flag" && index === 0,
    [mapType],
  );

  const handleSaveText = async () => {
    if (!mapType || !targetId || !content.trim()) {
      setError("Введите текст story перед сохранением.");
      return;
    }

    setSavingText(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await fetchJson<StoryResponse>("/api/admin/map-story", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mapType,
          targetId,
          content,
          youtube_url_ru: youtubeUrlRu,
          youtube_url_he: youtubeUrlHe,
          youtube_url_en: youtubeUrlEn,
          google_maps_url: googleMapsUrl,
        }),
      });

      setStory(data.story);
      setSlides(data.slides);
      setContent(data.story?.content ?? content);
      setYoutubeUrlRu(data.story?.youtube_url_ru ?? "");
      setYoutubeUrlHe(data.story?.youtube_url_he ?? "");
      setYoutubeUrlEn(data.story?.youtube_url_en ?? "");
      setGoogleMapsUrl(data.story?.google_maps_url ?? "");
      setSuccess("Текст сохранён.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingText(false);
    }
  };

  const handleParseSlides = async () => {
    if (!mapType || !targetId || !content.trim()) {
      setError("Нужен текст story, чтобы распарсить его в слайды.");
      return;
    }

    if (
      slides.length > 0 &&
      !window.confirm(
        "Перераспарсить текст и полностью перезаписать текущие слайды?",
      )
    ) {
      return;
    }

    setParsingSlides(true);
    setError(null);
    setSuccess(null);

    try {
      await fetchJson<{ ok: true; storyId: string; slidesCount: number }>(
        "/api/admin/map-story-slides/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mapType,
            targetId,
            content,
          }),
        },
      );

      await loadData();
      setSuccess(
        slides.length > 0
          ? "Слайды заново созданы из текста и полностью перезаписаны."
          : "Слайды созданы из текста.",
      );
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : String(parseError));
    } finally {
      setParsingSlides(false);
    }
  };

  const handleApproveStory = async () => {
    if (!mapType || !targetId || !story) {
      setError("Story не найдена.");
      return;
    }

    setApprovingStory(true);
    setError(null);
    setSuccess(null);

    try {
      await fetchJson<{ ok: true }>("/api/admin/map-story/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mapType,
          targetId,
        }),
      });

      await loadData();
      setSuccess("Story одобрена.");
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : String(approveError));
    } finally {
      setApprovingStory(false);
    }
  };

  const handleSlideChange = (index: number, value: string) => {
    setSlides((currentSlides) =>
      currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              text: value,
            }
          : slide,
      ),
    );
    setSlideSuccess(null);
  };

  const handleSlideImageUrlChange = (index: number, value: string) => {
    setSlides((currentSlides) =>
      currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              image_url: value,
            }
          : slide,
      ),
    );
    setSlideSuccess(null);
  };

  const handleSlideCreditLineChange = (index: number, value: string) => {
    setSlides((currentSlides) =>
      currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              credit_line: value,
            }
          : slide,
      ),
    );
    setSlideSuccess(null);
  };

  const handleRemoveSlideMedia = (index: number) => {
    if (isLockedFlagSlide(index)) {
      return;
    }

    setSlides((currentSlides) =>
      currentSlides.map((slide, slideIndex) =>
        slideIndex === index
          ? {
              ...slide,
              image_url: null,
              credit_line: null,
            }
          : slide,
      ),
    );
    setSuccess(null);
    setError(null);
    setSlideSuccess(null);
  };

  const handleInsertSlide = (index: number) => {
    setSlides((currentSlides) => {
      const nextSlides = [...currentSlides];
      nextSlides.splice(index, 0, {
        id: `draft-${Date.now()}-${index}`,
        story_id: story?.id ?? null,
        text: "",
        image_url: null,
        credit_line: null,
      });
      return nextSlides;
    });
    setSuccess(null);
    setError(null);
    setSlideSuccess(null);
  };

  const handleDeleteSlide = (index: number) => {
    const confirmed = window.confirm("Вы уверены что хотите стереть этот слайд?");
    if (!confirmed) {
      return;
    }

    setSlides((currentSlides) => currentSlides.filter((_, slideIndex) => slideIndex !== index));
    setSuccess(null);
    setError(null);
    setSlideSuccess(null);
  };

  const buildSlidesPayload = useCallback(
    (slideItems: SlideItem[]) => ({
      mapType,
      targetId,
      content,
      slides: slideItems.map((slide) => ({
        text: slide.text,
        image_url: slide.image_url,
        credit_line: slide.credit_line,
      })),
    }),
    [content, mapType, targetId],
  );

  const requestResolvedMedia = useCallback(
    async (
      slideText: string,
      excludedUrls: string[],
      options?: {
        searchQuery?: string;
        preferredSource?: PreferredSource;
        preferredType?: "image" | "video";
      },
    ) =>
      fetchJson<{
        type: "image" | "video";
        url: string;
        creditLine: string;
        source: string;
      }>("/api/admin/resolve-media", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slideText,
          targetId,
          mapType,
          searchQuery: options?.searchQuery,
          preferredSource: options?.preferredSource,
          preferredType: options?.preferredType,
          existingUrls: excludedUrls,
        }),
      }),
    [mapType, targetId],
  );

  const handleSaveSlides = async () => {
    if (!mapType || !targetId || slides.length === 0) {
      setError("Нет слайдов для сохранения.");
      return;
    }

    const invalidMedia = slides.find(
      (slide, index) =>
        slide.image_url &&
        isDisallowedMediaUrl(slide.image_url) &&
        !(isLockedFlagSlide(index) && isFlagBucketSvgUrl(slide.image_url)),
    );
    if (invalidMedia) {
      setError("PDF, SVG, DJVU, OGG, OGA и TIFF нельзя использовать как media URL, кроме первого flag-слайда.");
      return;
    }

    setSavingSlides(true);
    setError(null);
    setSuccess(null);
    setSlideSuccess(null);

    try {
      await fetchJson<{ ok: true; storyId: string; slidesCount: number }>(
        "/api/admin/map-story-slides/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildSlidesPayload(slides)),
        },
      );

      setSuccess("Слайды сохранены.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSavingSlides(false);
    }
  };

  const handleResolveMediaForAllSlides = async () => {
    if (!mapType || !targetId || slides.length === 0) {
      setError("Нет слайдов для автоподбора медиа.");
      return;
    }

    setResolvingAllSlides(true);
    setError(null);
    setSuccess(null);
    setSlideSuccess(null);
    let failedSlideIndex: number | null = null;

    try {
      const nextSlides = [...slides];
      const eligibleIndices = nextSlides
        .map((slide, index) => ({ slide, index }))
        .filter(({ slide, index }) => !isLockedFlagSlide(index) && slide.text.trim().length > 0)
        .map(({ index }) => index);
      const targetVideoCount = Math.min(
        eligibleIndices.length,
        eligibleIndices.length >= 12 ? 6 : eligibleIndices.length >= 9 ? 5 : Math.floor(eligibleIndices.length / 3),
      );
      const usedUrls = new Set<string>(
        nextSlides
          .filter((slide, index) => index === 0 && isLockedFlagSlide(index) && Boolean(slide.image_url))
          .map((slide) => slide.image_url as string),
      );
      let wikimediaCount = 0;
      let pexelsImageCount = 0;
      let pexelsVideoCount = 0;
      let giphyCount = 0;

      for (let index = 0; index < nextSlides.length; index += 1) {
        if (isLockedFlagSlide(index)) {
          if (nextSlides[index]?.image_url) {
            usedUrls.add(nextSlides[index].image_url as string);
          }
          continue;
        }

        const slide = nextSlides[index];
        if (!slide?.text.trim()) {
          continue;
        }

        setResolvingSlideIndex(index);
        failedSlideIndex = index;

        const intent = detectSlideIntent(slide.text);
        const preferences: Array<{ source: PreferredSource; type?: "image" | "video" }> = [];

        if (intent === "fact" || intent === "place") {
          preferences.push(
            { source: "wikimedia", type: "image" },
            { source: "pexels", type: "image" },
          );
        } else if (intent === "story") {
          preferences.push(
            { source: "giphy", type: "image" },
            { source: "pexels", type: "image" },
            { source: "wikimedia", type: "image" },
          );
        } else if (intent === "action") {
          if (pexelsVideoCount < targetVideoCount) {
            preferences.push({ source: "pexels", type: "video" });
          }
          preferences.push(
            { source: "giphy", type: "video" },
            { source: "giphy", type: "image" },
            { source: "pexels", type: "image" },
          );
        } else {
          if (wikimediaCount <= pexelsImageCount) {
            preferences.push(
              { source: "wikimedia", type: "image" },
              { source: "pexels", type: "image" },
            );
          } else {
            preferences.push(
              { source: "pexels", type: "image" },
              { source: "wikimedia", type: "image" },
            );
          }
          preferences.push({ source: "giphy", type: "image" });
        }

        let media:
          | {
              type: "image" | "video";
              url: string;
              creditLine: string;
              source: string;
            }
          | null = null;

        for (const preference of preferences) {
          const candidate = await requestResolvedMedia(slide.text, Array.from(usedUrls), {
            preferredSource: preference.source,
            preferredType: preference.type,
          });

          if (candidate.source === "fallback") {
            continue;
          }

          media = candidate;
          break;
        }

        if (!media) {
          media = await requestResolvedMedia(slide.text, Array.from(usedUrls));
        }

        nextSlides[index] = {
          ...slide,
          image_url: media.url,
          credit_line: media.creditLine,
        };
        usedUrls.add(media.url);

        const normalizedCredit = media.creditLine.toLowerCase();
        if (normalizedCredit.includes("wikimedia")) {
          wikimediaCount += 1;
        } else if (normalizedCredit.includes("giphy")) {
          giphyCount += 1;
        } else if (normalizedCredit.includes("pexels")) {
          if (media.type === "video") {
            pexelsVideoCount += 1;
          } else {
            pexelsImageCount += 1;
          }
        }
      }

      await fetchJson<{ ok: true; storyId: string; slidesCount: number }>(
        "/api/admin/map-story-slides/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildSlidesPayload(nextSlides)),
        },
      );

      setSlides(nextSlides);
      setSuccess(
        `Медиа автоматически подобраны: Wikimedia ${wikimediaCount}, Pexels image ${pexelsImageCount}, Pexels video ${pexelsVideoCount}, Giphy ${giphyCount}.`,
      );
    } catch (resolveError) {
      const message = resolveError instanceof Error ? resolveError.message : String(resolveError);
      setError(
        failedSlideIndex !== null
          ? `Ошибка при подборе медиа для слайда ${failedSlideIndex + 1}: ${message}`
          : message,
      );
    } finally {
      setResolvingSlideIndex(null);
      setResolvingAllSlides(false);
    }
  };

  const handleManualSearchChange = (slide: SlideItem, index: number, value: string) => {
    const slideKey = getSlideKey(slide, index);
    setManualSearchBySlide((current) => ({
      ...current,
      [slideKey]: value,
    }));
  };

  const handlePexelsSearchChange = (slide: SlideItem, index: number, value: string) => {
    const slideKey = getSlideKey(slide, index);
    setPexelsSearchBySlide((current) => ({
      ...current,
      [slideKey]: value,
    }));
  };

  const handlePexelsTypeChange = (slide: SlideItem, index: number, value: "image" | "video") => {
    const slideKey = getSlideKey(slide, index);
    setPexelsTypeBySlide((current) => ({
      ...current,
      [slideKey]: value,
    }));
  };

  const handleGiphySearchChange = (slide: SlideItem, index: number, value: string) => {
    const slideKey = getSlideKey(slide, index);
    setGiphySearchBySlide((current) => ({
      ...current,
      [slideKey]: value,
    }));
  };

  const handleGiphyTypeChange = (slide: SlideItem, index: number, value: "image" | "video") => {
    const slideKey = getSlideKey(slide, index);
    setGiphyTypeBySlide((current) => ({
      ...current,
      [slideKey]: value,
    }));
  };

  const handleResolveMedia = async (
    index: number,
    options?: {
      loadAnother?: boolean;
      searchQuery?: string;
      preferredSource?: PreferredSource;
      preferredType?: "image" | "video";
    },
  ) => {
    if (!mapType || !targetId) {
      setError("Не удалось определить map target.");
      return;
    }

    const slide = slides[index];
    if (!slide?.text.trim()) {
      setError("У слайда должен быть текст, чтобы подобрать медиа.");
      return;
    }

    setResolvingSlideIndex(index);
    setError(null);
    setSuccess(null);
    setSlideSuccess(null);

    try {
      const slideKey = getSlideKey(slide, index);
      const rejectedUrls = rejectedMediaBySlide[slideKey] ?? [];
      const extraExcludedUrls =
        options?.loadAnother && slide.image_url ? [...rejectedUrls, slide.image_url] : rejectedUrls;
      const inheritedSource =
        options?.loadAnother && !options?.preferredSource
          ? inferMediaSource(slide.credit_line)
          : options?.preferredSource;
      const inheritedType =
        options?.loadAnother && !options?.preferredType
          ? inferMediaType(slide.image_url)
          : options?.preferredType;

      if (options?.loadAnother && slide.image_url) {
        setRejectedMediaBySlide((current) => ({
          ...current,
          [slideKey]: Array.from(new Set([...(current[slideKey] ?? []), slide.image_url as string])),
        }));
      }

      const media = await requestResolvedMedia(
        slide.text,
        slides
          .filter((item, slideIndex) => slideIndex !== index && Boolean(item.image_url))
          .map((item) => item.image_url as string)
          .concat(extraExcludedUrls),
        {
          searchQuery: options?.searchQuery,
          preferredSource: inheritedSource,
          preferredType: inheritedType,
        },
      );

      const nextSlides = slides.map((item, slideIndex) =>
        slideIndex === index
          ? {
              ...item,
              image_url: media.url,
              credit_line: media.creditLine,
            }
          : item,
      );

      setSlides(nextSlides);
      setRejectedMediaBySlide((current) => ({
        ...current,
        [slideKey]: current[slideKey] ?? [],
      }));
      if (options?.searchQuery) {
        setManualSearchBySlide((current) => ({
          ...current,
          [slideKey]: options.searchQuery ?? "",
        }));
      }

      await fetchJson<{ ok: true; storyId: string; slidesCount: number }>(
        "/api/admin/map-story-slides/save",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mapType,
            targetId,
            content,
            slides: nextSlides.map((item) => ({
              text: item.text,
              image_url: item.image_url,
              credit_line: item.credit_line,
            })),
          }),
        },
      );

      setSlideSuccess({
        index,
        message: options?.loadAnother
          ? `Загружено другое медиа: ${media.source}`
          : `Медиа найдено: ${media.source}`,
      });
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : String(resolveError));
    } finally {
      setResolvingSlideIndex(null);
    }
  };

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="books-admin-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <header className="map-target-editor__header">
        <div>
          <Link href="/admin/map-targets" className="books-button books-button--ghost">
            Назад
          </Link>
          <h1 className="map-target-editor__title">{title}</h1>
          <p className="map-target-editor__subtitle">Редактирование текста story и связанных слайдов.</p>
        </div>
      </header>

      {error ? <div className="books-panel books-panel--error">{error}</div> : null}
      {success ? <div className="books-panel books-panel--success">{success}</div> : null}

      {loading ? (
        <section className="books-panel">
          <p>Загрузка данных map target...</p>
        </section>
      ) : (
        <>
          <section className="books-panel">
            <div className="map-target-editor__panel-header">
              <div>
                <h2 className="books-panel__title">Текст</h2>
                <p className="map-target-editor__panel-subtitle">
                  {story ? "Русская story найдена." : "Story ещё не создана. Можно ввести текст и сохранить."}
                </p>
                {story?.auto_generated && !story.is_approved ? (
                  <div className="map-target-editor__auto-badge">
                    Автоматическая генерация. Нужна ручная проверка и одобрение.
                  </div>
                ) : null}
              </div>
              <div className="map-target-editor__panel-actions">
                {story?.auto_generated && !story.is_approved ? (
                  <button
                    type="button"
                    className="books-button books-button--ghost"
                    onClick={() => void handleApproveStory()}
                    disabled={approvingStory}
                  >
                    {approvingStory ? "Одобряем..." : "Одобрить"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="books-button books-button--primary"
                  onClick={() => void handleSaveText()}
                  disabled={savingText}
                >
                  {savingText ? "Сохраняем..." : "Сохранить текст"}
                </button>
              </div>
            </div>

            <textarea
              className="books-input books-input--textarea map-target-editor__textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Введите story для этого target"
            />

            <div className="map-target-editor__youtube-fields">
              <div>
                <div className="map-target-editor__field-label">YouTube RU</div>
                <input
                  className="books-input map-target-editor__slide-input"
                  value={youtubeUrlRu}
                  onChange={(event) => setYoutubeUrlRu(event.target.value)}
                  placeholder="Необязательно. Вставьте YouTube link или iframe для RU"
                />
              </div>
              <div>
                <div className="map-target-editor__field-label">YouTube HE</div>
                <input
                  className="books-input map-target-editor__slide-input"
                  value={youtubeUrlHe}
                  onChange={(event) => setYoutubeUrlHe(event.target.value)}
                  placeholder="Необязательно. Вставьте YouTube link или iframe для HE"
                />
              </div>
              <div>
                <div className="map-target-editor__field-label">YouTube EN</div>
                <input
                  className="books-input map-target-editor__slide-input"
                  value={youtubeUrlEn}
                  onChange={(event) => setYoutubeUrlEn(event.target.value)}
                  placeholder="Необязательно. Вставьте YouTube link или iframe для EN"
                />
              </div>
              <div>
                <div className="map-target-editor__field-label">Большая карта Google</div>
                <input
                  className="books-input map-target-editor__slide-input"
                  value={googleMapsUrl}
                  onChange={(event) => setGoogleMapsUrl(event.target.value)}
                  placeholder="Необязательно. Вставьте Google Maps link или iframe"
                />
                {googleMapsUrl.trim() ? (
                  <div className="map-target-editor__map-link">
                    <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                      Открыть карту
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="books-panel">
            <div className="map-target-editor__panel-header">
              <div>
                <h2 className="books-panel__title">Слайды</h2>
                <p className="map-target-editor__panel-subtitle">
                  {slides.length > 0
                    ? `Найдено слайдов: ${slides.length}.`
                    : "Слайды ещё не созданы для этого target."}
                </p>
              </div>

              <div className="map-target-editor__panel-actions">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  onClick={() => void handleParseSlides()}
                  disabled={parsingSlides || !content.trim()}
                >
                  {parsingSlides
                    ? "Парсим..."
                    : slides.length > 0
                      ? "Перераспарсить текст"
                      : "Распарсить в слайды"}
                </button>
                {slides.length > 0 ? (
                  <button
                    type="button"
                    className="books-button books-button--ghost"
                    onClick={() => void handleResolveMediaForAllSlides()}
                    disabled={resolvingAllSlides || savingSlides}
                  >
                    {resolvingAllSlides ? "Подбираем медиа..." : "Подобрать медиа для всех"}
                  </button>
                ) : null}
                {slides.length > 0 ? (
                  <button
                    type="button"
                    className="books-button books-button--primary"
                    onClick={() => void handleSaveSlides()}
                    disabled={savingSlides || resolvingAllSlides}
                  >
                    {savingSlides ? "Сохраняем..." : "Сохранить слайды"}
                  </button>
                ) : null}
              </div>
            </div>

            {slides.length === 0 ? (
              <div className="map-target-editor__empty">
                {content.trim()
                  ? "Слайдов пока нет. Можно распарсить текущий текст."
                  : "Сначала добавьте текст story, потом распарсьте его в слайды."}
              </div>
            ) : (
              <div className="map-target-editor__slides">
                {slides.map((slide, index) => (
                  <article key={slide.id || `${slide.story_id}-${index}`} className="map-target-editor__slide">
                    <div className="map-target-editor__slide-toolbar">
                      <button
                        type="button"
                        className="map-target-editor__insert"
                        onClick={() => handleInsertSlide(index)}
                        title="Добавить слайд выше"
                        aria-label="Добавить слайд выше"
                      >
                        +
                      </button>
                      <div className="map-target-editor__slide-index">Слайд {index + 1}</div>
                      <button
                        type="button"
                        className="map-target-editor__delete"
                        onClick={() => handleDeleteSlide(index)}
                        title="Удалить слайд"
                        aria-label="Удалить слайд"
                      >
                        ×
                      </button>
                    </div>
                    <div className="map-target-editor__slide-grid">
                      {slideSuccess?.index === index ? (
                        <div className="books-panel books-panel--success map-target-editor__inline-success">
                          {slideSuccess.message}
                        </div>
                      ) : null}
                      <div>
                        <div className="map-target-editor__field-label">Текст</div>
                        <textarea
                          className="books-input books-input--textarea map-target-editor__slide-textarea"
                          value={slide.text}
                          onChange={(event) => handleSlideChange(index, event.target.value)}
                          placeholder="Текст слайда"
                        />
                      </div>
                      <div>
                        <div className="map-target-editor__field-label">image_url</div>
                        <div className="map-target-editor__media-actions">
                          <button
                            type="button"
                            className="books-button books-button--secondary map-target-editor__media-button"
                            onClick={() => void handleResolveMedia(index)}
                            disabled={resolvingAllSlides || resolvingSlideIndex === index || isLockedFlagSlide(index)}
                          >
                            {resolvingSlideIndex === index ? "Ищем..." : "Найти медиа"}
                          </button>
                          {slide.image_url ? (
                            <button
                              type="button"
                              className="books-button books-button--ghost map-target-editor__media-button"
                              onClick={() => void handleResolveMedia(index, { loadAnother: true })}
                              disabled={resolvingAllSlides || resolvingSlideIndex === index || isLockedFlagSlide(index)}
                            >
                              {resolvingSlideIndex === index ? "Ищем..." : "Загрузить другую"}
                            </button>
                          ) : null}
                          {slide.image_url ? (
                            <button
                              type="button"
                              className="books-button books-button--ghost map-target-editor__media-button"
                              onClick={() => handleRemoveSlideMedia(index)}
                              disabled={resolvingAllSlides || isLockedFlagSlide(index)}
                            >
                              Удалить медиа
                            </button>
                          ) : null}
                        </div>
                        <div className="map-target-editor__manual-search">
                          <input
                            className="books-input map-target-editor__slide-input"
                            value={manualSearchBySlide[getSlideKey(slide, index)] ?? ""}
                            onChange={(event) => handleManualSearchChange(slide, index, event.target.value)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                (manualSearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                              ) {
                                event.preventDefault();
                                void handleResolveMedia(index, {
                                  searchQuery: manualSearchBySlide[getSlideKey(slide, index)] ?? "",
                                });
                              }
                            }}
                            placeholder="Ключевое слово для ручного поиска"
                          />
                          <button
                            type="button"
                            className="books-button books-button--ghost map-target-editor__media-button"
                            onClick={() =>
                              void handleResolveMedia(index, {
                                searchQuery: manualSearchBySlide[getSlideKey(slide, index)] ?? "",
                              })
                            }
                            disabled={
                              resolvingSlideIndex === index ||
                              resolvingAllSlides ||
                              isLockedFlagSlide(index) ||
                              !(manualSearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                            }
                          >
                            Искать по слову
                          </button>
                        </div>
                        <div className="map-target-editor__manual-search">
                          <input
                            className="books-input map-target-editor__slide-input"
                            value={pexelsSearchBySlide[getSlideKey(slide, index)] ?? ""}
                            onChange={(event) => handlePexelsSearchChange(slide, index, event.target.value)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                (pexelsSearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                              ) {
                                event.preventDefault();
                                void handleResolveMedia(index, {
                                  searchQuery: pexelsSearchBySlide[getSlideKey(slide, index)] ?? "",
                                  preferredSource: "pexels",
                                  preferredType: pexelsTypeBySlide[getSlideKey(slide, index)] ?? "image",
                                });
                              }
                            }}
                            placeholder="Pexels: ключевое слово"
                          />
                          <select
                            className="books-input map-target-editor__type-select"
                            value={pexelsTypeBySlide[getSlideKey(slide, index)] ?? "image"}
                            onChange={(event) =>
                              handlePexelsTypeChange(
                                slide,
                                index,
                                event.target.value === "video" ? "video" : "image",
                              )
                            }
                          >
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                          </select>
                          <button
                            type="button"
                            className="books-button books-button--ghost map-target-editor__media-button"
                            onClick={() =>
                              void handleResolveMedia(index, {
                                searchQuery: pexelsSearchBySlide[getSlideKey(slide, index)] ?? "",
                                preferredSource: "pexels",
                                preferredType: pexelsTypeBySlide[getSlideKey(slide, index)] ?? "image",
                              })
                            }
                            disabled={
                              resolvingSlideIndex === index ||
                              resolvingAllSlides ||
                              isLockedFlagSlide(index) ||
                              !(pexelsSearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                            }
                          >
                            Искать в Pexels
                          </button>
                        </div>
                        <div className="map-target-editor__manual-search">
                          <input
                            className="books-input map-target-editor__slide-input"
                            value={giphySearchBySlide[getSlideKey(slide, index)] ?? ""}
                            onChange={(event) => handleGiphySearchChange(slide, index, event.target.value)}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Enter" &&
                                !event.shiftKey &&
                                (giphySearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                              ) {
                                event.preventDefault();
                                void handleResolveMedia(index, {
                                  searchQuery: giphySearchBySlide[getSlideKey(slide, index)] ?? "",
                                  preferredSource: "giphy",
                                  preferredType: giphyTypeBySlide[getSlideKey(slide, index)] ?? "image",
                                });
                              }
                            }}
                            placeholder="Giphy: ключевое слово"
                          />
                          <select
                            className="books-input map-target-editor__type-select"
                            value={giphyTypeBySlide[getSlideKey(slide, index)] ?? "image"}
                            onChange={(event) =>
                              handleGiphyTypeChange(
                                slide,
                                index,
                                event.target.value === "video" ? "video" : "image",
                              )
                            }
                          >
                            <option value="image">GIF</option>
                            <option value="video">Video</option>
                          </select>
                          <button
                            type="button"
                            className="books-button books-button--ghost map-target-editor__media-button"
                            onClick={() =>
                              void handleResolveMedia(index, {
                                searchQuery: giphySearchBySlide[getSlideKey(slide, index)] ?? "",
                                preferredSource: "giphy",
                                preferredType: giphyTypeBySlide[getSlideKey(slide, index)] ?? "image",
                              })
                            }
                            disabled={
                              resolvingSlideIndex === index ||
                              resolvingAllSlides ||
                              isLockedFlagSlide(index) ||
                              !(giphySearchBySlide[getSlideKey(slide, index)] ?? "").trim()
                            }
                          >
                            Искать в Giphy
                          </button>
                        </div>
                        <input
                          className="books-input map-target-editor__slide-input"
                          value={slide.image_url ?? ""}
                          onChange={(event) => handleSlideImageUrlChange(index, event.target.value)}
                          placeholder={
                            isLockedFlagSlide(index)
                              ? "Первый slide у flag всегда берёт SVG из bucket flags-svg"
                              : "https://... image or video url (no pdf/svg/djvu/ogg/oga/tiff)"
                          }
                          disabled={isLockedFlagSlide(index)}
                        />
                        {slide.image_url ? (
                          <div className="map-target-editor__preview">
                            {isDisallowedMediaUrl(slide.image_url) &&
                            !(isLockedFlagSlide(index) && isFlagBucketSvgUrl(slide.image_url)) ? (
                              <div className="map-target-editor__slide-meta">
                                Нельзя использовать PDF, SVG, DJVU, OGG, OGA или TIFF. Укажите другой URL.
                              </div>
                            ) : /\.(mp4|webm|mov)(\?.*)?$/i.test(slide.image_url) ? (
                              <video
                                className="map-target-editor__preview-media"
                                src={slide.image_url}
                                controls
                                preload="none"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                className="map-target-editor__preview-media"
                                src={slide.image_url}
                                alt={`Preview ${index + 1}`}
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                            <a href={slide.image_url} target="_blank" rel="noreferrer">
                              Открыть источник
                            </a>
                            {isLockedFlagSlide(index) ? (
                              <div className="map-target-editor__slide-meta">
                                Для `flag` первый слайд всегда фиксируется из bucket `flags-svg`.
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="map-target-editor__slide-meta">
                            {isLockedFlagSlide(index)
                              ? "После сохранения/парсинга сюда будет подставлен флаг из bucket flags-svg."
                              : "—"}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="map-target-editor__field-label">credit_line</div>
                        <input
                          className="books-input map-target-editor__slide-input"
                          value={slide.credit_line ?? ""}
                          onChange={(event) => handleSlideCreditLineChange(index, event.target.value)}
                          placeholder="Wikimedia Commons, Pexels, custom source..."
                        />
                      </div>
                    </div>
                  </article>
                ))}
                <button
                  type="button"
                  className="map-target-editor__insert-tail"
                  onClick={() => handleInsertSlide(slides.length)}
                >
                  + Добавить слайд в конец
                </button>
              </div>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        .map-target-editor__header {
          margin-bottom: 24px;
        }

        .map-target-editor__title {
          margin: 16px 0 8px;
          font-size: 32px;
        }

        .map-target-editor__subtitle,
        .map-target-editor__panel-subtitle {
          margin: 0;
          color: #667085;
        }

        .map-target-editor__auto-badge {
          margin-top: 10px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: #fff7e6;
          color: #9a6700;
          font-size: 13px;
          font-weight: 700;
        }

        .map-target-editor__panel-header {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 16px;
        }

        .map-target-editor__panel-actions {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .map-target-editor__textarea {
          min-height: 240px;
        }

        .map-target-editor__youtube-fields {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .map-target-editor__map-link {
          margin-top: 8px;
          font-size: 14px;
        }

        .map-target-editor__empty {
          padding: 20px;
          border: 1px dashed #d0d5dd;
          border-radius: 12px;
          color: #667085;
          background: #fcfcfd;
        }

        .map-target-editor__slides {
          display: grid;
          gap: 16px;
        }

        .map-target-editor__slide {
          border: 1px solid #eaecf0;
          border-radius: 14px;
          padding: 18px;
          background: #fcfcfd;
        }

        .map-target-editor__slide-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .map-target-editor__slide-index {
          font-size: 13px;
          font-weight: 700;
          color: #475467;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .map-target-editor__insert,
        .map-target-editor__delete {
          width: 32px;
          min-width: 32px;
          height: 32px;
          margin: 0;
          padding: 0;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }

        .map-target-editor__insert {
          border: 1px solid #98a2b3;
          background: #ffffff;
          color: #344054;
        }

        .map-target-editor__delete {
          border: 1px solid #f04438;
          background: #fff1f3;
          color: #d92d20;
        }

        .map-target-editor__insert-tail {
          width: auto;
          margin: 0;
          padding: 10px 14px;
          border: 1px dashed #98a2b3;
          border-radius: 12px;
          background: #ffffff;
          color: #344054;
          cursor: pointer;
          font-weight: 600;
        }

        .map-target-editor__slide-grid {
          display: grid;
          gap: 16px;
        }

        .map-target-editor__inline-success {
          margin: 0;
        }

        .map-target-editor__field-label {
          font-size: 12px;
          font-weight: 700;
          color: #667085;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .map-target-editor__slide-text,
        .map-target-editor__slide-meta {
          white-space: pre-wrap;
          word-break: break-word;
          color: #101828;
        }

        .map-target-editor__slide-textarea {
          min-height: 120px;
          margin: 0;
        }

        .map-target-editor__slide-input {
          margin: 0;
        }

        .map-target-editor__preview {
          display: grid;
          gap: 10px;
          margin-top: 10px;
        }

        .map-target-editor__preview-media {
          max-width: 100%;
          max-height: 240px;
          border-radius: 12px;
          border: 1px solid #d0d5dd;
          background: #f8fafc;
        }

        .map-target-editor__media-actions {
          margin-bottom: 10px;
        }

        .map-target-editor__media-button {
          width: auto;
          margin: 0;
        }

        .map-target-editor__manual-search {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 10px;
        }

        .map-target-editor__manual-search :global(input) {
          flex: 1;
        }

        .map-target-editor__type-select {
          width: 120px;
          margin: 0;
        }

        @media (max-width: 768px) {
          .map-target-editor__manual-search {
            flex-direction: column;
            align-items: stretch;
          }
        }

        @media (max-width: 768px) {
          .map-target-editor__panel-header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
