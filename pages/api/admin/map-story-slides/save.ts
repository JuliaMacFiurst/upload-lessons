import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import { getFlagMedia } from "@/lib/server/media/getFlagMedia";

type SlideInput = {
  text: string;
  image_url?: string | null;
  credit_line?: string | null;
};

type RawSlideInput = {
  text?: unknown;
  image_url?: unknown;
  credit_line?: unknown;
};

type StoryLookupRow = {
  id: string;
  content: string | null;
};

function isDisallowedMediaUrl(url: string): boolean {
  return /\.(pdf|svg|djvu|djv|ogg|oga|tif|tiff)(\?.*)?$/i.test(url.trim());
}

function isAllowedFlagSvgForFirstSlide(mapType: string, slideIndex: number, url: string): boolean {
  return (
    mapType === "flag" &&
    slideIndex === 0 &&
    /\/storage\/v1\/object\/public\/flags-svg\/flags-svg\/[a-z0-9_-]+\.svg(\?.*)?$/i.test(url.trim())
  );
}

function splitIntoSentences(content: string): string[] {
  return content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function buildSlidesFromContent(content: string): SlideInput[] {
  const sentences = splitIntoSentences(content);
  const slides: SlideInput[] = [];

  for (let index = 0; index < sentences.length; index += 2) {
    const text = sentences.slice(index, index + 2).join(" ").trim();
    if (text) {
      slides.push({
        text,
        image_url: null,
        credit_line: null,
      });
    }
  }

  return slides;
}

async function ensureStory(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
  content?: string,
): Promise<StoryLookupRow> {
  const { data: existing, error: existingError } = await supabase
    .from("map_stories")
    .select("id,content")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load map_story: ${existingError.message}`);
  }

  if (existing?.id) {
    return existing as StoryLookupRow;
  }

  const trimmedContent = typeof content === "string" ? content.trim() : "";
  if (!trimmedContent) {
    throw new Error("Story does not exist and content is empty.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("map_stories")
    .insert({
      type: mapType,
      target_id: targetId,
      language: "ru",
      content: trimmedContent,
      is_approved: true,
    })
    .select("id,content")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to create map_story.");
  }

  return inserted as StoryLookupRow;
}

async function replaceSlides(
  supabase: SupabaseClient,
  storyId: string,
  slides: SlideInput[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("map_story_slides")
    .delete()
    .eq("story_id", storyId);

  if (deleteError) {
    throw new Error(`Failed to clear map_story_slides: ${deleteError.message}`);
  }

  if (slides.length === 0) {
    return;
  }

  const orderedRows = slides.map((slide, index) => ({
    story_id: storyId,
    slide_order: index,
    text: slide.text,
    image_url: slide.image_url ?? null,
    image_credit_line: slide.credit_line ?? null,
  }));

  const { error: insertError } = await supabase.from("map_story_slides").insert(orderedRows);

  if (insertError) {
    throw new Error(`Failed to save map_story_slides: ${insertError.message}`);
  }
}

async function applyFlagFirstSlideMedia(
  mapType: string,
  targetId: string,
  slides: SlideInput[],
): Promise<SlideInput[]> {
  if (mapType !== "flag" || slides.length === 0) {
    return slides;
  }

  const flagMedia = await getFlagMedia(targetId);
  if (!flagMedia) {
    throw new Error(`Flag SVG not found in bucket flags-svg for targetId=${targetId}`);
  }

  return slides.map((slide, index) =>
    index === 0
      ? {
          ...slide,
          image_url: flagMedia.url,
          credit_line: flagMedia.creditLine,
        }
      : slide,
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;

  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mapType = typeof req.body?.mapType === "string" ? req.body.mapType.trim() : "";
  const targetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const slidesRaw = Array.isArray(req.body?.slides) ? req.body.slides : null;

  if (!mapType || !targetId) {
    return res.status(400).json({ error: "mapType and targetId are required." });
  }

  try {
    const story = await ensureStory(supabase, mapType, targetId, content);
    const rawSlides =
      slidesRaw?.map((slide: RawSlideInput) => ({
        text: typeof slide?.text === "string" ? slide.text.trim() : "",
        image_url:
          typeof slide?.image_url === "string" &&
          (!isDisallowedMediaUrl(slide.image_url) ||
            isAllowedFlagSvgForFirstSlide(mapType, 0, slide.image_url))
            ? slide.image_url
            : null,
        credit_line: typeof slide?.credit_line === "string" ? slide.credit_line : null,
      })).filter((slide: SlideInput) => slide.text) ??
      buildSlidesFromContent(content || story.content || "");

    const slides = await applyFlagFirstSlideMedia(mapType, targetId, rawSlides);

    if (slides.length === 0) {
      return res.status(400).json({ error: "No slides to save." });
    }

    await replaceSlides(supabase, story.id, slides);

    return res.status(200).json({
      ok: true,
      storyId: story.id,
      slidesCount: slides.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save map story slides.";
    return res.status(500).json({ error: message });
  }
}
