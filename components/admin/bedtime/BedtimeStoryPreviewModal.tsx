"use client";

import { useEffect, useMemo, useState } from "react";
import type { BedtimeStoryLanguage, BedtimeStoryRecord } from "../../../lib/bedtime-stories/types.ts";
import { getBedtimePreviewPages } from "../../../lib/bedtime-stories/preview.ts";

export function BedtimeStoryPreviewModal({
  story,
  initialLanguage = "ru",
  onClose,
}: {
  story: BedtimeStoryRecord;
  initialLanguage?: BedtimeStoryLanguage;
  onClose: () => void;
}) {
  const [lang, setLang] = useState<BedtimeStoryLanguage>(initialLanguage);
  const [pageIndex, setPageIndex] = useState(0);

  const pages = useMemo(() => getBedtimePreviewPages(story, lang), [story, lang]);

  const pageCount = Math.max(1, pages.length);
  const currentPage = pages[pageIndex] || pages[0];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft") {
        setPageIndex((prev) => Math.max(0, prev - 1));
      } else if (event.key === "ArrowRight") {
        setPageIndex((prev) => Math.min(pageCount - 1, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pageCount]);

  return (
    <div
      className="bedtime-reader-backdrop"
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(10, 15, 25, 0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={story.title?.[lang] || story.slug}
        dir={lang === "he" ? "rtl" : "ltr"}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "#fffbf4",
          color: "#1c2430",
          borderRadius: 16,
          boxShadow: "0 24px 48px rgba(0,0,0,0.35)",
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
            background: "#fef9f0",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              {story.title?.[lang] || story.title?.ru || story.title?.en || story.slug}
            </h3>
            <small style={{ color: "#718096" }}>{story.slug}</small>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {(["ru", "en", "he"] as BedtimeStoryLanguage[]).map((l) => (
              <button
                key={l}
                type="button"
                className={lang === l ? "books-button books-button--primary" : "books-button books-button--ghost"}
                style={{ padding: "4px 8px", fontSize: "0.75rem", minHeight: 28 }}
                onClick={() => {
                  setLang(l);
                  setPageIndex(0);
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className="books-button books-button--ghost"
              style={{ padding: "4px 10px", fontSize: "1.2rem", lineHeight: 1, minHeight: 28 }}
              onClick={onClose}
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </header>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "center", minHeight: 380 }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "4 / 5",
              background: "#ede5d8",
              borderRadius: 12,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {currentPage?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentPage.imageUrl}
                alt={`Page ${currentPage.pageNumber}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={{ color: "#8c8273", fontSize: "0.95rem", textAlign: "center", padding: 20 }}>
                Page {currentPage?.pageNumber || pageIndex + 1}: Image not yet added for {lang.toUpperCase()}
              </div>
            )}
          </div>

          {currentPage?.text ? (
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: "0.95rem",
                color: "#2d3748",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              {currentPage.text}
            </p>
          ) : null}
        </div>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px",
            borderTop: "1px solid rgba(0,0,0,0.08)",
            background: "#fef9f0",
          }}
        >
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            style={{ minHeight: 32, padding: "4px 12px" }}
          >
            {lang === "he" ? "→ הקודם" : "← Previous"}
          </button>
          <span style={{ fontSize: "0.85rem", color: "#4a5568", fontWeight: 600 }}>
            {pageIndex + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => setPageIndex((prev) => Math.min(pageCount - 1, prev + 1))}
            style={{ minHeight: 32, padding: "4px 12px" }}
          >
            {lang === "he" ? "הבא ←" : "Next →"}
          </button>
        </footer>
      </section>
    </div>
  );
}
