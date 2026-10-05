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

const optionalImportText = z.string().max(10_000).nullable().optional();

export const productionBriefQuestionImportSchema = z.object({
  video_concept: optionalImportText,
  production_mode: optionalImportText,
  overall_visual_direction: optionalImportText,
  mood: optionalImportText,
  pacing: optionalImportText,
  music_direction: optionalImportText,
  continuity_idea: optionalImportText,
  production_notes: optionalImportText,
}).strict();

export const productionBriefSlideImportSchema = z.object({
  slide_id: z.string().uuid().optional(),
  slide_number: z.number().int().positive().optional(),
  scene_intent: optionalImportText,
  visual_idea: optionalImportText,
  important_constraints: optionalImportText,
  things_to_avoid: optionalImportText,
  asset_search_hints: optionalImportText,
  visual_style_hint: optionalImportText,
  continuity_transition_hint: optionalImportText,
  generation_notes: optionalImportText,
  production_notes: optionalImportText,
}).strict().refine((slide) => Boolean(slide.slide_id) !== Boolean(slide.slide_number), {
  message: "Each slide must specify exactly one of slide_id or slide_number.",
});

export const productionBriefImportSchema = z.object({
  production: productionBriefQuestionImportSchema.optional(),
  slides: z.array(productionBriefSlideImportSchema).optional(),
}).strict().refine((brief) => Boolean(brief.production) || Boolean(brief.slides?.length), {
  message: "Production Brief must contain production fields or at least one slide.",
});

export type ProductionBriefImport = z.infer<typeof productionBriefImportSchema>;
export type ProductionBriefQuestionImport = z.infer<typeof productionBriefQuestionImportSchema>;
export type ProductionBriefSlideImport = z.infer<typeof productionBriefSlideImportSchema>;

export const CANONICAL_PRODUCTION_BRIEF_EXAMPLE: ProductionBriefImport = {
  production: {
    video_concept: "Короткий научно-познавательный ролик для детей, объясняющий сложное явление через простые физические аналогии.",
    production_mode: "cutout_animation",
    overall_visual_direction: "Тёплый бумажный коллаж, тактильные текстуры, выразительная мультипликационная пластика персонажа-кота.",
    mood: "Любознательное, дружелюбное, вовлекающее.",
    pacing: "Умеренный темп с чёткими смысловыми паузами для детского восприятия.",
    music_direction: "Акустическая, игривая фоновая музыка без резких перепадов, не заглушающая голос.",
    continuity_idea: "Плавное визуальное развитие от макромира к микромиру с сохранением единой цветовой палитры.",
    production_notes: "Все ключевые научные термины сопровождаются наглядной визуализацией.",
  },
  slides: [
    {
      slide_number: 1,
      scene_intent: "Задать главный вопрос и захватить внимание зрителя через знакомую повседневную ситуацию.",
      visual_idea: "Кот сидит у окна и наблюдает за явлением природы, вокруг появляются рисованные знаки вопроса.",
      important_constraints: "Персонаж должен быть в левой трети кадра, оставляя центр под анимацию процесса.",
      things_to_avoid: "Избегать мелкого нечитаемого текста и перегруженного деталями заднего плана.",
      asset_search_hints: "paper texture, cozy room interior, window rain view, cute cat character",
      visual_style_hint: "Бумажная перекладка, мягкое студийное освещение, естественные тени.",
      continuity_transition_hint: "Зум-ин в каплю воды на окне для перехода к микромиру в следующем слайде.",
      generation_notes: "Сгенерировать слой с котом отдельно от фона для последующей покадровой перекладки.",
      production_notes: "Синхронизировать поворот головы кота с ключевым словом в озвучке.",
    },
    {
      slide_number: 2,
      scene_intent: "Наглядно объяснить физический механизм простыми визуальными метафорами.",
      visual_idea: "Анимированная схема взаимодействия молекул или частиц в виде забавных прыгающих шариков.",
      important_constraints: "Сохранять размер частиц читаемым на экранах смартфонов.",
      things_to_avoid: "Слишком быстрые перемещения объектов, вызывающие рябь в глазах.",
      asset_search_hints: "molecule particles paper cutout, colorful spheres, scientific diagram simple",
      visual_style_hint: "Инфографика в стиле детской энциклопедии с живой покадровой анимацией.",
      continuity_transition_hint: "Плавное растворение в общий план перед финальным выводом.",
      generation_notes: "Сформировать циклическую анимацию теплового движения частиц.",
      production_notes: "Акцентный звуковой эффект при столкновении частиц.",
    },
  ],
};

// Immediate schema evaluation ensures code breaks build/tests if example ever drifts from schema
productionBriefImportSchema.parse(CANONICAL_PRODUCTION_BRIEF_EXAMPLE);

export function getProductionBriefExampleJson(): string {
  return JSON.stringify(CANONICAL_PRODUCTION_BRIEF_EXAMPLE, null, 2);
}

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
    `Base key: ${manifest.question.baseKey}`,
    `Series: ${manifest.question.series}`,
    `Locale: ${locale}`,
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
      `Processing settings: ${asset ? JSON.stringify(asset.processingSettings) : "MISSING"}`,
      `Processor version: ${asset?.processorVersion ?? "MISSING"}`,
      `Readiness: ${asset ? "SAVED" : "MISSING"}`,
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
