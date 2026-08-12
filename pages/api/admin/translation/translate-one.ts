import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { mockTranslateLesson, type LessonTextPayload } from "../../../../lib/server/translation-runner";
import {
  loadTranslationItemByContent,
  type TranslationContentType as ContentType,
} from "../../../../lib/server/translation-content";
import { getTranslationAdapter } from "../../../../lib/server/translation-adapters";
import { buildSourceHash } from "../../../../lib/server/translation-hash";
import { isTranslationContentType } from "../../../../lib/translations/content-types";
import { requireAdminSession } from "../../../../lib/server/admin-session";

type RequestBody = {
  content_type?: ContentType;
  content_id?: string;
  lang?: string;
  preview?: boolean;
  sourcePreview?: boolean;
  manualTranslation?: unknown;
  manualTranslations?: unknown;
};

async function saveTranslationRow(args: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  contentType: ContentType;
  contentId: string;
  language: string;
  sourceHash: string;
  translation: unknown;
}): Promise<void> {
  const { error: upsertError } = await args.supabase.from("content_translations").upsert(
    {
      content_type: args.contentType,
      content_id: args.contentId,
      language: args.language,
      source_hash: args.sourceHash,
      translation: args.translation,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "content_type,content_id,language",
    },
  );
  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

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
    "Translate human-readable title, description, text, label, name, and short_text string values.",
    "Do NOT translate identifier values under keys such as id, slug, preset_key, variant_key, key, mode_slug, language, or content_type.",
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

async function buildSourcePayload(args: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  contentType: ContentType;
  contentId: string;
}): Promise<{
  sourcePayload: unknown;
  sourceHash: string;
}> {
  const item = await loadTranslationItemByContent(
    args.supabase,
    args.contentType,
    args.contentId,
  );
  const sourcePayload = getTranslationAdapter(args.contentType).buildSourcePayload(item.payload);
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

  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
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
  const sourcePreview = body.sourcePreview === true;
  const hasManualTranslation = body.manualTranslation !== undefined;
  const hasManualTranslations = body.manualTranslations !== undefined;

  if (!isTranslationContentType(contentType)) {
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

    if (sourcePreview) {
      return res.status(200).json({ sourcePreview: true, sourcePayload });
    }

    if (hasManualTranslations) {
      const manualTranslations =
        typeof body.manualTranslations === "string"
          ? JSON.parse(body.manualTranslations)
          : body.manualTranslations;

      if (!manualTranslations || typeof manualTranslations !== "object" || Array.isArray(manualTranslations)) {
        return res.status(400).json({ error: "manualTranslations must be an object." });
      }

      const translationEntries = Object.entries(manualTranslations as Record<string, unknown>)
        .filter(([language, value]) => (language === "en" || language === "he") && value !== undefined && value !== null);

      if (translationEntries.length === 0) {
        return res.status(400).json({ error: "No en/he translations were provided." });
      }

      for (const [manualLang, rawTranslation] of translationEntries) {
        const adapter = getTranslationAdapter(contentType);
        const normalizedTranslation = adapter.normalizeTranslation(sourcePayload, rawTranslation);

        adapter.validateTranslation(sourcePayload, normalizedTranslation, manualLang as "en" | "he");

        let safeJson: unknown;
        try {
          safeJson = JSON.parse(JSON.stringify(normalizedTranslation));
        } catch {
          return res.status(422).json({ error: `Invalid translation payload for ${manualLang}` });
        }

        await saveTranslationRow({
          supabase,
          contentType,
          contentId,
          language: manualLang,
          sourceHash,
          translation: safeJson,
        });
      }

      return res.status(200).json({ ok: true, savedLanguages: translationEntries.map(([language]) => language) });
    }

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

    let translation: unknown;
    if (hasManualTranslation) {
      const manualTranslation =
        typeof body.manualTranslation === "string"
          ? JSON.parse(body.manualTranslation)
          : body.manualTranslation;
      translation = getTranslationAdapter(contentType).normalizeTranslation(sourcePayload, manualTranslation);
    } else {
      const rawTranslation = TRANSLATION_MOCK_MODEL
        ? contentType === "lesson"
          ? mockTranslateLesson(sourcePayload as LessonTextPayload, lang)
          : mockTranslateGeneric(sourcePayload, lang)
        : await translateWithGemini(sourcePayload, lang);

      translation = getTranslationAdapter(contentType).normalizeTranslation(sourcePayload, rawTranslation);
    }

    try {
      getTranslationAdapter(contentType).validateTranslation(sourcePayload, translation);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid translation payload";
      return res.status(422).json({ error: message });
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

    await saveTranslationRow({
      supabase,
      contentType,
      contentId,
      language: lang,
      sourceHash,
      translation: safeJson,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
}
