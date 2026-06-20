"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type { RecipeLayoutTemplate, RecipeRecord } from "../../../lib/recipes/types";

type RecipeLayoutElement = {
  id: string;
  kind: "title" | "country" | "image" | "asset" | "logo" | "text" | "list" | "steps" | "step";
  label: string;
  source:
    | "title"
    | "country"
    | "image_url"
    | "custom_image"
    | "custom_text"
    | "raccoon_caption"
    | "cooking_time"
    | "ingredients"
    | "cooking_steps"
    | "fact"
    | "raccoon_advice"
    | "serving_instructions"
    | "laplapla_interaction_caption";
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize: number;
  fontFamily?: RecipeFontFamily;
  textColor?: string;
  backgroundEnabled?: boolean;
  backgroundColor?: string;
  backgroundOpacity?: number;
  underlineEnabled?: boolean;
  boldEnabled?: boolean;
  arcBend?: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  align: "left" | "center" | "right";
  visible: boolean;
  url?: string;
  path?: string;
  groupId?: string;
  stepIndex?: number;
  customText?: string;
  customTextTranslations?: Partial<Record<RecipeStudioLanguage, string>>;
  languageStyles?: Partial<Record<RecipeStudioLanguage, Partial<RecipeLanguageStyle>>>;
};

type RecipeLanguageStyle = Pick<
  RecipeLayoutElement,
  | "x"
  | "y"
  | "width"
  | "height"
  | "fontSize"
  | "fontFamily"
  | "textColor"
  | "backgroundEnabled"
  | "backgroundColor"
  | "backgroundOpacity"
  | "underlineEnabled"
  | "boldEnabled"
  | "arcBend"
  | "rotation"
  | "align"
  | "visible"
>;

type RecipeLayout = {
  canvas: {
    width: number;
    height: number;
  };
  elements: RecipeLayoutElement[];
  groups?: RecipeLayerGroup[];
  assets?: RecipeSavedAsset[];
};

type RecipeLayerGroup = {
  id: string;
  name: string;
};

type RecipeSavedAsset = {
  label: string;
  url: string;
  path: string;
  kind: RecipeCropMode;
  setKey: string;
  tag: string;
  name: string;
  index: number;
  createdAt: string;
};

type DragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  groupId?: string;
  startPositions?: Array<{ id: string; x: number; y: number }>;
};

type RecipeStudioLanguage = "ru" | "en" | "he";
type RecipeMediaKind = "dish" | "recipe_asset_sheet" | "raccoon_sticker_sheet";
type RecipeCropMode = "recipe_asset" | "raccoon_sticker";
type CropSelectionMode = "rect" | "lasso";
type RecipeFontFamily =
  | "Nunito"
  | "Varela Round"
  | "Caveat"
  | "Amatic SC"
  | "Hachi Maru Pop"
  | "Pacifico"
  | "Rampart One"
  | "Rubik Doodle Shadow"
  | "Arial";

type MediaLibraryObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

type MediaLibraryResponse = {
  prefix: string;
  folders: string[];
  objects: MediaLibraryObject[];
  nextContinuationToken: string | null;
};

type MediaTreeNode = {
  prefix: string;
  label: string;
  children: MediaTreeNode[];
};

type CountryTarget = {
  target_id: string;
  title_ru: string | null;
  title_en: string | null;
  title_he: string | null;
};

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropPoint = {
  x: number;
  y: number;
};

type CropInteraction = {
  action: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
};

type LayerDragState = {
  id: string;
  type: "element" | "group";
};

type LayoutUpdater = (current: RecipeLayout) => RecipeLayout;

type TransformState = {
  action: "resize" | "rotate";
  id: string;
  startClientX: number;
  startClientY: number;
  startWidth: number;
  startHeight?: number;
  startFontSize: number;
  startRotation: number;
  startAngle: number;
  centerX: number;
  centerY: number;
  groupId?: string;
  startGroupElements?: Array<{ id: string; x: number; y: number; rotation: number; centerOffsetX: number; centerOffsetY: number }>;
};

type LayerPanelRow =
  | { type: "group"; group: RecipeLayerGroup; elements: RecipeLayoutElement[] }
  | { type: "element"; element: RecipeLayoutElement };

const RECIPE_FONTS: Array<{ label: string; value: RecipeFontFamily; css: string }> = [
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

const LOGO_OPTIONS = [
  {
    label: "Логотип с буквами",
    url: "https://media.laplapla.com/stickers/laplapla-logo-letters.webp",
    path: "stickers/laplapla-logo-letters.webp",
  },
  {
    label: "Лапка",
    url: "https://media.laplapla.com/stickers/laplapla-logo.png",
    path: "stickers/laplapla-logo.png",
  },
];

const GRADIENT_PRESETS = [
  { label: "Vanilla mint", from: "#fff4cf", to: "#b9efe4" },
  { label: "Berry milk", from: "#ffe2ec", to: "#d7f2ff" },
  { label: "Mango sky", from: "#ffe2a8", to: "#b7defa" },
  { label: "Leaf cream", from: "#ecf8c8", to: "#fff2dc" },
  { label: "Lilac peach", from: "#eadcff", to: "#ffd7c2" },
];

const ASSET_TAGS = [
  { label: "asset", value: "asset" },
  { label: "decor", value: "decor" },
  { label: "food", value: "food" },
  { label: "frame", value: "frame" },
  { label: "label", value: "label" },
  { label: "line", value: "line" },
  { label: "logo", value: "logo" },
  { label: "ribbon", value: "ribbon" },
  { label: "star", value: "star" },
  { label: "sticker", value: "sticker" },
];

const ROOT_MEDIA_FOLDERS = ["bedtime_story/", "recipes/", "stickers/", "stickers-for-laplapla-song/"];
const KNOWN_MEDIA_FOLDERS_BY_PREFIX: Record<string, string[]> = {
  "recipes/": ["recipes/assets/", "recipes/exports/", "recipes/recipes-pics/"],
  "stickers/": ["stickers/capybara-stickers/", "stickers/raccoon-stickers/"],
};
const EXCLUDED_EDITOR_MEDIA_FOLDER_PATTERNS = [
  /(^|\/)audio(s)?\//i,
  /(^|\/)music\//i,
  /(^|\/)mp3(s)?\//i,
  /(^|\/)sound(s)?\//i,
  /(^|\/)songs?\//i,
  /parrot-music/i,
];
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
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

function arcPathD(bend: number) {
  const safeBend = Math.max(-100, Math.min(100, bend));
  const controlY = 50 - safeBend * 0.34;
  return `M 0 50 Q 50 ${controlY.toFixed(2)} 100 50`;
}

function arcTextAnchor(align: RecipeLayoutElement["align"]) {
  if (align === "left") {
    return { anchor: "start", offset: "0%" };
  }
  if (align === "right") {
    return { anchor: "end", offset: "100%" };
  }
  return { anchor: "middle", offset: "50%" };
}

function publicR2Url(path: string) {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  return `${base}/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function withCacheBuster(url: string | null | undefined, key: string | number | null | undefined) {
  if (!url) {
    return "";
  }
  if (!key) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(key))}`;
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

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function fontCss(fontFamily: RecipeFontFamily | undefined) {
  return RECIPE_FONTS.find((font) => font.value === fontFamily)?.css ?? RECIPE_FONTS[0].css;
}

function fontValue(value: unknown): RecipeFontFamily {
  return RECIPE_FONTS.some((font) => font.value === value) ? value as RecipeFontFamily : "Nunito";
}

function colorValue(value: unknown, fallback = "#18202d") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function opacityValue(value: unknown, fallback = 0.62) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(1, numberValue)) : fallback;
}

function hexToRgba(hex: string, opacity: number) {
  const value = colorValue(hex, "#ffffff").replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function isTextElement(element: RecipeLayoutElement) {
  return element.kind !== "image" && element.kind !== "asset" && element.kind !== "logo";
}

function isRecipeTextSource(value: unknown): value is Exclude<RecipeLayoutElement["source"], "image_url" | "custom_image"> {
  return value === "title"
    || value === "country"
    || value === "raccoon_caption"
    || value === "cooking_time"
    || value === "ingredients"
    || value === "cooking_steps"
    || value === "fact"
    || value === "raccoon_advice"
    || value === "serving_instructions"
    || value === "laplapla_interaction_caption";
}

function isRecipeElementKind(value: unknown): value is RecipeLayoutElement["kind"] {
  return value === "title"
    || value === "country"
    || value === "image"
    || value === "asset"
    || value === "logo"
    || value === "text"
    || value === "list"
    || value === "steps"
    || value === "step";
}

const LANGUAGE_STYLE_KEYS = new Set<keyof RecipeLanguageStyle>([
  "x",
  "y",
  "width",
  "height",
  "fontSize",
  "fontFamily",
  "textColor",
  "backgroundEnabled",
  "backgroundColor",
  "backgroundOpacity",
  "underlineEnabled",
  "boldEnabled",
  "arcBend",
  "rotation",
  "align",
  "visible",
]);

function languageStyleFromElement(element: RecipeLayoutElement): Partial<RecipeLanguageStyle> {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    textColor: element.textColor,
    backgroundEnabled: element.backgroundEnabled,
    backgroundColor: element.backgroundColor,
    backgroundOpacity: element.backgroundOpacity,
    underlineEnabled: element.underlineEnabled,
    boldEnabled: element.boldEnabled,
    arcBend: element.arcBend,
    rotation: element.rotation,
    align: element.align,
    visible: element.visible,
  };
}

function normalizeLanguageStyle(value: unknown): Partial<RecipeLanguageStyle> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Partial<RecipeLanguageStyle>;
  const style: Partial<RecipeLanguageStyle> = {};
  if (record.x !== undefined) style.x = Number(record.x);
  if (record.y !== undefined) style.y = Number(record.y);
  if (record.width !== undefined) style.width = Number(record.width);
  if (record.height !== undefined) style.height = Number(record.height);
  if (record.fontSize !== undefined) style.fontSize = Number(record.fontSize);
  if (record.fontFamily !== undefined) style.fontFamily = fontValue(record.fontFamily);
  if (record.textColor !== undefined) style.textColor = colorValue(record.textColor);
  if (record.backgroundColor !== undefined) style.backgroundColor = colorValue(record.backgroundColor, "#ffffff");
  if (record.backgroundOpacity !== undefined) style.backgroundOpacity = opacityValue(record.backgroundOpacity);
  if (record.backgroundEnabled !== undefined) style.backgroundEnabled = record.backgroundEnabled === true;
  if (record.underlineEnabled !== undefined) style.underlineEnabled = record.underlineEnabled === true;
  if (record.boldEnabled !== undefined) style.boldEnabled = record.boldEnabled === true;
  if (record.arcBend !== undefined) style.arcBend = Number(record.arcBend);
  if (record.rotation !== undefined) style.rotation = Number(record.rotation);
  if (record.align === "left" || record.align === "center" || record.align === "right") style.align = record.align;
  if (record.visible !== undefined) style.visible = record.visible !== false;
  return style;
}

function normalizeLanguageStyles(element: RecipeLayoutElement, value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Record<RecipeStudioLanguage, unknown>>
    : {};
  return {
    ru: {
      ...languageStyleFromElement(element),
      ...normalizeLanguageStyle(record.ru),
    },
    en: {
      ...languageStyleFromElement(element),
      ...normalizeLanguageStyle(record.en),
    },
    he: {
      ...languageStyleFromElement(element),
      ...normalizeLanguageStyle(record.he),
    },
  };
}

function resolveElementForLanguage(element: RecipeLayoutElement, language: RecipeStudioLanguage): RecipeLayoutElement {
  return {
    ...element,
    ...(element.languageStyles?.[language] ?? {}),
  };
}

function patchElementForLanguage(
  element: RecipeLayoutElement,
  patch: Partial<RecipeLayoutElement>,
  language: RecipeStudioLanguage,
): RecipeLayoutElement {
  const languagePatch: Partial<RecipeLanguageStyle> = {};
  const basePatch: Partial<RecipeLayoutElement> = {};
  for (const [key, value] of Object.entries(patch) as Array<[keyof RecipeLayoutElement, unknown]>) {
    if (LANGUAGE_STYLE_KEYS.has(key as keyof RecipeLanguageStyle)) {
      (languagePatch as Record<string, unknown>)[key] = value;
    } else {
      (basePatch as Record<string, unknown>)[key] = value;
    }
  }

  const currentStyles = element.languageStyles ?? normalizeLanguageStyles(element, element.languageStyles);
  const currentLanguageStyle = currentStyles[language] ?? languageStyleFromElement(element);
  return {
    ...element,
    ...basePatch,
    languageStyles: {
      ...currentStyles,
      [language]: {
        ...currentLanguageStyle,
        ...languagePatch,
      },
    },
    ...(language === "ru" ? languagePatch : {}),
  };
}

function mediaLabelFromKey(key: string) {
  const fileName = key.split("/").filter(Boolean).pop() ?? key;
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

function elementTemplateSnapshot(layout: RecipeLayout) {
  return layout.elements.map((element) => ({
    id: element.id,
    label: element.label,
    kind: element.kind,
    source: element.source,
    path: element.path,
    url: element.url,
    x: Number(element.x.toFixed(2)),
    y: Number(element.y.toFixed(2)),
    width: Number(element.width.toFixed(2)),
    height: element.height === undefined ? undefined : Number(element.height.toFixed(2)),
    fontSize: element.fontSize,
    fontFamily: element.fontFamily ?? "Nunito",
    textColor: element.textColor ?? "#18202d",
    backgroundEnabled: element.backgroundEnabled === true,
    backgroundColor: element.backgroundColor ?? "#ffffff",
    backgroundOpacity: element.backgroundOpacity ?? 0.62,
    underlineEnabled: element.underlineEnabled === true,
    boldEnabled: element.boldEnabled !== false,
    arcBend: element.arcBend ?? 0,
    rotation: element.rotation,
    flipX: element.flipX === true,
    flipY: element.flipY === true,
    align: element.align,
    visible: element.visible,
    groupId: element.groupId,
    stepIndex: element.stepIndex,
    customTextTranslations: element.customTextTranslations,
    languageStyles: element.languageStyles,
  }));
}

function layoutTemplateElementCount(template: RecipeLayoutTemplate) {
  const elements = template.layout_json.elements;
  return Array.isArray(elements) ? elements.length : 0;
}

function mediaFoldersForPrefix(prefix: string, folders: string[]) {
  const requiredFolders = prefix ? KNOWN_MEDIA_FOLDERS_BY_PREFIX[prefix] ?? [] : ROOT_MEDIA_FOLDERS;
  return Array.from(new Set([...requiredFolders, ...folders]))
    .filter((folder) => folder !== prefix)
    .filter((folder) => !EXCLUDED_EDITOR_MEDIA_FOLDER_PATTERNS.some((pattern) => pattern.test(folder)))
    .sort((left, right) => left.localeCompare(right));
}

function mediaAncestorPrefixes(prefix: string) {
  const parts = prefix.split("/").filter(Boolean);
  return [
    "",
    ...parts.map((_, index) => `${parts.slice(0, index + 1).join("/")}/`),
  ];
}

function mediaBreadcrumbs(prefix: string) {
  const parts = prefix.split("/").filter(Boolean);
  return parts.map((part, index) => ({
    label: part,
    prefix: `${parts.slice(0, index + 1).join("/")}/`,
  }));
}

function normalizeSavedAssets(value: unknown): RecipeSavedAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RecipeSavedAsset | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Partial<RecipeSavedAsset>;
      if (!record.url || !record.path) {
        return null;
      }
      return {
        label: record.label || mediaLabelFromKey(record.path),
        url: record.url,
        path: record.path,
        kind: record.kind === "raccoon_sticker" ? "raccoon_sticker" : "recipe_asset",
        setKey: record.setKey || "",
        tag: record.tag || "asset",
        name: record.name || mediaLabelFromKey(record.path),
        index: Number(record.index || 1),
        createdAt: record.createdAt || new Date().toISOString(),
      };
    })
    .filter((item): item is RecipeSavedAsset => item !== null);
}

function normalizeCustomTextTranslations(value: unknown, fallback: string | undefined): Partial<Record<RecipeStudioLanguage, string>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback ? { ru: fallback, en: fallback, he: fallback } : undefined;
  }

  const record = value as Partial<Record<RecipeStudioLanguage, unknown>>;
  const translations: Partial<Record<RecipeStudioLanguage, string>> = {};
  for (const language of ["ru", "en", "he"] as const) {
    if (typeof record[language] === "string") {
      translations[language] = record[language];
    }
  }
  return Object.keys(translations).length > 0 ? translations : fallback ? { ru: fallback, en: fallback, he: fallback } : undefined;
}

function normalizeGroups(value: unknown): RecipeLayerGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): RecipeLayerGroup | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Partial<RecipeLayerGroup>;
      if (!record.id) {
        return null;
      }
      return {
        id: record.id,
        name: record.name?.trim() || "Группа",
      };
    })
    .filter((item): item is RecipeLayerGroup => item !== null);
}

function groupName(layout: RecipeLayout, groupId: string | undefined) {
  if (!groupId) {
    return "";
  }
  return layout.groups?.find((group) => group.id === groupId)?.name ?? "Группа";
}

function fallbackMediaTree(): MediaTreeNode {
  return {
    prefix: "",
    label: "laplapla-public-media",
    children: ROOT_MEDIA_FOLDERS.map((rootFolder) => ({
      prefix: rootFolder,
      label: rootFolder.replace(/\/$/, ""),
      children: (KNOWN_MEDIA_FOLDERS_BY_PREFIX[rootFolder] ?? []).map((childFolder) => ({
        prefix: childFolder,
        label: childFolder.split("/").filter(Boolean).pop() ?? childFolder,
        children: [],
      })),
    })),
  };
}

function offscreenHandlePosition(element: RecipeLayoutElement) {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + (element.height ?? 8) / 2;
  const isOffscreen =
    element.x + element.width < 0 ||
    element.x > 100 ||
    element.y + (element.height ?? 8) < 0 ||
    element.y > 100;

  return {
    isOffscreen,
    x: Math.max(2, Math.min(98, centerX)),
    y: Math.max(2, Math.min(98, centerY)),
  };
}

function selectedOverlayGeometry(element: RecipeLayoutElement) {
  return {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height ?? Math.max(6, element.fontSize * 0.22),
    rotation: element.rotation,
  };
}

function groupBounds(elements: RecipeLayoutElement[]) {
  if (elements.length === 0) {
    return null;
  }
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(...elements.map((element) => element.x + element.width));
  const bottom = Math.max(...elements.map((element) => element.y + (element.height ?? Math.max(6, element.fontSize * 0.22))));
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function defaultLayout(): RecipeLayout {
  const textBase = {
    textColor: "#18202d",
    backgroundColor: "#ffffff",
    backgroundOpacity: 0.62,
    underlineEnabled: false,
    boldEnabled: true,
    arcBend: 0,
  };
  return {
    canvas: { width: 1000, height: 1500 },
    groups: [],
    assets: [],
    elements: [
      { id: "brand", kind: "logo", label: "Логотип", source: "custom_image", x: 7, y: 4, width: 18, height: 8, fontSize: 16, fontFamily: "Nunito", rotation: 0, align: "center", visible: true, url: LOGO_OPTIONS[0].url, path: LOGO_OPTIONS[0].path },
      { ...textBase, id: "country", kind: "country", label: "Страна", source: "country", x: 7, y: 9, width: 48, fontSize: 18, fontFamily: "Varela Round", backgroundEnabled: false, rotation: 0, align: "left", visible: true },
      { ...textBase, id: "title", kind: "title", label: "Название", source: "title", x: 7, y: 13, width: 72, fontSize: 48, fontFamily: "Amatic SC", backgroundEnabled: false, rotation: 0, align: "left", visible: true },
      { id: "image", kind: "image", label: "Картинка блюда", source: "image_url", x: 18, y: 24, width: 64, height: 19, fontSize: 16, fontFamily: "Nunito", rotation: -2, align: "center", visible: true },
      { ...textBase, id: "caption", kind: "text", label: "Фраза енотика", source: "raccoon_caption", x: 47, y: 42, width: 42, fontSize: 22, fontFamily: "Caveat", backgroundEnabled: true, rotation: 2, align: "center", visible: true },
      { ...textBase, id: "time", kind: "text", label: "Время", source: "cooking_time", x: 7, y: 45, width: 34, fontSize: 20, fontFamily: "Nunito", backgroundEnabled: true, rotation: 0, align: "center", visible: true },
      { ...textBase, id: "ingredients", kind: "list", label: "Ингредиенты", source: "ingredients", x: 7, y: 52, width: 38, fontSize: 18, fontFamily: "Nunito", backgroundEnabled: true, rotation: 0, align: "left", visible: true },
      { ...textBase, id: "steps", kind: "steps", label: "Шаги", source: "cooking_steps", x: 48, y: 52, width: 44, fontSize: 17, fontFamily: "Nunito", backgroundEnabled: true, rotation: 0, align: "left", visible: true },
      { ...textBase, id: "fact", kind: "text", label: "Факт", source: "fact", x: 8, y: 76, width: 84, fontSize: 17, fontFamily: "Nunito", backgroundEnabled: true, rotation: 0, align: "center", visible: true },
      { ...textBase, id: "advice", kind: "text", label: "Совет", source: "raccoon_advice", x: 8, y: 84, width: 40, fontSize: 17, fontFamily: "Nunito", backgroundEnabled: true, rotation: -1, align: "left", visible: true },
      { ...textBase, id: "serving", kind: "text", label: "Подача", source: "serving_instructions", x: 53, y: 84, width: 39, fontSize: 17, fontFamily: "Nunito", backgroundEnabled: true, rotation: 1, align: "left", visible: true },
      { ...textBase, id: "interaction", kind: "text", label: "CTA", source: "laplapla_interaction_caption", x: 12, y: 94, width: 76, fontSize: 18, fontFamily: "Varela Round", backgroundEnabled: true, rotation: 0, align: "center", visible: true },
    ],
  };
}

function normalizeLayout(value: unknown): RecipeLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultLayout();
  }

  const record = value as { canvas?: unknown; elements?: unknown };
  if (!Array.isArray(record.elements)) {
    return defaultLayout();
  }

  const fallback = defaultLayout();
  const elements = record.elements
    .map((item): RecipeLayoutElement | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const element = item as Partial<RecipeLayoutElement>;
      const fallbackElement = fallback.elements.find((candidate) => candidate.id === element.id);
      if (!element.id || !element.source) {
        return null;
      }
      if (element.id === "brand") {
        const normalizedBrand: RecipeLayoutElement = {
          ...fallback.elements[0],
          ...element,
          kind: "logo",
          source: "custom_image",
          label: element.label ?? "Логотип",
          x: Number(element.x ?? fallback.elements[0].x),
          y: Number(element.y ?? fallback.elements[0].y),
          width: Number(element.width ?? fallback.elements[0].width),
          height: element.height === undefined ? fallback.elements[0].height : Number(element.height),
          fontSize: Number(element.fontSize ?? fallback.elements[0].fontSize),
          fontFamily: fontValue(element.fontFamily),
          textColor: colorValue(element.textColor),
          backgroundColor: colorValue(element.backgroundColor, "#ffffff"),
          backgroundOpacity: opacityValue(element.backgroundOpacity),
          backgroundEnabled: element.backgroundEnabled === true,
          underlineEnabled: element.underlineEnabled === true,
          boldEnabled: element.boldEnabled !== false,
          arcBend: Number(element.arcBend ?? 0),
          rotation: Number(element.rotation ?? fallback.elements[0].rotation),
          align: element.align ?? fallback.elements[0].align,
          url: element.url || LOGO_OPTIONS[0].url,
          path: element.path || LOGO_OPTIONS[0].path,
          groupId: typeof element.groupId === "string" ? element.groupId : undefined,
          flipX: element.flipX === true,
          flipY: element.flipY === true,
          visible: element.visible !== false,
        };
        normalizedBrand.languageStyles = normalizeLanguageStyles(normalizedBrand, element.languageStyles);
        return normalizedBrand;
      }
      const incomingKind = isRecipeElementKind(element.kind) ? element.kind : undefined;
      const incomingSource = element.source;
      const baseElement: RecipeLayoutElement = fallbackElement ?? {
        id: element.id,
        kind: incomingKind === "asset" || incomingKind === "logo" || incomingKind === "image"
          ? incomingKind
          : incomingKind === "step" || incomingKind === "steps" || incomingKind === "list" || incomingKind === "title" || incomingKind === "country" || incomingKind === "text"
            ? incomingKind
            : "image",
        label: element.label ?? (incomingKind === "step" ? "Шаг" : "Изображение"),
        source: incomingSource === "custom_image" || incomingSource === "custom_text" || incomingSource === "image_url" || isRecipeTextSource(incomingSource)
          ? incomingSource
          : "custom_image",
        x: 16,
        y: 16,
        width: 24,
        height: 12,
        fontSize: 16,
        fontFamily: "Nunito",
        textColor: "#18202d",
        backgroundColor: "#ffffff",
        backgroundOpacity: 0.62,
        backgroundEnabled: false,
        underlineEnabled: false,
        boldEnabled: true,
        arcBend: 0,
        rotation: 0,
        flipX: false,
        flipY: false,
        align: "center",
        visible: true,
      };
      const normalizedElement: RecipeLayoutElement = {
        ...baseElement,
        ...element,
        kind: incomingKind ?? baseElement.kind,
        source: incomingSource === "custom_image" || incomingSource === "custom_text" || incomingSource === "image_url" || isRecipeTextSource(incomingSource)
          ? incomingSource
          : baseElement.source,
        x: Number(element.x ?? baseElement.x),
        y: Number(element.y ?? baseElement.y),
        width: Number(element.width ?? baseElement.width),
        height: element.height === undefined ? baseElement.height : Number(element.height),
        fontSize: Number(element.fontSize ?? baseElement.fontSize),
        fontFamily: fontValue(element.fontFamily),
        textColor: colorValue(element.textColor, baseElement.textColor ?? "#18202d"),
        backgroundColor: colorValue(element.backgroundColor, baseElement.backgroundColor ?? "#ffffff"),
        backgroundOpacity: opacityValue(element.backgroundOpacity, baseElement.backgroundOpacity ?? 0.62),
        backgroundEnabled: element.backgroundEnabled ?? baseElement.backgroundEnabled ?? false,
        underlineEnabled: element.underlineEnabled === true,
        boldEnabled: element.boldEnabled ?? baseElement.boldEnabled ?? true,
        arcBend: Number(element.arcBend ?? baseElement.arcBend ?? 0),
        rotation: Number(element.rotation ?? baseElement.rotation),
        groupId: typeof element.groupId === "string" ? element.groupId : undefined,
        stepIndex: Number.isInteger(element.stepIndex) ? element.stepIndex : undefined,
        customText: typeof element.customText === "string" ? element.customText : undefined,
        customTextTranslations: normalizeCustomTextTranslations(element.customTextTranslations, typeof element.customText === "string" ? element.customText : undefined),
        flipX: element.flipX === true,
        flipY: element.flipY === true,
        visible: element.visible !== false,
      };
      normalizedElement.languageStyles = normalizeLanguageStyles(normalizedElement, element.languageStyles);
      return normalizedElement;
    })
    .filter((item): item is RecipeLayoutElement => item !== null);

  const merged = [
    ...elements,
    ...fallback.elements.filter((item) => !elements.some((existing) => existing.id === item.id)),
  ];

  return {
    canvas: fallback.canvas,
    groups: normalizeGroups((record as { groups?: unknown }).groups).filter((group) => merged.some((element) => element.groupId === group.id)),
    assets: normalizeSavedAssets((record as { assets?: unknown }).assets),
    elements: merged,
  };
}

function recipeToEditableJson(recipe: RecipeRecord): string {
  const {
    id,
    created_at,
    updated_at,
    ...payload
  } = recipe;
  void id;
  void created_at;
  void updated_at;
  return JSON.stringify(payload, null, 2);
}

function recipePayload(recipe: RecipeRecord, layout: RecipeLayout) {
  const {
    id,
    created_at,
    updated_at,
    ...payload
  } = recipe;
  void id;
  void created_at;
  void updated_at;
  return {
    ...payload,
    layout_json: layout,
  };
}

function recipeTextForLanguage(
  recipe: RecipeRecord,
  language: RecipeStudioLanguage,
  key: Exclude<RecipeLayoutElement["source"], "image_url" | "custom_image" | "custom_text">,
): string | string[] {
  const translation = language === "ru" ? null : recipe.translations[language];

  switch (key) {
    case "title":
      return translation?.title ?? recipe.title;
    case "country":
      return translation?.country ?? recipe.country ?? "Страна";
    case "raccoon_caption":
      return translation?.raccoon_caption ?? recipe.raccoon_caption ?? "Енотик советует попробовать!";
    case "cooking_time": {
      const label = language === "en" ? "Time" : language === "he" ? "זמן" : "Время";
      const cookingTime = translation?.cooking_time ?? recipe.cooking_time;
      return cookingTime ? `${label}: ${cookingTime}` : label;
    }
    case "ingredients":
      return translation?.ingredients?.length ? translation.ingredients : recipe.ingredients;
    case "cooking_steps":
      return (translation?.cooking_steps?.length ? translation.cooking_steps : recipe.cooking_steps)
        .map((step) => `${step.order}. ${step.text}`);
    case "fact":
      return translation?.fact ?? recipe.fact ?? "";
    case "raccoon_advice":
      return translation?.raccoon_advice ?? recipe.raccoon_advice ?? "";
    case "serving_instructions":
      return translation?.serving_instructions ?? recipe.serving_instructions ?? "";
    case "laplapla_interaction_caption":
      return translation?.laplapla_interaction_caption ?? recipe.laplapla_interaction_caption ?? "Сохрани рецепт на будущее";
    default:
      return "";
  }
}

function valueForElement(
  recipe: RecipeRecord,
  element: RecipeLayoutElement,
  language: RecipeStudioLanguage,
): string | string[] {
  if (element.source === "image_url") {
    return withCacheBuster(recipe.image_url, recipe.updated_at);
  }

  if (element.source === "custom_image") {
    return element.url ?? "";
  }

  if (element.source === "custom_text") {
    return element.customTextTranslations?.[language] ?? element.customText ?? "";
  }

  if (element.source === "cooking_steps" && element.kind === "step") {
    const steps = recipeTextForLanguage(recipe, language, "cooking_steps");
    const stepIndex = Math.max(0, element.stepIndex ?? 0);
    return Array.isArray(steps) ? steps[stepIndex] ?? "" : "";
  }

  return recipeTextForLanguage(recipe, language, element.source);
}

function cookingStepCount(recipe: RecipeRecord) {
  return Math.max(
    recipe.cooking_steps.length,
    recipe.translations.en?.cooking_steps?.length ?? 0,
    recipe.translations.he?.cooking_steps?.length ?? 0,
  );
}

function countryTargetLabel(target: CountryTarget) {
  const title = target.title_ru || target.title_en || target.title_he;
  return title ? `${title} (${target.target_id})` : target.target_id;
}

export default function RecipeEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const recipeId = typeof router.query.recipe_id === "string" ? router.query.recipe_id : "";
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const transformStateRef = useRef<TransformState | null>(null);
  const layerDragStateRef = useRef<LayerDragState | null>(null);
  const historyPastRef = useRef<RecipeLayout[]>([]);
  const historyFutureRef = useRef<RecipeLayout[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutosaveSignatureRef = useRef("");
  const layoutLoadedRef = useRef(false);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const cropInteractionRef = useRef<CropInteraction | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
  const [layout, setLayout] = useState<RecipeLayout>(defaultLayout);
  const [selectedId, setSelectedId] = useState("title");
  const [jsonValue, setJsonValue] = useState("");
  const [studioLanguage, setStudioLanguage] = useState<RecipeStudioLanguage>("ru");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingExport, setUploadingExport] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<RecipeMediaKind | null>(null);
  const [renamingStickerFolder, setRenamingStickerFolder] = useState(false);
  const [assetSetName, setAssetSetName] = useState("");
  const [stickerSetName, setStickerSetName] = useState("");
  const [cropMode, setCropMode] = useState<RecipeCropMode>("recipe_asset");
  const [cropSelectionMode, setCropSelectionMode] = useState<CropSelectionMode>("rect");
  const [cropRect, setCropRect] = useState<CropRect>({ x: 12, y: 12, width: 28, height: 28 });
  const [cropNaturalSize, setCropNaturalSize] = useState({ width: 0, height: 0 });
  const [cropLassoPoints, setCropLassoPoints] = useState<CropPoint[]>([]);
  const [cropLassoDrawing, setCropLassoDrawing] = useState(false);
  const [assetCropIndex, setAssetCropIndex] = useState(1);
  const [stickerCropIndex, setStickerCropIndex] = useState(1);
  const [cropWhiteRemovalIntensity, setCropWhiteRemovalIntensity] = useState(65);
  const [cropAssetName, setCropAssetName] = useState("");
  const [cropAssetTag, setCropAssetTag] = useState("asset");
  const [cropSearchTags, setCropSearchTags] = useState("");
  const [savingCrop, setSavingCrop] = useState(false);
  const [savedCropAssets, setSavedCropAssets] = useState<RecipeSavedAsset[]>([]);
  const [mediaPrefix, setMediaPrefix] = useState("");
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryResponse | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaTree, setMediaTree] = useState<MediaTreeNode>(fallbackMediaTree);
  const [mediaTreeLoading, setMediaTreeLoading] = useState(false);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [expandedMediaFolders, setExpandedMediaFolders] = useState<Set<string>>(() => new Set(["", "recipes/", "stickers/"]));
  const [selectedMediaObject, setSelectedMediaObject] = useState<MediaLibraryObject | null>(null);
  const [renameMediaName, setRenameMediaName] = useState("");
  const [renameMediaTag, setRenameMediaTag] = useState("asset");
  const [renamingMedia, setRenamingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [captureMode, setCaptureMode] = useState(false);
  const [exportLinksRefreshKey, setExportLinksRefreshKey] = useState(0);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [templates, setTemplates] = useState<RecipeLayoutTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [mediaPanelOpen, setMediaPanelOpen] = useState(true);
  const [cropPanelOpen, setCropPanelOpen] = useState(true);
  const [r2PanelOpen, setR2PanelOpen] = useState(true);
  const [freeTextValue, setFreeTextValue] = useState("");
  const [countryTargetQuery, setCountryTargetQuery] = useState("");
  const [countryTargets, setCountryTargets] = useState<CountryTarget[]>([]);
  const [countryTargetsLoading, setCountryTargetsLoading] = useState(false);
  const [countryTargetsError, setCountryTargetsError] = useState<string | null>(null);
  const [positionSourceLanguage, setPositionSourceLanguage] = useState<RecipeStudioLanguage>("ru");

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
    if (!sessionChecked || !recipeId) {
      return;
    }

    setLoading(true);
    setError(null);
    fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipeId}`)
      .then((data) => {
        const loadedLayout = normalizeLayout(data.recipe.layout_json);
        layoutLoadedRef.current = true;
        historyPastRef.current = [];
        historyFutureRef.current = [];
        setHistoryVersion((current) => current + 1);
        lastAutosaveSignatureRef.current = JSON.stringify({
          layout: loadedLayout,
          gradient_from: data.recipe.gradient_from,
          gradient_to: data.recipe.gradient_to,
        });
        setRecipe(data.recipe);
        setLayout(loadedLayout);
        setJsonValue(recipeToEditableJson(data.recipe));
        setAssetSetName(data.recipe.asset_set_key ?? "");
        setStickerSetName(data.recipe.sticker_set_key ?? "");
        setSavedCropAssets(loadedLayout.assets ?? []);
        setSelectedId(loadedLayout.elements[0]?.id ?? "title");
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
      .finally(() => setLoading(false));
  }, [recipeId, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    setMediaLoading(true);
    setMediaError(null);
    fetchJson<MediaLibraryResponse>(`/api/admin/recipes/media-library?prefix=${encodeURIComponent(mediaPrefix)}`)
      .then(setMediaLibrary)
      .catch((fetchError) => setMediaError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
      .finally(() => setMediaLoading(false));
  }, [mediaPrefix, mediaRefreshKey, sessionChecked]);

  useEffect(() => {
    setExpandedMediaFolders((current) => {
      const next = new Set(current);
      for (const prefix of mediaAncestorPrefixes(mediaPrefix)) {
        next.add(prefix);
      }
      return next;
    });
  }, [mediaPrefix]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    setMediaTreeLoading(true);
    fetchJson<{ tree: MediaTreeNode }>(`/api/admin/recipes/media-tree?depth=7`)
      .then((data) => setMediaTree(data.tree))
      .catch(() => setMediaTree(fallbackMediaTree()))
      .finally(() => setMediaTreeLoading(false));
  }, [mediaRefreshKey, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked || !templatePanelOpen || !recipeId) {
      return;
    }

    setTemplatesLoading(true);
    setTemplatesError(null);
    fetchJson<{ templates: RecipeLayoutTemplate[] }>(
      `/api/admin/recipes/templates?currentRecipeId=${encodeURIComponent(recipeId)}&limit=40`,
    )
      .then((data) => setTemplates(data.templates))
      .catch((fetchError) => setTemplatesError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
      .finally(() => setTemplatesLoading(false));
  }, [recipeId, sessionChecked, templatePanelOpen]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    const timer = setTimeout(() => {
      setCountryTargetsLoading(true);
      setCountryTargetsError(null);
      fetchJson<{ targets: CountryTarget[] }>(
        `/api/admin/recipes/country-targets?q=${encodeURIComponent(countryTargetQuery)}&limit=30`,
      )
        .then((data) => setCountryTargets(data.targets))
        .catch((fetchError) => setCountryTargetsError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
        .finally(() => setCountryTargetsLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [countryTargetQuery, sessionChecked]);

  useEffect(() => {
    if (!recipe || !layoutLoadedRef.current) {
      return;
    }

    const signature = JSON.stringify({
      layout,
      gradient_from: recipe.gradient_from,
      gradient_to: recipe.gradient_to,
    });
    if (signature === lastAutosaveSignatureRef.current) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    setAutosaveState("saving");
    autosaveTimerRef.current = setTimeout(() => {
      fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipe.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipePayload(recipe, layout) }),
      })
        .then((data) => {
          lastAutosaveSignatureRef.current = signature;
          setRecipe(data.recipe);
          setJsonValue(recipeToEditableJson(data.recipe));
          setAutosaveState("saved");
        })
        .catch(() => setAutosaveState("error"));
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [layout, recipe]);

  const selectedElementRaw = useMemo(
    () => layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0],
    [layout.elements, selectedId],
  );
  const selectedElement = useMemo(
    () => selectedElementRaw ? resolveElementForLanguage(selectedElementRaw, studioLanguage) : selectedElementRaw,
    [selectedElementRaw, studioLanguage],
  );
  const mediaFolders = useMemo(
    () => mediaFoldersForPrefix(mediaPrefix, mediaLibrary?.folders ?? []),
    [mediaLibrary?.folders, mediaPrefix],
  );
  const mediaCrumbs = useMemo(() => mediaBreadcrumbs(mediaPrefix), [mediaPrefix]);
  const selectedGroupId = selectedElementRaw?.groupId;
  const layerRows = useMemo<LayerPanelRow[]>(() => {
    const rows: LayerPanelRow[] = [];
    const renderedGroups = new Set<string>();
    for (const element of layout.elements) {
      if (element.groupId) {
        if (renderedGroups.has(element.groupId)) {
          continue;
        }
        renderedGroups.add(element.groupId);
        rows.push({
          type: "group",
          group: {
            id: element.groupId,
            name: groupName(layout, element.groupId),
          },
          elements: layout.elements
            .filter((item) => item.groupId === element.groupId)
            .map((item) => resolveElementForLanguage(item, studioLanguage)),
        });
      } else {
        rows.push({ type: "element", element: resolveElementForLanguage(element, studioLanguage) });
      }
    }
    return rows;
  }, [layout, studioLanguage]);

  const activeCropSetKey =
    cropMode === "recipe_asset"
      ? assetSetName || recipe?.asset_set_key || ""
      : stickerSetName || recipe?.sticker_set_key || "";
  const activeCropIndex = cropMode === "recipe_asset" ? assetCropIndex : stickerCropIndex;
  const activeCropSourceUrl =
    activeCropSetKey.trim()
      ? withCacheBuster(
          publicR2Url(
            cropMode === "recipe_asset"
              ? `recipes/assets/${activeCropSetKey.trim()}/source.webp`
              : `stickers/raccoon-stickers/${activeCropSetKey.trim()}/source.webp`,
          ),
          recipe?.updated_at,
        )
      : "";
  const activeCropFolderPrefix = activeCropSetKey.trim()
    ? cropMode === "recipe_asset"
      ? `recipes/assets/${activeCropSetKey.trim()}/`
      : `stickers/raccoon-stickers/${activeCropSetKey.trim()}/`
    : "";
  const activeCropObjectKeys = useMemo(
    () => mediaLibrary?.prefix === activeCropFolderPrefix
      ? new Set(mediaLibrary.objects.map((object) => object.key))
      : null,
    [activeCropFolderPrefix, mediaLibrary],
  );
  const visibleSavedCropAssets = useMemo(
    () => savedCropAssets
      .filter((asset) => asset.kind === cropMode && asset.setKey === activeCropSetKey.trim())
      .filter((asset) => !activeCropObjectKeys || activeCropObjectKeys.has(asset.path))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [activeCropObjectKeys, activeCropSetKey, cropMode, savedCropAssets],
  );

  const pushLayoutHistory = (snapshot: RecipeLayout) => {
    historyPastRef.current = [...historyPastRef.current.slice(-79), snapshot];
    historyFutureRef.current = [];
    setHistoryVersion((current) => current + 1);
  };

  const applyLayoutChange = (updater: LayoutUpdater) => {
    setLayout((current) => {
      pushLayoutHistory(current);
      return updater(current);
    });
  };

  const undoLayout = () => {
    setLayout((current) => {
      const previous = historyPastRef.current.at(-1);
      if (!previous) {
        return current;
      }
      historyPastRef.current = historyPastRef.current.slice(0, -1);
      historyFutureRef.current = [current, ...historyFutureRef.current].slice(0, 80);
      setHistoryVersion((value) => value + 1);
      setSelectedId(previous.elements.some((element) => element.id === selectedId) ? selectedId : previous.elements[0]?.id ?? "title");
      return previous;
    });
  };

  const redoLayout = () => {
    setLayout((current) => {
      const next = historyFutureRef.current[0];
      if (!next) {
        return current;
      }
      historyFutureRef.current = historyFutureRef.current.slice(1);
      historyPastRef.current = [...historyPastRef.current.slice(-79), current];
      setHistoryVersion((value) => value + 1);
      setSelectedId(next.elements.some((element) => element.id === selectedId) ? selectedId : next.elements[0]?.id ?? "title");
      return next;
    });
  };

  const updateElement = (id: string, patch: Partial<RecipeLayoutElement>) => {
    applyLayoutChange((current) => ({
      ...current,
      elements: current.elements.map((element) => (
        element.id === id ? patchElementForLanguage(element, patch, studioLanguage) : element
      )),
    }));
  };

  const updateCustomTextForLanguage = (id: string, text: string) => {
    applyLayoutChange((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        if (element.id !== id) {
          return element;
        }
        const currentTranslations = normalizeCustomTextTranslations(element.customTextTranslations, element.customText) ?? {};
        const nextTranslations = {
          ...currentTranslations,
          [studioLanguage]: text,
        };
        const fallbackText = studioLanguage === "ru" ? text : element.customText ?? nextTranslations.ru ?? text;
        return {
          ...element,
          customText: fallbackText,
          customTextTranslations: nextTranslations,
          label: (nextTranslations.ru ?? fallbackText).trim().length > 34
            ? `${(nextTranslations.ru ?? fallbackText).trim().slice(0, 34)}...`
            : (nextTranslations.ru ?? fallbackText).trim() || "Свободный текст",
        };
      }),
    }));
  };

  const syncElementPositionsFromLanguage = () => {
    const targetLanguages = (["ru", "en", "he"] as const).filter((language) => language !== positionSourceLanguage);
    const copiedStyleKeys: Array<keyof RecipeLanguageStyle> = [
      "x",
      "y",
      "width",
      "height",
      "fontSize",
      "fontFamily",
      "textColor",
      "backgroundEnabled",
      "backgroundColor",
      "backgroundOpacity",
      "underlineEnabled",
      "boldEnabled",
      "arcBend",
      "rotation",
      "align",
    ];
    applyLayoutChange((current) => ({
      ...current,
      elements: current.elements.map((element) => {
        const styles = element.languageStyles ?? normalizeLanguageStyles(element, element.languageStyles);
        const sourceStyle = styles[positionSourceLanguage] ?? languageStyleFromElement(element);
        const copiedStyle = Object.fromEntries(
          copiedStyleKeys.map((key) => [key, sourceStyle[key]]),
        ) as Partial<RecipeLanguageStyle>;
        return {
          ...element,
          languageStyles: {
            ...styles,
            ...Object.fromEntries(targetLanguages.map((language) => [
              language,
              {
                ...(styles[language] ?? languageStyleFromElement(element)),
                ...copiedStyle,
              },
            ])),
          },
        };
      }),
    }));
    setSuccess(`Layout скопирован из ${positionSourceLanguage.toUpperCase()} в ${targetLanguages.map((language) => language.toUpperCase()).join(" и ")}.`);
  };

  const splitCookingSteps = () => {
    if (!recipe) {
      return;
    }

    const count = cookingStepCount(recipe);
    if (count === 0) {
      setError("В рецепте пока нет шагов приготовления.");
      return;
    }

    const sourceElement = selectedElementRaw?.source === "cooking_steps"
      ? selectedElementRaw
      : layout.elements.find((element) => element.id === "steps" || element.source === "cooking_steps");
    const resolvedSource = sourceElement
      ? resolveElementForLanguage(sourceElement, studioLanguage)
      : {
          x: 48,
          y: 52,
          width: 44,
          height: 20,
          fontSize: 17,
          fontFamily: "Nunito" as RecipeFontFamily,
          textColor: "#18202d",
          backgroundColor: "#ffffff",
          backgroundOpacity: 0.62,
          backgroundEnabled: true,
          underlineEnabled: false,
          boldEnabled: true,
          arcBend: 0,
          rotation: 0,
          align: "left" as const,
          visible: true,
        };
    const stepHeight = Math.max(4, Math.min(10, (resolvedSource.height ?? 22) / Math.max(1, count)));
    const createdAt = Date.now().toString(36);
    const stepElements = Array.from({ length: count }, (_, index): RecipeLayoutElement => {
      const y = Math.min(96, resolvedSource.y + index * (stepHeight + 0.8));
      const element: RecipeLayoutElement = {
        id: `step-${index + 1}-${createdAt}`,
        kind: "step",
        label: `Шаг ${index + 1}`,
        source: "cooking_steps",
        stepIndex: index,
        x: resolvedSource.x,
        y,
        width: resolvedSource.width,
        height: stepHeight,
        fontSize: resolvedSource.fontSize,
        fontFamily: resolvedSource.fontFamily,
        textColor: resolvedSource.textColor,
        backgroundColor: resolvedSource.backgroundColor,
        backgroundOpacity: resolvedSource.backgroundOpacity,
        backgroundEnabled: resolvedSource.backgroundEnabled,
        underlineEnabled: resolvedSource.underlineEnabled,
        boldEnabled: resolvedSource.boldEnabled,
        arcBend: 0,
        rotation: resolvedSource.rotation,
        align: resolvedSource.align,
        visible: true,
      };
      element.languageStyles = normalizeLanguageStyles(element, sourceElement?.languageStyles);
      element.languageStyles = {
        ru: { ...element.languageStyles.ru, y },
        en: { ...element.languageStyles.en, y },
        he: { ...element.languageStyles.he, y },
      };
      return element;
    });

    applyLayoutChange((current) => ({
      ...current,
      elements: [
        ...current.elements
          .filter((element) => element.kind !== "step" || element.source !== "cooking_steps")
          .map((element) => (
            element.source === "cooking_steps" && element.kind === "steps"
              ? {
                  ...element,
                  visible: false,
                  languageStyles: {
                    ...(element.languageStyles ?? normalizeLanguageStyles(element, element.languageStyles)),
                    ru: { ...(element.languageStyles?.ru ?? languageStyleFromElement(element)), visible: false },
                    en: { ...(element.languageStyles?.en ?? languageStyleFromElement(element)), visible: false },
                    he: { ...(element.languageStyles?.he ?? languageStyleFromElement(element)), visible: false },
                  },
                }
              : element
          )),
        ...stepElements,
      ],
    }));
    setSelectedId(stepElements[0]?.id ?? selectedId);
    setSuccess(`Шаги разделены на отдельные блоки: ${count}.`);
  };

  const toggleLayerSelection = (id: string, checked: boolean) => {
    setSelectedLayerIds((current) => (
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)
    ));
  };

  const createGroupFromSelectedLayers = () => {
    const ids = selectedLayerIds.filter((id) => layout.elements.some((element) => element.id === id));
    if (ids.length < 2) {
      setError("Для группы нужно выбрать минимум два слоя.");
      return;
    }

    const groupId = `group-${Date.now().toString(36)}`;
    applyLayoutChange((current) => ({
      ...current,
      groups: [
        ...(current.groups ?? []),
        { id: groupId, name: `Группа ${(current.groups ?? []).length + 1}` },
      ],
      elements: current.elements.map((element) => (
        ids.includes(element.id) ? { ...element, groupId } : element
      )),
    }));
    setSelectedLayerIds([]);
    setError(null);
  };

  const renameGroup = (groupId: string, name: string) => {
    applyLayoutChange((current) => ({
      ...current,
      groups: (current.groups ?? []).map((group) => (
        group.id === groupId ? { ...group, name } : group
      )),
    }));
  };

  const ungroup = (groupId: string) => {
    applyLayoutChange((current) => ({
      ...current,
      groups: (current.groups ?? []).filter((group) => group.id !== groupId),
      elements: current.elements.map((element) => (
        element.groupId === groupId ? { ...element, groupId: undefined } : element
      )),
    }));
  };

  const moveLayer = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) {
      return;
    }

    applyLayoutChange((current) => {
      const draggedIndex = current.elements.findIndex((element) => element.id === draggedId);
      const targetIndex = current.elements.findIndex((element) => element.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0) {
        return current;
      }

      const nextElements = [...current.elements];
      const [draggedElement] = nextElements.splice(draggedIndex, 1);
      nextElements.splice(targetIndex, 0, draggedElement);
      return {
        ...current,
        elements: nextElements,
      };
    });
  };

  const moveGroup = (draggedGroupId: string, targetId: string, targetType: LayerDragState["type"]) => {
    applyLayoutChange((current) => {
      const draggedElements = current.elements.filter((element) => element.groupId === draggedGroupId);
      if (draggedElements.length === 0) {
        return current;
      }

      const remaining = current.elements.filter((element) => element.groupId !== draggedGroupId);
      const targetIndex = targetType === "group"
        ? remaining.findIndex((element) => element.groupId === targetId)
        : remaining.findIndex((element) => element.id === targetId);
      const insertIndex = targetIndex < 0 ? remaining.length : targetIndex;
      const nextElements = [...remaining];
      nextElements.splice(insertIndex, 0, ...draggedElements);
      return {
        ...current,
        elements: nextElements,
      };
    });
  };

  const addImageElement = (
    item: { label: string; url: string; path?: string },
    kind: Extract<RecipeLayoutElement["kind"], "asset" | "logo"> = "asset",
    position?: { x: number; y: number },
  ) => {
    const idPrefix = kind === "logo" ? "logo" : "asset";
    const id = `${idPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const nextElement: RecipeLayoutElement = {
      id,
      kind,
      label: item.label,
      source: "custom_image",
      x: position?.x ?? (kind === "logo" ? 72 : 40),
      y: position?.y ?? (kind === "logo" ? 4 : 38),
      width: kind === "logo" ? 18 : 22,
      height: kind === "logo" ? 8 : 12,
      fontSize: 16,
      fontFamily: "Nunito",
      rotation: 0,
      flipX: false,
      flipY: false,
      align: "center",
      visible: true,
      url: item.url,
      path: item.path,
    };

    applyLayoutChange((current) => ({
      ...current,
      elements: [...current.elements, nextElement],
    }));
    setSelectedId(id);
  };

  const addFreeTextElement = () => {
    const text = freeTextValue.trim();
    if (!text) {
      setError("Введите текст для нового слоя.");
      return;
    }

    const id = `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const nextElement: RecipeLayoutElement = {
      id,
      kind: "text",
      label: text.length > 34 ? `${text.slice(0, 34)}...` : text,
      source: "custom_text",
      customText: text,
      customTextTranslations: {
        ru: text,
        en: text,
        he: text,
      },
      x: 18,
      y: 18,
      width: 48,
      height: 8,
      fontSize: 24,
      fontFamily: "Nunito",
      textColor: "#18202d",
      backgroundColor: "#ffffff",
      backgroundOpacity: 0.62,
      backgroundEnabled: true,
      underlineEnabled: false,
      boldEnabled: true,
      arcBend: 0,
      rotation: 0,
      flipX: false,
      flipY: false,
      align: "center",
      visible: true,
    };
    nextElement.languageStyles = normalizeLanguageStyles(nextElement, undefined);

    applyLayoutChange((current) => ({
      ...current,
      elements: [...current.elements, nextElement],
    }));
    setFreeTextValue("");
    setSelectedId(id);
    setSuccess("Свободный текст добавлен как новый слой.");
  };

  const selectCountryTarget = (targetId: string | null) => {
    setRecipe((current) => current ? {
      ...current,
      country_target_id: targetId,
    } : current);
  };

  const setBrandLogo = (logo: typeof LOGO_OPTIONS[number]) => {
    const existingBrand = layout.elements.find((element) => element.id === "brand");
    if (existingBrand) {
      updateElement("brand", {
        kind: "logo",
        source: "custom_image",
        label: "Логотип",
        url: logo.url,
        path: logo.path,
        width: existingBrand.width || 18,
        height: existingBrand.height || 8,
        fontSize: 16,
        align: "center",
        visible: true,
      });
      setSelectedId("brand");
      return;
    }

    addImageElement(logo, "logo");
  };

  const removeElement = (id: string) => {
    applyLayoutChange((current) => {
      const nextElements = current.elements.filter((element) => element.id !== id);
      return {
        ...current,
        elements: nextElements.length > 0 ? nextElements : current.elements,
      };
    });
    setSelectedId((current) => (current === id ? layout.elements.find((element) => element.id !== id)?.id ?? "title" : current));
  };

  const selectMediaForRename = (object: MediaLibraryObject) => {
    const label = mediaLabelFromKey(object.key);
    const existingTag = ASSET_TAGS.find((tag) => label === tag.value || label.startsWith(`${tag.value}-`))?.value ?? "asset";
    setSelectedMediaObject(object);
    setRenameMediaTag(existingTag);
    setRenameMediaName(label.replace(new RegExp(`^${existingTag}-`), ""));
  };

  const renameSelectedMedia = async () => {
    if (!selectedMediaObject) {
      return;
    }

    setRenamingMedia(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ key: string; oldKey: string; publicUrl: string }>("/api/admin/recipes/media-library/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: selectedMediaObject.key,
          name: renameMediaName,
          tag: renameMediaTag,
          deleteOriginal: true,
        }),
      });

      applyLayoutChange((current) => ({
        ...current,
        elements: current.elements.map((element) => (
          element.path === data.oldKey
            ? { ...element, path: data.key, url: data.publicUrl, label: mediaLabelFromKey(data.key) }
            : element
        )),
      }));
      setSelectedMediaObject({
        ...selectedMediaObject,
        key: data.key,
        publicUrl: data.publicUrl,
      });
      setMediaRefreshKey((current) => current + 1);
      setSuccess(`Ассет переименован: ${data.key}`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    } finally {
      setRenamingMedia(false);
    }
  };

  const renderMediaTreeNode = (node: MediaTreeNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const expanded = expandedMediaFolders.has(node.prefix);
    return (
      <div key={node.prefix || "root"} className="recipe-media-tree-node">
        <div
          className={mediaPrefix === node.prefix ? "recipe-media-tree-row recipe-media-tree-row--active" : "recipe-media-tree-row"}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            className="recipe-media-tree-toggle"
            disabled={!hasChildren}
            aria-label={expanded ? "Свернуть папку" : "Развернуть папку"}
            onClick={(event) => {
              event.stopPropagation();
              if (!hasChildren) {
                return;
              }
              setExpandedMediaFolders((current) => {
                const next = new Set(current);
                if (next.has(node.prefix)) {
                  next.delete(node.prefix);
                } else {
                  next.add(node.prefix);
                }
                return next;
              });
            }}
          >
            {hasChildren ? (expanded ? "v" : ">") : "-"}
          </button>
          <button
            type="button"
            className="recipe-media-tree-button"
            onClick={() => setMediaPrefix(node.prefix)}
          >
            <strong>{node.label}</strong>
          </button>
        </div>
        {hasChildren && expanded ? (
          <div className="recipe-media-tree-children">
            {node.children.map((child) => renderMediaTreeNode(child, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  };

  const logTemplate = () => {
    const snapshot = {
      canvas: layout.canvas,
      gradient_from: recipe?.gradient_from,
      gradient_to: recipe?.gradient_to,
      elements: elementTemplateSnapshot(layout),
    };
    console.log("Recipe Studio template", snapshot);
    setSuccess("Шаблон выведен в console.log.");
  };

  const applyLayoutTemplate = (template: RecipeLayoutTemplate) => {
    if (!recipe) {
      return;
    }

    const nextLayout = normalizeLayout(template.layout_json);
    pushLayoutHistory(layout);
    setLayout(nextLayout);
    setRecipe((current) => current ? {
      ...current,
      gradient_from: template.gradient_from ?? current.gradient_from,
      gradient_to: template.gradient_to ?? current.gradient_to,
    } : current);
    setSelectedId(nextLayout.elements[0]?.id ?? "title");
    setSelectedLayerIds([]);
    setTemplatePanelOpen(false);
    setSuccess(`Шаблон применен: ${template.title}. Тексты остались из текущего рецепта.`);
  };

  const saveRecipe = async (nextRecipe: RecipeRecord, nextLayout: RecipeLayout) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${nextRecipe.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipePayload(nextRecipe, nextLayout) }),
      });
      const savedLayout = normalizeLayout(data.recipe.layout_json);
      setRecipe(data.recipe);
      setLayout(savedLayout);
      setJsonValue(recipeToEditableJson(data.recipe));
      setSuccess("Рецепт сохранен.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setSaving(false);
    }
  };

  const saveFromJson = async () => {
    if (!recipe) {
      return;
    }

    try {
      const parsed = JSON.parse(jsonValue) as Omit<RecipeRecord, "id">;
      const nextRecipe = { ...recipe, ...parsed, id: recipe.id };
      const nextLayout = normalizeLayout(parsed.layout_json ?? layout);
      await saveRecipe(nextRecipe, nextLayout);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "JSON не удалось прочитать.");
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, element: RecipeLayoutElement) => {
    if (!canvasRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pushLayoutHistory(layout);
    const groupElements = element.groupId
      ? layout.elements
          .map((item) => resolveElementForLanguage(item, studioLanguage))
          .filter((item) => item.groupId === element.groupId)
      : [];
    dragStateRef.current = {
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
      groupId: element.groupId,
      startPositions: groupElements.map((item) => ({ id: item.id, x: item.x, y: item.y })),
    };
    setSelectedId(element.id);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startClientY) / rect.height) * 100;
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => (
        drag.groupId && element.groupId === drag.groupId
          ? (() => {
              const startPosition = drag.startPositions?.find((item) => item.id === element.id);
              return startPosition
                ? patchElementForLanguage(element, { x: startPosition.x + dx, y: startPosition.y + dy }, studioLanguage)
                : element;
            })()
          : element.id === drag.id
            ? patchElementForLanguage(element, { x: drag.startX + dx, y: drag.startY + dy }, studioLanguage)
            : element
      )),
    }));
  };

  const endDrag = () => {
    dragStateRef.current = null;
  };

  const startElementTransform = (
    event: React.PointerEvent<HTMLElement>,
    element: RecipeLayoutElement,
    action: TransformState["action"],
  ) => {
    if (!canvasRef.current) {
      return;
    }
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pushLayoutHistory(layout);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const groupElements = element.groupId
      ? layout.elements
          .map((item) => resolveElementForLanguage(item, studioLanguage))
          .filter((item) => item.groupId === element.groupId)
      : [];
    const bounds = action === "rotate" ? groupBounds(groupElements) : null;
    const centerPercentX = bounds ? bounds.centerX : element.x + element.width / 2;
    const centerPercentY = bounds ? bounds.centerY : element.y + (element.height ?? 8) / 2;
    const centerX = canvasRect.left + (centerPercentX / 100) * canvasRect.width;
    const centerY = canvasRect.top + (centerPercentY / 100) * canvasRect.height;
    transformStateRef.current = {
      action,
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: element.width,
      startHeight: element.height,
      startFontSize: element.fontSize,
      startRotation: element.rotation,
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
      centerX,
      centerY,
      groupId: action === "rotate" ? element.groupId : undefined,
      startGroupElements: bounds
        ? groupElements.map((item) => ({
            id: item.id,
            x: item.x,
            y: item.y,
            rotation: item.rotation,
            centerOffsetX: item.x + item.width / 2 - bounds.centerX,
            centerOffsetY: item.y + (item.height ?? 8) / 2 - bounds.centerY,
          }))
        : undefined,
    };
    setSelectedId(element.id);
  };

  const moveElementTransform = (event: React.PointerEvent<HTMLDivElement>) => {
    const transform = transformStateRef.current;
    const canvas = canvasRef.current;
    if (!transform || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();

    if (transform.action === "resize") {
      const dx = ((event.clientX - transform.startClientX) / rect.width) * 100;
      const dy = ((event.clientY - transform.startClientY) / rect.height) * 100;
      setLayout((current) => ({
        ...current,
        elements: current.elements.map((element) => (
          element.id === transform.id
            ? (() => {
                const nextWidth = Math.max(2, transform.startWidth + dx);
                const nextHeight = Math.max(2, (transform.startHeight ?? 8) + dy);
                const textScale = isTextElement(element)
                  ? Math.max(0.2, Math.min(5, Math.max(nextWidth / Math.max(1, transform.startWidth), nextHeight / Math.max(1, transform.startHeight ?? 8))))
                  : 1;
                return patchElementForLanguage(element, {
                  width: nextWidth,
                  height: nextHeight,
                  fontSize: isTextElement(element) ? Math.max(6, transform.startFontSize * textScale) : element.fontSize,
                }, studioLanguage);
              })()
            : element
        )),
      }));
      return;
    }

    const angle = Math.atan2(event.clientY - transform.centerY, event.clientX - transform.centerX) * 180 / Math.PI;
    const deltaAngle = angle - transform.startAngle;
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => (
        transform.groupId && element.groupId === transform.groupId
          ? (() => {
              const startGroupElement = transform.startGroupElements?.find((item) => item.id === element.id);
              if (!startGroupElement) {
                return element;
              }
              const rotatedOffset = rotatePoint(startGroupElement.centerOffsetX, startGroupElement.centerOffsetY, deltaAngle);
              const resolvedElement = resolveElementForLanguage(element, studioLanguage);
              return patchElementForLanguage(element, {
                x: (transform.centerX - rect.left) / rect.width * 100 + rotatedOffset.x - resolvedElement.width / 2,
                y: (transform.centerY - rect.top) / rect.height * 100 + rotatedOffset.y - (resolvedElement.height ?? 8) / 2,
                rotation: startGroupElement.rotation + deltaAngle,
              }, studioLanguage);
            })()
          : element.id === transform.id
            ? patchElementForLanguage(element, { rotation: transform.startRotation + deltaAngle }, studioLanguage)
            : element
      )),
    }));
  };

  const endElementTransform = () => {
    transformStateRef.current = null;
  };

  const startCropInteraction = (
    event: React.PointerEvent<HTMLElement>,
    action: CropInteraction["action"],
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    cropInteractionRef.current = {
      action,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: cropRect,
    };
  };

  const moveCropInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = cropInteractionRef.current;
    const stage = cropStageRef.current;
    if (!interaction || !stage) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startClientY) / rect.height) * 100;

    if (interaction.action === "move") {
      setCropRect({
        ...interaction.startRect,
        x: Math.max(0, Math.min(100 - interaction.startRect.width, interaction.startRect.x + dx)),
        y: Math.max(0, Math.min(100 - interaction.startRect.height, interaction.startRect.y + dy)),
      });
      return;
    }

    setCropRect({
      ...interaction.startRect,
      width: Math.max(4, Math.min(100 - interaction.startRect.x, interaction.startRect.width + dx)),
      height: Math.max(4, Math.min(100 - interaction.startRect.y, interaction.startRect.height + dy)),
    });
  };

  const endCropInteraction = () => {
    cropInteractionRef.current = null;
  };

  const cropPointerToNaturalPoint = (event: React.PointerEvent<HTMLElement>): CropPoint | null => {
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    if (!cropNaturalSize.width || !cropNaturalSize.height || !imageRect) {
      return null;
    }

    return {
      x: Math.max(0, Math.min(cropNaturalSize.width, Math.round(((event.clientX - imageRect.left) / imageRect.width) * cropNaturalSize.width))),
      y: Math.max(0, Math.min(cropNaturalSize.height, Math.round(((event.clientY - imageRect.top) / imageRect.height) * cropNaturalSize.height))),
    };
  };

  const cropLassoContinuationThreshold = () => {
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    if (!cropNaturalSize.width || !imageRect?.width) {
      return 24;
    }
    return Math.max(12, (24 / imageRect.width) * cropNaturalSize.width);
  };

  const startCropLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropSelectionMode !== "lasso") {
      return;
    }
    event.preventDefault();
    const point = cropPointerToNaturalPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropLassoDrawing(true);
    setCropLassoPoints((current) => {
      if (current.length < 2) {
        return [point];
      }

      const threshold = cropLassoContinuationThreshold();
      const first = current[0];
      const last = current.at(-1);
      if (last && Math.hypot(last.x - point.x, last.y - point.y) <= threshold) {
        return current;
      }
      if (first && Math.hypot(first.x - point.x, first.y - point.y) <= threshold) {
        return [...current].reverse();
      }
      return [point];
    });
  };

  const moveCropLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropSelectionMode !== "lasso" || !cropLassoDrawing) {
      return;
    }
    event.preventDefault();
    const point = cropPointerToNaturalPoint(event);
    if (!point) {
      return;
    }
    setCropLassoPoints((current) => {
      const previous = current.at(-1);
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 8) {
        return current;
      }
      return [...current, point].slice(-600);
    });
  };

  const endCropLasso = () => {
    setCropLassoDrawing(false);
  };

  const cropLassoBounds = () => {
    if (cropLassoPoints.length < 3) {
      return null;
    }
    const xs = cropLassoPoints.map((point) => point.x);
    const ys = cropLassoPoints.map((point) => point.y);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(cropNaturalSize.width, Math.max(...xs));
    const bottom = Math.min(cropNaturalSize.height, Math.max(...ys));
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(right - left)),
      height: Math.max(1, Math.round(bottom - top)),
    };
  };

  const renderRecipeDomToPngBlob = async (language: RecipeStudioLanguage): Promise<Blob> => {
    if (!canvasRef.current) {
      throw new Error("Recipe canvas is not available.");
    }

    setStudioLanguage(language);
    setCaptureMode(true);
    await document.fonts.ready;
    await nextAnimationFrame();

    const canvasNode = canvasRef.current;
    const rect = canvasNode.getBoundingClientRect();
    const scale = layout.canvas.width / rect.width;
    const blob = await toBlob(canvasNode, {
      cacheBust: true,
      includeQueryParams: true,
      pixelRatio: scale,
      backgroundColor: recipe?.gradient_from || "#fff4cf",
      filter: (node) => {
        if (!(node instanceof HTMLElement)) {
          return true;
        }
        return !node.classList.contains("recipe-element-controls-overlay")
          && !node.classList.contains("recipe-studio-offscreen-handle");
      },
    });

    setCaptureMode(false);
    if (!blob) {
      throw new Error("Failed to export DOM PNG.");
    }
    return blob;
  };

  const exportPng = async (languages: RecipeStudioLanguage[]) => {
    if (!recipe) {
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);
    const previousLanguage = studioLanguage;
    try {
      for (const language of languages) {
        const blob = await renderRecipeDomToPngBlob(language);
        downloadBlob(blob, `${recipe.slug || "recipe"}-${language}-pinterest.png`);
      }
      await saveRecipe(recipe, layout);
      setSuccess(`PNG экспортирован: ${languages.map((language) => language.toUpperCase()).join(", ")}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setStudioLanguage(previousLanguage);
      setCaptureMode(false);
      setExporting(false);
    }
  };

  const uploadPng = async (languages: RecipeStudioLanguage[]) => {
    if (!recipe) {
      return;
    }

    setUploadingExport(true);
    setError(null);
    setSuccess(null);
    const previousLanguage = studioLanguage;
    try {
      let currentRecipe = recipe;
      await saveRecipe(currentRecipe, layout);

      for (const language of languages) {
        const exportId = `${Date.now().toString(36)}-${language}`;
        const blob = await renderRecipeDomToPngBlob(language);
        const imageBase64 = await blobToDataUrl(blob);
        const response = await fetchJson<{
          publicUrl: string;
          recipe: RecipeRecord;
        }>(`/api/admin/recipes/${currentRecipe.id}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            contentType: "image/png",
            imageBase64,
            exportId,
          }),
        });
        currentRecipe = response.recipe;
        setRecipe(response.recipe);
        setJsonValue(recipeToEditableJson(response.recipe));
      }

      setExportLinksRefreshKey(Date.now());
      setSuccess(`PNG загружен в storage: ${languages.map((language) => language.toUpperCase()).join(", ")}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setStudioLanguage(previousLanguage);
      setCaptureMode(false);
      setUploadingExport(false);
    }
  };

  const downloadCurrentExport = async (language: RecipeStudioLanguage) => {
    if (!recipe) {
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);
    const previousLanguage = studioLanguage;
    try {
      const blob = await renderRecipeDomToPngBlob(language);
      const fileName = `${recipe.slug || "recipe"}-${language}-pinterest.png`;
      downloadBlob(blob, fileName);
      setSuccess(`PNG экспортирован: ${language.toUpperCase()}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setStudioLanguage(previousLanguage);
      setCaptureMode(false);
      setExporting(false);
    }
  };

  const uploadMedia = async (kind: RecipeMediaKind, file: File | null) => {
    if (!recipe || !file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Можно загружать только изображения.");
      return;
    }

    setUploadingMedia(kind);
    setError(null);
    setSuccess(null);
    try {
      const imageBase64 = await blobToDataUrl(file);
      const response = await fetchJson<{
        publicUrl: string;
        recipe: RecipeRecord;
        setKey?: string;
      }>(`/api/admin/recipes/${recipe.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          imageBase64,
          fileName: file.name,
          setName: kind === "recipe_asset_sheet" ? assetSetName : kind === "raccoon_sticker_sheet" ? stickerSetName : undefined,
          removeWhite: kind === "dish",
        }),
      });

      setRecipe(response.recipe);
      setJsonValue(recipeToEditableJson(response.recipe));
      setAssetSetName(response.recipe.asset_set_key ?? "");
      setStickerSetName(response.recipe.sticker_set_key ?? "");
      if (kind === "recipe_asset_sheet") {
        setAssetCropIndex(1);
        if (response.setKey) {
          setMediaPrefix(`recipes/assets/${response.setKey}/`);
        }
      }
      if (kind === "raccoon_sticker_sheet") {
        setStickerCropIndex(1);
        if (response.setKey) {
          setMediaPrefix(`stickers/raccoon-stickers/${response.setKey}/`);
        }
      }
      setSuccess(`Медиа обработано и загружено: ${response.publicUrl}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploadingMedia(null);
    }
  };

  const renameRecipeStickerFolder = async () => {
    if (!recipe) {
      return;
    }
    const oldSetKey = recipe.sticker_set_key?.trim() ?? "";
    const newSetKey = stickerSetName.trim();
    if (!oldSetKey || !newSetKey || oldSetKey === newSetKey) {
      return;
    }

    setRenamingStickerFolder(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ newSetKey: string; moved: number }>("/api/admin/media/sticker-folder/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldSetKey,
          newSetKey,
          basePrefix: "stickers/raccoon-stickers",
        }),
      });
      const nextRecipe = {
        ...recipe,
        sticker_set_key: response.newSetKey,
      };
      const savedRecipe = await fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipe.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipePayload(nextRecipe, layout) }),
      });
      setRecipe(savedRecipe.recipe);
      setJsonValue(recipeToEditableJson(savedRecipe.recipe));
      setStickerSetName(savedRecipe.recipe.sticker_set_key ?? "");
      setSuccess(`Папка стикеров переименована: ${response.newSetKey}. Перенесено файлов: ${response.moved}.`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    } finally {
      setRenamingStickerFolder(false);
    }
  };

  const saveCropDetail = async () => {
    if (!recipe) {
      return;
    }
    const setKey = activeCropSetKey.trim();
    if (!setKey) {
      setError("Сначала укажите и загрузите набор ассетов или стикеров.");
      return;
    }
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    const boxRect = cropBoxRef.current?.getBoundingClientRect();
    const lassoCrop = cropSelectionMode === "lasso" ? cropLassoBounds() : null;
    if (!cropNaturalSize.width || !cropNaturalSize.height || !imageRect || (!lassoCrop && !boxRect)) {
      setError("Source image еще не загрузился.");
      return;
    }
    if (cropSelectionMode === "lasso" && !lassoCrop) {
      setError("Нарисуйте замкнутый контур лассо вокруг детали.");
      return;
    }

    setSavingCrop(true);
    setError(null);
    setSuccess(null);
    try {
      const crop = lassoCrop ?? {
        x: Math.round((((boxRect as DOMRect).left - imageRect.left) / imageRect.width) * cropNaturalSize.width),
        y: Math.round((((boxRect as DOMRect).top - imageRect.top) / imageRect.height) * cropNaturalSize.height),
        width: Math.round(((boxRect as DOMRect).width / imageRect.width) * cropNaturalSize.width),
        height: Math.round(((boxRect as DOMRect).height / imageRect.height) * cropNaturalSize.height),
      };
      const response = await fetchJson<{
        publicUrl: string;
        path: string;
        index: number;
      }>(`/api/admin/recipes/${recipe.id}/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: cropMode,
          setKey,
          index: activeCropIndex,
          assetName: cropAssetName,
          assetTag: cropAssetTag,
          searchTags: cropSearchTags,
          crop,
          mask: cropSelectionMode === "lasso" ? { points: cropLassoPoints } : undefined,
          removeWhiteBackground: cropWhiteRemovalIntensity > 0,
          whiteRemovalIntensity: cropWhiteRemovalIntensity,
        }),
      });

      const label = mediaLabelFromKey(response.path);
      const savedAsset: RecipeSavedAsset = {
        label,
        url: response.publicUrl,
        path: response.path,
        kind: cropMode,
        setKey,
        tag: cropAssetTag || "asset",
        name: cropAssetName || label,
        index: response.index,
        createdAt: new Date().toISOString(),
      };
      const retainedAssets = (layout.assets ?? []).filter((asset) => {
        if (asset.path === savedAsset.path) {
          return false;
        }
        if (
          activeCropObjectKeys &&
          asset.kind === savedAsset.kind &&
          asset.setKey === savedAsset.setKey &&
          !activeCropObjectKeys.has(asset.path)
        ) {
          return false;
        }
        return true;
      });
      const nextLayout: RecipeLayout = {
        ...layout,
        assets: [
          savedAsset,
          ...retainedAssets,
        ],
      };
      applyLayoutChange(() => nextLayout);
      const savedRecipe = await fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipe.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipePayload(recipe, nextLayout) }),
      });
      lastAutosaveSignatureRef.current = JSON.stringify({
        layout: nextLayout,
        gradient_from: savedRecipe.recipe.gradient_from,
        gradient_to: savedRecipe.recipe.gradient_to,
      });
      setRecipe(savedRecipe.recipe);
      setJsonValue(recipeToEditableJson(savedRecipe.recipe));
      setSavedCropAssets(nextLayout.assets ?? []);
      setMediaPrefix(activeCropFolderPrefix);
      setMediaRefreshKey((current) => current + 1);
      if (cropMode === "recipe_asset") {
        setAssetCropIndex(response.index + 1);
      } else {
        setStickerCropIndex(response.index + 1);
      }
      setSuccess(`Деталь сохранена: ${response.publicUrl}`);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : String(cropError));
    } finally {
      setSavingCrop(false);
    }
  };

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="books-admin-page recipes-admin-page">
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
          <h1 className="books-admin-title">{recipe?.title ?? "Recipe Studio"}</h1>
          <p className="books-admin-subtitle">
            Редактирование JSON и первая раскладка Pinterest-карточки. Позиции блоков сохраняются в `layout_json`.
          </p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--ghost"
            onClick={() => {
              void router.push("/admin/recipes");
            }}
          >
            К списку
          </button>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={!recipe || saving || exporting || uploadingExport}
            onClick={() => {
              if (recipe) {
                void saveRecipe(recipe, layout);
              }
            }}
          >
            {saving ? "Сохранение..." : "Сохранить layout"}
          </button>
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={!recipe || exporting || uploadingExport}
            onClick={() => {
              void exportPng(["ru", "en", "he"]);
            }}
          >
            {exporting ? "Экспорт..." : "Скачать 3 PNG"}
          </button>
          <button
            type="button"
            className="books-button books-button--success"
            disabled={!recipe || exporting || uploadingExport}
            onClick={() => {
              void uploadPng(["ru", "en", "he"]);
            }}
          >
            {uploadingExport ? "Загрузка..." : "Загрузить 3 PNG"}
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}
      {loading && <div className="books-panel">Загрузка...</div>}

      {recipe ? (
        <>
          <section className="books-panel recipe-country-target-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Страна на карте</h2>
                <p className="books-section-help">
                  Привязка рецепта к `map_targets.target_id` только для `map_type = country`.
                </p>
              </div>
              {recipe.country_target_id ? (
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => selectCountryTarget(null)}
                >
                  Очистить
                </button>
              ) : null}
            </div>
            <div className="recipe-country-target-picker">
              <label className="books-field">
                <span className="books-field__label">Поиск country target</span>
                <input
                  className="books-input"
                  value={countryTargetQuery}
                  onChange={(event) => setCountryTargetQuery(event.target.value)}
                  placeholder="indonesia, Индонезия, target_id..."
                />
              </label>
              <div className="recipe-country-target-current">
                <span>Выбрано:</span>
                <strong>{recipe.country_target_id || "не выбрано"}</strong>
              </div>
            </div>
            {countryTargetsLoading ? <div className="books-section-help">Загрузка стран...</div> : null}
            {countryTargetsError ? <div className="books-alert books-alert--error">{countryTargetsError}</div> : null}
            <div className="recipe-country-target-results">
              {countryTargets.map((target) => (
                <button
                  key={target.target_id}
                  type="button"
                  className={recipe.country_target_id === target.target_id ? "recipe-country-target-button recipe-country-target-button--active" : "recipe-country-target-button"}
                  title={countryTargetLabel(target)}
                  onClick={() => selectCountryTarget(target.target_id)}
                >
                  <strong>{target.target_id}</strong>
                  <span>{target.title_ru || target.title_en || target.title_he || "Без названия"}</span>
                </button>
              ))}
              {!countryTargetsLoading && countryTargets.length === 0 ? (
                <div className="books-section-help">Страны не найдены.</div>
              ) : null}
            </div>
          </section>

          <section className="books-panel recipe-media-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Медиа для рецепта</h2>
                <p className="books-section-help">
                  Загружаем PNG/JPEG на белом фоне, сервер удаляет белый фон, конвертирует в WebP и сохраняет в R2.
                </p>
              </div>
              <button
                type="button"
                className="books-button books-button--ghost"
                onClick={() => setMediaPanelOpen((current) => !current)}
              >
                {mediaPanelOpen ? "Свернуть" : "Развернуть"}
              </button>
            </div>
            {mediaPanelOpen ? (
              <>
                <div className="recipe-media-grid">
                  <label className="recipe-media-card">
                    <span className="recipe-media-card__title">Картинка блюда</span>
                    <small>R2: recipes/recipes-pics/{recipe.slug}.webp</small>
                    {recipe.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={withCacheBuster(recipe.image_url, recipe.updated_at)} alt="" className="recipe-media-card__preview" />
                    ) : null}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingMedia !== null}
                      onChange={(event) => {
                        void uploadMedia("dish", event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <label className="recipe-media-card">
                    <span className="recipe-media-card__title">Набор ассетов</span>
                    <small>R2: recipes/assets/[set]/source.webp</small>
                    <input
                      className="books-input"
                      value={assetSetName}
                      onChange={(event) => setAssetSetName(event.target.value)}
                      placeholder="khachapuri-assets"
                    />
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingMedia !== null}
                      onChange={(event) => {
                        void uploadMedia("recipe_asset_sheet", event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  <label className="recipe-media-card">
                    <span className="recipe-media-card__title">Стикеры енотика</span>
                    <small>R2: stickers/raccoon-stickers/[set]/source.webp</small>
                    <input
                      className="books-input"
                      value={stickerSetName}
                      onChange={(event) => setStickerSetName(event.target.value)}
                      placeholder="raccoon-kitchen-01"
                    />
                    {recipe.sticker_set_key && stickerSetName.trim() && stickerSetName.trim() !== recipe.sticker_set_key ? (
                      <button
                        type="button"
                        className="books-button books-button--secondary"
                        disabled={renamingStickerFolder}
                        onClick={(event) => {
                          event.preventDefault();
                          void renameRecipeStickerFolder();
                        }}
                      >
                        {renamingStickerFolder ? "Переименование..." : "Переименовать папку"}
                      </button>
                    ) : null}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingMedia !== null}
                      onChange={(event) => {
                        void uploadMedia("raccoon_sticker_sheet", event.target.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                {uploadingMedia ? (
                  <div className="books-alert books-alert--success">Обработка медиа...</div>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="books-panel recipe-crop-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Нарезка деталей</h2>
                <p className="books-section-help">
                  Выберите набор, перетащите рамку на нужную деталь, растяните нижний правый угол и сохраните crop как отдельный WebP.
                </p>
              </div>
              <div className="books-actions">
                <button
                  type="button"
                  className={cropMode === "recipe_asset" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropMode("recipe_asset")}
                >
                  Ассеты
                </button>
                <button
                  type="button"
                  className={cropMode === "raccoon_sticker" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropMode("raccoon_sticker")}
                >
                  Стикеры
                </button>
                <button
                  type="button"
                  className={cropSelectionMode === "rect" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropSelectionMode("rect")}
                >
                  Прямоугольник
                </button>
                <button
                  type="button"
                  className={cropSelectionMode === "lasso" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropSelectionMode("lasso")}
                >
                  Лассо
                </button>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => setCropPanelOpen((current) => !current)}
                >
                  {cropPanelOpen ? "Свернуть" : "Развернуть"}
                </button>
              </div>
            </div>

            {cropPanelOpen ? (
            <div className="recipe-crop-shell">
              <div className="recipe-crop-stage-wrap">
                {activeCropSourceUrl ? (
                  <div
                    ref={cropStageRef}
                    className="recipe-crop-stage"
                    onPointerMove={(event) => {
                      moveCropInteraction(event);
                      moveCropLasso(event);
                    }}
                    onPointerUp={() => {
                      endCropInteraction();
                      endCropLasso();
                    }}
                    onPointerCancel={() => {
                      endCropInteraction();
                      endCropLasso();
                    }}
                    onPointerDown={startCropLasso}
                    onPointerLeave={endCropLasso}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeCropSourceUrl}
                      alt=""
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                      onLoad={(event) => {
                        setCropNaturalSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                      }}
                    />
                    {cropSelectionMode === "rect" ? (
                      <div
                        ref={cropBoxRef}
                        className="recipe-crop-box"
                        style={{
                          left: `${cropRect.x}%`,
                          top: `${cropRect.y}%`,
                          width: `${cropRect.width}%`,
                          height: `${cropRect.height}%`,
                        }}
                        onPointerDown={(event) => startCropInteraction(event, "move")}
                      >
                        <span className="recipe-crop-box__label">
                          {Math.round((cropRect.width / 100) * cropNaturalSize.width)} x {Math.round((cropRect.height / 100) * cropNaturalSize.height)}
                        </span>
                        <span
                          className="recipe-crop-box__handle"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            startCropInteraction(event, "resize");
                          }}
                        />
                      </div>
                    ) : (
                      <svg
                        className="recipe-crop-lasso"
                        viewBox={`0 0 ${cropNaturalSize.width || 1} ${cropNaturalSize.height || 1}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {cropLassoPoints.length > 1 ? (
                          <polyline
                            points={cropLassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                            className="recipe-crop-lasso__line"
                          />
                        ) : null}
                        {cropLassoPoints.length > 2 && !cropLassoDrawing ? (
                          <polygon
                            points={cropLassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                            className="recipe-crop-lasso__fill"
                          />
                        ) : null}
                        {cropLassoPoints.length > 0 ? (
                          <>
                            <circle
                              cx={cropLassoPoints[0].x}
                              cy={cropLassoPoints[0].y}
                              r={5}
                              className="recipe-crop-lasso__endpoint"
                            />
                            <circle
                              cx={cropLassoPoints.at(-1)?.x}
                              cy={cropLassoPoints.at(-1)?.y}
                              r={5}
                              className="recipe-crop-lasso__endpoint recipe-crop-lasso__endpoint--end"
                            />
                          </>
                        ) : null}
                      </svg>
                    )}
                  </div>
                ) : (
                  <div className="recipe-crop-empty">
                    {activeCropSetKey.trim()
                      ? "Не удалось собрать URL source sheet."
                      : "Загрузите source sheet и укажите имя набора."}
                  </div>
                )}
              </div>

              <aside className="recipe-crop-controls">
                <label className="books-field">
                  <span className="books-field__label">Режим выделения</span>
                  <div className="books-actions">
                    <button
                      type="button"
                      className={cropSelectionMode === "rect" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                      onClick={() => setCropSelectionMode("rect")}
                    >
                      Прямоугольник
                    </button>
                    <button
                      type="button"
                      className={cropSelectionMode === "lasso" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                      onClick={() => setCropSelectionMode("lasso")}
                    >
                      Лассо
                    </button>
                  </div>
                  {cropSelectionMode === "lasso" ? (
                    <span className="books-field__help">Проведите по картинке вокруг детали. Отпустите указатель, чтобы замкнуть контур.</span>
                  ) : null}
                </label>
                {cropSelectionMode === "lasso" ? (
                  <button
                    type="button"
                    className="books-button books-button--secondary"
                    onClick={() => setCropLassoPoints([])}
                  >
                    Очистить лассо
                  </button>
                ) : null}
                <label className="books-field">
                  <span className="books-field__label">Интенсивность удаления белого фона</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={cropWhiteRemovalIntensity}
                    onChange={(event) => setCropWhiteRemovalIntensity(Number(event.target.value))}
                  />
                  <span className="books-field__help">
                    {cropWhiteRemovalIntensity === 0
                      ? "0%: фон не удаляется."
                      : `${cropWhiteRemovalIntensity}%: при сохранении crop удаляется белый, связанный с краями; белые детали внутри сохраняются.`}
                  </span>
                </label>
                <label className="books-field">
                  <span className="books-field__label">Набор</span>
                  <input
                    className="books-input"
                    value={activeCropSetKey}
                    onChange={(event) => {
                      if (cropMode === "recipe_asset") {
                        setAssetSetName(event.target.value);
                      } else {
                        setStickerSetName(event.target.value);
                      }
                    }}
                  />
                  {activeCropSourceUrl ? (
                    <span className="books-field__help">
                      Source: <a href={activeCropSourceUrl} target="_blank" rel="noreferrer">{activeCropSourceUrl}</a>
                    </span>
                  ) : null}
                </label>
                <label className="books-field">
                  <span className="books-field__label">Порядковый номер</span>
                  <input
                    className="books-input"
                    type="number"
                    min={1}
                    value={activeCropIndex}
                    onChange={(event) => {
                      const next = Math.max(1, Number(event.target.value) || 1);
                      if (cropMode === "recipe_asset") {
                        setAssetCropIndex(next);
                      } else {
                        setStickerCropIndex(next);
                      }
                    }}
                  />
                </label>
                <div className="books-grid books-grid--2">
                  <label className="books-field">
                    <span className="books-field__label">Тип детали</span>
                    <select
                      className="books-input"
                      value={cropAssetTag}
                      onChange={(event) => setCropAssetTag(event.target.value)}
                    >
                      {ASSET_TAGS.map((tag) => (
                        <option key={tag.value} value={tag.value}>{tag.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Название детали</span>
                    <input
                      className="books-input"
                      value={cropAssetName}
                      onChange={(event) => setCropAssetName(event.target.value)}
                      placeholder="yellow-note"
                    />
                  </label>
                </div>
                {cropMode === "raccoon_sticker" ? (
                  <label className="books-field">
                    <span className="books-field__label">Поисковые теги</span>
                    <textarea
                      className="books-input"
                      value={cropSearchTags}
                      onChange={(event) => setCropSearchTags(event.target.value)}
                      placeholder="еда, кухня, грузия, сыр"
                      rows={3}
                    />
                    <span className="books-field__help">Через запятую, точку с запятой или с новой строки. Сохраняются в sticker_assets.</span>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="books-button books-button--success recipe-crop-save-button"
                  disabled={savingCrop || !activeCropSourceUrl}
                  onClick={() => {
                    void saveCropDetail();
                  }}
                >
                  {savingCrop ? "Сохранение..." : "Сохранить деталь"}
                </button>
                {visibleSavedCropAssets.length > 0 ? (
                  <div className="recipe-crop-saved-assets">
                    <div className="recipe-crop-saved-assets__head">
                      <strong>Сохранено в текущем наборе</strong>
                      <span>{visibleSavedCropAssets.length}</span>
                    </div>
                    <div className="recipe-export-links recipe-export-links--compact">
                      {visibleSavedCropAssets.map((asset) => (
                        <a key={asset.path} href={withCacheBuster(asset.url, asset.createdAt)} target="_blank" rel="noreferrer">
                          {asset.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="books-grid books-grid--2">
                  <label className="books-field">
                    <span className="books-field__label">X %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.x)} onChange={(event) => setCropRect((current) => ({ ...current, x: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Y %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.y)} onChange={(event) => setCropRect((current) => ({ ...current, y: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">W %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.width)} onChange={(event) => setCropRect((current) => ({ ...current, width: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">H %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.height)} onChange={(event) => setCropRect((current) => ({ ...current, height: Number(event.target.value) }))} />
                  </label>
                </div>
              </aside>
            </div>
            ) : null}
          </section>

          <section className="books-panel recipe-studio-panel">
            <div className="recipe-studio-toolbar">
              <div className="books-actions">
                {(["ru", "en", "he"] as const).map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={studioLanguage === language ? "books-button books-button--primary" : "books-button books-button--ghost"}
                    onClick={() => setStudioLanguage(language)}
                  >
                    {language.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="books-actions">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={exporting || uploadingExport}
                  onClick={() => {
                    void exportPng(["ru", "en", "he"]);
                  }}
                >
                  Скачать 3 PNG
                </button>
                <button
                  type="button"
                  className="books-button books-button--success"
                  disabled={exporting || uploadingExport}
                  onClick={() => {
                    void uploadPng(["ru", "en", "he"]);
                  }}
                >
                  Загрузить 3 PNG
                </button>
              </div>
            </div>

            <div className="recipe-design-strip">
              <div className="recipe-gradient-panel">
                <div className="recipe-gradient-presets">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="recipe-gradient-swatch"
                      title={preset.label}
                      style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                      onClick={() => setRecipe((current) => current ? { ...current, gradient_from: preset.from, gradient_to: preset.to } : current)}
                    />
                  ))}
                </div>
                <label className="recipe-color-input">
                  <span>Фон 1</span>
                  <input
                    type="color"
                    value={recipe.gradient_from || "#fff4cf"}
                    onChange={(event) => setRecipe((current) => current ? { ...current, gradient_from: event.target.value } : current)}
                  />
                </label>
                <label className="recipe-color-input">
                  <span>Фон 2</span>
                  <input
                    type="color"
                    value={recipe.gradient_to || "#b9efe4"}
                    onChange={(event) => setRecipe((current) => current ? { ...current, gradient_to: event.target.value } : current)}
                  />
                </label>
              </div>

              <div className="recipe-logo-panel">
                {LOGO_OPTIONS.map((logo) => (
                  <button
                    key={logo.path}
                    type="button"
                    className="recipe-logo-choice"
                    onClick={() => setBrandLogo(logo)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.url} alt="" />
                    <span>{logo.label}</span>
                  </button>
                ))}
              </div>

              <form
                className="recipe-free-text-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  addFreeTextElement();
                }}
              >
                <input
                  className="books-input"
                  value={freeTextValue}
                  onChange={(event) => setFreeTextValue(event.target.value)}
                  placeholder="Свободный текст"
                />
                <button type="submit" className="books-button books-button--secondary">
                  Добавить текст
                </button>
              </form>

              <div className="recipe-position-sync">
                <label className="books-field">
                  <span className="books-field__label">Позиции из языка</span>
                  <select
                    className="books-input"
                    value={positionSourceLanguage}
                    onChange={(event) => setPositionSourceLanguage(event.target.value as RecipeStudioLanguage)}
                  >
                    <option value="ru">RU</option>
                    <option value="en">EN</option>
                    <option value="he">HE</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  onClick={syncElementPositionsFromLanguage}
                >
                  Скопировать layout
                </button>
              </div>

              <button
                type="button"
                className="books-button books-button--ghost"
                disabled={historyPastRef.current.length === 0}
                onClick={undoLayout}
              >
                Undo
              </button>
              <button
                type="button"
                className="books-button books-button--ghost"
                disabled={historyFutureRef.current.length === 0}
                onClick={redoLayout}
              >
                Redo
              </button>
              <span className="recipe-autosave-state">
                {autosaveState === "saving" ? "autosave..." : autosaveState === "saved" ? "saved" : autosaveState === "error" ? "autosave error" : ""}
                {historyVersion > -1 ? "" : ""}
              </span>
              <button
                type="button"
                className="books-button books-button--ghost"
                onClick={logTemplate}
              >
                Console template
              </button>
              <button
                type="button"
                className="books-button books-button--secondary"
                onClick={() => setTemplatePanelOpen(true)}
              >
                Шаблоны
              </button>
            </div>

            {templatePanelOpen ? (
              <div className="recipe-template-modal" role="dialog" aria-modal="true" aria-label="Шаблоны рецепта">
                <div className="recipe-template-modal__panel">
                  <div className="recipe-template-modal__head">
                    <div>
                      <strong>Шаблоны layout</strong>
                      <p>Выберите сохраненный layout из другого рецепта. Тексты подставятся из текущего рецепта.</p>
                    </div>
                    <button
                      type="button"
                      className="books-button books-button--ghost"
                      onClick={() => setTemplatePanelOpen(false)}
                    >
                      Закрыть
                    </button>
                  </div>

                  {templatesLoading ? (
                    <div className="recipe-template-state">Загрузка шаблонов...</div>
                  ) : templatesError ? (
                    <div className="books-alert books-alert--error">{templatesError}</div>
                  ) : templates.length === 0 ? (
                    <div className="recipe-template-state">Пока нет сохраненных layout-шаблонов.</div>
                  ) : (
                    <div className="recipe-template-grid">
                      {templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className="recipe-template-card"
                          onClick={() => applyLayoutTemplate(template)}
                        >
                          <span
                            className="recipe-template-card__preview"
                            style={{
                              background: `linear-gradient(155deg, ${template.gradient_from || "#fff4cf"}, ${template.gradient_to || "#b9efe4"})`,
                            }}
                          >
                            {template.preview_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={proxiedMediaUrl(template.preview_url)} alt="" />
                            ) : (
                              <span>{layoutTemplateElementCount(template)} layers</span>
                            )}
                          </span>
                          <span className="recipe-template-card__title">{template.title}</span>
                          <small>{template.country || template.slug}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="recipe-media-library">
              <div className="recipe-media-library__head">
                <div>
                  <strong>Ассеты из R2</strong>
                  <span>{mediaPrefix || "laplapla-public-media/"}</span>
                </div>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => setR2PanelOpen((current) => !current)}
                >
                  {r2PanelOpen ? "Свернуть" : "Развернуть"}
                </button>
              </div>
              {r2PanelOpen ? (
              <>
              <div className="recipe-media-library__crumbs">
                <button
                  type="button"
                  className={!mediaPrefix ? "recipe-crumb-button recipe-crumb-button--active" : "recipe-crumb-button"}
                  onClick={() => setMediaPrefix("")}
                >
                  Корень
                </button>
                {mediaCrumbs.map((crumb) => (
                  <button
                    type="button"
                    key={crumb.prefix}
                    className={mediaPrefix === crumb.prefix ? "recipe-crumb-button recipe-crumb-button--active" : "recipe-crumb-button"}
                    onClick={() => setMediaPrefix(crumb.prefix)}
                  >
                    {crumb.label}
                  </button>
                ))}
              </div>
              <div className="recipe-media-browser">
                <aside className="recipe-media-tree">
                  <div className="recipe-media-tree__title">
                    <span>Папки</span>
                    {mediaTreeLoading ? <small>загрузка...</small> : null}
                  </div>
                  {renderMediaTreeNode(mediaTree)}
                </aside>

                <div className="recipe-media-window">
                  <div className="recipe-media-window__bar">
                    <strong>{mediaPrefix || "laplapla-public-media/"}</strong>
                    {mediaPrefix ? (
                      <button
                        type="button"
                        className="recipe-folder-button"
                        onClick={() => {
                          const parts = mediaPrefix.split("/").filter(Boolean);
                          setMediaPrefix(parts.slice(0, -1).join("/") + (parts.length > 1 ? "/" : ""));
                        }}
                      >
                        На уровень выше
                      </button>
                    ) : null}
                  </div>

                  {mediaLoading ? <div className="books-section-help">Загрузка R2...</div> : null}
                  {mediaError ? <div className="books-alert books-alert--error">{mediaError}</div> : null}

                  <div className="recipe-media-library__folders">
                    {mediaFolders.map((folder) => (
                      <button
                        type="button"
                        key={folder}
                        className="recipe-folder-tile"
                        onClick={() => setMediaPrefix(folder)}
                      >
                        <span>folder</span>
                        <strong>{folder.slice(mediaPrefix.length).replace(/\/$/, "")}</strong>
                      </button>
                    ))}
                  </div>

                  {selectedMediaObject ? (
                    <div className="recipe-media-rename-panel">
                      <div className="recipe-media-rename-panel__preview">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selectedMediaObject.publicUrl} alt="" />
                        <span>{selectedMediaObject.key}</span>
                      </div>
                      <label className="books-field">
                        <span className="books-field__label">Тип</span>
                        <select
                          className="books-input"
                          value={renameMediaTag}
                          onChange={(event) => setRenameMediaTag(event.target.value)}
                        >
                          {ASSET_TAGS.map((tag) => (
                            <option key={tag.value} value={tag.value}>{tag.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Название</span>
                        <input
                          className="books-input"
                          value={renameMediaName}
                          onChange={(event) => setRenameMediaName(event.target.value)}
                          placeholder="yellow-note"
                        />
                      </label>
                      <div className="books-actions">
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          disabled={renamingMedia}
                          onClick={() => addImageElement({
                            label: mediaLabelFromKey(selectedMediaObject.key),
                            url: selectedMediaObject.publicUrl,
                            path: selectedMediaObject.key,
                          }, "asset")}
                        >
                          Добавить
                        </button>
                        <button
                          type="button"
                          className="books-button books-button--success"
                          disabled={renamingMedia}
                          onClick={() => {
                            void renameSelectedMedia();
                          }}
                        >
                          {renamingMedia ? "Переименование..." : "Переименовать"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="recipe-media-library__assets">
                    {mediaLibrary?.objects.map((object) => {
                      const label = mediaLabelFromKey(object.key);
                      return (
                    <button
                      type="button"
                      key={object.key}
                      className="recipe-asset-thumb"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-laplapla-media-url", object.publicUrl);
                        event.dataTransfer.setData("application/x-laplapla-media-path", object.key);
                        event.dataTransfer.setData("application/x-laplapla-media-label", label);
                      }}
                      onClick={() => selectMediaForRename(object)}
                      onDoubleClick={() => addImageElement({ label, url: object.publicUrl, path: object.key }, "asset")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={object.publicUrl} alt="" />
                      <span>{label}</span>
                    </button>
                      );
                    })}
                    {!mediaLoading && mediaLibrary?.objects.length === 0 && mediaFolders.length === 0 ? (
                      <div className="recipe-media-empty">В этой папке пока нет изображений.</div>
                    ) : null}
                  </div>
                </div>
              </div>
              </>
              ) : null}
            </div>
            {Object.keys(recipe.exported_image_urls).length > 0 ? (
              <div className="recipe-export-links">
                {(["ru", "en", "he"] as const).map((language) => (
                  recipe.exported_image_urls[language] ? (() => {
                    const cacheKey = exportLinksRefreshKey || recipe.updated_at;
                    return (
                    <span key={language} className="recipe-export-link-pair">
                      <button
                        type="button"
                        className="recipe-export-download-button"
                        onClick={() => {
                          void downloadCurrentExport(language);
                        }}
                      >
                        Скачать {language.toUpperCase()}
                      </button>
                      <a
                        href={withCacheBuster(proxiedMediaUrl(recipe.exported_image_urls[language]), cacheKey)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        open
                      </a>
                      <a
                        href={withCacheBuster(recipe.exported_image_urls[language], cacheKey)}
                        target="_blank"
                        rel="noreferrer"
                        title="Публичный R2 URL"
                      >
                        public
                      </a>
                    </span>
                    );
                  })() : null
                ))}
              </div>
            ) : null}
            <div className="recipe-studio-shell">
              <div className="recipe-studio-canvas-wrap">
                <div
                  ref={canvasRef}
                  className={captureMode ? "recipe-studio-canvas recipe-studio-canvas--capture" : "recipe-studio-canvas"}
                  style={{
                    background: `linear-gradient(155deg, ${recipe.gradient_from || "#fff4cf"}, ${recipe.gradient_to || "#b9efe4"})`,
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const url = event.dataTransfer.getData("application/x-laplapla-media-url");
                    const path = event.dataTransfer.getData("application/x-laplapla-media-path");
                    const label = event.dataTransfer.getData("application/x-laplapla-media-label") || mediaLabelFromKey(path);
                    if (!url || !canvasRef.current) {
                      return;
                    }
                    const rect = canvasRef.current.getBoundingClientRect();
                    addImageElement(
                      { label, url, path },
                      "asset",
                      {
                        x: Math.max(0, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100 - 10)),
                        y: Math.max(0, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100 - 6)),
                      },
                    );
                  }}
                  onPointerMove={(event) => {
                    moveElementTransform(event);
                  }}
                  onPointerUp={endElementTransform}
                  onPointerCancel={endElementTransform}
                >
                  {[...layout.elements].reverse().map((rawElement) => resolveElementForLanguage(rawElement, studioLanguage)).filter((element) => element.visible).map((element) => {
                    const value = valueForElement(recipe, element, studioLanguage);
                    const isSelected = selectedId === element.id;
                    const layerIndex = layout.elements.findIndex((candidate) => candidate.id === element.id);
                    const textElement = isTextElement(element);
                    return (
                      <div
                        key={element.id}
                        className={`recipe-studio-element ${isSelected ? "recipe-studio-element--selected" : ""} recipe-studio-element--${element.kind}`}
                        style={{
                          left: `${element.x}%`,
                          top: `${element.y}%`,
                          width: `${element.width}%`,
                          height: element.height ? `${element.height}%` : undefined,
                          minHeight: element.height ? undefined : undefined,
                          fontSize: `${element.fontSize}px`,
                          fontFamily: fontCss(element.fontFamily),
                          color: element.textColor ?? "#18202d",
                          background: textElement ? (element.backgroundEnabled === false ? "transparent" : hexToRgba(element.backgroundColor ?? "#ffffff", element.backgroundOpacity ?? 0.48)) : undefined,
                          fontWeight: textElement ? (element.boldEnabled === false ? 400 : 900) : undefined,
                          textDecoration: textElement && element.underlineEnabled ? "underline" : undefined,
                          textAlign: element.align,
                          transform: `rotate(${element.rotation}deg) scale(${element.flipX ? -1 : 1}, ${element.flipY ? -1 : 1})`,
                          zIndex: layout.elements.length - layerIndex,
                        }}
                        onPointerDown={(event) => startDrag(event, element)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      >
                        {element.kind === "image" || element.kind === "asset" || element.kind === "logo" ? (
                          typeof value === "string" && value ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxiedMediaUrl(value)} alt="" />
                          ) : (
                            <span>image</span>
                          )
                        ) : !Array.isArray(value) && element.arcBend && Math.abs(element.arcBend) > 1 ? (
                          <svg
                            className="recipe-arc-text"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            <path id={`arc-${element.id}`} d={arcPathD(element.arcBend)} fill="none" />
                            <text
                              textAnchor={arcTextAnchor(element.align).anchor}
                              dominantBaseline="middle"
                              style={{
                                fontFamily: fontCss(element.fontFamily),
                                fontSize: `${element.fontSize}px`,
                                fontWeight: element.boldEnabled === false ? 400 : 900,
                                textDecoration: element.underlineEnabled ? "underline" : "none",
                              }}
                            >
                              <textPath href={`#arc-${element.id}`} startOffset={arcTextAnchor(element.align).offset}>
                                {value}
                              </textPath>
                            </text>
                          </svg>
                        ) : Array.isArray(value) ? (
                          <div className="recipe-studio-lines">
                            {value.map((item, index) => (
                              <span key={`${element.id}-${index}`}>{item}</span>
                            ))}
                          </div>
                        ) : (
                          <span>{value}</span>
                        )}
                      </div>
                    );
                  })}
                  {selectedElement && selectedElement.visible ? (
                    <div
                      className="recipe-element-controls-overlay"
                      style={{
                        left: `${selectedOverlayGeometry(selectedElement).left}%`,
                        top: `${selectedOverlayGeometry(selectedElement).top}%`,
                        width: `${selectedOverlayGeometry(selectedElement).width}%`,
                        height: `${selectedOverlayGeometry(selectedElement).height}%`,
                        transform: `rotate(${selectedOverlayGeometry(selectedElement).rotation}deg)`,
                        zIndex: 1001,
                      }}
                    >
                      <span
                        className="recipe-element-resize-handle"
                        onPointerDown={(event) => startElementTransform(event, selectedElement, "resize")}
                      />
                      <span
                        className="recipe-element-rotate-handle"
                        onPointerDown={(event) => startElementTransform(event, selectedElement, "rotate")}
                      />
                    </div>
                  ) : null}
                  {layout.elements.map((rawElement) => resolveElementForLanguage(rawElement, studioLanguage)).filter((element) => element.visible).map((element) => {
                    const handle = offscreenHandlePosition(element);
                    if (!handle.isOffscreen) {
                      return null;
                    }
                    const isSelected = selectedId === element.id;
                    return (
                      <div
                        key={`${element.id}-offscreen-handle`}
                        className={isSelected ? "recipe-studio-offscreen-handle recipe-studio-offscreen-handle--selected" : "recipe-studio-offscreen-handle"}
                        style={{
                          left: `${handle.x}%`,
                          top: `${handle.y}%`,
                          zIndex: 1000,
                        }}
                        title={element.label}
                        onPointerDown={(event) => startDrag(event, element)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      >
                        {element.label.slice(0, 2)}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="recipe-studio-sidebar">
                <div className="recipe-layer-panel">
                  <button
                    type="button"
                    className="recipe-layer-panel__toggle"
                    onClick={() => setLayerPanelOpen((current) => !current)}
                  >
                    <span>
                      <strong>Слои</strong>
                      <small>{layout.elements.length} элементов</small>
                    </span>
                    <b>{layerPanelOpen ? "Свернуть" : "Развернуть"}</b>
                  </button>

                  {layerPanelOpen ? (
                    <>
                      <p className="books-section-help">Верхний слой в списке рисуется поверх остальных. Отметьте несколько слоёв, чтобы создать группу.</p>
                      <div className="books-actions">
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          disabled={selectedLayerIds.length < 2}
                          onClick={createGroupFromSelectedLayers}
                        >
                          Сгруппировать
                        </button>
                        <button
                          type="button"
                          className="books-button books-button--ghost"
                          disabled={selectedLayerIds.length === 0}
                          onClick={() => setSelectedLayerIds([])}
                        >
                          Снять выбор
                        </button>
                      </div>
                      <div className="recipe-studio-elements">
                        {layerRows.map((row) => (
                          row.type === "group" ? (
                            <div
                              key={row.group.id}
                              className={selectedGroupId === row.group.id ? "recipe-layer-group recipe-layer-group--active" : "recipe-layer-group"}
                              draggable
                              onDragStart={(event) => {
                                layerDragStateRef.current = { id: row.group.id, type: "group" };
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", row.group.id);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const dragged = layerDragStateRef.current;
                                if (!dragged) {
                                  return;
                                }
                                if (dragged.type === "group") {
                                  moveGroup(dragged.id, row.group.id, "group");
                                } else {
                                  moveLayer(dragged.id, row.elements[0]?.id ?? "");
                                }
                              }}
                              onDragEnd={() => {
                                layerDragStateRef.current = null;
                              }}
                            >
                              <div className="recipe-layer-group__head">
                                <small className="recipe-studio-list-button__handle">move</small>
                                <input
                                  className="recipe-layer-group__name"
                                  value={row.group.name}
                                  onChange={(event) => renameGroup(row.group.id, event.target.value)}
                                />
                                <button
                                  type="button"
                                  className="recipe-layer-delete-button"
                                  onClick={() => ungroup(row.group.id)}
                                  title="Разгруппировать"
                                >
                                  split
                                </button>
                              </div>
                              <div className="recipe-layer-group__items">
                                {row.elements.map((element) => (
                                  <button
                                    type="button"
                                    key={element.id}
                                    className={selectedId === element.id ? "recipe-studio-list-button recipe-studio-list-button--active" : "recipe-studio-list-button"}
                                    draggable
                                    onDragStart={(event) => {
                                      layerDragStateRef.current = { id: element.id, type: "element" };
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", element.id);
                                    }}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = "move";
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const dragged = layerDragStateRef.current;
                                      if (!dragged) {
                                        return;
                                      }
                                      if (dragged.type === "group") {
                                        moveGroup(dragged.id, element.id, "element");
                                      } else {
                                        moveLayer(dragged.id, element.id);
                                      }
                                    }}
                                    onDragEnd={() => {
                                      layerDragStateRef.current = null;
                                    }}
                                    onClick={() => setSelectedId(element.id)}
                                  >
                                    <span className="recipe-studio-list-button__label">
                                      <input
                                        type="checkbox"
                                        className="recipe-layer-checkbox"
                                        checked={selectedLayerIds.includes(element.id)}
                                        onChange={(event) => {
                                          event.stopPropagation();
                                          toggleLayerSelection(element.id, event.target.checked);
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                      />
                                      <small className="recipe-studio-list-button__handle">move</small>
                                      <span className="recipe-layer-title" title={element.label}>{element.label}</span>
                                    </span>
                                    <small className="recipe-layer-visibility">{element.visible ? "visible" : "hidden"}</small>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div
                              key={row.element.id}
                              className={selectedId === row.element.id ? "recipe-studio-list-button recipe-studio-list-button--active" : "recipe-studio-list-button"}
                              draggable
                              onDragStart={(event) => {
                                layerDragStateRef.current = { id: row.element.id, type: "element" };
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", row.element.id);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                const dragged = layerDragStateRef.current;
                                if (!dragged) {
                                  return;
                                }
                                if (dragged.type === "group") {
                                  moveGroup(dragged.id, row.element.id, "element");
                                } else {
                                  moveLayer(dragged.id, row.element.id);
                                }
                              }}
                              onDragEnd={() => {
                                layerDragStateRef.current = null;
                              }}
                              onClick={() => setSelectedId(row.element.id)}
                            >
                              <span className="recipe-studio-list-button__label">
                                <input
                                  type="checkbox"
                                  className="recipe-layer-checkbox"
                                  checked={selectedLayerIds.includes(row.element.id)}
                                  onChange={(event) => {
                                    event.stopPropagation();
                                    toggleLayerSelection(row.element.id, event.target.checked);
                                  }}
                                  onClick={(event) => event.stopPropagation()}
                                />
                                <small className="recipe-studio-list-button__handle">move</small>
                                <span className="recipe-layer-title" title={row.element.label}>{row.element.label}</span>
                              </span>
                              <span className="recipe-studio-list-button__meta">
                                <small className="recipe-layer-visibility">{row.element.visible ? "visible" : "hidden"}</small>
                                <button
                                  type="button"
                                  className="recipe-layer-delete-button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeElement(row.element.id);
                                  }}
                                  title="Удалить слой"
                                >
                                  x
                                </button>
                              </span>
                            </div>
                          )
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>

                {selectedElement ? (
                  <div className="recipe-studio-controls">
                    <label className="books-checkbox books-checkbox--inline">
                      <input
                        type="checkbox"
                        checked={selectedElement.visible}
                        onChange={(event) => updateElement(selectedElement.id, { visible: event.target.checked })}
                      />
                      <span>Показывать элемент</span>
                    </label>

                    {isTextElement(selectedElement) ? (
                      <div className="recipe-text-style-controls">
                        {selectedElement.source === "custom_text" ? (
                          <label className="books-field recipe-free-text-edit">
                            <span className="books-field__label">Текст слоя</span>
                            <input
                              className="books-input"
                              value={selectedElement.customTextTranslations?.[studioLanguage] ?? selectedElement.customText ?? ""}
                              onChange={(event) => updateCustomTextForLanguage(selectedElement.id, event.target.value)}
                            />
                          </label>
                        ) : null}
                        <label className="recipe-color-input">
                          <span>Цвет текста</span>
                          <input
                            type="color"
                            value={selectedElement.textColor ?? "#18202d"}
                            onChange={(event) => updateElement(selectedElement.id, { textColor: event.target.value })}
                          />
                        </label>
                        <label className="recipe-color-input">
                          <span>Фон текста</span>
                          <input
                            type="color"
                            value={selectedElement.backgroundColor ?? "#ffffff"}
                            onChange={(event) => updateElement(selectedElement.id, { backgroundColor: event.target.value })}
                          />
                        </label>
                        <label className="books-field recipe-opacity-field">
                          <span className="books-field__label">Прозрачность фона</span>
                          <input
                            className="books-input"
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round((selectedElement.backgroundOpacity ?? 0.62) * 100)}
                            onChange={(event) => updateElement(selectedElement.id, { backgroundOpacity: Number(event.target.value) / 100 })}
                          />
                        </label>
                        <button
                          type="button"
                          className={selectedElement.backgroundEnabled === false ? "books-button books-button--ghost" : "books-button books-button--primary"}
                          onClick={() => updateElement(selectedElement.id, { backgroundEnabled: selectedElement.backgroundEnabled === false })}
                        >
                          Фон
                        </button>
                        <button
                          type="button"
                          className={selectedElement.underlineEnabled ? "books-button books-button--primary" : "books-button books-button--ghost"}
                          onClick={() => updateElement(selectedElement.id, { underlineEnabled: !selectedElement.underlineEnabled })}
                        >
                          Подчеркнуть
                        </button>
                        <button
                          type="button"
                          className={selectedElement.boldEnabled === false ? "books-button books-button--ghost" : "books-button books-button--primary"}
                          onClick={() => updateElement(selectedElement.id, { boldEnabled: selectedElement.boldEnabled === false })}
                        >
                          Жирный
                        </button>
                        <label className="books-field recipe-opacity-field">
                          <span className="books-field__label">Арка текста</span>
                          <input
                            className="books-input"
                            type="range"
                            min={-100}
                            max={100}
                            value={Math.round(selectedElement.arcBend ?? 0)}
                            onChange={(event) => updateElement(selectedElement.id, { arcBend: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                    ) : null}

                    {selectedElement.source === "cooking_steps" ? (
                      <div className="books-actions">
                        <button
                          type="button"
                          className="books-button books-button--secondary"
                          onClick={splitCookingSteps}
                        >
                          Разделить шаги на блоки
                        </button>
                      </div>
                    ) : null}

                    <div className="books-grid books-grid--2">
                      <label className="books-field">
                        <span className="books-field__label">X</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Y</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Ширина</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.width)} onChange={(event) => updateElement(selectedElement.id, { width: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Высота</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.height ?? 0)} onChange={(event) => updateElement(selectedElement.id, { height: Number(event.target.value) || undefined })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Размер текста</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.fontSize)} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Шрифт</span>
                        <select
                          className="books-input"
                          value={selectedElement.fontFamily ?? "Nunito"}
                          onChange={(event) => updateElement(selectedElement.id, { fontFamily: event.target.value as RecipeFontFamily })}
                        >
                          {RECIPE_FONTS.map((font) => (
                            <option key={font.value} value={font.value}>{font.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Поворот</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.rotation)} onChange={(event) => updateElement(selectedElement.id, { rotation: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Выравнивание</span>
                        <select
                          className="books-input"
                          value={selectedElement.align}
                          onChange={(event) => updateElement(selectedElement.id, { align: event.target.value as RecipeLayoutElement["align"] })}
                        >
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                    </div>
                    {selectedElement.kind === "image" || selectedElement.kind === "asset" || selectedElement.kind === "logo" ? (
                      <div className="books-actions">
                        <button
                          type="button"
                          className={selectedElement.flipX ? "books-button books-button--primary" : "books-button books-button--ghost"}
                          onClick={() => updateElement(selectedElement.id, { flipX: !selectedElement.flipX })}
                        >
                          Зеркалить X
                        </button>
                        <button
                          type="button"
                          className={selectedElement.flipY ? "books-button books-button--primary" : "books-button books-button--ghost"}
                          onClick={() => updateElement(selectedElement.id, { flipY: !selectedElement.flipY })}
                        >
                          Зеркалить Y
                        </button>
                      </div>
                    ) : null}
                    {selectedElement.source === "custom_image" ? (
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={() => removeElement(selectedElement.id)}
                      >
                        Удалить картинку
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </aside>
            </div>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">JSON рецепта</h2>
                <p className="books-section-help">
                  Можно быстро поправить текстовые поля. `layout_json` лучше менять через студию выше.
                </p>
              </div>
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={saving}
                onClick={() => {
                  void saveFromJson();
                }}
              >
                Сохранить JSON
              </button>
            </div>
            <textarea
              className="books-input books-input--textarea books-input--json recipe-json-editor"
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
