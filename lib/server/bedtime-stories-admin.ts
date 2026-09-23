import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  bedtimeStoryPayloadSchema,
  bedtimeStoryRecordSchema,
  strictLocalizedTextSchema,
  type BedtimeStoryAsset,
  type BedtimeStoryLanguage,
  type BedtimeStoryListItem,
  type BedtimeStoryPatch,
  type BedtimeStoryPayload,
  type BedtimeStoryRecord,
  type BedtimeStorySlide,
  type BedtimeStorySlidePatch,
} from "../bedtime-stories/types.ts";
import { withBedtimeStoryIllustrationTechnicalSuffix } from "../bedtime-stories/illustration-prompt.ts";
import { listAllPublicR2ObjectKeys, publicR2ObjectUrl } from "./r2-storage.ts";

const LANGUAGES: BedtimeStoryLanguage[] = ["en", "ru", "he"];
const BEDTIME_STAMP_PREFIX = "bedtime_story/stamps/";
const STAMP_IMAGE_EXTENSIONS = new Set(["apng", "avif", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const DEFAULT_STAMP_PROMPT = "Natural ink stamp impression on watercolor paper, slightly aged, softly blurred, transparent background, containing one recognizable detail from a specific story.";

export type BedtimeStampAssetRecord = {
  id: string;
  name: string;
  path: string;
  url: string;
  prompt: string | null;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
};

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function extensionForPath(path: string) {
  return path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
}

function assetNameFromPath(path: string) {
  const fileName = path.split("/").filter(Boolean).pop() ?? path;
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

function localizedText(value: unknown, required: boolean) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const text = typeof record[language] === "string" ? record[language].trim() : "";
      return [language, required ? text : text || ""];
    }),
  );
}

function normalizeSlide(value: unknown, index: number): BedtimeStorySlide {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Slide ${index + 1} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const slideNumber = typeof record.slide_number === "number" ? record.slide_number : index + 1;
  const layers = Array.isArray(record.layers)
    ? record.layers.filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === "object" && !Array.isArray(layer))
    : [];

  return {
    slide_number: slideNumber,
    text: localizedText(record.text, true) as BedtimeStorySlide["text"],
    illustration_prompt: getString(record, ["illustration_prompt", "illustrationPrompt"]) ?? "",
    stamp_prompt: index === 0 ? getString(record, ["stamp_prompt", "stampPrompt"]) ?? "" : "",
    marker_prompt: getString(record, ["marker_prompt", "markerPrompt"]) ?? "",
    image_url: getString(record, ["image_url", "imageUrl"]) ?? "",
    layers,
  };
}

function normalizePublishDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error("publish_date must be a valid ISO date or datetime.");
  }
  return new Date(timestamp).toISOString();
}

function rowToRecord(row: unknown): BedtimeStoryRecord {
  const story = bedtimeStoryRecordSchema.parse(row);
  const slides = sanitizeSlides(story.slides);

  return {
    ...story,
    full_json: { ...story.full_json, slides },
    slides,
  };
}

function sanitizeSlides(slides: BedtimeStorySlide[]): BedtimeStorySlide[] {
  return slides.map((slide, index) => ({
    ...slide,
    illustration_prompt: withBedtimeStoryIllustrationTechnicalSuffix(slide.illustration_prompt),
    stamp_prompt: index === 0 ? slide.stamp_prompt : "",
  }));
}

export function parseBedtimeStoryJson(value: string): BedtimeStoryPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  const rawTitle = localizedText(record.title, true);
  const title = strictLocalizedTextSchema.parse(rawTitle);

  const slidesInput = Array.isArray(record.slides) ? record.slides : [];
  if (slidesInput.length === 0) {
    throw new Error("Bedtime story must contain at least 1 slide.");
  }
  const normalizedSlides = slidesInput.map((slide, index) => {
    const normalized = normalizeSlide(slide, index);
    strictLocalizedTextSchema.parse(normalized.text);
    if (!normalized.illustration_prompt || !normalized.illustration_prompt.trim()) {
      throw new Error(`Slide ${index + 1}: illustration_prompt is required for imported JSON.`);
    }
    return normalized;
  });
  const slug = getString(record, ["slug"]) ?? slugifyStoryTitle(title.en || "bedtime-story");
  const images: Record<string, string> = {};
  normalizedSlides.forEach((slide) => {
    if (slide.image_url) {
      images[String(slide.slide_number).padStart(2, "0")] = slide.image_url;
    }
  });

  return bedtimeStoryPayloadSchema.parse({
    slug,
    status: getString(record, ["status"]) ?? "draft",
    title: localizedText(record.title, true),
    emotional_theme: localizedText(record.emotional_theme ?? record.theme, false),
    full_json: record,
    slides: normalizedSlides,
    images: {
      ...(record.images && typeof record.images === "object" && !Array.isArray(record.images) ? record.images : {}),
      ...images,
    },
    cover_image_url: getString(record, ["cover_image_url", "coverImageUrl"]) ?? null,
    instagram_caption: localizedText(record.instagram_caption, false),
    instagram_hashtags: getStringArray(record, ["hashtags", "instagram_hashtags", "instagramHashtags"]),
    collection_tags: getStringArray(record, ["collection_tags", "collectionTags"]),
    visual_tags: getStringArray(record, ["visual_tags", "visualTags"]),
    stamp_assets: Array.isArray(record.stamp_assets) ? record.stamp_assets : [],
    marker_assets: Array.isArray(record.marker_assets) ? record.marker_assets : [],
    exported_image_urls: record.exported_image_urls && typeof record.exported_image_urls === "object" && !Array.isArray(record.exported_image_urls)
      ? record.exported_image_urls
      : {},
    publish_date: getString(record, ["publish_date", "publishDate"]) ?? null,
    is_published: typeof record.is_published === "boolean" ? record.is_published : false,
  });
}

export function slugifyStoryTitle(value: string) {
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

async function ensureUniqueSlug(supabase: SupabaseClient, slug: string, excludeId?: string) {
  let query = supabase.from("bedtime_stories").select("id").eq("slug", slug).limit(1);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to validate story slug: ${error.message}`);
  }
  if ((data ?? []).length > 0) {
    throw new Error("Story slug must be unique.");
  }
}

function dbPayload(payload: BedtimeStoryPayload) {
  const publishDate = normalizePublishDate(payload.publish_date);
  const slides = sanitizeSlides(payload.slides);
  return {
    slug: payload.slug,
    status: payload.status,
    title: payload.title,
    emotional_theme: payload.emotional_theme,
    full_json: { ...payload.full_json, slides },
    slides,
    images: payload.images,
    cover_image_url: payload.cover_image_url,
    instagram_caption: payload.instagram_caption,
    instagram_hashtags: payload.instagram_hashtags,
    collection_tags: payload.collection_tags,
    visual_tags: payload.visual_tags,
    stamp_assets: payload.stamp_assets,
    marker_assets: payload.marker_assets,
    exported_image_urls: payload.exported_image_urls,
    publish_date: publishDate,
    is_published: payload.is_published,
  };
}

export async function listBedtimeStories(
  supabase: SupabaseClient,
  args: { search: string; page: number; limit: number },
): Promise<{ stories: BedtimeStoryListItem[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, args.page);
  const limit = Math.min(50, Math.max(1, args.limit));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = args.search.trim();

  let query = supabase
    .from("bedtime_stories")
    .select("id,slug,status,title,publish_date,is_published,slides,created_at,updated_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`slug.ilike.%${search}%,title->>en.ilike.%${search}%,title->>ru.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Failed to load bedtime stories: ${error.message}`);
  }

  return {
    stories: ((data as BedtimeStoryListItem[] | null) ?? []),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function loadBedtimeStory(supabase: SupabaseClient, storyId: string): Promise<BedtimeStoryRecord> {
  const { data, error } = await supabase
    .from("bedtime_stories")
    .select("*")
    .eq("id", storyId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Bedtime story not found.");
  }

  return rowToRecord(data);
}

export async function createBedtimeStory(supabase: SupabaseClient, payload: BedtimeStoryPayload): Promise<BedtimeStoryRecord> {
  const parsed = bedtimeStoryPayloadSchema.parse(payload);
  await ensureUniqueSlug(supabase, parsed.slug);
  const { data, error } = await supabase
    .from("bedtime_stories")
    .insert(dbPayload(parsed))
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create bedtime story.");
  }

  return loadBedtimeStory(supabase, data.id);
}

export function mergeBedtimeStoryPatch(
  existing: BedtimeStoryRecord,
  patch: BedtimeStoryPatch,
): BedtimeStoryPayload {
  const slug = typeof patch.slug === "string" && patch.slug.trim()
    ? patch.slug.trim()
    : existing.slug;

  const status = patch.status ?? existing.status;

  const title = {
    ...existing.title,
    ...(patch.title ?? {}),
  };

  const emotional_theme = {
    ...existing.emotional_theme,
    ...(patch.emotional_theme ?? {}),
  };

  const full_json = {
    ...existing.full_json,
    ...(patch.full_json ?? {}),
  };

  const cover_image_url = patch.cover_image_url !== undefined
    ? patch.cover_image_url
    : existing.cover_image_url;

  const instagram_caption = {
    ...existing.instagram_caption,
    ...(patch.instagram_caption ?? {}),
  };

  const instagram_hashtags = Array.isArray(patch.instagram_hashtags)
    ? patch.instagram_hashtags
    : existing.instagram_hashtags;

  const collection_tags = Array.isArray(patch.collection_tags)
    ? patch.collection_tags
    : existing.collection_tags;

  const visual_tags = Array.isArray(patch.visual_tags)
    ? patch.visual_tags
    : existing.visual_tags;

  const stamp_assets = Array.isArray(patch.stamp_assets)
    ? patch.stamp_assets
    : existing.stamp_assets;

  const marker_assets = Array.isArray(patch.marker_assets)
    ? patch.marker_assets
    : existing.marker_assets;

  const exported_image_urls = patch.replaceExportedImageUrls
    ? { ...(patch.exported_image_urls ?? {}) }
    : { ...existing.exported_image_urls, ...(patch.exported_image_urls ?? {}) };

  let publish_date = patch.publish_date !== undefined
    ? patch.publish_date
    : existing.publish_date;

  let is_published = typeof patch.is_published === "boolean"
    ? patch.is_published
    : existing.is_published;
  if (status === "draft" || status === "archived") {
    is_published = false;
    publish_date = null;
  }

  let baseSlides = existing.slides;

  // Explicit structural deletion:
  if (Array.isArray(patch.deleteSlideNumbers) && patch.deleteSlideNumbers.length > 0) {
    const toDelete = new Set(patch.deleteSlideNumbers);
    baseSlides = baseSlides.filter((s) => !toDelete.has(s.slide_number));
  }

  let slides: BedtimeStorySlide[];
  if (patch.replaceSlides && Array.isArray(patch.slides) && patch.slides.length > 0) {
    // Explicit replacement: patch.slides defines the full set of slides.
    const existingByNumber = new Map<number, BedtimeStorySlide>();
    baseSlides.forEach((s) => existingByNumber.set(s.slide_number, s));

    slides = patch.slides.map((s, idx) => {
      const slideNum = s.slide_number ?? idx + 1;
      const ex = existingByNumber.get(slideNum);
      return {
        slide_number: slideNum,
        text: { en: "", ru: "", he: "", ...(ex?.text ?? {}), ...(s.text ?? {}) },
        illustration_prompt: s.illustration_prompt !== undefined
          ? s.illustration_prompt
          : (ex?.illustration_prompt ?? ""),
        stamp_prompt: s.stamp_prompt !== undefined
          ? s.stamp_prompt
          : (ex?.stamp_prompt ?? ""),
        marker_prompt: s.marker_prompt !== undefined
          ? s.marker_prompt
          : (ex?.marker_prompt ?? ""),
        image_url: s.image_url !== undefined
          ? s.image_url
          : (ex?.image_url ?? ""),
        layers: s.layers && s.layers.length > 0
          ? s.layers
          : (ex?.layers ?? []),
      };
    });
  } else if (!patch.slides || !Array.isArray(patch.slides) || patch.slides.length === 0) {
    slides = baseSlides;
  } else {
    // Non-destructive slide merging:
    // Update matching slides, keep all untouched existing slides (especially 2..10).
    // NEVER infer deletion from receiving a shorter slides array!
    const incomingByNumber = new Map<number, BedtimeStorySlidePatch>();
    patch.slides.forEach((s) => incomingByNumber.set(s.slide_number, s));

    const updatedBaseSlides = baseSlides.map((existingSlide) => {
      const incoming = incomingByNumber.get(existingSlide.slide_number);
      if (!incoming) {
        return existingSlide;
      }
      return {
        ...existingSlide,
        slide_number: existingSlide.slide_number,
        text: {
          ...existingSlide.text,
          ...(incoming.text ?? {}),
        },
        illustration_prompt: incoming.illustration_prompt !== undefined
          ? incoming.illustration_prompt
          : existingSlide.illustration_prompt,
        stamp_prompt: incoming.stamp_prompt !== undefined
          ? incoming.stamp_prompt
          : existingSlide.stamp_prompt,
        marker_prompt: incoming.marker_prompt !== undefined
          ? incoming.marker_prompt
          : existingSlide.marker_prompt,
        image_url: incoming.image_url !== undefined
          ? incoming.image_url
          : existingSlide.image_url,
        layers: incoming.layers && incoming.layers.length > 0
          ? incoming.layers
          : existingSlide.layers,
      };
    });

    const brandNewSlides: BedtimeStorySlide[] = patch.slides
      .filter((s) => !baseSlides.some((es) => es.slide_number === s.slide_number))
      .map((s) => ({
        slide_number: s.slide_number,
        text: { en: "", ru: "", he: "", ...(s.text ?? {}) },
        illustration_prompt: s.illustration_prompt ?? "",
        stamp_prompt: s.stamp_prompt ?? "",
        marker_prompt: s.marker_prompt ?? "",
        image_url: s.image_url ?? "",
        layers: s.layers ?? [],
      }));

    slides = [...updatedBaseSlides, ...brandNewSlides].sort(
      (a, b) => a.slide_number - b.slide_number,
    );
  }

  const images = { ...existing.images, ...(patch.images ?? {}) };
  slides.forEach((slide) => {
    if (slide.image_url) {
      images[String(slide.slide_number).padStart(2, "0")] = slide.image_url;
    } else if (patch.slides?.some((incoming) => incoming.slide_number === slide.slide_number && incoming.image_url === "")) {
      delete images[String(slide.slide_number).padStart(2, "0")];
    }
  });

  if (Array.isArray(patch.deleteSlideNumbers)) {
    for (const delNum of patch.deleteSlideNumbers) {
      const padNum = String(delNum).padStart(2, "0");
      delete images[padNum];
      for (const lang of LANGUAGES) {
        delete exported_image_urls[`${lang}-${padNum}`];
      }
      delete exported_image_urls[padNum];
    }
  }

  return {
    slug,
    status,
    title,
    emotional_theme,
    full_json,
    slides,
    images,
    cover_image_url,
    instagram_caption,
    instagram_hashtags,
    collection_tags,
    visual_tags,
    stamp_assets,
    marker_assets,
    exported_image_urls,
    publish_date,
    is_published,
  };
}

export async function updateBedtimeStory(
  supabase: SupabaseClient,
  storyId: string,
  payload: BedtimeStoryPatch,
): Promise<BedtimeStoryRecord> {
  const existing = await loadBedtimeStory(supabase, storyId);
  const merged = mergeBedtimeStoryPatch(existing, payload);
  const parsed = bedtimeStoryPayloadSchema.parse(merged);
  await ensureUniqueSlug(supabase, parsed.slug, storyId);
  const { error } = await supabase
    .from("bedtime_stories")
    .update(dbPayload(parsed))
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to update bedtime story: ${error.message}`);
  }

  return loadBedtimeStory(supabase, storyId);
}


export async function deleteBedtimeStory(supabase: SupabaseClient, storyId: string): Promise<void> {
  const { error } = await supabase
    .from("bedtime_stories")
    .delete()
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to delete bedtime story: ${error.message}`);
  }
}

export async function saveBedtimeStorySlideImage(
  supabase: SupabaseClient,
  storyId: string,
  slideNumber: number,
  publicUrl: string,
  language?: BedtimeStoryLanguage,
): Promise<BedtimeStoryRecord> {
  const story = await loadBedtimeStory(supabase, storyId);
  const slideKey = String(slideNumber).padStart(2, "0");

  // 1. Images map (Source mapping)
  const images = {
    ...story.images,
    [slideKey]: publicUrl,
  };

  // 2. Slides array: ensure the slide exists and update the shared image_url
  const slides = [...story.slides];
  const slideIndex = slides.findIndex((s) => s.slide_number === slideNumber);
  if (slideIndex !== -1) {
    slides[slideIndex] = {
      ...slides[slideIndex],
      image_url: publicUrl,
    };
  } else {
    slides.push({
      slide_number: slideNumber,
      text: { ru: "", en: "", he: "" },
      illustration_prompt: "",
      stamp_prompt: "",
      marker_prompt: "",
      image_url: publicUrl,
      layers: [],
    });
    slides.sort((a, b) => a.slide_number - b.slide_number);
  }

  // 3. Cover image: update if slide 1 and no cover exists yet
  let coverImageUrl = story.cover_image_url;
  if (slideNumber === 1 && !coverImageUrl) {
    coverImageUrl = publicUrl;
  }

  const { error } = await supabase
    .from("bedtime_stories")
    .update({
      slides,
      images,
      cover_image_url: coverImageUrl,
    })
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to save story image URL: ${error.message}`);
  }

  return loadBedtimeStory(supabase, storyId);
}

export async function addBedtimeStoryAsset(
  supabase: SupabaseClient,
  storyId: string,
  asset: BedtimeStoryAsset,
): Promise<BedtimeStoryRecord> {
  const story = await loadBedtimeStory(supabase, storyId);
  const key = asset.kind === "stamp" ? "stamp_assets" : "marker_assets";
  const assets = [asset, ...story[key].filter((item) => item.path !== asset.path)];

  const { error } = await supabase
    .from("bedtime_stories")
    .update({ [key]: assets })
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to save story asset: ${error.message}`);
  }

  return loadBedtimeStory(supabase, storyId);
}

export async function listBedtimeStampAssets(
  supabase: SupabaseClient,
  limit = 80,
): Promise<{ stamps: BedtimeStampAssetRecord[] }> {
  const { data, error } = await supabase
    .from("bedtime_stamp_assets")
    .select("id,name,path,url,prompt,tags,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 200)));

  if (error) {
    throw new Error(`Failed to load bedtime stamp assets: ${error.message}`);
  }

  return { stamps: (data as BedtimeStampAssetRecord[] | null) ?? [] };
}

export async function createBedtimeStampAsset(
  supabase: SupabaseClient,
  asset: {
    name: string;
    path: string;
    url: string;
    prompt?: string | null;
    tags?: string[];
  },
): Promise<BedtimeStampAssetRecord> {
  const { data, error } = await supabase
    .from("bedtime_stamp_assets")
    .upsert({
      name: asset.name,
      path: asset.path,
      url: asset.url,
      prompt: asset.prompt ?? null,
      tags: asset.tags ?? [],
    }, { onConflict: "path" })
    .select("id,name,path,url,prompt,tags,created_at,updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save bedtime stamp asset.");
  }

  return data as BedtimeStampAssetRecord;
}

export async function syncBedtimeStampAssetsFromR2(
  supabase: SupabaseClient,
): Promise<{ synced: number; scanned: number }> {
  const keys = Array.from(await listAllPublicR2ObjectKeys(BEDTIME_STAMP_PREFIX))
    .filter((key) => !key.endsWith("/"))
    .filter((key) => !key.endsWith(".keep"))
    .filter((key) => STAMP_IMAGE_EXTENSIONS.has(extensionForPath(key)));

  let synced = 0;
  for (const key of keys) {
    const { error } = await supabase
      .from("bedtime_stamp_assets")
      .upsert({
        name: assetNameFromPath(key),
        path: key,
        url: publicR2ObjectUrl(key),
        prompt: DEFAULT_STAMP_PROMPT,
        tags: ["bedtime-story", "watercolor-stamp"],
      }, { onConflict: "path", ignoreDuplicates: true });

    if (error) {
      throw new Error(`Failed to sync bedtime stamp asset: ${error.message}`);
    }
    synced += 1;
  }

  return { synced, scanned: keys.length };
}

export async function saveBedtimeStoryExportUrl(
  supabase: SupabaseClient,
  storyId: string,
  language: BedtimeStoryLanguage,
  slideNumber: number,
  publicUrl: string,
): Promise<BedtimeStoryRecord> {
  const story = await loadBedtimeStory(supabase, storyId);
  const key = `${language}-${String(slideNumber).padStart(2, "0")}`;
  const exportedImageUrls = {
    ...story.exported_image_urls,
    [key]: publicUrl,
  };

  const { error } = await supabase
    .from("bedtime_stories")
    .update({
      exported_image_urls: exportedImageUrls,
      status: story.status === "draft" || story.status === "ready" ? "exported" : story.status,
    })
    .eq("id", storyId);

  if (error) {
    throw new Error(`Failed to save story export URL: ${error.message}`);
  }

  return loadBedtimeStory(supabase, storyId);
}

export function handleBedtimeStoryValidationError(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: error.issues[0]?.message ?? "Validation failed.",
        issues: error.issues,
      },
    };
  }

  return {
    status: error instanceof Error && error.message.startsWith("Invalid JSON") ? 400 : 500,
    body: {
      error: error instanceof Error ? error.message : "Bedtime story request failed.",
    },
  };
}
