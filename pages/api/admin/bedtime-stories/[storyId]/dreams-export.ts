import { writePsdBuffer, type Layer, type PixelData, type Psd } from "ag-psd";
import JSZip from "jszip";
import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { loadBedtimeStory } from "../../../../../lib/server/bedtime-stories-admin";
import type { BedtimeStoryAsset, BedtimeStoryLanguage, BedtimeStoryRecord, BedtimeStorySlide } from "../../../../../lib/bedtime-stories/types";
import { fetchPublicR2Object, hasR2Config } from "../../../../../lib/server/r2-storage";

export const config = {
  api: {
    responseLimit: false,
  },
};

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
const SLIDE_TOP = Math.round((EXPORT_HEIGHT - SLIDE_HEIGHT) / 2);
const PAPER_COLOR = "#fff8ed";
const LAPLAPLA_LOGO_URL = "https://media.laplapla.com/stickers/laplapla-logo-aquarelle.png";

type BoxLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

type TextLayout = BoxLayout & {
  fontSize: number;
  fontFamily: string;
  textColor: string;
  align: "left" | "center" | "right";
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
};

type AssetLayout = BoxLayout & {
  name: string;
  path: string;
  url: string;
  hidden?: boolean;
};

const DEFAULT_TEXT_LAYOUT: TextLayout = {
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

const DEFAULT_NUMBER_LAYOUT: TextLayout = {
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

const DEFAULT_LOGO_LAYOUT: BoxLayout = {
  x: 3.8661,
  y: 2.1441,
  width: 20,
  height: 10,
  rotation: -13.0997,
};

const DEFAULT_STAMP_LAYOUT: AssetLayout = {
  x: 7,
  y: 13,
  width: 18,
  height: 14,
  rotation: -8,
  name: "",
  path: "",
  url: "",
  hidden: true,
};

const DEFAULT_MARKER_LAYOUT: AssetLayout = {
  x: 8,
  y: 72,
  width: 18,
  height: 14,
  rotation: -8,
  name: "",
  path: "",
  url: "",
  hidden: true,
};

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getLayerRecord(slide: BedtimeStorySlide, kind: string, language: BedtimeStoryLanguage): Record<string, unknown> | null {
  const layer = slide.layers.find((item) => item.kind === kind);
  if (!layer) {
    return null;
  }
  const languageLayouts = layer.languageLayouts;
  if (languageLayouts && typeof languageLayouts === "object" && !Array.isArray(languageLayouts)) {
    const localized = (languageLayouts as Record<string, unknown>)[language];
    if (localized && typeof localized === "object" && !Array.isArray(localized)) {
      return { ...layer, ...localized as Record<string, unknown> };
    }
  }
  return layer;
}

function readBoxLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage, kind: string, defaults: BoxLayout): BoxLayout {
  const record = getLayerRecord(slide, kind, language);
  if (!record) {
    return defaults;
  }
  return {
    x: typeof record.x === "number" ? record.x : defaults.x,
    y: typeof record.y === "number" ? record.y : defaults.y,
    width: typeof record.width === "number" ? record.width : defaults.width,
    height: typeof record.height === "number" ? record.height : defaults.height,
    rotation: typeof record.rotation === "number" ? record.rotation : defaults.rotation,
  };
}

function readTextLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): TextLayout {
  const record = getLayerRecord(slide, "bedtime_text_layout", language);
  const defaults = DEFAULT_TEXT_LAYOUT;
  if (!record) {
    return defaults;
  }
  const align = record.align === "left" || record.align === "center" || record.align === "right" ? record.align : defaults.align;
  return {
    ...readBoxLayout(slide, language, "bedtime_text_layout", defaults),
    fontSize: typeof record.fontSize === "number" ? record.fontSize : defaults.fontSize,
    fontFamily: typeof record.fontFamily === "string" ? record.fontFamily : defaults.fontFamily,
    textColor: typeof record.textColor === "string" ? record.textColor : defaults.textColor,
    align,
    backgroundEnabled: typeof record.backgroundEnabled === "boolean" ? record.backgroundEnabled : defaults.backgroundEnabled,
    backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : defaults.backgroundColor,
    backgroundOpacity: typeof record.backgroundOpacity === "number" ? record.backgroundOpacity : defaults.backgroundOpacity,
  };
}

function readNumberLayout(slide: BedtimeStorySlide, language: BedtimeStoryLanguage): TextLayout {
  const record = getLayerRecord(slide, "bedtime_number_layout", language);
  const defaults = DEFAULT_NUMBER_LAYOUT;
  if (!record) {
    return defaults;
  }
  const align = record.align === "left" || record.align === "center" || record.align === "right" ? record.align : defaults.align;
  return {
    ...readBoxLayout(slide, language, "bedtime_number_layout", defaults),
    fontSize: typeof record.fontSize === "number" ? record.fontSize : defaults.fontSize,
    fontFamily: typeof record.fontFamily === "string" ? record.fontFamily : defaults.fontFamily,
    textColor: typeof record.textColor === "string" ? record.textColor : defaults.textColor,
    align,
    backgroundEnabled: typeof record.backgroundEnabled === "boolean" ? record.backgroundEnabled : defaults.backgroundEnabled,
    backgroundColor: typeof record.backgroundColor === "string" ? record.backgroundColor : defaults.backgroundColor,
    backgroundOpacity: typeof record.backgroundOpacity === "number" ? record.backgroundOpacity : defaults.backgroundOpacity,
  };
}

function readAssetLayout(
  slide: BedtimeStorySlide,
  language: BedtimeStoryLanguage,
  kind: "bedtime_stamp_layout" | "bedtime_marker_layout",
  defaults: AssetLayout,
  fallbackAsset?: BedtimeStoryAsset,
): AssetLayout {
  const record = getLayerRecord(slide, kind, language);
  if (!record) {
    return fallbackAsset
      ? {
          ...defaults,
          name: fallbackAsset.name,
          path: fallbackAsset.path,
          url: fallbackAsset.url,
          hidden: false,
        }
      : defaults;
  }
  return {
    ...readBoxLayout(slide, language, kind, defaults),
    name: typeof record.name === "string" ? record.name : fallbackAsset?.name ?? defaults.name,
    path: typeof record.path === "string" ? record.path : fallbackAsset?.path ?? defaults.path,
    url: typeof record.url === "string" ? record.url : fallbackAsset?.url ?? defaults.url,
    hidden: typeof record.hidden === "boolean" ? record.hidden : defaults.hidden,
  };
}

function layoutPixels(layout: BoxLayout) {
  return {
    left: Math.round((layout.x / 100) * SLIDE_WIDTH),
    top: SLIDE_TOP + Math.round((layout.y / 100) * SLIDE_HEIGHT),
    width: Math.max(1, Math.round((layout.width / 100) * SLIDE_WIDTH)),
    height: Math.max(1, Math.round((layout.height / 100) * SLIDE_HEIGHT)),
  };
}

function emptyCanvas() {
  return sharp({
    create: {
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
}

async function sharpToPixelData(image: sharp.Sharp): Promise<PixelData> {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data,
  };
}

async function layerFromImage(name: string, buffer: Buffer, layout: BoxLayout, fit: "contain" | "cover" = "contain"): Promise<Layer> {
  const box = layoutPixels(layout);
  let image = sharp(buffer, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize(box.width, box.height, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png();

  if (layout.rotation) {
    image = image.rotate(layout.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  const rotated = await image.toBuffer();
  const metadata = await sharp(rotated).metadata();
  const left = box.left - Math.round(((metadata.width ?? box.width) - box.width) / 2);
  const top = box.top - Math.round(((metadata.height ?? box.height) - box.height) / 2);
  const imageData = await sharpToPixelData(emptyCanvas().composite([{ input: rotated, left, top }]));
  return { name, imageData };
}

async function layerFromFullImage(name: string, buffer: Buffer, background?: string): Promise<Layer> {
  const image = emptyCanvas();
  const base = background
    ? sharp({
        create: {
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          channels: 4,
          background,
        },
      })
    : image;
  const fitted = await sharp(buffer, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize(SLIDE_WIDTH, SLIDE_HEIGHT, { fit: "cover" })
    .png()
    .toBuffer();
  const imageData = await sharpToPixelData(base.composite([{ input: fitted, left: 0, top: SLIDE_TOP }]));
  return { name, imageData };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitTextLines(text: string, layout: TextLayout) {
  const maxChars = Math.max(8, Math.floor((layout.width * 10.8) / Math.max(8, layout.fontSize * 0.55)));
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) {
      lines.push(current);
    }
  }
  return lines.slice(0, 18);
}

async function layerFromText(name: string, text: string, layout: TextLayout, language: BedtimeStoryLanguage): Promise<Layer> {
  const box = layoutPixels(layout);
  const anchor = layout.align === "left" ? "start" : layout.align === "right" ? "end" : "middle";
  const x = layout.align === "left" ? 0 : layout.align === "right" ? box.width : box.width / 2;
  const lines = splitTextLines(text, layout);
  const lineHeight = Math.round(layout.fontSize * 1.18);
  const startY = Math.max(layout.fontSize, Math.round((box.height - lineHeight * lines.length) / 2) + layout.fontSize);
  const background = layout.backgroundEnabled
    ? `<rect x="0" y="0" width="${box.width}" height="${box.height}" rx="0" fill="${escapeXml(layout.backgroundColor)}" opacity="${Math.max(0, Math.min(1, layout.backgroundOpacity))}" />`
    : "";
  const textSpans = lines.map((line, index) => (
    `<text x="${x}" y="${startY + index * lineHeight}" font-family="${escapeXml(layout.fontFamily)}, Arial, sans-serif" font-size="${layout.fontSize}" font-weight="700" fill="${escapeXml(layout.textColor)}" text-anchor="${anchor}">${escapeXml(line)}</text>`
  )).join("");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}" direction="${language === "he" ? "rtl" : "ltr"}">
      ${background}
      ${textSpans}
    </svg>
  `);

  let image = sharp(svg).png();
  if (layout.rotation) {
    image = image.rotate(layout.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  const rendered = await image.toBuffer();
  const metadata = await sharp(rendered).metadata();
  const left = box.left - Math.round(((metadata.width ?? box.width) - box.width) / 2);
  const top = box.top - Math.round(((metadata.height ?? box.height) - box.height) / 2);
  const imageData = await sharpToPixelData(emptyCanvas().composite([{ input: rendered, left, top }]));
  return { name, imageData };
}

async function fetchAssetBuffer(url: string) {
  if (!url) {
    throw new Error("Missing asset URL.");
  }
  const publicBase = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(publicBase);
    if (hasR2Config() && parsedUrl.host === parsedBase.host) {
      return fetchPublicR2Object(decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, "")));
    }
  } catch {
    // fall through to public fetch
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function layerGroup(name: string, children: Layer[]): Layer | null {
  return children.length > 0 ? { name, opened: true, children } : null;
}

async function buildSlidePsd(story: BedtimeStoryRecord, slide: BedtimeStorySlide, language: BedtimeStoryLanguage): Promise<Buffer> {
  const backgroundLayers: Layer[] = [
    {
      name: "Paper Background",
      imageData: await sharpToPixelData(sharp({
        create: {
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          channels: 4,
          background: PAPER_COLOR,
        },
      })),
    },
  ];

  if (slide.image_url) {
    backgroundLayers.push(await layerFromFullImage("Watercolor Illustration", await fetchAssetBuffer(slide.image_url)));
  }

  const overlayLayers: Layer[] = [];
  const logoBuffer = await fetchAssetBuffer(LAPLAPLA_LOGO_URL);
  overlayLayers.push(await layerFromImage("LapLapLa Logo", logoBuffer, readBoxLayout(slide, language, "bedtime_logo_layout", DEFAULT_LOGO_LAYOUT)));

  const stampLayout = readAssetLayout(slide, language, "bedtime_stamp_layout", DEFAULT_STAMP_LAYOUT, slide.slide_number === 1 ? story.stamp_assets[0] : undefined);
  if (stampLayout.url && !stampLayout.hidden) {
    overlayLayers.push(await layerFromImage(`Stamp - ${stampLayout.name || "Story stamp"}`, await fetchAssetBuffer(stampLayout.url), stampLayout));
  }

  const markerLayout = readAssetLayout(slide, language, "bedtime_marker_layout", DEFAULT_MARKER_LAYOUT);
  if (markerLayout.url && !markerLayout.hidden) {
    overlayLayers.push(await layerFromImage(`Marker - ${markerLayout.name || "Marker"}`, await fetchAssetBuffer(markerLayout.url), markerLayout));
  }

  const textLayers: Layer[] = [
    await layerFromText("Story Text", slide.text[language], readTextLayout(slide, language), language),
    await layerFromText("Slide Number", String(slide.slide_number).padStart(2, "0"), readNumberLayout(slide, language), language),
  ];

  const groups = [
    layerGroup("BACKGROUND", backgroundLayers),
    layerGroup("MIDGROUND", []),
    layerGroup("CHARACTER", []),
    layerGroup("FOG", []),
    layerGroup("LIGHTS", []),
    layerGroup("PARTICLES", []),
    layerGroup("OVERLAYS", overlayLayers),
    layerGroup("TEXT", textLayers),
  ].filter(Boolean) as Layer[];

  const psd: Psd = {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    children: groups,
  };
  return writePsdBuffer(psd, { invalidateTextLayers: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const storyId = typeof req.query.storyId === "string" ? req.query.storyId : "";
  if (!storyId) {
    return res.status(400).json({ error: "Missing `storyId`." });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const language = req.query.language === "ru" || req.query.language === "he" ? req.query.language : "en";
    const story = await loadBedtimeStory(supabase, storyId);
    const slug = normalizeStorageSegment(story.slug || story.id) || "bedtime-story";
    const zip = new JSZip();
    const slidesFolder = zip.folder("slides");
    if (!slidesFolder) {
      throw new Error("Failed to create slides folder.");
    }

    for (const slide of story.slides) {
      const psd = await buildSlidePsd(story, slide, language);
      slidesFolder.file(`slide_${String(slide.slide_number).padStart(2, "0")}.psd`, psd);
    }

    const manifest = {
      story: slug,
      language,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
      slide_comp_area: { left: 0, top: SLIDE_TOP, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
      groups: ["BACKGROUND", "MIDGROUND", "CHARACTER", "FOG", "LIGHTS", "PARTICLES", "OVERLAYS", "TEXT"],
      purpose: "Procreate Dreams layered animation workflow",
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}-dreams-psd-${language}.zip"`);
    res.setHeader("Content-Length", String(archive.length));
    return res.status(200).send(archive);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export story for Dreams.";
    return res.status(500).json({ error: message });
  }
}
