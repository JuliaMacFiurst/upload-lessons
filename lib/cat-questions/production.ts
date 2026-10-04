import { z } from "zod";

export const PROCESSOR_VERSION = "laplapla-studio-voice-v1";

export const voiceProcessingSettingsSchema = z.object({
  enhance: z.boolean(),
  louder: z.boolean(),
  child: z.boolean(),
});

export type VoiceProcessingSettings = z.infer<typeof voiceProcessingSettingsSchema>;

export const DEFAULT_RU_SCIENTIFIC_VOICE_PRESET: VoiceProcessingSettings = {
  enhance: false,
  louder: true,
  child: true,
};

export const questionProductionDirectionSchema = z.object({
  videoConcept: z.string().max(10_000).optional().nullable(),
  productionMode: z.string().max(1_000).optional().nullable(),
  overallVisualDirection: z.string().max(10_000).optional().nullable(),
  mood: z.string().max(2_000).optional().nullable(),
  pacing: z.string().max(2_000).optional().nullable(),
  musicDirection: z.string().max(5_000).optional().nullable(),
  continuityIdea: z.string().max(5_000).optional().nullable(),
  productionNotes: z.string().max(10_000).optional().nullable(),
});

export const slideProductionDirectionSchema = z.object({
  slideId: z.string().uuid(),
  sceneIntent: z.string().max(5_000).optional().nullable(),
  visualIdea: z.string().max(10_000).optional().nullable(),
  importantConstraints: z.string().max(5_000).optional().nullable(),
  thingsToAvoid: z.string().max(5_000).optional().nullable(),
  assetSearchHints: z.string().max(5_000).optional().nullable(),
  visualStyleHint: z.string().max(5_000).optional().nullable(),
  continuityTransitionHint: z.string().max(5_000).optional().nullable(),
  generationNotes: z.string().max(10_000).optional().nullable(),
  productionNotes: z.string().max(10_000).optional().nullable(),
});

export const productionDirectionsPayloadSchema = z.object({
  question: questionProductionDirectionSchema,
  slides: z.array(slideProductionDirectionSchema),
});

export type QuestionProductionDirection = z.infer<typeof questionProductionDirectionSchema>;
export type SlideProductionDirection = z.infer<typeof slideProductionDirectionSchema>;

export type NarrationAsset = {
  slideId: string;
  locale: string;
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  container: string;
  durationMs: number;
  sha256: string;
  processingSettings: VoiceProcessingSettings;
  processorVersion: string;
  updatedAt: string;
};

export type ProductionManifestSlide = {
  id: string;
  order: number;
  narrationText: Record<string, string | null>;
  direction: Omit<SlideProductionDirection, "slideId">;
  narrationAssets: Partial<Record<string, NarrationAsset>>;
};

export type CatQuestionProductionManifest = {
  schemaVersion: 1;
  question: {
    id: string;
    legacyId: string;
    baseKey: string;
    series: "cat_explains";
    kind: "text" | "full";
    category: string | null;
    isActive: boolean;
    title: Record<string, string | null>;
  };
  locales: string[];
  direction: QuestionProductionDirection;
  slides: ProductionManifestSlide[];
  readiness: Record<string, { recorded: number; total: number; ready: boolean }>;
  timingPolicy: {
    source: "final_processed_narration";
    alignment: "forced_alignment_per_slide";
    sceneDuration: "aligned_words_plus_editorial_pause";
  };
};

export function calculateNarrationReadiness(
  slides: Array<{ narrationAssets: Partial<Record<string, NarrationAsset>> }>,
  locales: string[],
) {
  return Object.fromEntries(locales.map((locale) => {
    const recorded = slides.filter((slide) => Boolean(slide.narrationAssets[locale])).length;
    return [locale, { recorded, total: slides.length, ready: slides.length > 0 && recorded === slides.length }];
  }));
}

function briefValue(value: string | null | undefined) {
  return value?.trim() || "—";
}

export function buildProductionBrief(manifest: CatQuestionProductionManifest, locale = "ru") {
  const lines = [
    "PROJECT",
    `Question ID: ${manifest.question.id}`,
    `Legacy ID: ${manifest.question.legacyId}`,
    `Series: ${manifest.question.series}`,
    `Languages: ${manifest.locales.join(", ")}`,
    `Title (${locale.toUpperCase()}): ${briefValue(manifest.question.title[locale])}`,
    "",
    "GLOBAL DIRECTION",
    `Video concept: ${briefValue(manifest.direction.videoConcept)}`,
    `Production mode: ${briefValue(manifest.direction.productionMode)}`,
    `Overall visual direction: ${briefValue(manifest.direction.overallVisualDirection)}`,
    `Mood: ${briefValue(manifest.direction.mood)}`,
    `Pacing: ${briefValue(manifest.direction.pacing)}`,
    `Music direction: ${briefValue(manifest.direction.musicDirection)}`,
    `Continuity idea: ${briefValue(manifest.direction.continuityIdea)}`,
    `Production notes: ${briefValue(manifest.direction.productionNotes)}`,
    "",
    "TIMING POLICY",
    "Final processed narration is the only production timing source.",
    "Run forced alignment per slide against the canonical slide text.",
  ];

  for (const slide of manifest.slides) {
    const asset = slide.narrationAssets[locale];
    lines.push(
      "",
      `SCENE ${String(slide.order).padStart(2, "0")}`,
      `Slide ID: ${slide.id}`,
      `Narration (${locale.toUpperCase()}): ${briefValue(slide.narrationText[locale])}`,
      `Human narration: ${asset ? asset.publicUrl || asset.storageKey : "MISSING"}`,
      `Narration R2 key: ${asset?.storageKey ?? "MISSING"}`,
      `Narration SHA-256: ${asset?.sha256 ?? "MISSING"}`,
      `Duration ms: ${asset?.durationMs ?? "MISSING"}`,
      `Canonical for production: ${locale === "ru" && asset ? "YES" : "NO"}`,
      `Scene intent: ${briefValue(slide.direction.sceneIntent)}`,
      `Visual idea: ${briefValue(slide.direction.visualIdea)}`,
      `Important constraints: ${briefValue(slide.direction.importantConstraints)}`,
      `Things to avoid: ${briefValue(slide.direction.thingsToAvoid)}`,
      `Asset/search hints: ${briefValue(slide.direction.assetSearchHints)}`,
      `Visual style hint: ${briefValue(slide.direction.visualStyleHint)}`,
      `Continuity/transition: ${briefValue(slide.direction.continuityTransitionHint)}`,
      `Generation notes: ${briefValue(slide.direction.generationNotes)}`,
      `Additional notes: ${briefValue(slide.direction.productionNotes)}`,
    );
  }

  const readiness = manifest.readiness[locale];
  lines.push("", `${locale.toUpperCase()} narration: ${readiness?.ready ? "READY" : `${readiness?.recorded ?? 0} / ${readiness?.total ?? manifest.slides.length}`}`);
  return lines.join("\n");
}
