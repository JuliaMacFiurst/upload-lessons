import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

type LessonStep = Record<string, unknown> & {
  frank?: string;
};

type LessonRow = {
  id: string;
  slug: string;
  title: string | null;
  steps: unknown;
};

type TranslationRow = {
  translation: {
    title?: unknown;
    steps_frank?: unknown;
    steps_texts?: unknown;
  } | null;
};

function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase server credentials.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
  const lang = typeof req.query.lang === "string" ? req.query.lang.trim() : "";
  if (!slug) {
    return res.status(400).json({ error: "Missing query param `slug`." });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("*")
      .eq("slug", slug)
      .single();

    if (lessonError || !lesson) {
      return res.status(404).json({ error: "Lesson not found." });
    }

    const output = { ...(lesson as LessonRow) } as Record<string, unknown>;

    if (lang) {
      const { data: translationRow } = await supabase
        .from("content_translations")
        .select("translation")
        .eq("content_type", "lesson")
        .eq("content_id", (lesson as LessonRow).id)
        .eq("language", lang)
        .maybeSingle();

      const translation = (translationRow as TranslationRow | null)?.translation;
      if (translation && typeof translation === "object") {
        if (typeof translation.title === "string" && translation.title.trim() !== "") {
          output.title = translation.title;
        }

        const stepsArray = Array.isArray((lesson as LessonRow).steps)
          ? ((lesson as LessonRow).steps as LessonStep[])
          : [];
        const translatedFrank = Array.isArray(translation.steps_frank)
          ? translation.steps_frank
          : Array.isArray(translation.steps_texts)
            ? translation.steps_texts
            : [];

        output.steps = stepsArray.map((step, i) => ({
          ...step,
          frank:
            typeof translatedFrank[i] === "string" && translatedFrank[i].trim() !== ""
              ? translatedFrank[i]
              : step.frank,
        }));
      }
    }

    return res.status(200).json({ lesson: output });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}

