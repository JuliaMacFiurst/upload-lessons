import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildMapTargetStoryPrompt } from "@/lib/ai/mapTargetPrompts";
import { MAP_TARGET_GENERATION_MODEL } from "@/lib/ai/mapTargetGenerationProfile";
import { detectSlideIntent } from "@/lib/media/detectSlideIntent";
import { runGeminiJsonPrompt } from "@/lib/server/book-admin";
import { getFlagMedia } from "@/lib/server/media/getFlagMedia";
import { resolveMedia } from "@/lib/server/media/resolveMedia";
import {
  sanitizeMapStoryContent,
  sanitizeMapStoryText,
} from "@/lib/server/mapTargets/sanitizeMapStoryContent";
import { splitMapStoryIntoSlideTexts } from "@/lib/server/mapTargets/storySlides";

type SlideInput = {
  text: string;
  image_url?: string | null;
  credit_line?: string | null;
};

type MapStoryRow = {
  id: string;
  content?: string | null;
};

const generatedMapStorySchema = z.object({
  content: z.string().trim().min(1),
});

function buildSlidesFromContent(content: string): SlideInput[] {
  return splitMapStoryIntoSlideTexts(sanitizeMapStoryContent(content)).map((text) => ({
    text: sanitizeMapStoryText(text),
    image_url: null,
    credit_line: null,
  }));
}

async function replaceSlides(supabase: SupabaseClient, storyId: string, slides: SlideInput[]) {
  const { error: deleteError } = await supabase.from("map_story_slides").delete().eq("story_id", storyId);

  if (deleteError) {
    throw new Error(`Failed to clear map_story_slides: ${deleteError.message}`);
  }

  if (slides.length === 0) {
    return;
  }

  const rows = slides.map((slide, index) => ({
    story_id: storyId,
    slide_order: index,
    text: slide.text,
    image_url: slide.image_url ?? null,
    image_credit_line: slide.credit_line ?? null,
  }));

  const { error: insertError } = await supabase.from("map_story_slides").insert(rows);

  if (insertError) {
    throw new Error(`Failed to save map_story_slides: ${insertError.message}`);
  }
}

async function upsertGeneratedStory(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
  content: string,
): Promise<MapStoryRow> {
  const sanitizedContent = sanitizeMapStoryContent(content);
  const { data: existing, error: existingError } = await supabase
    .from("map_stories")
    .select("id")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load map_story: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("map_stories")
      .update({
        content: sanitizedContent,
        auto_generated: true,
        auto_generation_model: MAP_TARGET_GENERATION_MODEL,
        is_approved: false,
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update map_story: ${updateError.message}`);
    }

    return { id: existing.id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("map_stories")
    .insert({
      type: mapType,
      target_id: targetId,
      language: "ru",
      content: sanitizedContent,
      is_approved: false,
      auto_generated: true,
      auto_generation_model: MAP_TARGET_GENERATION_MODEL,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "Failed to create map_story.");
  }

  return { id: inserted.id };
}

async function loadExistingStory(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
): Promise<MapStoryRow> {
  const { data, error } = await supabase
    .from("map_stories")
    .select("id,content")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load map_story: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error("Story not found.");
  }

  return {
    id: data.id,
    content: typeof data.content === "string" ? data.content : "",
  };
}

async function applyFlagFirstSlideMedia(mapType: string, targetId: string, slides: SlideInput[]) {
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

async function enrichSlidesWithMedia(mapType: string, targetId: string, slides: SlideInput[]) {
  const nextSlides = await applyFlagFirstSlideMedia(mapType, targetId, slides);
  const eligibleIndices = nextSlides
    .map((slide, index) => ({ slide, index }))
    .filter(({ slide, index }) => !(mapType === "flag" && index === 0) && slide.text.trim().length > 0)
    .map(({ index }) => index);
  const targetVideoCount = Math.min(
    eligibleIndices.length,
    eligibleIndices.length >= 12 ? 6 : eligibleIndices.length >= 9 ? 5 : Math.floor(eligibleIndices.length / 3),
  );
  const usedUrls = new Set<string>(
    nextSlides
      .filter((slide, index) => index === 0 && mapType === "flag" && Boolean(slide.image_url))
      .map((slide) => slide.image_url as string),
  );

  let wikimediaCount = 0;
  let pexelsImageCount = 0;
  let pexelsVideoCount = 0;
  let giphyCount = 0;

  for (let index = 0; index < nextSlides.length; index += 1) {
    if (mapType === "flag" && index === 0) {
      continue;
    }

    const slide = nextSlides[index];
    if (!slide?.text.trim()) {
      continue;
    }

    const intent = detectSlideIntent(slide.text);
    const preferences: Array<{ source: "auto" | "wikimedia" | "pexels" | "giphy"; type?: "image" | "video" }> = [];

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
      const candidate = await resolveMedia({
        slideText: slide.text,
        targetId,
        mapType,
        preferredSource: preference.source,
        preferredType: preference.type,
        existingUrls: Array.from(usedUrls),
      });

      if (candidate.source === "fallback") {
        continue;
      }

      media = candidate;
      break;
    }

    if (!media) {
      media = await resolveMedia({
        slideText: slide.text,
        targetId,
        mapType,
        existingUrls: Array.from(usedUrls),
      });
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

  return {
    slides: nextSlides,
    mediaStats: {
      wikimediaCount,
      pexelsImageCount,
      pexelsVideoCount,
      giphyCount,
    },
  };
}

export async function generateMapTargetStoryBatchItem(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
) {
  const prompt = buildMapTargetStoryPrompt({ mapType, targetId });
  const generated = generatedMapStorySchema.parse(
    await runGeminiJsonPrompt<unknown>(prompt),
  );
  const sanitizedContent = sanitizeMapStoryContent(generated.content);
  const story = await upsertGeneratedStory(supabase, mapType, targetId, sanitizedContent);
  const slides = buildSlidesFromContent(sanitizedContent);

  if (slides.length === 0) {
    throw new Error("Generated story could not be parsed into slides.");
  }

  const enriched = await enrichSlidesWithMedia(mapType, targetId, slides);
  await replaceSlides(supabase, story.id, enriched.slides);

  return {
    storyId: story.id,
    content: sanitizedContent,
    slidesCount: enriched.slides.length,
    mediaStats: enriched.mediaStats,
  };
}

export async function approveMapTargetStory(supabase: SupabaseClient, mapType: string, targetId: string) {
  const { data: existing, error: loadError } = await supabase
    .from("map_stories")
    .select("id")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load map_story: ${loadError.message}`);
  }

  if (!existing?.id) {
    throw new Error("Story not found.");
  }

  const { error: updateError } = await supabase
    .from("map_stories")
    .update({
      is_approved: true,
    })
    .eq("id", existing.id);

  if (updateError) {
    throw new Error(`Failed to approve map_story: ${updateError.message}`);
  }

  return { ok: true };
}

export async function parseExistingMapTargetStoryToSlides(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
) {
  const story = await loadExistingStory(supabase, mapType, targetId);
  const content = story.content?.trim() ?? "";

  if (!content) {
    throw new Error("Story is empty.");
  }

  const slides = buildSlidesFromContent(content);

  if (slides.length === 0) {
    throw new Error("Story could not be parsed into slides.");
  }

  const enriched = await enrichSlidesWithMedia(mapType, targetId, slides);
  await replaceSlides(supabase, story.id, enriched.slides);

  return {
    storyId: story.id,
    slidesCount: enriched.slides.length,
    mediaStats: enriched.mediaStats,
  };
}
