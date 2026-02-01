"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../components/AdminTabs";
import { AdminLogout } from "../../components/AdminLogout";

type VideoFormat = "video" | "short";
type LanguageDependency = "spoken" | "visual";

type ContentLanguage = "ru" | "he" | "en";

type ParsedYouTubeData = {
  youtubeId: string;
};

const CATEGORY_OPTIONS = [
  { key: "animals", label: "🐾 animals" },
  { key: "science", label: "🔬 science" },
  { key: "nature", label: "🌿 nature" },
  { key: "space", label: "🚀 space" },
  { key: "art", label: "🎨 art" },
  { key: "music", label: "🎵 music" },
  { key: "human", label: "🧠 human" },
] as const;

export default function UploadVideoPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);

  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [format, setFormat] = useState<VideoFormat>("video");
  const [categoryKey, setCategoryKey] =
    useState<(typeof CATEGORY_OPTIONS)[number]["key"]>("animals");
  const [languageDependency, setLanguageDependency] =
    useState<LanguageDependency>("spoken");
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>("en");

  const [parsed, setParsed] = useState<ParsedYouTubeData | null>(null);
  const [titleRu, setTitleRu] = useState("");
  const [titleHe, setTitleHe] = useState("");
  const [titleEn, setTitleEn] = useState("");

  const [sourceChannel, setSourceChannel] = useState("");
  const [durationLabel, setDurationLabel] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ───────────────────────────────
  // Auth guard
  // ───────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  useEffect(() => {
    // If input is empty — reset parsed state
    if (!youtubeUrl.trim()) {
      if (parsed !== null) {
        setParsed(null);
      }
      return;
    }

    // If there is a parsed video, but URL now points to a different video — reset
    if (parsed) {
      const nextId = extractYouTubeId(youtubeUrl);
      if (!nextId || nextId !== parsed.youtubeId) {
        setParsed(null);
      }
    }
  }, [youtubeUrl, parsed]);

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session…</p>;
  }

  // ───────────────────────────────
  // Helpers
  // ───────────────────────────────
  function extractYouTubeId(input: string): string | null {
    const text = input.trim();

    // 1) If iframe HTML was pasted, extract src
    const iframeMatch = text.match(/src=["']([^"']+)["']/i);
    const urlString = iframeMatch ? iframeMatch[1] : text;

    try {
      const url = new URL(urlString);

      // youtu.be/<id>
      if (url.hostname.includes("youtu.be")) {
        return url.pathname.replace("/", "");
      }

      // youtube.com/watch?v=<id>
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      // youtube.com/shorts/<id>
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/shorts/")[1];
      }

      // youtube.com/embed/<id>
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/embed/")[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  async function parseYouTube() {
    setError(null);
    setParsed(null);

    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setError(
        "Cannot detect YouTube ID. Paste a Shorts link, Watch link, or Embed iframe.",
      );
      return;
    }

    setParsed({ youtubeId: id });
  }

  async function submit() {
    if (!parsed) {
      setError("Parse YouTube video first");
      return;
    }

    if (!titleRu.trim() && !titleHe.trim() && !titleEn.trim()) {
      setError("At least one title (RU, HE or EN) is required");
      return;
    }

    if (!categoryKey.trim()) {
      setError("Category key is required");
      return;
    }

    if (!sourceChannel.trim()) {
      setError("Source channel is required");
      setIsSubmitting(false);
      return;
    }

    if (format === "video") {
      if (!/^\d{2}:\d{2}$/.test(durationLabel)) {
        setError("Duration must be in MM:SS format");
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const contentLanguages =
      languageDependency === "visual" ? ["all"] : [contentLanguage];

    if (languageDependency === "spoken" && !contentLanguage) {
      setError("Content language is required for spoken videos");
      setIsSubmitting(false);
      return;
    }

    const videoId = [categoryKey, parsed.youtubeId, format].join("-");

    const payload = {
      id: videoId,
      format,
      category_key: categoryKey,
      language_dependency: languageDependency,
      content_languages: contentLanguages,
      title: {
        ...(titleRu && { ru: titleRu }),
        ...(titleHe && { he: titleHe }),
        ...(titleEn && { en: titleEn }),
      },
      source: {
        platform: "youtube",
        channel: sourceChannel,
      },
      youtube_id: parsed.youtubeId,
      duration_label: format === "video" ? durationLabel : null,
      status: "approved",
    };

    const { error } = await supabase.from("videos").insert(payload);

    if (error) {
      setError(error.message);
      setIsSubmitting(false);
      return;
    }

    setSuccess("Video saved");
    setIsSubmitting(false);
  }

  // ───────────────────────────────
  // UI
  // ───────────────────────────────
  return (
    <div className="upload-video">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <h1 className="upload-video__title">Upload video</h1>
      <div className="upload-video__form">
        <label className="upload-video__label">
          YouTube URL
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            className="upload-video__input"
          />
        </label>

        <button
          onClick={parseYouTube}
          className={[
            "upload-video__button",
            "upload-video__button--secondary",
            parsed ? "is-active" : "",
          ].join(" ")}
        >
          {parsed ? "Parsed ✓" : "Parse YouTube"}
        </button>

        {parsed && (
          <div className="upload-video__parsed">
            <div>
              <strong>YouTube ID:</strong> {parsed.youtubeId}
            </div>
          </div>
        )}

        {parsed && (
          <div>
            <label className="upload-video__label">
              Title (RU)
              <input
                type="text"
                value={titleRu}
                onChange={(e) => setTitleRu(e.target.value)}
                className="upload-video__input"
              />
            </label>

            <label className="upload-video__label">
              Title (HE)
              <input
                type="text"
                value={titleHe}
                onChange={(e) => setTitleHe(e.target.value)}
                className="upload-video__input upload-video__input--rtl"
              />
            </label>

            <label className="upload-video__label">
              Title (EN)
              <input
                type="text"
                value={titleEn}
                onChange={(e) => setTitleEn(e.target.value)}
                className="upload-video__input"
              />
            </label>
          </div>
        )}

        <hr className="upload-video__divider" />

        <label className="upload-video__label">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as VideoFormat)}
            className="upload-video__input"
          >
            <option value="video">video</option>
            <option value="short">short</option>
          </select>
        </label>

        <label className="upload-video__label">
          Category
          <select
            value={categoryKey}
            onChange={(e) =>
              setCategoryKey(
                e.target.value as (typeof CATEGORY_OPTIONS)[number]["key"],
              )
            }
            className="upload-video__input"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {format === "video" && (
          <label className="upload-video__label">
            Duration (MM:SS)
            <input
              type="text"
              placeholder="10:42"
              value={durationLabel}
              onChange={(e) =>
                setDurationLabel(e.target.value.replace(/[^0-9:]/g, ""))
              }
              className="upload-video__input"
            />
          </label>
        )}

        <label className="upload-video__label">
          Source channel (YouTube)
          <input
            type="text"
            value={sourceChannel}
            onChange={(e) => setSourceChannel(e.target.value)}
            className="upload-video__input"
          />
        </label>

        <label className="upload-video__label">
          Language dependency
          <select
            value={languageDependency}
            onChange={(e) =>
              setLanguageDependency(e.target.value as LanguageDependency)
            }
            className="upload-video__input"
          >
            <option value="spoken">spoken</option>
            <option value="visual">visual</option>
          </select>
        </label>

        {languageDependency === "spoken" && (
          <label className="upload-video__label">
            Content language
            <select
              value={contentLanguage}
              onChange={(e) =>
                setContentLanguage(e.target.value as ContentLanguage)
              }
              className="upload-video__input"
            >
              <option value="en">English</option>
              <option value="ru">Russian</option>
              <option value="he">Hebrew</option>
            </select>
          </label>
        )}

        {error && <p style={{ color: "red", marginTop: 16 }}>Error: {error}</p>}

        {success && <p style={{ color: "green", marginTop: 16 }}>{success}</p>}

        <button
          onClick={submit}
          disabled={isSubmitting}
          className={`upload-video__button upload-video__button--primary ${
            success ? "is-success" : ""
          }`}
        >
          {isSubmitting ? "Saving…" : "Save video"}
        </button>
      </div>
    </div>
  );
}
