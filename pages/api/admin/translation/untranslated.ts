import type { NextApiRequest, NextApiResponse } from "next";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeAssembledStory } from "../../../../lib/server/story-submissions-admin";
import { loadTranslationItemsByScope, type TranslationContentType } from "../../../../lib/server/translation-content";

type Scope = "all" | "lessons" | "map_stories" | "artworks" | "books" | "stories";

type TranslationRow = {
  content_id: string;
};

type LessonRow = {
  id: string;
  title: string | null;
};

type MapStoryRow = {
  id: string | number;
  target_id?: string | null;
  content?: string | null;
};

type ArtworkRow = {
  id: string;
  title: string | null;
};

type BookRow = {
  id: string;
  title: string | null;
};

type StoryTemplateRow = {
  id: string;
  name: string | null;
};

type StorySubmissionRow = {
  id: string;
  hero_name: string | null;
  assembled_story: unknown;
};

function parseScope(scopeRaw: string | undefined): Scope {
  if (
    scopeRaw === "map_stories" ||
    scopeRaw === "artworks" ||
    scopeRaw === "books" ||
    scopeRaw === "stories" ||
    scopeRaw === "all" ||
    scopeRaw === "lessons"
  ) {
    return scopeRaw;
  }
  return "lessons";
}

function estimateTokensByChars(characters: number): number {
  return Math.ceil(characters / 4);
}

function buildSubmissionTitle(row: StorySubmissionRow): string {
  const assembled = normalizeAssembledStory(row.assembled_story);
  const narration = assembled.steps.find((step) => step.key === "narration")?.text.trim() ?? "";
  if (row.hero_name?.trim()) {
    return row.hero_name.trim();
  }
  if (assembled.hero.trim()) {
    return assembled.hero.trim();
  }
  if (narration) {
    return narration.slice(0, 60);
  }
  return "Approved story submission";
}

async function fetchSourceRows(
  scope: Scope,
  supabase: SupabaseClient,
): Promise<Array<{ id: string; title: string | null; content_type: TranslationContentType }>> {
  if (scope === "all") {
    const groups = await Promise.all([
      fetchSourceRows("lessons", supabase),
      fetchSourceRows("map_stories", supabase),
      fetchSourceRows("artworks", supabase),
      fetchSourceRows("books", supabase),
      fetchSourceRows("stories", supabase),
    ]);
    return groups.flat();
  }

  if (scope === "lessons") {
    const { data, error } = await supabase
      .from("lessons")
      .select("id,title")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return ((data as LessonRow[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      content_type: "lesson",
    }));
  }

  if (scope === "map_stories") {
    const { data, error } = await supabase.from("map_stories").select("id,target_id,content");
    if (error) {
      throw new Error(error.message);
    }
    return ((data as MapStoryRow[] | null) ?? []).map((row) => ({
      id: String(row.id),
      title: row.target_id ?? (row.content ? row.content.slice(0, 60) : "Untitled story"),
      content_type: "map_story",
    }));
  }

  if (scope === "artworks") {
    const { data, error } = await supabase
      .from("artworks")
      .select("id,title")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return ((data as ArtworkRow[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      content_type: "artwork",
    }));
  }

  if (scope === "books") {
    const { data, error } = await supabase
      .from("books")
      .select("id,title")
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(error.message);
    }
    return ((data as BookRow[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      content_type: "book",
    }));
  }

  const [templatesRes, submissionsRes] = await Promise.all([
    supabase.from("story_templates").select("id,name").order("created_at", { ascending: false }),
    supabase
      .from("user_story_submissions")
      .select("id,hero_name,assembled_story")
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
  ]);

  if (templatesRes.error) {
    throw new Error(templatesRes.error.message);
  }
  if (submissionsRes.error) {
    throw new Error(submissionsRes.error.message);
  }

  const templates = ((templatesRes.data as StoryTemplateRow[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.name,
    content_type: "story_template" as const,
  }));
  const submissions = ((submissionsRes.data as StorySubmissionRow[] | null) ?? []).map((row) => ({
    id: row.id,
    title: buildSubmissionTitle(row),
    content_type: "story_submission" as const,
  }));

  return [...templates, ...submissions];
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
  if (!lang) {
    return res.status(400).json({ error: "Missing query param `lang`." });
  }

  try {
    const [sourceRows, scopeItems] = await Promise.all([
      fetchSourceRows(scope, supabase),
      loadTranslationItemsByScope(supabase, scope),
    ]);

    const contentTypes =
      scope === "all"
        ? (["lesson", "map_story", "artwork", "book", "story_template", "story_submission"] as const)
        : scope === "stories"
        ? (["story_template", "story_submission"] as const)
        : scope === "books"
          ? (["book"] as const)
          : scope === "artworks"
            ? (["artwork"] as const)
            : scope === "map_stories"
              ? (["map_story"] as const)
              : (["lesson"] as const);

    const translationQueries = contentTypes.map((contentType) =>
      supabase
        .from("content_translations")
        .select("content_id")
        .eq("content_type", contentType)
        .eq("language", lang),
    );

    const translationResults = await Promise.all(translationQueries);
    for (const result of translationResults) {
      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }
    }

    const translatedKeys = new Set(
      translationResults.flatMap((result, index) =>
        (((result.data as TranslationRow[] | null) ?? []).map(
          (row) => `${contentTypes[index]}:${row.content_id}`,
        )),
      ),
    );

    const tokensByKey = new Map(
      scopeItems.map((item) => [
        `${item.contentType}:${item.contentId}`,
        estimateTokensByChars(item.characters),
      ]),
    );

    const items = sourceRows
      .filter((row) => !translatedKeys.has(`${row.content_type}:${row.id}`))
      .map((row) => ({
        id: row.id,
        title: row.title,
        content_type: row.content_type,
        source_tokens: tokensByKey.get(`${row.content_type}:${row.id}`) ?? 0,
      }));

    return res.status(200).json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
