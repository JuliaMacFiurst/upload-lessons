import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { safeSlug } from "./book-admin";
import { buildSourceHash } from "./translation-content";
import {
  catQuestionPayloadSchema,
  type CatQuestionEditor,
  type CatQuestionListItem,
  type CatQuestionPayload,
  type CatSlideInput,
  type CatTranslationPayload,
} from "../cat-questions/types";

type CatPresetRow = {
  id: string;
  legacy_id: string;
  base_key: string;
  kind: "text" | "full";
  prompt: string;
  category: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string | null;
};

type CatSlideRow = {
  id: string;
  preset_id: string;
  slide_order: number;
  text: string;
  media_url: string | null;
  media_type: "gif" | "video" | null;
};

const duplicateWordMinLength = 2;

function normalizeWords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
        .split(/[\s-]+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= duplicateWordMinLength),
    ),
  );
}

function duplicateWarningFor(row: CatPresetRow, allRows: CatPresetRow[]): string | null {
  const ownWords = normalizeWords(row.prompt);
  if (ownWords.length < 3) {
    return null;
  }

  for (const other of allRows) {
    if (other.id === row.id) {
      continue;
    }

    const otherWords = normalizeWords(other.prompt);
    if (otherWords.length < 3) {
      continue;
    }

    const ownMisses = ownWords.filter((word) => !otherWords.includes(word)).length;
    const otherMisses = otherWords.filter((word) => !ownWords.includes(word)).length;
    const allowedMisses = Math.min(2, Math.max(0, Math.floor(Math.max(ownWords.length, otherWords.length) / 3)));

    if (ownMisses <= allowedMisses && otherMisses <= allowedMisses) {
      return `Возможно дублируется: ${other.prompt}`;
    }
  }

  return null;
}

function normalizeSlideOrder(slides: CatSlideInput[]): CatSlideInput[] {
  return [...slides]
    .sort((left, right) => left.order - right.order)
    .map((slide, index) => ({ ...slide, order: index + 1 }));
}

function normalizeTranslations(
  translations: CatQuestionPayload["translations"],
  slideOrders: number[],
): CatQuestionPayload["translations"] {
  const normalized: CatQuestionPayload["translations"] = {};

  for (const language of ["en", "he"] as const) {
    const translation = translations?.[language];
    if (!translation) {
      continue;
    }

    const slides = [...translation.slides]
      .sort((left, right) => left.order - right.order)
      .map((slide, index) => ({
        order: slideOrders[index] ?? index + 1,
        text: slide.text.trim(),
      }));

    if (slides.length !== slideOrders.length) {
      throw new Error(`Translation ${language} must contain ${slideOrders.length} slides.`);
    }

    normalized[language] = {
      prompt: translation.prompt.trim(),
      slides,
    };
  }

  return normalized;
}

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isInteger(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function normalizeRawSlides(record: Record<string, unknown>): CatSlideInput[] {
  const rawSlides = Array.isArray(record.slides) ? record.slides : Array.isArray(record.texts) ? record.texts : [];

  const slides: CatSlideInput[] = [];
  rawSlides.forEach((item, index) => {
    if (typeof item === "string") {
      slides.push({
        order: index + 1,
        text: item.trim(),
        mediaUrl: null,
        mediaType: null,
      });
      return;
    }

    if (!item || typeof item !== "object") {
      return;
    }

    const slide = item as Record<string, unknown>;
    const mediaUrl = getString(slide, ["mediaUrl", "media_url"]) ?? null;
    const rawMediaType = getString(slide, ["mediaType", "media_type"]);
    const mediaType: CatSlideInput["mediaType"] = rawMediaType === "gif" || rawMediaType === "video" ? rawMediaType : null;

    slides.push({
      id: getString(slide, ["id"]),
      order: getNumber(slide, ["order", "slide_order"]) ?? index + 1,
      text: getString(slide, ["text"]) ?? "",
      mediaUrl,
      mediaType,
    });
  });

  return slides;
}

function normalizeTranslation(value: unknown): CatTranslationPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const prompt = getString(record, ["prompt", "prompt_ru", "question", "title"]);
  if (!prompt) {
    return undefined;
  }

  const slides = normalizeRawSlides(record).map((slide) => ({
    order: slide.order,
    text: slide.text,
  }));

  if (slides.length === 0) {
    return undefined;
  }

  return { prompt, slides };
}

export function parseCatQuestionJson(value: string): CatQuestionPayload {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  const translationsRecord = record.translations && typeof record.translations === "object"
    ? (record.translations as Record<string, unknown>)
    : {};

  const rawKind = getString(record, ["kind"]);
  const prompt = getString(record, ["prompt", "prompt_ru", "question", "title"]);
  const slides = normalizeRawSlides(record);
  const translations = {
    en: normalizeTranslation(translationsRecord.en ?? {
      prompt: record.prompt_en,
      slides: record.slides_en ?? record.texts_en,
    }),
    he: normalizeTranslation(translationsRecord.he ?? {
      prompt: record.prompt_he,
      slides: record.slides_he ?? record.texts_he,
    }),
  };

  return catQuestionPayloadSchema.parse({
    legacy_id: getString(record, ["legacy_id", "id"]),
    base_key: getString(record, ["base_key", "baseKey", "key"]),
    kind: rawKind === "full" ? "full" : "text",
    prompt,
    category: getString(record, ["category"]) ?? null,
    is_active: typeof record.is_active === "boolean" ? record.is_active : true,
    sort_order: getNumber(record, ["sort_order", "sortOrder"]) ?? null,
    slides,
    translations,
  });
}

export async function createUniqueCatBaseKey(
  supabase: SupabaseClient,
  prompt: string,
  kind: "text" | "full",
  explicitBaseKey?: string,
): Promise<string> {
  const base = safeSlug(explicitBaseKey ?? prompt) || "cat-question";
  let candidate = base;
  let attempt = 1;

  while (true) {
    const { data, error } = await supabase
      .from("cat_presets")
      .select("id")
      .eq("base_key", candidate)
      .eq("kind", kind)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to check base_key: ${error.message}`);
    }
    if (!data?.id) {
      return candidate;
    }

    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function listCatQuestions(
  supabase: SupabaseClient,
  args: { search: string; page: number; limit: number },
): Promise<{ questions: CatQuestionListItem[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, args.page);
  const limit = Math.min(100, Math.max(1, args.limit));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = args.search.trim();

  let query = supabase
    .from("cat_presets")
    .select("id,legacy_id,base_key,kind,prompt,category,is_active,sort_order,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("prompt", `%${search}%`);
  }

  const [{ data, error, count }, allRowsResult] = await Promise.all([
    query,
    supabase.from("cat_presets").select("id,legacy_id,base_key,kind,prompt,category,is_active,sort_order,created_at"),
  ]);

  if (error) {
    throw new Error(`Failed to load cat questions: ${error.message}`);
  }
  if (allRowsResult.error) {
    throw new Error(`Failed to load duplicate index: ${allRowsResult.error.message}`);
  }

  const rows = (data as CatPresetRow[] | null) ?? [];
  const allRows = (allRowsResult.data as CatPresetRow[] | null) ?? [];
  const ids = rows.map((row) => row.id);
  const slideCounts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: slides, error: slidesError } = await supabase
      .from("cat_preset_slides")
      .select("preset_id")
      .in("preset_id", ids);

    if (slidesError) {
      throw new Error(`Failed to load slide counts: ${slidesError.message}`);
    }

    for (const slide of ((slides as Array<{ preset_id: string }> | null) ?? [])) {
      slideCounts.set(slide.preset_id, (slideCounts.get(slide.preset_id) ?? 0) + 1);
    }
  }

  return {
    questions: rows.map((row) => ({
      id: row.id,
      legacy_id: row.legacy_id,
      base_key: row.base_key,
      kind: row.kind,
      prompt: row.prompt,
      category: row.category,
      is_active: row.is_active,
      slide_count: slideCounts.get(row.id) ?? 0,
      created_at: row.created_at,
      duplicate_warning: duplicateWarningFor(row, allRows),
    })),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function createCatQuestion(
  supabase: SupabaseClient,
  payload: CatQuestionPayload,
): Promise<CatQuestionEditor> {
  const parsed = catQuestionPayloadSchema.parse(payload);
  const slides = normalizeSlideOrder(parsed.slides);
  const slideOrders = slides.map((slide) => slide.order);
  const translations = normalizeTranslations(parsed.translations, slideOrders);
  const sourcePayload = {
    prompt: parsed.prompt,
    slides: slides.map((slide) => ({
      order: slide.order,
      text: slide.text,
    })),
  };
  const baseKey = await createUniqueCatBaseKey(supabase, parsed.prompt, parsed.kind, parsed.base_key);
  const legacyId = parsed.legacy_id?.trim() || `${baseKey}-ru-001`;

  const { data: preset, error: presetError } = await supabase
    .from("cat_presets")
    .insert({
      legacy_id: legacyId,
      base_key: baseKey,
      kind: parsed.kind,
      prompt: parsed.prompt,
      category: parsed.category?.trim() || null,
      is_active: parsed.is_active,
      sort_order: parsed.sort_order ?? null,
    })
    .select("id,legacy_id,base_key,kind,prompt,category,is_active,sort_order,created_at")
    .single();

  if (presetError || !preset) {
    throw new Error(presetError?.message ?? "Failed to create cat question.");
  }

  await replaceCatSlides(supabase, preset.id, parsed.kind, slides);
  await upsertCatTranslations(supabase, preset.id, translations, sourcePayload);

  return loadCatQuestionEditor(supabase, preset.id);
}

export async function loadCatQuestionEditor(
  supabase: SupabaseClient,
  id: string,
): Promise<CatQuestionEditor> {
  const [{ data: preset, error: presetError }, { data: slides, error: slidesError }] = await Promise.all([
    supabase
      .from("cat_presets")
      .select("id,legacy_id,base_key,kind,prompt,category,is_active,sort_order,created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("cat_preset_slides")
      .select("id,preset_id,slide_order,text,media_url,media_type")
      .eq("preset_id", id)
      .order("slide_order", { ascending: true }),
  ]);

  if (presetError || !preset) {
    throw new Error(presetError?.message ?? "Cat question not found.");
  }
  if (slidesError) {
    throw new Error(`Failed to load cat question slides: ${slidesError.message}`);
  }

  const row = preset as CatPresetRow;
  return {
    id: row.id,
    legacy_id: row.legacy_id,
    base_key: row.base_key,
    kind: row.kind,
    prompt: row.prompt,
    category: row.category,
    is_active: row.is_active,
    sort_order: row.sort_order,
    slides: ((slides as CatSlideRow[] | null) ?? []).map((slide) => ({
      id: slide.id,
      order: slide.slide_order,
      text: slide.text,
      mediaUrl: slide.media_url,
      mediaType: slide.media_type,
    })),
  };
}

export async function updateCatQuestion(
  supabase: SupabaseClient,
  id: string,
  payload: CatQuestionPayload,
): Promise<CatQuestionEditor> {
  const parsed = catQuestionPayloadSchema.parse(payload);
  const slides = normalizeSlideOrder(parsed.slides);

  const { error: presetError } = await supabase
    .from("cat_presets")
    .update({
      legacy_id: parsed.legacy_id?.trim() || `${parsed.base_key ?? id}-ru-001`,
      base_key: parsed.base_key?.trim() || await createUniqueCatBaseKey(supabase, parsed.prompt, parsed.kind),
      kind: parsed.kind,
      prompt: parsed.prompt,
      category: parsed.category?.trim() || null,
      is_active: parsed.is_active,
      sort_order: parsed.sort_order ?? null,
    })
    .eq("id", id);

  if (presetError) {
    throw new Error(`Failed to update cat question: ${presetError.message}`);
  }

  await replaceCatSlides(supabase, id, parsed.kind, slides);
  return loadCatQuestionEditor(supabase, id);
}

async function replaceCatSlides(
  supabase: SupabaseClient,
  presetId: string,
  kind: "text" | "full",
  slides: CatSlideInput[],
) {
  const normalizedSlides = normalizeSlideOrder(slides);
  const rows = normalizedSlides.map((slide) => {
    const mediaUrl = kind === "full" ? slide.mediaUrl?.trim() || null : null;
    const mediaType = kind === "full" ? slide.mediaType ?? null : null;

    if ((mediaUrl && !mediaType) || (!mediaUrl && mediaType)) {
      throw new Error("Each media slide must include both mediaUrl and mediaType.");
    }

    return {
      preset_id: presetId,
      slide_order: slide.order,
      text: slide.text.trim(),
      media_url: mediaUrl,
      media_type: mediaType,
    };
  });

  const { error: deleteError } = await supabase.from("cat_preset_slides").delete().eq("preset_id", presetId);
  if (deleteError) {
    throw new Error(`Failed to replace slides: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.from("cat_preset_slides").insert(rows);
  if (insertError) {
    throw new Error(`Failed to save slides: ${insertError.message}`);
  }
}

async function upsertCatTranslations(
  supabase: SupabaseClient,
  presetId: string,
  translations: CatQuestionPayload["translations"],
  sourcePayload: CatTranslationPayload,
) {
  const sourceHash = buildSourceHash(sourcePayload);
  const rows = (["en", "he"] as const)
    .map((language) => {
      const payload = translations?.[language];
      if (!payload) {
        return null;
      }
      return {
        content_type: "cat_preset",
        content_id: presetId,
        language,
        source_hash: sourceHash,
        translation: payload,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("content_translations")
    .upsert(rows, { onConflict: "content_type,content_id,language" });

  if (error) {
    throw new Error(`Failed to save translations: ${error.message}`);
  }
}

export async function deleteCatQuestion(supabase: SupabaseClient, id: string): Promise<void> {
  const { error: translationError } = await supabase
    .from("content_translations")
    .delete()
    .eq("content_type", "cat_preset")
    .eq("content_id", id);

  if (translationError) {
    throw new Error(`Failed to delete translations: ${translationError.message}`);
  }

  const { error } = await supabase.from("cat_presets").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete cat question: ${error.message}`);
  }
}

export function handleCatQuestionValidationError(error: unknown) {
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
    status: 500,
    body: {
      error: error instanceof Error ? error.message : "Cat question request failed.",
    },
  };
}
