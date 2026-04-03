import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import { loadExpectedMapTargets } from "@/lib/server/mapTargets/importMapTargets";
import { countMapStorySlides } from "@/lib/server/mapTargets/storySlides";

type MapTargetRow = {
  map_type: string;
  target_id: string;
};

type MapStoryRow = {
  id: string;
  type: string | null;
  target_id: string | null;
  content: string | null;
  is_approved: boolean | null;
  auto_generated: boolean | null;
  youtube_url_ru: string | null;
  youtube_url_he: string | null;
  youtube_url_en: string | null;
  google_maps_url: string | null;
};

type MapStorySlideRow = {
  id: string;
  story_id: string | null;
  image_url: string | null;
};

type MapTargetStatusItem = {
  map_type: string;
  target_id: string;
  has_story: boolean;
  has_slides: boolean;
  slides_count: number;
  has_youtube_links: boolean;
  has_google_maps_url: boolean;
  has_slide_images: boolean;
  is_approved: boolean;
  auto_generated: boolean;
};

function hasFilledValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

async function loadMapTargetsStatus(supabase: SupabaseClient): Promise<MapTargetStatusItem[]> {
  const [expectedTargets, { data: targets, error: targetsError }, { data: stories, error: storiesError }] =
    await Promise.all([
      loadExpectedMapTargets(),
      supabase.from("map_targets").select("map_type,target_id").order("map_type").order("target_id"),
      supabase
        .from("map_stories")
        .select(
          "id,type,target_id,content,is_approved,auto_generated,youtube_url_ru,youtube_url_he,youtube_url_en,google_maps_url",
        )
        .eq("language", "ru"),
    ]);

  if (targetsError) {
    throw new Error(`Failed to load map_targets: ${targetsError.message}`);
  }

  if (storiesError) {
    throw new Error(`Failed to load map_stories: ${storiesError.message}`);
  }

  const typedTargets = (targets ?? []) as MapTargetRow[];
  const typedStories = (stories ?? []) as MapStoryRow[];
  const storyIds = typedStories.map((story) => story.id).filter(Boolean);

  let slidesByStoryId = new Map<string, { count: number; hasImages: boolean }>();

  if (storyIds.length > 0) {
    const { data: slides, error: slidesError } = await supabase
      .from("map_story_slides")
      .select("id,story_id,image_url")
      .in("story_id", storyIds);

    if (slidesError) {
      throw new Error(`Failed to load map_story_slides: ${slidesError.message}`);
    }

    slidesByStoryId = ((slides ?? []) as MapStorySlideRow[]).reduce((acc, slide) => {
      if (!slide.story_id) {
        return acc;
      }

      const current = acc.get(slide.story_id) ?? { count: 0, hasImages: false };
      acc.set(slide.story_id, {
        count: current.count + 1,
        hasImages: current.hasImages || hasFilledValue(slide.image_url),
      });
      return acc;
    }, new Map<string, { count: number; hasImages: boolean }>());
  }

  const storiesByTargetKey = typedStories.reduce((acc, story) => {
    if (!story.type || !story.target_id) {
      return acc;
    }

    const key = `${story.type}::${story.target_id}`;
    const existing = acc.get(key) ?? [];
    existing.push(story);
    acc.set(key, existing);
    return acc;
  }, new Map<string, MapStoryRow[]>());

  const targetKeyMap = new Map<string, { map_type: string; target_id: string }>();

  for (const target of expectedTargets) {
    const key = `${target.map_type}::${target.target_id}`;
    targetKeyMap.set(key, target);
  }

  for (const target of typedTargets) {
    const key = `${target.map_type}::${target.target_id}`;
    if (!targetKeyMap.has(key)) {
      targetKeyMap.set(key, target);
    }
  }

  for (const story of typedStories) {
    if (!story.type || !story.target_id) {
      continue;
    }

    const key = `${story.type}::${story.target_id}`;
    if (!targetKeyMap.has(key)) {
      targetKeyMap.set(key, {
        map_type: story.type,
        target_id: story.target_id,
      });
    }
  }

  const items = Array.from(targetKeyMap.values()).map((target) => {
    const key = `${target.map_type}::${target.target_id}`;
    const targetStories = storiesByTargetKey.get(key) ?? [];
    const savedSlidesCount = targetStories.reduce((sum, story) => {
      const storySlides = slidesByStoryId.get(story.id);
      return sum + (storySlides?.count ?? 0);
    }, 0);
    const slidesCount = targetStories.reduce(
      (sum, story) => sum + countMapStorySlides(story.content),
      0,
    );
    const hasSlideImages = targetStories.some((story) => slidesByStoryId.get(story.id)?.hasImages ?? false);
    const hasYouTubeLinks = targetStories.some(
      (story) =>
        hasFilledValue(story.youtube_url_ru) ||
        hasFilledValue(story.youtube_url_en) ||
        hasFilledValue(story.youtube_url_he),
    );
    const hasGoogleMapsUrl = targetStories.some((story) => hasFilledValue(story.google_maps_url));
    const isApproved = targetStories.some((story) => story.is_approved ?? true);
    const autoGenerated = targetStories.some((story) => story.auto_generated ?? false);

    return {
      map_type: target.map_type,
      target_id: target.target_id,
      has_story: targetStories.length > 0,
      has_slides: savedSlidesCount > 0,
      slides_count: slidesCount,
      has_youtube_links: hasYouTubeLinks,
      has_google_maps_url: hasGoogleMapsUrl,
      has_slide_images: hasSlideImages,
      is_approved: isApproved,
      auto_generated: autoGenerated,
    };
  });

  return items.sort((a, b) => {
    const aRank = !a.has_story ? 0 : !a.has_slides ? 1 : 2;
    const bRank = !b.has_story ? 0 : !b.has_slides ? 1 : 2;

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    if (a.map_type !== b.map_type) {
      return a.map_type.localeCompare(b.map_type);
    }

    return a.target_id.localeCompare(b.target_id);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;

  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const items = await loadMapTargetsStatus(supabase);
    return res.status(200).json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load map target status.";
    return res.status(500).json({ error: message });
  }
}
