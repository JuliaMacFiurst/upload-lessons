import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { extractTranslatableLessonPayload, type LessonJson } from "../../../../lib/lesson-translation";

type Scope = "lessons" | "map_stories" | "artworks";
type ContentType = "lesson" | "map_story" | "artwork";

type LessonRow = {
  id: string;
  title: string | null;
  steps: unknown;
};

type MapStoryRow = {
  id: string | number;
  target_id?: string | null;
  content?: string | null;
};

type ArtworkRow = {
  id: string;
  title: string | null;
  description?: string | null;
};

type TranslationRow = {
  content_id: string;
};

function parseScope(scopeRaw: string | undefined): Scope {
  if (scopeRaw === "map_stories" || scopeRaw === "artworks" || scopeRaw === "lessons") {
    return scopeRaw;
  }
  return "lessons";
}

function mapScopeToContentType(scope: Scope): ContentType {
  if (scope === "map_stories") return "map_story";
  if (scope === "artworks") return "artwork";
  return "lesson";
}

function estimateTokensByChars(characters: number): number {
  return Math.ceil(characters / 4);
}

function lessonSourceTokens(lesson: LessonRow): number {
  const payload = extractTranslatableLessonPayload({
    lesson: {
      title: lesson.title,
      steps: Array.isArray(lesson.steps) ? (lesson.steps as LessonJson["steps"]) : [],
    } as LessonJson,
  });
  return estimateTokensByChars(JSON.stringify(payload).length);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const lang = typeof req.query.lang === "string" ? req.query.lang.trim() : "";
  const scope = parseScope(typeof req.query.scope === "string" ? req.query.scope : undefined);
  const contentType = mapScopeToContentType(scope);
  if (!lang) {
    return res.status(400).json({ error: "Missing query param `lang`." });
  }

  const sourceQuery =
    scope === "lessons"
      ? supabase.from("lessons").select("id,title,steps").order("created_at", { ascending: false })
      : scope === "map_stories"
        ? supabase.from("map_stories").select("id,target_id,content")
        : supabase.from("artworks").select("id,title,description").order("created_at", { ascending: false });

  const { data: sourceRows, error: sourceError } = await sourceQuery;
  if (sourceError) {
    return res.status(500).json({ error: sourceError.message });
  }

  const { data: translations, error: translationsError } = await supabase
    .from("content_translations")
    .select("content_id")
    .eq("content_type", contentType)
    .eq("language", lang);

  if (translationsError) {
    return res.status(500).json({ error: translationsError.message });
  }

  const translatedIds = new Set(
    ((translations as TranslationRow[] | null) ?? []).map((row) => row.content_id),
  );

  const items =
    scope === "lessons"
      ? ((sourceRows as LessonRow[] | null) ?? [])
          .filter((row) => !translatedIds.has(row.id))
          .map((row) => ({
            id: row.id,
            title: row.title,
            content_type: "lesson" as const,
            source_tokens: lessonSourceTokens(row),
          }))
      : scope === "map_stories"
        ? ((sourceRows as MapStoryRow[] | null) ?? [])
            .filter((row) => !translatedIds.has(String(row.id)))
            .map((row) => ({
              id: String(row.id),
              title: row.target_id ?? (row.content ? row.content.slice(0, 60) : "Untitled story"),
              content_type: "map_story" as const,
              source_tokens: estimateTokensByChars(
                JSON.stringify({
                  content: row.content ?? "",
                }).length,
              ),
            }))
        : ((sourceRows as ArtworkRow[] | null) ?? [])
            .filter((row) => !translatedIds.has(row.id))
            .map((row) => ({
              id: row.id,
              title: row.title,
              content_type: "artwork" as const,
              source_tokens: estimateTokensByChars(
                JSON.stringify({
                  title: row.title ?? "",
                  description: row.description ?? "",
                }).length,
              ),
            }));

  console.log("[untranslated lessons]", items.length);
  return res.status(200).json({ items });
}
