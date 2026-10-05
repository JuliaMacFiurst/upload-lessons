import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROCESSOR_VERSION,
  calculateNarrationReadiness,
  productionBriefImportSchema,
  productionDirectionsPayloadSchema,
  voiceProcessingSettingsSchema,
  type CatQuestionProductionManifest,
  type NarrationAsset,
  type QuestionProductionDirection,
  type SlideProductionDirection,
  type VoiceProcessingSettings,
} from "../cat-questions/production.ts";

type ObjectUpload = (input: { key: string; body: Buffer; contentType: string }) => Promise<string>;
type ObjectDelete = (key: string) => Promise<void>;

type QuestionRow = {
  id: string;
  legacy_id: string;
  base_key: string;
  kind: "text" | "full";
  prompt: string;
  category: string | null;
  is_active: boolean;
};

type SlideRow = { id: string; preset_id: string; slide_order: number; text: string };
type TranslationRow = { language: string; translation: unknown };

const emptyQuestionDirection: QuestionProductionDirection = {
  videoConcept: null,
  productionMode: null,
  overallVisualDirection: null,
  mood: null,
  pacing: null,
  musicDirection: null,
  continuityIdea: null,
  productionNotes: null,
};

const emptySlideDirection = (slideId: string): SlideProductionDirection => ({
  slideId,
  sceneIntent: null,
  visualIdea: null,
  importantConstraints: null,
  thingsToAvoid: null,
  assetSearchHints: null,
  visualStyleHint: null,
  continuityTransitionHint: null,
  generationNotes: null,
  productionNotes: null,
});

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function mapQuestionDirection(row: Record<string, unknown> | null): QuestionProductionDirection {
  if (!row) return { ...emptyQuestionDirection };
  return {
    videoConcept: textOrNull(row.video_concept),
    productionMode: textOrNull(row.production_mode),
    overallVisualDirection: textOrNull(row.overall_visual_direction),
    mood: textOrNull(row.mood),
    pacing: textOrNull(row.pacing),
    musicDirection: textOrNull(row.music_direction),
    continuityIdea: textOrNull(row.continuity_idea),
    productionNotes: textOrNull(row.production_notes),
  };
}

function mapSlideDirection(row: Record<string, unknown> | undefined, slideId: string): SlideProductionDirection {
  if (!row) return emptySlideDirection(slideId);
  return {
    slideId,
    sceneIntent: textOrNull(row.scene_intent),
    visualIdea: textOrNull(row.visual_idea),
    importantConstraints: textOrNull(row.important_constraints),
    thingsToAvoid: textOrNull(row.things_to_avoid),
    assetSearchHints: textOrNull(row.asset_search_hints),
    visualStyleHint: textOrNull(row.visual_style_hint),
    continuityTransitionHint: textOrNull(row.continuity_transition_hint),
    generationNotes: textOrNull(row.generation_notes),
    productionNotes: textOrNull(row.production_notes),
  };
}

function withoutSlideId(direction: SlideProductionDirection) {
  return {
    sceneIntent: direction.sceneIntent,
    visualIdea: direction.visualIdea,
    importantConstraints: direction.importantConstraints,
    thingsToAvoid: direction.thingsToAvoid,
    assetSearchHints: direction.assetSearchHints,
    visualStyleHint: direction.visualStyleHint,
    continuityTransitionHint: direction.continuityTransitionHint,
    generationNotes: direction.generationNotes,
    productionNotes: direction.productionNotes,
  };
}

function mapNarration(row: Record<string, unknown>): NarrationAsset {
  return {
    slideId: String(row.slide_id),
    locale: String(row.locale),
    storageKey: String(row.storage_key),
    publicUrl: String(row.public_url),
    mimeType: String(row.mime_type),
    container: String(row.container),
    durationMs: Number(row.duration_ms),
    sha256: String(row.sha256),
    processingSettings: voiceProcessingSettingsSchema.parse(row.processing_settings),
    processorVersion: String(row.processor_version),
    updatedAt: String(row.updated_at),
  };
}

function parseTranslation(value: unknown): { prompt: string | null; slides: Array<{ order: number; text: string }> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { prompt: null, slides: [] };
  const record = value as Record<string, unknown>;
  const slides = Array.isArray(record.slides)
    ? record.slides.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const slide = item as Record<string, unknown>;
        const text = textOrNull(slide.text);
        return text ? [{ order: Number(slide.order) || index + 1, text }] : [];
      })
    : [];
  return { prompt: textOrNull(record.prompt), slides };
}

export async function loadCatQuestionProductionManifest(
  supabase: SupabaseClient,
  questionId: string,
): Promise<CatQuestionProductionManifest> {
  const [questionResult, slidesResult, translationsResult, questionDirectionResult] = await Promise.all([
    supabase.from("cat_presets").select("id,legacy_id,base_key,kind,prompt,category,is_active").eq("id", questionId).single(),
    supabase.from("cat_preset_slides").select("id,preset_id,slide_order,text").eq("preset_id", questionId).order("slide_order", { ascending: true }),
    supabase.from("content_translations").select("language,translation").eq("content_type", "cat_preset").eq("content_id", questionId),
    supabase.from("cat_question_production").select("*").eq("preset_id", questionId).maybeSingle(),
  ]);

  if (questionResult.error || !questionResult.data) throw new Error(questionResult.error?.message ?? "Cat question not found.");
  if (slidesResult.error) throw new Error(`Failed to load question slides: ${slidesResult.error.message}`);
  if (translationsResult.error) throw new Error(`Failed to load question translations: ${translationsResult.error.message}`);
  if (questionDirectionResult.error) throw new Error(`Failed to load production direction: ${questionDirectionResult.error.message}`);

  const question = questionResult.data as QuestionRow;
  const slideRows = (slidesResult.data ?? []) as SlideRow[];
  const slideIds = slideRows.map((slide) => slide.id);
  const [slideDirectionsResult, narrationsResult] = slideIds.length > 0
    ? await Promise.all([
        supabase.from("cat_question_slide_production").select("*").in("slide_id", slideIds),
        supabase.from("cat_slide_narrations").select("*").in("slide_id", slideIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (slideDirectionsResult.error) throw new Error(`Failed to load scene directions: ${slideDirectionsResult.error.message}`);
  if (narrationsResult.error) throw new Error(`Failed to load narrations: ${narrationsResult.error.message}`);

  const translations = new Map<string, ReturnType<typeof parseTranslation>>();
  for (const row of (translationsResult.data ?? []) as TranslationRow[]) {
    translations.set(row.language, parseTranslation(row.translation));
  }
  const locales = ["ru", ...Array.from(translations.keys()).filter((locale) => locale !== "ru").sort()];
  const directionsBySlide = new Map(
    ((slideDirectionsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.slide_id), row]),
  );
  const narrationsBySlide = new Map<string, Partial<Record<string, NarrationAsset>>>();
  for (const row of (narrationsResult.data ?? []) as Array<Record<string, unknown>>) {
    const narration = mapNarration(row);
    const current = narrationsBySlide.get(narration.slideId) ?? {};
    current[narration.locale] = narration;
    narrationsBySlide.set(narration.slideId, current);
  }

  const slides = slideRows.map((slide) => ({
    id: slide.id,
    order: slide.slide_order,
    narrationText: Object.fromEntries(locales.map((locale) => [
      locale,
      locale === "ru"
        ? slide.text
        : translations.get(locale)?.slides.find((item) => item.order === slide.slide_order)?.text ?? null,
    ])),
    direction: withoutSlideId(mapSlideDirection(directionsBySlide.get(slide.id), slide.id)),
    narrationAssets: narrationsBySlide.get(slide.id) ?? {},
  }));

  return {
    schemaVersion: 1,
    question: {
      id: question.id,
      legacyId: question.legacy_id,
      baseKey: question.base_key,
      series: "cat_explains",
      kind: question.kind,
      category: question.category,
      isActive: question.is_active,
      title: Object.fromEntries(locales.map((locale) => [locale, locale === "ru" ? question.prompt : translations.get(locale)?.prompt ?? null])),
    },
    locales,
    direction: mapQuestionDirection(questionDirectionResult.data as Record<string, unknown> | null),
    slides,
    readiness: calculateNarrationReadiness(slides, locales),
    timingPolicy: {
      source: "final_processed_narration",
      alignment: "forced_alignment_per_slide",
      sceneDuration: "aligned_words_plus_editorial_pause",
    },
  };
}

export async function saveCatQuestionProductionDirections(
  supabase: SupabaseClient,
  questionId: string,
  input: unknown,
) {
  const payload = productionDirectionsPayloadSchema.parse(input);
  const { data: slides, error: slideError } = await supabase
    .from("cat_preset_slides")
    .select("id")
    .eq("preset_id", questionId);
  if (slideError) throw new Error(`Failed to validate slides: ${slideError.message}`);
  const allowed = new Set((slides ?? []).map((slide: { id: string }) => slide.id));
  const invalid = payload.slides.find((slide) => !allowed.has(slide.slideId));
  if (invalid) throw new Error(`Slide ${invalid.slideId} does not belong to question ${questionId}.`);

  const q = payload.question;
  const { error: questionError } = await supabase.from("cat_question_production").upsert({
    preset_id: questionId,
    video_concept: textOrNull(q.videoConcept),
    production_mode: textOrNull(q.productionMode),
    overall_visual_direction: textOrNull(q.overallVisualDirection),
    mood: textOrNull(q.mood),
    pacing: textOrNull(q.pacing),
    music_direction: textOrNull(q.musicDirection),
    continuity_idea: textOrNull(q.continuityIdea),
    production_notes: textOrNull(q.productionNotes),
  }, { onConflict: "preset_id" });
  if (questionError) throw new Error(`Failed to save production direction: ${questionError.message}`);

  if (payload.slides.length > 0) {
    const { error } = await supabase.from("cat_question_slide_production").upsert(payload.slides.map((slide) => ({
      slide_id: slide.slideId,
      scene_intent: textOrNull(slide.sceneIntent),
      visual_idea: textOrNull(slide.visualIdea),
      important_constraints: textOrNull(slide.importantConstraints),
      things_to_avoid: textOrNull(slide.thingsToAvoid),
      asset_search_hints: textOrNull(slide.assetSearchHints),
      visual_style_hint: textOrNull(slide.visualStyleHint),
      continuity_transition_hint: textOrNull(slide.continuityTransitionHint),
      generation_notes: textOrNull(slide.generationNotes),
      production_notes: textOrNull(slide.productionNotes),
    })), { onConflict: "slide_id" });
    if (error) throw new Error(`Failed to save scene directions: ${error.message}`);
  }
}

export async function importCatQuestionProductionBrief(
  supabase: SupabaseClient,
  questionId: string,
  input: unknown,
) {
  const manifest = await loadCatQuestionProductionManifest(supabase, questionId);
  const plan = buildProductionBriefImportPlan(manifest, input);

  if (plan.questionRow) {
    const { error } = await supabase.from("cat_question_production").upsert(plan.questionRow, { onConflict: "preset_id" });
    if (error) throw new Error(`Failed to import production direction: ${error.message}`);
  }

  if (plan.slideRows.length > 0) {
    const { error } = await supabase.from("cat_question_slide_production").upsert(plan.slideRows, { onConflict: "slide_id" });
    if (error) throw new Error(`Failed to import scene directions: ${error.message}`);
  }
}

export function buildProductionBriefImportPlan(manifest: CatQuestionProductionManifest, input: unknown) {
  const payload = productionBriefImportSchema.parse(input);
  const slidesById = new Map(manifest.slides.map((slide) => [slide.id, slide]));
  const slidesByNumber = new Map(manifest.slides.map((slide) => [slide.order, slide]));
  const resolved = (payload.slides ?? []).map((incoming) => {
    const slide = incoming.slide_id ? slidesById.get(incoming.slide_id) : slidesByNumber.get(incoming.slide_number as number);
    if (!slide) {
      const reference = incoming.slide_id ? `slide_id ${incoming.slide_id}` : `slide_number ${incoming.slide_number}`;
      throw new Error(`Unknown slide reference: ${reference}.`);
    }
    return { incoming, slide };
  });
  const seen = new Set<string>();
  for (const item of resolved) {
    if (seen.has(item.slide.id)) throw new Error(`Duplicate slide reference resolves to slide ${item.slide.id}.`);
    seen.add(item.slide.id);
  }

  let questionRow: Record<string, unknown> | null = null;
  if (payload.production) {
    const source = payload.production;
    const current = manifest.direction;
    questionRow = {
      preset_id: manifest.question.id,
      video_concept: hasOwn(source, "video_concept") ? textOrNull(source.video_concept) : current.videoConcept,
      production_mode: hasOwn(source, "production_mode") ? textOrNull(source.production_mode) : current.productionMode,
      overall_visual_direction: hasOwn(source, "overall_visual_direction") ? textOrNull(source.overall_visual_direction) : current.overallVisualDirection,
      mood: hasOwn(source, "mood") ? textOrNull(source.mood) : current.mood,
      pacing: hasOwn(source, "pacing") ? textOrNull(source.pacing) : current.pacing,
      music_direction: hasOwn(source, "music_direction") ? textOrNull(source.music_direction) : current.musicDirection,
      continuity_idea: hasOwn(source, "continuity_idea") ? textOrNull(source.continuity_idea) : current.continuityIdea,
      production_notes: hasOwn(source, "production_notes") ? textOrNull(source.production_notes) : current.productionNotes,
    };
  }

  const slideRows = resolved.map(({ incoming, slide }) => {
      const current = slide.direction;
      return {
        slide_id: slide.id,
        scene_intent: hasOwn(incoming, "scene_intent") ? textOrNull(incoming.scene_intent) : current.sceneIntent,
        visual_idea: hasOwn(incoming, "visual_idea") ? textOrNull(incoming.visual_idea) : current.visualIdea,
        important_constraints: hasOwn(incoming, "important_constraints") ? textOrNull(incoming.important_constraints) : current.importantConstraints,
        things_to_avoid: hasOwn(incoming, "things_to_avoid") ? textOrNull(incoming.things_to_avoid) : current.thingsToAvoid,
        asset_search_hints: hasOwn(incoming, "asset_search_hints") ? textOrNull(incoming.asset_search_hints) : current.assetSearchHints,
        visual_style_hint: hasOwn(incoming, "visual_style_hint") ? textOrNull(incoming.visual_style_hint) : current.visualStyleHint,
        continuity_transition_hint: hasOwn(incoming, "continuity_transition_hint") ? textOrNull(incoming.continuity_transition_hint) : current.continuityTransitionHint,
        generation_notes: hasOwn(incoming, "generation_notes") ? textOrNull(incoming.generation_notes) : current.generationNotes,
        production_notes: hasOwn(incoming, "production_notes") ? textOrNull(incoming.production_notes) : current.productionNotes,
      };
    });
  return { questionRow, slideRows };
}

function decodeFinalWav(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!payload || !/^[A-Za-z0-9+/=\r\n]+$/.test(payload)) throw new Error("Invalid base64 audio payload.");
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported audio format. Final narration must be a WAV file.");
  }
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Narration file exceeds the 15 MB limit.");
  return bytes;
}

export function inspectPcmWav(bytes: Buffer) {
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  let audioFormat = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("Invalid WAV chunk size.");
    if (id === "fmt " && size >= 16) {
      audioFormat = bytes.readUInt16LE(start);
      byteRate = bytes.readUInt32LE(start + 8);
    } else if (id === "data") {
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (audioFormat !== 1 || byteRate <= 0 || dataSize <= 0) throw new Error("Only PCM WAV narration is supported.");
  return { durationMs: Math.round((dataSize / byteRate) * 1000), container: "wav" };
}

export function buildNarrationStorageKey(questionId: string, locale: string, slideId: string, sha256: string) {
  return `narration/questions/${questionId}/${locale}/${slideId}/${sha256}.wav`;
}

export async function saveFinalSlideNarration(input: {
  supabase: SupabaseClient;
  questionId: string;
  slideId: string;
  locale: string;
  audioBase64: string;
  mimeType: string;
  processingSettings: VoiceProcessingSettings;
  upload: ObjectUpload;
  remove: ObjectDelete;
}) {
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.locale)) throw new Error("Invalid narration locale.");
  if (input.mimeType !== "audio/wav") throw new Error("Unsupported audio format. Final narration must be audio/wav.");
  const settings = voiceProcessingSettingsSchema.parse(input.processingSettings);
  const bytes = decodeFinalWav(input.audioBase64);
  const { durationMs, container } = inspectPcmWav(bytes);
  if (durationMs <= 0 || durationMs > 10 * 60 * 1000) throw new Error("Invalid narration duration.");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  const { data: slide, error: slideError } = await input.supabase
    .from("cat_preset_slides")
    .select("id,preset_id")
    .eq("id", input.slideId)
    .eq("preset_id", input.questionId)
    .maybeSingle();
  if (slideError) throw new Error(`Failed to validate narration slide: ${slideError.message}`);
  if (!slide) throw new Error("Slide does not belong to this question.");

  const { data: previous, error: previousError } = await input.supabase
    .from("cat_slide_narrations")
    .select("storage_key")
    .eq("slide_id", input.slideId)
    .eq("locale", input.locale)
    .maybeSingle();
  if (previousError) throw new Error(`Failed to load current narration: ${previousError.message}`);

  const key = buildNarrationStorageKey(input.questionId, input.locale, input.slideId, sha256);
  const publicUrl = await input.upload({ key, body: bytes, contentType: "audio/wav" });
  const row = {
    slide_id: input.slideId,
    locale: input.locale,
    storage_key: key,
    public_url: publicUrl,
    mime_type: "audio/wav",
    container,
    duration_ms: durationMs,
    sha256,
    processing_settings: settings,
    processor_version: PROCESSOR_VERSION,
  };

  const { data, error } = await input.supabase
    .from("cat_slide_narrations")
    .upsert(row, { onConflict: "slide_id,locale" })
    .select("*")
    .single();
  if (error || !data) {
    if (previous?.storage_key !== key) await input.remove(key).catch(() => undefined);
    throw new Error(error?.message ?? "Failed to save narration metadata.");
  }

  const previousKey = previous?.storage_key as string | undefined;
  if (previousKey && previousKey !== key) await input.remove(previousKey).catch(() => undefined);
  return mapNarration(data as Record<string, unknown>);
}

export async function deleteFinalSlideNarration(input: {
  supabase: SupabaseClient;
  questionId: string;
  slideId: string;
  locale: string;
  remove: ObjectDelete;
}) {
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(input.locale)) throw new Error("Invalid narration locale.");
  const { data: slide, error: slideError } = await input.supabase
    .from("cat_preset_slides")
    .select("id,preset_id")
    .eq("id", input.slideId)
    .eq("preset_id", input.questionId)
    .maybeSingle();
  if (slideError) throw new Error(`Failed to validate narration slide: ${slideError.message}`);
  if (!slide) throw new Error("Slide does not belong to this question.");

  const { data: previous, error: previousError } = await input.supabase
    .from("cat_slide_narrations")
    .select("storage_key")
    .eq("slide_id", input.slideId)
    .eq("locale", input.locale)
    .maybeSingle();
  if (previousError) throw new Error(`Failed to load current narration: ${previousError.message}`);
  if (!previous) return { deleted: false, storageKey: null };

  const storageKey = String(previous.storage_key);
  const { error: deleteError } = await input.supabase
    .from("cat_slide_narrations")
    .delete()
    .eq("slide_id", input.slideId)
    .eq("locale", input.locale)
    .eq("storage_key", storageKey);
  if (deleteError) throw new Error(`Failed to delete narration metadata: ${deleteError.message}`);

  const { count, error: referenceError } = await input.supabase
    .from("cat_slide_narrations")
    .select("slide_id", { count: "exact", head: true })
    .eq("storage_key", storageKey);
  if (referenceError) throw new Error(`Narration metadata was deleted, but object cleanup could not be verified: ${referenceError.message}`);
  if ((count ?? 0) === 0) await input.remove(storageKey);
  return { deleted: true, storageKey };
}
