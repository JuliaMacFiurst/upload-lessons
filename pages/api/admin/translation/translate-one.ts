import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import stringify from "json-stable-stringify";
import { extractTranslatableLessonPayload, type LessonJson } from "../../../../lib/lesson-translation";
import { mockTranslateLesson, type LessonTextPayload, validateTranslationPayload } from "../../../../lib/server/translation-runner";

type ContentType = "lesson" | "map_story" | "artwork";

type RequestBody = {
  content_type?: ContentType;
  content_id?: string;
  lang?: string;
  preview?: boolean;
};

type LessonRow = {
  id: string;
  title: string | null;
  steps: unknown;
};

type MapStoryRow = {
  id: string | number;
  content: string | null;
};

type ArtworkRow = {
  id: string;
  title: string | null;
  description: string | null;
};

const TRANSLATION_MOCK_MODEL = process.env.TRANSLATION_MOCK_MODEL === "true";

function createSupabaseServerClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function buildSourceHash(payload: unknown): string {
  const canonical = stringify(payload) ?? "null";
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function parseModelJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s*[\r\n]/gm, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // handle case where Gemini returns `items: [...]` without braces
    const trimmed = cleaned.trim();
    if (trimmed.startsWith("items:")) {
      const wrapped = `{ ${trimmed} }`;
      try {
        return JSON.parse(wrapped);
      } catch {
        // continue to other recovery strategies
      }
    }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1 && end > start) {
      const jsonSlice = cleaned.slice(start, end + 1);

      try {
        return JSON.parse(jsonSlice);
      } catch {
        // continue to throw below
      }
    }

    throw new Error("Failed to parse Gemini JSON response.");
  }
}

// Enhanced validation and reason reporting for lesson translations
function getInvalidTranslationReason(payload: unknown): string | null {
  if (!payload) return "payload is empty";
  if (typeof payload !== "object") return "payload is not an object";

  const record = payload as {
    title?: unknown;
    steps_texts?: unknown;
    steps_frank?: unknown;
  };

  if (typeof record.title === "string" && record.title.trim() === "") {
    return "title is empty";
  }

  const lessonSteps = Array.isArray(record.steps_frank)
    ? record.steps_frank
    : Array.isArray(record.steps_texts)
      ? record.steps_texts
      : null;

  if (lessonSteps) {
    const validSteps = lessonSteps.filter(
      (text) => typeof text === "string" && text.trim().length > 0,
    );

    if (lessonSteps.length === 0) return "steps array is empty";
    if (validSteps.length === 0) return "all steps are empty";
    if (validSteps.length !== lessonSteps.length) return "some steps are empty";
  }

  return null;
}

function coerceLessonPayload(payload: unknown): LessonTextPayload {
  if (!payload || typeof payload !== "object") {
    return { title: "", steps_texts: [] };
  }

  const record = payload as {
    title?: unknown;
    steps_frank?: unknown;
    steps_texts?: unknown;
    steps?: unknown;
  };
  const title = typeof record.title === "string" ? record.title : "";

  if (Array.isArray(record.steps_frank)) {
    return {
      title,
      steps_frank: record.steps_frank.map((step) => (typeof step === "string" ? step : "")),
    };
  }
  if (Array.isArray(record.steps_texts)) {
    return {
      title,
      steps_texts: record.steps_texts.map((step) => (typeof step === "string" ? step : "")),
    };
  }

  const steps_texts = Array.isArray(record.steps)
    ? record.steps.map((step) => {
        if (step && typeof step === "object" && "text" in step) {
          const text = (step as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
    : [];

  return { title, steps_texts };
}

function coerceLessonToOriginalShape(
  originalPayload: LessonTextPayload,
  translatedPayload: LessonTextPayload,
): LessonTextPayload {
  const translatedSteps = Array.isArray(
    (translatedPayload as { steps_frank?: unknown }).steps_frank,
  )
    ? (translatedPayload as { steps_frank: string[] }).steps_frank
    : Array.isArray((translatedPayload as { steps_texts?: unknown }).steps_texts)
      ? (translatedPayload as { steps_texts: string[] }).steps_texts
      : [];

  if ("steps_frank" in originalPayload) {
    return {
      title: translatedPayload.title,
      steps_frank: [...translatedSteps],
    };
  }
  return {
    title: translatedPayload.title,
    steps_texts: [...translatedSteps],
  };
}

function mockTranslateGeneric(payload: unknown, lang: string): unknown {
  if (typeof payload === "string") {
    return payload.trim() === "" ? payload : `[${lang}] ${payload}`;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => mockTranslateGeneric(item, lang));
  }
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    Object.entries(payload).forEach(([key, value]) => {
      out[key] = mockTranslateGeneric(value, lang);
    });
    return out;
  }
  return payload;
}

async function translateWithGemini(payload: unknown, lang: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    `Translate the following JSON to ${lang}.`,
    "Important rules:",
    "Do NOT change JSON keys.",
    "Translate ALL non-empty string values.",
    "Never replace text with empty strings.",
    "Preserve the number of steps exactly.",
    "Preserve all newline characters such as \\n and \\n\\n exactly as they appear.",
    "Do NOT remove or translate emojis. Keep emojis exactly as they appear.",
    "If translation fails, keep the original text instead of removing it.",
    "If a word looks like a character name, invented word, meme word, or proper noun, transliterate it to English (Latin letters) instead of translating it.",
    "Examples: 'Трипи-Тропи' -> 'Tripi-Tropi', 'Бомбардини' -> 'Bombardini'.",
    "Do NOT shorten the text.",
    "Return JSON in EXACTLY the same structure as the input.",
    "Do NOT add explanations.",
    "Do NOT add markdown.",
    "Do NOT wrap the response in ```json blocks.",
    "Do not write text before or after the JSON.",
    "",
    "JSON to translate:",
    JSON.stringify(payload),
  ].join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  if (!response.text) {
    throw new Error("Gemini returned empty response.");
  }

  return parseModelJson(response.text);
}

function validateNonEmptyObjectStrings(payload: unknown, requiredKeys: string[]): void {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid translation payload");
  }
  const record = payload as Record<string, unknown>;
  for (const key of requiredKeys) {
    if (typeof record[key] !== "string" || record[key]!.toString().trim() === "") {
      throw new Error("Invalid translation payload");
    }
  }
}

async function buildSourcePayload(args: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  contentType: ContentType;
  contentId: string;
}): Promise<{
  sourcePayload: unknown;
  sourceHash: string;
}> {
  if (args.contentType === "lesson") {
    const { data: lesson, error } = await args.supabase
      .from("lessons")
      .select("id,title,steps")
      .eq("id", args.contentId)
      .single();
    if (error || !lesson) {
      throw new Error("Lesson not found.");
    }
    const extracted = extractTranslatableLessonPayload({
      lesson: {
        title: (lesson as LessonRow).title,
        steps: Array.isArray((lesson as LessonRow).steps)
          ? ((lesson as LessonRow).steps as LessonJson["steps"])
          : [],
      } as LessonJson,
    });
    const sourcePayload = coerceLessonPayload(extracted);
    return {
      sourcePayload,
      sourceHash: buildSourceHash(sourcePayload),
    };
  }

  if (args.contentType === "map_story") {
    const { data: story, error } = await args.supabase
      .from("map_stories")
      .select("id,content")
      .eq("id", args.contentId)
      .single();
    if (error || !story) {
      throw new Error("Map story not found.");
    }
    const sourcePayload = { content: (story as MapStoryRow).content ?? "" };
    return {
      sourcePayload,
      sourceHash: buildSourceHash(sourcePayload),
    };
  }

  const { data: artwork, error } = await args.supabase
    .from("artworks")
    .select("id,title,description")
    .eq("id", args.contentId)
    .single();
  if (error || !artwork) {
    throw new Error("Artwork not found.");
  }
  const sourcePayload = {
    title: (artwork as ArtworkRow).title ?? "",
    description: (artwork as ArtworkRow).description ?? "",
  };
  return {
    sourcePayload,
    sourceHash: buildSourceHash(sourcePayload),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }

  const body = (req.body ?? {}) as RequestBody;
  const contentType = body.content_type;
  const contentId = typeof body.content_id === "string" ? body.content_id.trim() : "";
  const lang = typeof body.lang === "string" ? body.lang.trim() : "";
  const preview = body.preview === true;

  if (!contentType || !["lesson", "map_story", "artwork"].includes(contentType)) {
    return res.status(400).json({ error: "Unsupported content_type." });
  }
  if (!contentId || !lang) {
    return res.status(400).json({ error: "Missing content_id or lang." });
  }

  try {
    const { sourcePayload, sourceHash } = await buildSourcePayload({
      supabase,
      contentType,
      contentId,
    });

    const { data: existingTranslation, error: existingError } = await supabase
      .from("content_translations")
      .select("id,source_hash")
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .eq("language", lang)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({ error: existingError.message });
    }
    if (existingTranslation && existingTranslation.source_hash === sourceHash && !preview) {
      return res.status(200).json({ upToDate: true });
    }

    const rawTranslation = TRANSLATION_MOCK_MODEL
      ? contentType === "lesson"
        ? mockTranslateLesson(sourcePayload as LessonTextPayload, lang)
        : mockTranslateGeneric(sourcePayload, lang)
      : await translateWithGemini(sourcePayload, lang);

    const translation =
      contentType === "lesson"
        ? coerceLessonToOriginalShape(
            sourcePayload as LessonTextPayload,
            coerceLessonPayload(rawTranslation),
          )
        : rawTranslation;

    if (contentType === "lesson") {
      const reason = getInvalidTranslationReason(translation);

      if (reason) {
        const title =
          typeof (sourcePayload as { title?: unknown }).title === "string"
            ? (sourcePayload as { title?: string }).title
            : "";

        console.error(
          `Invalid translation detected for lesson ${contentId}${title ? ` (${title})` : ""}: ${reason}`,
        );

        return res.status(422).json({ error: `Invalid translation: ${reason}` });
      }

      validateTranslationPayload({
        contentType: "lesson",
        originalPayload: sourcePayload,
        translatedPayload: translation,
      });
    } else if (contentType === "map_story") {
      validateNonEmptyObjectStrings(translation, ["content"]);
    } else {
      validateNonEmptyObjectStrings(translation, ["title", "description"]);
    }

    let safeJson: unknown;
    try {
      safeJson = JSON.parse(JSON.stringify(translation));
    } catch {
      return res.status(422).json({ error: "Invalid translation payload" });
    }

    if (preview) {
      return res.status(200).json({ preview: true, translation: safeJson });
    }

    const { error: upsertError } = await supabase.from("content_translations").upsert(
      {
        content_type: contentType,
        content_id: contentId,
        language: lang,
        source_hash: sourceHash,
        translation: safeJson,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "content_type,content_id,language",
      },
    );
    if (upsertError) {
      return res.status(500).json({ error: upsertError.message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}
