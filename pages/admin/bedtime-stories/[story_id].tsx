"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { toBlob } from "html-to-image";
import JSZip from "jszip";
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

type BedtimeTextFont =
  | "Nunito"
  | "Varela Round"
  | "Caveat"
  | "Amatic SC"
  | "Hachi Maru Pop"
  | "Pacifico"
  | "Rampart One"
  | "Rubik Doodle Shadow"
  | "Arial";

type BedtimeTextLayout = {
  kind: "bedtime_text_layout";
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: BedtimeTextFont;
  textColor: string;
  align: "left" | "center" | "right";
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  rotation: number;
};

type BedtimeLogoLayout = {
  kind: "bedtime_logo_layout";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type BedtimeMarkerLayout = Omit<BedtimeLogoLayout, "kind"> & {
  kind: "bedtime_marker_layout";
  assetId: string;
  name: string;
  path: string;
  url: string;
  hidden: boolean;
};

type BedtimeStampLayout = Omit<BedtimeMarkerLayout, "kind"> & {
  kind: "bedtime_stamp_layout";
};

type BedtimeNumberLayout = Omit<BedtimeTextLayout, "kind"> & {
  kind: "bedtime_number_layout";
};

type BedtimeEditableKind = "text" | "logo" | "number" | "stamp" | "marker";
type BedtimeEditableLayout = BedtimeTextLayout | BedtimeLogoLayout | BedtimeNumberLayout | BedtimeStampLayout | BedtimeMarkerLayout;

type BedtimeStampLibraryItem = {
  id: string;
  name: string;
  path: string;
  url: string;
  prompt: string | null;
  tags: string[];
  created_at: string | null;
};

type TextInteraction = {
  action: "move" | "resize" | "rotate";
  target: BedtimeEditableKind;
  slideNumber: number;
  startClientX: number;
  startClientY: number;
  startLayout: BedtimeEditableLayout;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
};

const BEDTIME_TEXT_FONTS: Array<{ label: string; value: BedtimeTextFont; css: string }> = [
  { label: "Nunito", value: "Nunito", css: "Nunito, Arial, sans-serif" },
  { label: "Varela Round", value: "Varela Round", css: "\"Varela Round\", Arial, sans-serif" },
  { label: "Caveat", value: "Caveat", css: "Caveat, cursive" },
  { label: "Amatic SC", value: "Amatic SC", css: "\"Amatic SC\", cursive" },
  { label: "Hachi Maru Pop", value: "Hachi Maru Pop", css: "\"Hachi Maru Pop\", cursive" },
  { label: "Pacifico", value: "Pacifico", css: "Pacifico, cursive" },
  { label: "Rampart One", value: "Rampart One", css: "\"Rampart One\", cursive" },
  { label: "Rubik Doodle Shadow", value: "Rubik Doodle Shadow", css: "\"Rubik Doodle Shadow\", cursive" },
  { label: "Arial", value: "Arial", css: "Arial, sans-serif" },
];

const DEFAULT_TEXT_LAYOUT: BedtimeTextLayout = {
  kind: "bedtime_text_layout",
  x: 55,
  y: 8,
  width: 40,
  height: 76,
  fontSize: 28,
  fontFamily: "Amatic SC",
  textColor: "#1c2430",
  align: "right",
  backgroundEnabled: false,
  backgroundColor: "#fffbf4",
  backgroundOpacity: 0,
  rotation: 0,
};

const DEFAULT_LOGO_LAYOUT: BedtimeLogoLayout = {
  kind: "bedtime_logo_layout",
  x: 3.8661,
  y: 2.1441,
  width: 20,
  height: 10,
  rotation: -13.0997,
};

const DEFAULT_MARKER_LAYOUT: BedtimeMarkerLayout = {
  kind: "bedtime_marker_layout",
  x: 8,
  y: 72,
  width: 18,
  height: 14,
  rotation: -8,
  assetId: "",
  name: "",
  path: "",
  url: "",
  hidden: true,
};

const DEFAULT_STAMP_LAYOUT: BedtimeStampLayout = {
  kind: "bedtime_stamp_layout",
  x: 7,
  y: 13,
  width: 18,
  height: 14,
  rotation: -8,
  assetId: "",
  name: "",
  path: "",
  url: "",
  hidden: true,
};

const DEFAULT_NUMBER_LAYOUT: BedtimeNumberLayout = {
  kind: "bedtime_number_layout",
  x: 42.6838,
  y: 90.5521,
  width: 10,
  height: 8,
  fontSize: 24,
  fontFamily: "Amatic SC",
  textColor: "#1c2430",
  align: "center",
  backgroundEnabled: false,
  backgroundColor: "#ffffff",
  backgroundOpacity: 0,
  rotation: 0,
};

const LAPLAPLA_LOGO_URL = "https://media.laplapla.com/stickers/laplapla-logo-aquarelle.webp";

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
  const slides = story.slides.map((slide, index) => ({
    ...slide,
    stamp_prompt: index === 0 ? slide.stamp_prompt : "",
  }));
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
      slides,
    },
    slides,
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

function storyAutosaveSignature(story: BedtimeStoryRecord) {
  return JSON.stringify({
    slides: story.slides,
    stamp_assets: story.stamp_assets,
    marker_assets: story.marker_assets,
    images: story.images,
    cover_image_url: story.cover_image_url,
  });
}

function captionText(story: BedtimeStoryRecord, language: BedtimeStoryLanguage) {
  return [story.instagram_caption[language], story.instagram_hashtags.join(" ")].filter(Boolean).join("\n\n");
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function fontCss(font: BedtimeTextFont) {
  return BEDTIME_TEXT_FONTS.find((item) => item.value === font)?.css ?? "\"Amatic SC\", cursive";
}

function proxiedMediaUrl(url: string) {
  if (!url) {
    return "";
  }
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(publicBase);
    if (parsedUrl.host !== parsedBase.host) {
      return url;
    }
    const key = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
    return `/api/admin/recipes/media-object?key=${encodeURIComponent(key)}`;
  } catch {
    return url;
  }
}

function hexToRgba(hex: string, opacity: number) {
  const value = hex.replace("#", "");
  const normalized = value.length === 3
    ? value.split("").map((char) => `${char}${char}`).join("")
    : value.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function localizedLayerRecord(layer: Record<string, unknown>, language: BedtimeStoryLanguage): Record<string, unknown> | null {
  const languageLayouts = layer.languageLayouts;
  if (!languageLayouts || typeof languageLayouts !== "object" || Array.isArray(languageLayouts)) {
    return null;
  }
  const localized = (languageLayouts as Record<string, unknown>)[language];
  if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
    return null;
  }
  return { ...layer, ...localized as Record<string, unknown> };
}

function languageLayoutRecord(layer: Record<string, unknown>, language: BedtimeStoryLanguage): Record<string, unknown> {
  return localizedLayerRecord(layer, language) ?? layer;
}

function readTextLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): BedtimeTextLayout {
  const layer = slide.layers.find((item) => item.kind === "bedtime_text_layout");
  if (!layer) {
    return DEFAULT_TEXT_LAYOUT;
  }
  const record = localizedLayerRecord(layer, language) ?? DEFAULT_TEXT_LAYOUT;

  const fontFamily = BEDTIME_TEXT_FONTS.some((font) => font.value === record.fontFamily)
    ? record.fontFamily as BedtimeTextFont
    : DEFAULT_TEXT_LAYOUT.fontFamily;
  const align = record.align === "left" || record.align === "center" || record.align === "right"
    ? record.align
    : DEFAULT_TEXT_LAYOUT.align;

  return {
    kind: "bedtime_text_layout",
    x: typeof record.x === "number" ? record.x : DEFAULT_TEXT_LAYOUT.x,
    y: typeof record.y === "number" ? record.y : DEFAULT_TEXT_LAYOUT.y,
    width: typeof record.width === "number" ? record.width : DEFAULT_TEXT_LAYOUT.width,
    height: typeof record.height === "number" ? record.height : DEFAULT_TEXT_LAYOUT.height,
    fontSize: typeof record.fontSize === "number" ? record.fontSize : DEFAULT_TEXT_LAYOUT.fontSize,
    fontFamily,
    textColor: typeof record.textColor === "string" ? record.textColor : DEFAULT_TEXT_LAYOUT.textColor,
    align,
    backgroundEnabled: typeof record.backgroundEnabled === "boolean" ? record.backgroundEnabled : DEFAULT_TEXT_LAYOUT.backgroundEnabled,
    backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : DEFAULT_TEXT_LAYOUT.backgroundColor,
    backgroundOpacity: typeof record.backgroundOpacity === "number" ? record.backgroundOpacity : DEFAULT_TEXT_LAYOUT.backgroundOpacity,
    rotation: typeof record.rotation === "number" ? record.rotation : DEFAULT_TEXT_LAYOUT.rotation,
  };
}

function readLogoLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): BedtimeLogoLayout {
  const layer = slide.layers.find((item) => item.kind === "bedtime_logo_layout");
  if (!layer) {
    return DEFAULT_LOGO_LAYOUT;
  }
  const record = languageLayoutRecord(layer, language);
  return {
    kind: "bedtime_logo_layout",
    x: typeof record.x === "number" ? record.x : DEFAULT_LOGO_LAYOUT.x,
    y: typeof record.y === "number" ? record.y : DEFAULT_LOGO_LAYOUT.y,
    width: typeof record.width === "number" ? record.width : DEFAULT_LOGO_LAYOUT.width,
    height: typeof record.height === "number" ? record.height : DEFAULT_LOGO_LAYOUT.height,
    rotation: typeof record.rotation === "number" ? record.rotation : DEFAULT_LOGO_LAYOUT.rotation,
  };
}

function readNumberLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): BedtimeNumberLayout {
  const layer = slide.layers.find((item) => item.kind === "bedtime_number_layout");
  if (!layer) {
    return DEFAULT_NUMBER_LAYOUT;
  }
  const record = languageLayoutRecord(layer, language);
  return {
    kind: "bedtime_number_layout",
    x: typeof record.x === "number" ? record.x : DEFAULT_NUMBER_LAYOUT.x,
    y: typeof record.y === "number" ? record.y : DEFAULT_NUMBER_LAYOUT.y,
    width: typeof record.width === "number" ? record.width : DEFAULT_NUMBER_LAYOUT.width,
    height: typeof record.height === "number" ? record.height : DEFAULT_NUMBER_LAYOUT.height,
    fontSize: typeof record.fontSize === "number" ? record.fontSize : DEFAULT_NUMBER_LAYOUT.fontSize,
    fontFamily: BEDTIME_TEXT_FONTS.some((font) => font.value === record.fontFamily) ? record.fontFamily as BedtimeTextFont : DEFAULT_NUMBER_LAYOUT.fontFamily,
    textColor: typeof record.textColor === "string" ? record.textColor : DEFAULT_NUMBER_LAYOUT.textColor,
    align: record.align === "left" || record.align === "center" || record.align === "right" ? record.align : DEFAULT_NUMBER_LAYOUT.align,
    backgroundEnabled: typeof record.backgroundEnabled === "boolean" ? record.backgroundEnabled : DEFAULT_NUMBER_LAYOUT.backgroundEnabled,
    backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : DEFAULT_NUMBER_LAYOUT.backgroundColor,
    backgroundOpacity: typeof record.backgroundOpacity === "number" ? record.backgroundOpacity : DEFAULT_NUMBER_LAYOUT.backgroundOpacity,
    rotation: typeof record.rotation === "number" ? record.rotation : DEFAULT_NUMBER_LAYOUT.rotation,
  };
}

function readMarkerLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): BedtimeMarkerLayout {
  const layer = slide.layers.find((item) => item.kind === "bedtime_marker_layout");
  if (!layer) {
    return DEFAULT_MARKER_LAYOUT;
  }
  const record = languageLayoutRecord(layer, language);
  return {
    kind: "bedtime_marker_layout",
    x: typeof record.x === "number" ? record.x : DEFAULT_MARKER_LAYOUT.x,
    y: typeof record.y === "number" ? record.y : DEFAULT_MARKER_LAYOUT.y,
    width: typeof record.width === "number" ? record.width : DEFAULT_MARKER_LAYOUT.width,
    height: typeof record.height === "number" ? record.height : DEFAULT_MARKER_LAYOUT.height,
    rotation: typeof record.rotation === "number" ? record.rotation : DEFAULT_MARKER_LAYOUT.rotation,
    assetId: typeof record.assetId === "string" ? record.assetId : DEFAULT_MARKER_LAYOUT.assetId,
    name: typeof record.name === "string" ? record.name : DEFAULT_MARKER_LAYOUT.name,
    path: typeof record.path === "string" ? record.path : DEFAULT_MARKER_LAYOUT.path,
    url: typeof record.url === "string" ? record.url : DEFAULT_MARKER_LAYOUT.url,
    hidden: typeof record.hidden === "boolean" ? record.hidden : DEFAULT_MARKER_LAYOUT.hidden,
  };
}

function readStampLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage, stamps: BedtimeStoryAsset[]): BedtimeStampLayout {
  const layer = slide.layers.find((item) => item.kind === "bedtime_stamp_layout");
  if (!layer) {
    const firstStamp = slide.slide_number === 1 ? stamps[0] : null;
    return firstStamp
      ? {
          ...DEFAULT_STAMP_LAYOUT,
          assetId: firstStamp.id,
          name: firstStamp.name,
          path: firstStamp.path,
          url: firstStamp.url,
          hidden: false,
        }
      : DEFAULT_STAMP_LAYOUT;
  }
  const record = languageLayoutRecord(layer, language);
  return {
    kind: "bedtime_stamp_layout",
    x: typeof record.x === "number" ? record.x : DEFAULT_STAMP_LAYOUT.x,
    y: typeof record.y === "number" ? record.y : DEFAULT_STAMP_LAYOUT.y,
    width: typeof record.width === "number" ? record.width : DEFAULT_STAMP_LAYOUT.width,
    height: typeof record.height === "number" ? record.height : DEFAULT_STAMP_LAYOUT.height,
    rotation: typeof record.rotation === "number" ? record.rotation : DEFAULT_STAMP_LAYOUT.rotation,
    assetId: typeof record.assetId === "string" ? record.assetId : DEFAULT_STAMP_LAYOUT.assetId,
    name: typeof record.name === "string" ? record.name : DEFAULT_STAMP_LAYOUT.name,
    path: typeof record.path === "string" ? record.path : DEFAULT_STAMP_LAYOUT.path,
    url: typeof record.url === "string" ? record.url : DEFAULT_STAMP_LAYOUT.url,
    hidden: typeof record.hidden === "boolean" ? record.hidden : DEFAULT_STAMP_LAYOUT.hidden,
  };
}

function writeLayerLayout(
  slide: BedtimeStorySlide,
  language: BedtimeStoryLanguage,
  layout: BedtimeEditableLayout,
): BedtimeStorySlide {
  const layerKind = layout.kind;
  const existingLayer = slide.layers.find((item) => item.kind === layerKind) ?? { kind: layerKind };
  const existingLanguageLayouts = existingLayer.languageLayouts && typeof existingLayer.languageLayouts === "object" && !Array.isArray(existingLayer.languageLayouts)
    ? existingLayer.languageLayouts as Record<string, unknown>
    : {};
  const nextLayer = {
    ...existingLayer,
    kind: layerKind,
    languageLayouts: {
      ...existingLanguageLayouts,
      [language]: layout,
    },
  };
  const layers = [
    nextLayer,
    ...slide.layers.filter((item) => item.kind !== layerKind),
  ];
  return { ...slide, layers };
}

function textLayoutStyle(layout: BedtimeTextLayout | BedtimeNumberLayout): CSSProperties {
  return {
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    width: `${layout.width}%`,
    height: `${layout.height}%`,
    fontSize: `${layout.fontSize}px`,
    fontFamily: fontCss(layout.fontFamily),
    color: layout.textColor,
    textAlign: layout.align,
    background: layout.backgroundEnabled ? hexToRgba(layout.backgroundColor, layout.backgroundOpacity) : "transparent",
    transform: `rotate(${layout.rotation}deg)`,
  };
}

function boxLayoutStyle(layout: BedtimeLogoLayout | BedtimeStampLayout | BedtimeMarkerLayout): CSSProperties {
  return {
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    width: `${layout.width}%`,
    height: `${layout.height}%`,
    transform: `rotate(${layout.rotation}deg)`,
  };
}

function SlideCanvas({
  slide,
  language,
  stamps,
  captureRef,
  layerRef,
  layerMode = "full",
  selected = false,
  selectedTarget = "text",
  onTextPointerDown,
  onResizePointerDown,
  onRotatePointerDown,
  onLogoPointerDown,
  onLogoResizePointerDown,
  onLogoRotatePointerDown,
  onStampPointerDown,
  onStampResizePointerDown,
  onStampRotatePointerDown,
  onStampRemoveClick,
  onMarkerPointerDown,
  onMarkerResizePointerDown,
  onMarkerRotatePointerDown,
  onNumberPointerDown,
  onNumberResizePointerDown,
  onNumberRotatePointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
}: {
  slide: BedtimeStorySlide;
  language: BedtimeStoryLanguage;
  stamps: BedtimeStoryAsset[];
  captureRef?: (node: HTMLDivElement | null) => void;
  layerRef?: (node: HTMLDivElement | null) => void;
  layerMode?: "full" | "background" | "text" | "logo" | "number" | "stamp" | "marker";
  selected?: boolean;
  selectedTarget?: BedtimeEditableKind;
  onTextPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onRotatePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onLogoPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onLogoResizePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onLogoRotatePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onStampPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onStampResizePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onStampRotatePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onStampRemoveClick?: () => void;
  onMarkerPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onMarkerResizePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onMarkerRotatePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onNumberPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onNumberResizePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onNumberRotatePointerDown?: (event: PointerEvent<HTMLSpanElement>) => void;
  onCanvasPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onCanvasPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const layout = readTextLayout(slide, language);
  const logoLayout = readLogoLayout(slide, language);
  const numberLayout = readNumberLayout(slide, language);
  const stampLayout = readStampLayout(slide, language, stamps);
  const markerLayout = readMarkerLayout(slide, language);
  const showBackground = layerMode === "full" || layerMode === "background";
  const showText = layerMode === "full" || layerMode === "text";
  const showLogo = layerMode === "full" || layerMode === "logo";
  const showNumber = layerMode === "full" || layerMode === "number";
  const showStamp = (layerMode === "full" || layerMode === "stamp") && Boolean(stampLayout.url) && !stampLayout.hidden;
  const showMarker = (layerMode === "full" || layerMode === "marker") && Boolean(markerLayout.url) && !markerLayout.hidden;
  const selectedText = selected && selectedTarget === "text";
  const selectedLogo = selected && selectedTarget === "logo";
  const selectedNumber = selected && selectedTarget === "number";
  const selectedStamp = selected && selectedTarget === "stamp";
  const selectedMarker = selected && selectedTarget === "marker";

  return (
    <div
      ref={captureRef}
      className={`bedtime-canvas bedtime-canvas--${layerMode}`}
      dir={language === "he" ? "rtl" : "ltr"}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerUp}
    >
      {showBackground ? (
        slide.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxiedMediaUrl(slide.image_url)} alt="" className="bedtime-canvas__image" />
        ) : (
          <div className="bedtime-canvas__empty">Upload slide image</div>
        )
      ) : null}
      {showText ? (
        <div
          ref={layerRef}
          className={`bedtime-canvas__text-layer ${selectedText ? "bedtime-canvas__text-layer--selected" : ""}`}
          style={textLayoutStyle(layout)}
          onPointerDown={onTextPointerDown}
        >
          <span>{slide.text[language]}</span>
          {selectedText ? (
            <>
              <span
                className="bedtime-text-frame bedtime-text-frame--resize"
                title="Resize text box"
                onPointerDown={onResizePointerDown}
              />
              <span
                className="bedtime-text-frame bedtime-text-frame--rotate"
                title="Rotate text box"
                onPointerDown={onRotatePointerDown}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {showLogo ? (
          <div
            className={`bedtime-canvas__logo-layer ${selectedLogo ? "bedtime-canvas__editable-layer--selected" : ""}`}
            style={boxLayoutStyle(logoLayout)}
            onPointerDown={onLogoPointerDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxiedMediaUrl(LAPLAPLA_LOGO_URL)} alt="LapLapLa" />
            {selectedLogo ? (
              <>
                <span className="bedtime-text-frame bedtime-text-frame--resize" onPointerDown={onLogoResizePointerDown} />
                <span className="bedtime-text-frame bedtime-text-frame--rotate" onPointerDown={onLogoRotatePointerDown} />
              </>
            ) : null}
          </div>
      ) : null}
      {showStamp ? (
          <div
            className={`bedtime-canvas__stamp-layer ${selectedStamp ? "bedtime-canvas__editable-layer--selected" : ""}`}
            style={boxLayoutStyle(stampLayout)}
            onPointerDown={onStampPointerDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxiedMediaUrl(stampLayout.url)} alt={stampLayout.name} />
            {selectedStamp ? (
              <>
                <button
                  type="button"
                  className="bedtime-layer-remove"
                  title="Remove stamp from slide"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onStampRemoveClick?.();
                  }}
                >
                  ×
                </button>
                <span className="bedtime-text-frame bedtime-text-frame--resize" onPointerDown={onStampResizePointerDown} />
                <span className="bedtime-text-frame bedtime-text-frame--rotate" onPointerDown={onStampRotatePointerDown} />
              </>
            ) : null}
          </div>
      ) : null}
      {showMarker ? (
          <div
            className={`bedtime-canvas__marker-layer ${selectedMarker ? "bedtime-canvas__editable-layer--selected" : ""}`}
            style={boxLayoutStyle(markerLayout)}
            onPointerDown={onMarkerPointerDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxiedMediaUrl(markerLayout.url)} alt={markerLayout.name} />
            {selectedMarker ? (
              <>
                <span className="bedtime-text-frame bedtime-text-frame--resize" onPointerDown={onMarkerResizePointerDown} />
                <span className="bedtime-text-frame bedtime-text-frame--rotate" onPointerDown={onMarkerRotatePointerDown} />
              </>
            ) : null}
          </div>
      ) : null}
      {showNumber ? (
          <div
            className={`bedtime-canvas__number-layer ${selectedNumber ? "bedtime-canvas__text-layer--selected" : ""}`}
            style={textLayoutStyle(numberLayout)}
            onPointerDown={onNumberPointerDown}
          >
            <span>{String(slide.slide_number).padStart(2, "0")}</span>
            {selectedNumber ? (
              <>
                <span className="bedtime-text-frame bedtime-text-frame--resize" onPointerDown={onNumberResizePointerDown} />
                <span className="bedtime-text-frame bedtime-text-frame--rotate" onPointerDown={onNumberRotatePointerDown} />
              </>
            ) : null}
          </div>
      ) : null}
    </div>
  );
}

export default function BedtimeStoryEditorPage() {
  const router = useRouter();
  const storyId = typeof router.query.story_id === "string" ? router.query.story_id : "";
  const supabase = createClientComponentClient();
  const slideRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const editorSlideRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const textInteractionRef = useRef<TextInteraction | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedStorySignatureRef = useRef("");

  const [sessionChecked, setSessionChecked] = useState(false);
  const [story, setStory] = useState<BedtimeStoryRecord | null>(null);
  const [language, setLanguage] = useState<BedtimeStoryLanguage>("en");
  const [activeSlide, setActiveSlide] = useState(1);
  const [selectedEditable, setSelectedEditable] = useState<BedtimeEditableKind>("text");
  const [contentPanelOpen, setContentPanelOpen] = useState(true);
  const [textPanelOpen, setTextPanelOpen] = useState(true);
  const [numberPanelOpen, setNumberPanelOpen] = useState(false);
  const [logoPanelOpen, setLogoPanelOpen] = useState(false);
  const [stampsPanelOpen, setStampsPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stampLibrary, setStampLibrary] = useState<BedtimeStampLibraryItem[]>([]);
  const [stampLibraryLoading, setStampLibraryLoading] = useState(false);

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
      lastSavedStorySignatureRef.current = storyAutosaveSignature(data.story);
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

  const loadStampLibrary = useCallback(async () => {
    setStampLibraryLoading(true);
    try {
      const data = await fetchJson<{ stamps: BedtimeStampLibraryItem[] }>("/api/admin/bedtime-stories/stamps?limit=120");
      setStampLibrary(data.stamps);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setStampLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadStampLibrary();
  }, [sessionChecked, loadStampLibrary]);

  const selectedSlide = useMemo(
    () => story?.slides.find((slide) => slide.slide_number === activeSlide) ?? story?.slides[0] ?? null,
    [story, activeSlide],
  );
  const selectedTextLayout = selectedSlide ? readTextLayout(selectedSlide, language) : DEFAULT_TEXT_LAYOUT;
  const selectedLogoLayout = selectedSlide ? readLogoLayout(selectedSlide, language) : DEFAULT_LOGO_LAYOUT;
  const selectedNumberLayout = selectedSlide ? readNumberLayout(selectedSlide, language) : DEFAULT_NUMBER_LAYOUT;
  const selectedStampLayout = selectedSlide && story ? readStampLayout(selectedSlide, language, story.stamp_assets) : DEFAULT_STAMP_LAYOUT;
  const selectedMarkerLayout = selectedSlide ? readMarkerLayout(selectedSlide, language) : DEFAULT_MARKER_LAYOUT;
  const uniqueStampLibrary = useMemo(() => {
    const seen = new Set<string>();
    return stampLibrary.filter((stamp) => {
      const key = stamp.path || stamp.url || stamp.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [stampLibrary]);

  const updateStory = (updater: (current: BedtimeStoryRecord) => BedtimeStoryRecord) => {
    setStory((current) => (current ? updater(current) : current));
  };

  const updateSlideTextLayout = (slideNumber: number, patch: Partial<BedtimeTextLayout>) => {
    updateStory((current) => ({
      ...current,
      slides: current.slides.map((slide) => {
        if (slide.slide_number !== slideNumber) {
          return slide;
        }
        const currentLayout = readTextLayout(slide, language);
        return writeLayerLayout(slide, language, { ...currentLayout, ...patch, kind: "bedtime_text_layout" });
      }),
    }));
  };

  const updateSlideLogoLayout = (slideNumber: number, patch: Partial<BedtimeLogoLayout>) => {
    updateStory((current) => ({
      ...current,
      slides: current.slides.map((slide) => {
        if (slide.slide_number !== slideNumber) {
          return slide;
        }
        const currentLayout = readLogoLayout(slide, language);
        return writeLayerLayout(slide, language, { ...currentLayout, ...patch, kind: "bedtime_logo_layout" });
      }),
    }));
  };

  const updateSlideNumberLayout = (slideNumber: number, patch: Partial<BedtimeNumberLayout>) => {
    updateStory((current) => ({
      ...current,
      slides: current.slides.map((slide) => {
        if (slide.slide_number !== slideNumber) {
          return slide;
        }
        const currentLayout = readNumberLayout(slide, language);
        return writeLayerLayout(slide, language, { ...currentLayout, ...patch, kind: "bedtime_number_layout" });
      }),
    }));
  };

  const updateSlideMarkerLayout = (slideNumber: number, patch: Partial<BedtimeMarkerLayout>) => {
    updateStory((current) => ({
      ...current,
      slides: current.slides.map((slide) => {
        if (slide.slide_number !== slideNumber) {
          return slide;
        }
        const currentLayout = readMarkerLayout(slide, language);
        return writeLayerLayout(slide, language, { ...currentLayout, ...patch, kind: "bedtime_marker_layout" });
      }),
    }));
  };

  const updateSlideStampLayout = (slideNumber: number, patch: Partial<BedtimeStampLayout>) => {
    updateStory((current) => ({
      ...current,
      slides: current.slides.map((slide) => {
        if (slide.slide_number !== slideNumber) {
          return slide;
        }
        const currentLayout = readStampLayout(slide, language, current.stamp_assets);
        return writeLayerLayout(slide, language, { ...currentLayout, ...patch, kind: "bedtime_stamp_layout" });
      }),
    }));
  };

  const updateEditableLayout = (slideNumber: number, target: BedtimeEditableKind, patch: Partial<BedtimeEditableLayout>) => {
    if (target === "text") {
      updateSlideTextLayout(slideNumber, patch as Partial<BedtimeTextLayout>);
      return;
    }
    if (target === "number") {
      updateSlideNumberLayout(slideNumber, patch as Partial<BedtimeNumberLayout>);
      return;
    }
    if (target === "marker") {
      updateSlideMarkerLayout(slideNumber, patch as Partial<BedtimeMarkerLayout>);
      return;
    }
    if (target === "stamp") {
      updateSlideStampLayout(slideNumber, patch as Partial<BedtimeStampLayout>);
      return;
    }
    updateSlideLogoLayout(slideNumber, patch as Partial<BedtimeLogoLayout>);
  };

  const startTextInteraction = (
    event: PointerEvent<HTMLElement>,
    action: TextInteraction["action"],
    slide: BedtimeStorySlide,
    target: BedtimeEditableKind = "text",
  ) => {
    const canvas = editorSlideRefs.current[slide.slide_number];
    if (!canvas) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const layout = target === "text"
      ? readTextLayout(slide, language)
      : target === "number"
        ? readNumberLayout(slide, language)
        : target === "marker"
          ? readMarkerLayout(slide, language)
          : target === "stamp"
            ? readStampLayout(slide, language, story?.stamp_assets ?? [])
            : readLogoLayout(slide, language);
    const canvasRect = canvas.getBoundingClientRect();
    const centerX = canvasRect.left + ((layout.x + layout.width / 2) / 100) * canvasRect.width;
    const centerY = canvasRect.top + ((layout.y + layout.height / 2) / 100) * canvasRect.height;
    textInteractionRef.current = {
      action,
      target,
      slideNumber: slide.slide_number,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayout: layout,
      centerX,
      centerY,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
    };
  };

  const moveTextInteraction = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = textInteractionRef.current;
    if (!interaction) {
      return;
    }
    const canvas = editorSlideRefs.current[interaction.slideNumber];
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startClientY) / rect.height) * 100;
    const layout = interaction.startLayout;

    if (interaction.action === "move") {
      updateEditableLayout(interaction.slideNumber, interaction.target, {
        x: clamp(layout.x + dx, -layout.width + 6, 94),
        y: clamp(layout.y + dy, -layout.height + 6, 94),
      });
      return;
    }

    if (interaction.action === "resize") {
      const nextWidth = clamp(layout.width + dx, 12, 100 - layout.x + 6);
      const nextHeight = clamp(layout.height + dy, 8, 100 - layout.y + 6);
      const scale = Math.max(
        nextWidth / Math.max(1, layout.width),
        nextHeight / Math.max(1, layout.height),
      );
      updateEditableLayout(interaction.slideNumber, interaction.target, {
        width: nextWidth,
        height: nextHeight,
        ...("fontSize" in layout ? { fontSize: clamp(layout.fontSize * scale, 14, 120) } : {}),
      });
      return;
    }

    if (interaction.centerX === undefined || interaction.centerY === undefined || interaction.startAngle === undefined) {
      return;
    }
    const angle = Math.atan2(event.clientY - interaction.centerY, event.clientX - interaction.centerX) * 180 / Math.PI;
    updateEditableLayout(interaction.slideNumber, interaction.target, {
      rotation: layout.rotation + angle - interaction.startAngle,
    });
  };

  const endTextInteraction = () => {
    textInteractionRef.current = null;
  };

  const saveStory = useCallback(async (
    nextStory = story,
    options: { silent?: boolean; updateState?: boolean } = {},
  ) => {
    if (!nextStory) {
      return;
    }
    if (!options.silent) {
      setSaving(true);
    }
    setError(null);
    if (!options.silent) {
      setSuccess(null);
    }
    try {
      const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${nextStory.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: storyToPayload(nextStory) }),
      });
      lastSavedStorySignatureRef.current = storyAutosaveSignature(options.updateState === false ? nextStory : data.story);
      if (options.updateState !== false) {
        setStory(data.story);
      }
      if (!options.silent) {
        setSuccess("Story saved.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      if (!options.silent) {
        setSaving(false);
      }
    }
  }, [story]);

  useEffect(() => {
    if (!story || loading || deleting) {
      return undefined;
    }

    const signature = storyAutosaveSignature(story);
    if (!lastSavedStorySignatureRef.current) {
      lastSavedStorySignatureRef.current = signature;
      return undefined;
    }
    if (signature === lastSavedStorySignatureRef.current) {
      return undefined;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void saveStory(story, { silent: true, updateState: false });
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [story, loading, deleting, saveStory]);

  const uploadMedia = async (kind: "slide" | "stamp" | "marker", file: File | null, slideNumber?: number) => {
    if (!story || !file) {
      return;
    }
    if (kind === "slide" && !slideNumber) {
      setError("Select a slide before uploading an image.");
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
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
      const savedData = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${story.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: storyToPayload(story) }),
      });
      lastSavedStorySignatureRef.current = storyAutosaveSignature(savedData.story);

      const imageBase64 = await blobToDataUrl(file);
      const data = await fetchJson<{ publicUrl: string; story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${savedData.story.id}/media`, {
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
      if (kind === "stamp" && selectedSlide) {
        const uploadedStamp = data.story.stamp_assets[0];
        const nextStory = uploadedStamp
          ? {
              ...data.story,
              slides: data.story.slides.map((slide) => (
                slide.slide_number === selectedSlide.slide_number
                  ? writeLayerLayout(slide, language, {
                      ...DEFAULT_STAMP_LAYOUT,
                      assetId: uploadedStamp.id,
                      name: uploadedStamp.name,
                      path: uploadedStamp.path,
                      url: uploadedStamp.url,
                      hidden: false,
                    })
                  : slide
              )),
            }
          : data.story;
        setSelectedEditable("stamp");
        setStory(nextStory);
      } else {
        lastSavedStorySignatureRef.current = storyAutosaveSignature(data.story);
        setStory(data.story);
      }
      setSuccess(`Uploaded: ${data.publicUrl}`);
      if (kind === "stamp") {
        void loadStampLibrary();
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(null);
    }
  };

  const attachStamp = async (stamp: BedtimeStampLibraryItem) => {
    if (!story) {
      return;
    }
    const storyWithAsset: BedtimeStoryRecord = {
      ...story,
      stamp_assets: [
        {
          id: stamp.id,
          kind: "stamp",
          name: stamp.name,
          path: stamp.path,
          url: stamp.url,
          created_at: stamp.created_at ?? new Date().toISOString(),
        },
        ...story.stamp_assets.filter((asset) => asset.path !== stamp.path),
      ],
    };
    const nextStory: BedtimeStoryRecord = selectedSlide
      ? {
          ...storyWithAsset,
          slides: storyWithAsset.slides.map((slide) => (
            slide.slide_number === selectedSlide.slide_number
              ? writeLayerLayout(slide, language, {
                  ...readStampLayout(slide, language, storyWithAsset.stamp_assets),
                  assetId: stamp.id,
                  name: stamp.name,
                  path: stamp.path,
                  url: stamp.url,
                  hidden: false,
                })
              : slide
          )),
        }
      : storyWithAsset;
    setSelectedEditable("stamp");
    setStory(nextStory);
    await saveStory(nextStory);
  };

  const clearStamp = () => {
    if (!selectedSlide) {
      return;
    }
    updateSlideStampLayout(selectedSlide.slide_number, {
      assetId: "",
      name: "",
      path: "",
      url: "",
      hidden: true,
    });
  };

  const placeMarker = (asset: BedtimeStoryAsset) => {
    if (!selectedSlide) {
      return;
    }
    setSelectedEditable("marker");
    updateSlideMarkerLayout(selectedSlide.slide_number, {
      assetId: asset.id,
      name: asset.name,
      path: asset.path,
      url: asset.url,
      hidden: false,
    });
  };

  const clearMarker = () => {
    if (!selectedSlide) {
      return;
    }
    updateSlideMarkerLayout(selectedSlide.slide_number, {
      assetId: "",
      name: "",
      path: "",
      url: "",
    });
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

  const exportStoryForDreams = async () => {
    if (!story) {
      return;
    }
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveStory(story, { silent: true, updateState: false });
      const response = await fetch(`/api/admin/bedtime-stories/${story.id}/dreams-export?language=${language}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Failed to export Story for Dreams.");
      }
      const blob = await response.blob();
      downloadBlob(blob, `${story.slug || story.id}-dreams-psd-${language}.zip`);
      setSuccess("Dreams PSD ZIP exported.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  const renderSlideBlob = async (slideNumber: number, contentType: "image/png" | "image/webp" = "image/png"): Promise<Blob> => {
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
      type: contentType,
      quality: contentType === "image/webp" ? 0.92 : 1,
      filter: (domNode) => {
        if (!(domNode instanceof HTMLElement)) {
          return true;
        }
        return !domNode.classList.contains("bedtime-text-frame") && !domNode.classList.contains("bedtime-layer-remove");
      },
    });
    if (!blob) {
      throw new Error(`Failed to export slide ${contentType}.`);
    }
    return blob;
  };

  const downloadCurrentLanguagePngs = async () => {
    if (!story) {
      return;
    }
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      await saveStory(story, { silent: true, updateState: false });
      const zip = new JSZip();
      const folder = zip.folder(`${story.slug || story.id}-${language}-png-slides`);
      if (!folder) {
        throw new Error("Failed to create PNG export folder.");
      }
      for (const slide of story.slides) {
        const blob = await renderSlideBlob(slide.slide_number, "image/png");
        folder.file(`slide-${String(slide.slide_number).padStart(2, "0")}.png`, blob);
      }
      const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      downloadBlob(archive, `${story.slug || story.id}-${language}-png-slides.zip`);
      setSuccess("Downloaded PNG slides ZIP.");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setExporting(false);
    }
  };

  const uploadCurrentLanguageWebps = async () => {
    if (!story) {
      return;
    }
    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      let currentStory = story;
      await saveStory(currentStory, { silent: true, updateState: false });
      for (const slide of story.slides) {
        const blob = await renderSlideBlob(slide.slide_number, "image/png");
        const imageBase64 = await blobToDataUrl(blob);
        const data = await fetchJson<{ story: BedtimeStoryRecord }>(`/api/admin/bedtime-stories/${currentStory.id}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            slideNumber: slide.slide_number,
            contentType: "image/webp",
            imageBase64,
          }),
        });
        currentStory = data.story;
        setStory(data.story);
      }
      setSuccess(`Uploaded ${story.slides.length} WebP slide(s) to R2.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
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
                className="books-button books-button--success"
                disabled={exporting}
                onClick={() => {
                  void exportStoryForDreams();
                }}
              >
                {exporting ? "Exporting Dreams ZIP..." : "Export Story for Dreams"}
              </button>
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={exporting}
                onClick={() => {
                  void downloadCurrentLanguagePngs();
                }}
              >
                Download current PNG
              </button>
              <button
                type="button"
                className="books-button books-button--success"
                disabled={exporting}
                onClick={() => {
                  void uploadCurrentLanguageWebps();
                }}
              >
                Upload current WebP
              </button>
            </div>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Slide editor</h2>
                <p className="books-section-help">Upload a background image per slide. The Dreams export packages the full story as layered PSD files in a ZIP archive.</p>
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
                    selected
                    selectedTarget={selectedEditable}
                    captureRef={(node) => {
                      editorSlideRefs.current[selectedSlide.slide_number] = node;
                    }}
                    onTextPointerDown={(event) => {
                      setSelectedEditable("text");
                      startTextInteraction(event, "move", selectedSlide, "text");
                    }}
                    onResizePointerDown={(event) => {
                      setSelectedEditable("text");
                      startTextInteraction(event, "resize", selectedSlide, "text");
                    }}
                    onRotatePointerDown={(event) => {
                      setSelectedEditable("text");
                      startTextInteraction(event, "rotate", selectedSlide, "text");
                    }}
                    onLogoPointerDown={(event) => {
                      setSelectedEditable("logo");
                      startTextInteraction(event, "move", selectedSlide, "logo");
                    }}
                    onLogoResizePointerDown={(event) => {
                      setSelectedEditable("logo");
                      startTextInteraction(event, "resize", selectedSlide, "logo");
                    }}
                    onLogoRotatePointerDown={(event) => {
                      setSelectedEditable("logo");
                      startTextInteraction(event, "rotate", selectedSlide, "logo");
                    }}
                    onStampPointerDown={(event) => {
                      setSelectedEditable("stamp");
                      startTextInteraction(event, "move", selectedSlide, "stamp");
                    }}
                    onStampResizePointerDown={(event) => {
                      setSelectedEditable("stamp");
                      startTextInteraction(event, "resize", selectedSlide, "stamp");
                    }}
                    onStampRotatePointerDown={(event) => {
                      setSelectedEditable("stamp");
                      startTextInteraction(event, "rotate", selectedSlide, "stamp");
                    }}
                    onStampRemoveClick={clearStamp}
                    onMarkerPointerDown={(event) => {
                      setSelectedEditable("marker");
                      startTextInteraction(event, "move", selectedSlide, "marker");
                    }}
                    onMarkerResizePointerDown={(event) => {
                      setSelectedEditable("marker");
                      startTextInteraction(event, "resize", selectedSlide, "marker");
                    }}
                    onMarkerRotatePointerDown={(event) => {
                      setSelectedEditable("marker");
                      startTextInteraction(event, "rotate", selectedSlide, "marker");
                    }}
                    onNumberPointerDown={(event) => {
                      setSelectedEditable("number");
                      startTextInteraction(event, "move", selectedSlide, "number");
                    }}
                    onNumberResizePointerDown={(event) => {
                      setSelectedEditable("number");
                      startTextInteraction(event, "resize", selectedSlide, "number");
                    }}
                    onNumberRotatePointerDown={(event) => {
                      setSelectedEditable("number");
                      startTextInteraction(event, "rotate", selectedSlide, "number");
                    }}
                    onCanvasPointerMove={moveTextInteraction}
                    onCanvasPointerUp={endTextInteraction}
                  />
                ) : null}
              </div>
              <div className="bedtime-slide-tools">
                {selectedSlide ? (
                  <>
                    <details className="bedtime-editor-panel" open={contentPanelOpen} onToggle={(event) => setContentPanelOpen(event.currentTarget.open)}>
                      <summary>Slide content and prompts</summary>
                      <div className="bedtime-editor-panel__body">
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
                        {selectedSlide.slide_number === 1 ? (
                          <label className="books-field">
                            <span className="books-field__label">Stamp prompt</span>
                            <textarea
                              className="books-input books-input--small-textarea"
                              value={selectedSlide.stamp_prompt}
                              placeholder="Natural ink stamp impression on watercolor paper, slightly aged and softly blurred, transparent background, containing one recognizable detail from this story."
                              onChange={(event) => updateStory((current) => ({
                                ...current,
                                slides: current.slides.map((slide, index) => (
                                  slide.slide_number === selectedSlide.slide_number
                                    ? { ...slide, stamp_prompt: event.target.value }
                                    : { ...slide, stamp_prompt: index === 0 ? slide.stamp_prompt : "" }
                                )),
                              }))}
                            />
                            <span className="books-field__help">
                              Stamp prompt is stored only on the first slide. It should describe a natural ink stamp on watercolor paper with a recognizable detail from this story.
                            </span>
                          </label>
                        ) : null}
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
                      </div>
                    </details>

                    <details className="bedtime-editor-panel" open={textPanelOpen} onToggle={(event) => setTextPanelOpen(event.currentTarget.open)}>
                      <summary>Story text layout</summary>
                      <div className="bedtime-editor-panel__body bedtime-text-controls">
                        <label className="books-field">
                          <span className="books-field__label">Text size</span>
                          <input type="range" min="14" max="120" value={Math.round(selectedTextLayout.fontSize)} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { fontSize: Number(event.target.value) })} />
                          <span className="books-field__help">{Math.round(selectedTextLayout.fontSize)} px</span>
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Box width</span>
                          <input type="range" min="12" max="100" value={Math.round(selectedTextLayout.width)} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { width: Number(event.target.value) })} />
                          <span className="books-field__help">{Math.round(selectedTextLayout.width)}%</span>
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Box height</span>
                          <input type="range" min="8" max="80" value={Math.round(selectedTextLayout.height)} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { height: Number(event.target.value) })} />
                          <span className="books-field__help">{Math.round(selectedTextLayout.height)}%</span>
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Rotation</span>
                          <input type="range" min="-35" max="35" value={Math.round(selectedTextLayout.rotation)} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { rotation: Number(event.target.value) })} />
                          <span className="books-field__help">{Math.round(selectedTextLayout.rotation)} deg</span>
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Font</span>
                          <select className="books-input" value={selectedTextLayout.fontFamily} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { fontFamily: event.target.value as BedtimeTextFont })}>
                            {BEDTIME_TEXT_FONTS.map((font) => (
                              <option key={font.value} value={font.value}>{font.label}</option>
                            ))}
                          </select>
                        </label>
                        <div className="books-field">
                          <span className="books-field__label">Alignment</span>
                          <div className="books-actions books-actions--compact">
                            {(["left", "center", "right"] as const).map((align) => (
                              <button key={align} type="button" className={selectedTextLayout.align === align ? "books-button books-button--primary" : "books-button books-button--ghost"} onClick={() => updateSlideTextLayout(selectedSlide.slide_number, { align })}>
                                {align}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="books-field">
                          <span className="books-field__label">Text color</span>
                          <input className="books-input bedtime-color-input" type="color" value={selectedTextLayout.textColor} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { textColor: event.target.value })} />
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Background color</span>
                          <input className="books-input bedtime-color-input" type="color" value={selectedTextLayout.backgroundColor} disabled={!selectedTextLayout.backgroundEnabled} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { backgroundColor: event.target.value })} />
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Background opacity</span>
                          <input type="range" min="0" max="1" step="0.05" value={selectedTextLayout.backgroundOpacity} disabled={!selectedTextLayout.backgroundEnabled} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { backgroundOpacity: Number(event.target.value) })} />
                          <span className="books-field__help">{Math.round(selectedTextLayout.backgroundOpacity * 100)}%</span>
                        </label>
                        <label className="books-checkbox books-checkbox--inline">
                          <input type="checkbox" checked={selectedTextLayout.backgroundEnabled} onChange={(event) => updateSlideTextLayout(selectedSlide.slide_number, { backgroundEnabled: event.target.checked })} />
                          <span>Use text background</span>
                        </label>
                      </div>
                    </details>

                    <details className="bedtime-editor-panel" open={numberPanelOpen} onToggle={(event) => setNumberPanelOpen(event.currentTarget.open)}>
                      <summary>Slide number layout</summary>
                      <div className="bedtime-editor-panel__body bedtime-text-controls">
                        <label className="books-field"><span className="books-field__label">Size</span><input type="range" min="10" max="80" value={Math.round(selectedNumberLayout.fontSize)} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { fontSize: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedNumberLayout.fontSize)} px</span></label>
                        <label className="books-field"><span className="books-field__label">Box width</span><input type="range" min="6" max="40" value={Math.round(selectedNumberLayout.width)} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { width: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedNumberLayout.width)}%</span></label>
                        <label className="books-field"><span className="books-field__label">Box height</span><input type="range" min="4" max="30" value={Math.round(selectedNumberLayout.height)} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { height: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedNumberLayout.height)}%</span></label>
                        <label className="books-field"><span className="books-field__label">Rotation</span><input type="range" min="-35" max="35" value={Math.round(selectedNumberLayout.rotation)} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { rotation: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedNumberLayout.rotation)} deg</span></label>
                        <label className="books-field"><span className="books-field__label">Font</span><select className="books-input" value={selectedNumberLayout.fontFamily} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { fontFamily: event.target.value as BedtimeTextFont })}>{BEDTIME_TEXT_FONTS.map((font) => (<option key={font.value} value={font.value}>{font.label}</option>))}</select></label>
                        <label className="books-field"><span className="books-field__label">Text color</span><input className="books-input bedtime-color-input" type="color" value={selectedNumberLayout.textColor} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { textColor: event.target.value })} /></label>
                        <label className="books-field"><span className="books-field__label">Background</span><input className="books-input bedtime-color-input" type="color" value={selectedNumberLayout.backgroundColor} disabled={!selectedNumberLayout.backgroundEnabled} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { backgroundColor: event.target.value })} /></label>
                        <label className="books-field"><span className="books-field__label">Opacity</span><input type="range" min="0" max="1" step="0.05" value={selectedNumberLayout.backgroundOpacity} disabled={!selectedNumberLayout.backgroundEnabled} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { backgroundOpacity: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedNumberLayout.backgroundOpacity * 100)}%</span></label>
                        <label className="books-checkbox books-checkbox--inline"><input type="checkbox" checked={selectedNumberLayout.backgroundEnabled} onChange={(event) => updateSlideNumberLayout(selectedSlide.slide_number, { backgroundEnabled: event.target.checked })} /><span>Use number background</span></label>
                      </div>
                    </details>

                    <details className="bedtime-editor-panel" open={logoPanelOpen} onToggle={(event) => setLogoPanelOpen(event.currentTarget.open)}>
                      <summary>Logo layout</summary>
                      <div className="bedtime-editor-panel__body bedtime-text-controls">
                        <label className="books-field"><span className="books-field__label">Logo width</span><input type="range" min="6" max="55" value={Math.round(selectedLogoLayout.width)} onChange={(event) => updateSlideLogoLayout(selectedSlide.slide_number, { width: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedLogoLayout.width)}%</span></label>
                        <label className="books-field"><span className="books-field__label">Logo height</span><input type="range" min="4" max="35" value={Math.round(selectedLogoLayout.height)} onChange={(event) => updateSlideLogoLayout(selectedSlide.slide_number, { height: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedLogoLayout.height)}%</span></label>
                        <label className="books-field"><span className="books-field__label">Rotation</span><input type="range" min="-35" max="35" value={Math.round(selectedLogoLayout.rotation)} onChange={(event) => updateSlideLogoLayout(selectedSlide.slide_number, { rotation: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedLogoLayout.rotation)} deg</span></label>
                      </div>
                    </details>

                    <details className="bedtime-editor-panel" open={stampsPanelOpen} onToggle={(event) => setStampsPanelOpen(event.currentTarget.open)}>
                      <summary>Stamps and markers</summary>
                      <div className="bedtime-editor-panel__body">
                        <div className="books-actions books-actions--compact">
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
                          <button type="button" className="books-button books-button--ghost" disabled={stampLibraryLoading} onClick={() => { void loadStampLibrary(); }}>
                            {stampLibraryLoading ? "Loading..." : "Refresh stamps"}
                          </button>
                        </div>

                        <div className="bedtime-stamp-library">
                          <h3 className="books-subpanel__title">Reusable stamp library</h3>
                          <div className="bedtime-asset-grid bedtime-asset-grid--compact">
                            {uniqueStampLibrary.map((stamp) => (
                              <button
                                key={stamp.path || stamp.id}
                                type="button"
                                className="bedtime-asset-card bedtime-asset-card--button"
                                onClick={() => {
                                  void attachStamp(stamp);
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={proxiedMediaUrl(stamp.url)} alt="" />
                                <strong>{stamp.name}</strong>
                                <small>{story.stamp_assets.some((asset) => asset.path === stamp.path) ? "attached" : "click to attach"}</small>
                              </button>
                            ))}
                            {!stampLibraryLoading && uniqueStampLibrary.length === 0 ? (
                              <p className="books-section-help">No reusable stamps yet.</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="bedtime-text-controls">
                          <label className="books-field"><span className="books-field__label">Stamp width</span><input type="range" min="4" max="60" value={Math.round(selectedStampLayout.width)} disabled={!selectedStampLayout.url || selectedStampLayout.hidden} onChange={(event) => updateSlideStampLayout(selectedSlide.slide_number, { width: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedStampLayout.width)}%</span></label>
                          <label className="books-field"><span className="books-field__label">Stamp height</span><input type="range" min="4" max="60" value={Math.round(selectedStampLayout.height)} disabled={!selectedStampLayout.url || selectedStampLayout.hidden} onChange={(event) => updateSlideStampLayout(selectedSlide.slide_number, { height: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedStampLayout.height)}%</span></label>
                          <label className="books-field"><span className="books-field__label">Stamp rotation</span><input type="range" min="-45" max="45" value={Math.round(selectedStampLayout.rotation)} disabled={!selectedStampLayout.url || selectedStampLayout.hidden} onChange={(event) => updateSlideStampLayout(selectedSlide.slide_number, { rotation: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedStampLayout.rotation)} deg</span></label>
                          <button type="button" className="books-button books-button--ghost" disabled={!selectedStampLayout.url || selectedStampLayout.hidden} onClick={clearStamp}>Remove stamp from slide</button>
                        </div>

                        <div className="bedtime-stamp-library">
                          <h3 className="books-subpanel__title">Markers</h3>
                          <div className="bedtime-asset-grid bedtime-asset-grid--compact">
                            {story.marker_assets.map((asset) => (
                              <button
                                key={asset.path || asset.id}
                                type="button"
                                className={selectedMarkerLayout.path === asset.path ? "bedtime-asset-card bedtime-asset-card--button bedtime-asset-card--active" : "bedtime-asset-card bedtime-asset-card--button"}
                                onClick={() => placeMarker(asset)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={proxiedMediaUrl(asset.url)} alt="" />
                                <strong>{asset.name}</strong>
                                <small>{selectedMarkerLayout.path === asset.path ? "on slide" : "click to place"}</small>
                              </button>
                            ))}
                            {story.marker_assets.length === 0 ? (
                              <p className="books-section-help">No markers uploaded yet.</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="bedtime-text-controls">
                          <label className="books-field"><span className="books-field__label">Marker width</span><input type="range" min="4" max="60" value={Math.round(selectedMarkerLayout.width)} disabled={!selectedMarkerLayout.url} onChange={(event) => updateSlideMarkerLayout(selectedSlide.slide_number, { width: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedMarkerLayout.width)}%</span></label>
                          <label className="books-field"><span className="books-field__label">Marker height</span><input type="range" min="4" max="60" value={Math.round(selectedMarkerLayout.height)} disabled={!selectedMarkerLayout.url} onChange={(event) => updateSlideMarkerLayout(selectedSlide.slide_number, { height: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedMarkerLayout.height)}%</span></label>
                          <label className="books-field"><span className="books-field__label">Rotation</span><input type="range" min="-45" max="45" value={Math.round(selectedMarkerLayout.rotation)} disabled={!selectedMarkerLayout.url} onChange={(event) => updateSlideMarkerLayout(selectedSlide.slide_number, { rotation: Number(event.target.value) })} /><span className="books-field__help">{Math.round(selectedMarkerLayout.rotation)} deg</span></label>
                          <button type="button" className="books-button books-button--ghost" disabled={!selectedMarkerLayout.url} onClick={clearMarker}>Remove marker from slide</button>
                        </div>
                      </div>
                    </details>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <div className="bedtime-export-bank" aria-hidden="true">
            {story.slides.map((slide) => (
              <SlideCanvas
                key={slide.slide_number}
                slide={slide}
                language={language}
                stamps={story.stamp_assets}
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
