import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

type MapStoryRow = {
  id: string;
  type: string | null;
  target_id: string | null;
  language: string | null;
  content: string | null;
  is_approved: boolean | null;
  auto_generated: boolean | null;
  auto_generation_model: string | null;
  youtube_url_ru: string | null;
  youtube_url_he: string | null;
  youtube_url_en: string | null;
  google_maps_url: string | null;
};

type RawSlideRow = Record<string, unknown> & {
  id?: string;
  story_id?: string | null;
  slide_order?: number | null;
  text?: string | null;
  content?: string | null;
  image_url?: string | null;
  image_credit_line?: string | null;
};

type SlideDto = {
  id: string;
  story_id: string | null;
  text: string;
  image_url: string | null;
  credit_line: string | null;
};

type StoryResponse = {
  story: {
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
  slides: SlideDto[];
};

type YouTubeFields = {
  youtube_url_ru?: string | null;
  youtube_url_he?: string | null;
  youtube_url_en?: string | null;
};

function extractIframeSrc(input: string): string {
  const text = input.trim();
  const iframeMatch = text.match(/src=["']([^"']+)["']/i);
  return iframeMatch?.[1] ?? text;
}

function extractYouTubeId(input: string): string | null {
  const urlString = extractIframeSrc(input);
  if (!urlString) {
    return null;
  }

  try {
    const url = new URL(urlString);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").split("/")[0] || null;
    }

    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }

    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
    }

    if (url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeYouTubeUrl(input: string | null | undefined): string | null {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) {
    return null;
  }

  const youtubeId = extractYouTubeId(value);
  if (!youtubeId) {
    throw new Error("Cannot detect YouTube ID. Paste a Shorts link, Watch link, or Embed iframe.");
  }

  return `https://www.youtube.com/embed/${youtubeId}`;
}

function normalizeYouTubeFields(fields?: YouTubeFields) {
  return {
    youtube_url_ru: normalizeYouTubeUrl(fields?.youtube_url_ru),
    youtube_url_he: normalizeYouTubeUrl(fields?.youtube_url_he),
    youtube_url_en: normalizeYouTubeUrl(fields?.youtube_url_en),
  };
}

function normalizeGoogleMapsUrl(input: string | null | undefined): string | null {
  const value = typeof input === "string" ? extractIframeSrc(input).trim() : "";
  if (!value) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Paste a full Google Maps link or iframe embed code.");
  }

  const hostname = url.hostname.toLowerCase();
  const isGoogleMapsHost =
    hostname === "maps.app.goo.gl" ||
    hostname === "maps.google.com" ||
    hostname === "google.com" ||
    hostname.endsWith(".google.com");

  if (!isGoogleMapsHost) {
    throw new Error("Only Google Maps links are allowed in google_maps_url.");
  }

  if (url.pathname.startsWith("/maps/embed")) {
    url.pathname = "/maps";
    url.searchParams.delete("output");
  }

  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    url.searchParams.delete(key);
  }

  return url.toString();
}

async function loadSlides(supabase: SupabaseClient, storyId: string): Promise<SlideDto[]> {
  const { data, error } = await supabase
    .from("map_story_slides")
    .select("*")
    .eq("story_id", storyId)
    .order("slide_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load map_story_slides: ${error.message}`);
  }

  return ((data ?? []) as RawSlideRow[]).map((slide) => ({
    id: typeof slide.id === "string" ? slide.id : "",
    story_id: typeof slide.story_id === "string" ? slide.story_id : null,
    text:
      typeof slide.text === "string"
        ? slide.text
        : typeof slide.content === "string"
          ? slide.content
          : "",
    image_url: typeof slide.image_url === "string" ? slide.image_url : null,
    credit_line:
      typeof slide.image_credit_line === "string" ? slide.image_credit_line : null,
  }));
}

async function loadStory(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
): Promise<StoryResponse> {
  const { data, error } = await supabase
    .from("map_stories")
    .select(
      "id,type,target_id,language,content,is_approved,auto_generated,auto_generation_model,youtube_url_ru,youtube_url_he,youtube_url_en,google_maps_url",
    )
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load map_story: ${error.message}`);
  }

  const story = (data ?? null) as MapStoryRow | null;

  if (!story?.id) {
    return {
      story: null,
      slides: [],
    };
  }

  const slides = await loadSlides(supabase, story.id);

  return {
    story: {
      id: story.id,
      type: story.type ?? mapType,
      target_id: story.target_id ?? targetId,
      language: story.language ?? "ru",
      content: story.content ?? "",
      is_approved: story.is_approved ?? true,
      auto_generated: story.auto_generated ?? false,
      auto_generation_model: story.auto_generation_model ?? null,
      youtube_url_ru: story.youtube_url_ru ?? null,
      youtube_url_he: story.youtube_url_he ?? null,
      youtube_url_en: story.youtube_url_en ?? null,
      google_maps_url: story.google_maps_url ?? null,
    },
    slides,
  };
}

async function saveStoryContent(
  supabase: SupabaseClient,
  mapType: string,
  targetId: string,
  content: string,
  youtubeFields?: YouTubeFields,
  googleMapsUrl?: string | null,
): Promise<StoryResponse> {
  const trimmedContent = content.trim();
  const normalizedYouTubeFields = normalizeYouTubeFields(youtubeFields);
  const normalizedGoogleMapsUrl = normalizeGoogleMapsUrl(googleMapsUrl);

  const { data: existing, error: existingError } = await supabase
    .from("map_stories")
    .select("id")
    .eq("type", mapType)
    .eq("target_id", targetId)
    .eq("language", "ru")
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check map_story: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("map_stories")
      .update({
        content: trimmedContent,
        ...normalizedYouTubeFields,
        google_maps_url: normalizedGoogleMapsUrl,
      })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update map_story: ${updateError.message}`);
    }
  } else {
    const { error: insertError } = await supabase.from("map_stories").insert({
      type: mapType,
      target_id: targetId,
      language: "ru",
      content: trimmedContent,
      ...normalizedYouTubeFields,
      google_maps_url: normalizedGoogleMapsUrl,
      is_approved: true,
      auto_generated: false,
      auto_generation_model: null,
    });

    if (insertError) {
      throw new Error(`Failed to insert map_story: ${insertError.message}`);
    }
  }

  return loadStory(supabase, mapType, targetId);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;

  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    const mapType = typeof req.query.mapType === "string" ? req.query.mapType.trim() : "";
    const targetId = typeof req.query.targetId === "string" ? req.query.targetId.trim() : "";

    if (!mapType || !targetId) {
      return res.status(400).json({ error: "mapType and targetId are required." });
    }

    try {
      const result = await loadStory(supabase, mapType, targetId);
      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load map story.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    const mapType = typeof req.body?.mapType === "string" ? req.body.mapType.trim() : "";
    const targetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const youtubeFields = {
      youtube_url_ru:
        typeof req.body?.youtube_url_ru === "string" ? req.body.youtube_url_ru : null,
      youtube_url_he:
        typeof req.body?.youtube_url_he === "string" ? req.body.youtube_url_he : null,
      youtube_url_en:
        typeof req.body?.youtube_url_en === "string" ? req.body.youtube_url_en : null,
    };
    const googleMapsUrl =
      typeof req.body?.google_maps_url === "string" ? req.body.google_maps_url : null;

    if (!mapType || !targetId) {
      return res.status(400).json({ error: "mapType and targetId are required." });
    }

    if (!content.trim()) {
      return res.status(400).json({ error: "content is required." });
    }

    try {
      const result = await saveStoryContent(
        supabase,
        mapType,
        targetId,
        content,
        youtubeFields,
        googleMapsUrl,
      );
      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save map story.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
