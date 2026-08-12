import {
  TRANSLATION_CONTENT_TYPES,
  type TranslationContentType,
} from "../translations/content-types.ts";

type LessonTextPayload = {
  title: string;
} & (
  | { steps_texts: string[]; steps_frank?: never }
  | { steps_frank: string[]; steps_texts?: never }
);

export type TranslationLanguage = "en" | "he";

export type TranslationAdapter = {
  contentType: TranslationContentType;
  buildSourcePayload: (loadedPayload: unknown) => unknown;
  normalizeTranslation: (sourcePayload: unknown, rawTranslation: unknown) => unknown;
  validateTranslation: (sourcePayload: unknown, translation: unknown, language?: TranslationLanguage) => void;
};

function getInvalidLessonTranslationReason(payload: unknown): string | null {
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

function validateLessonTranslation(sourcePayload: unknown, translation: unknown): void {
  const reason = getInvalidLessonTranslationReason(translation);
  if (reason) {
    throw new Error(`Invalid translation: ${reason}`);
  }
  const source = coerceLessonPayload(sourcePayload);
  const translated = coerceLessonPayload(translation);
  const sourceSteps = Array.isArray(source.steps_frank) ? source.steps_frank : (source.steps_texts ?? []);
  const translatedSteps = Array.isArray(translated.steps_frank)
    ? translated.steps_frank
    : (translated.steps_texts ?? []);
  if (
    translated.title.trim() === "" ||
    translatedSteps.length === 0 ||
    translatedSteps.some((step) => step.trim() === "") ||
    translatedSteps.length !== sourceSteps.length
  ) {
    throw new Error("Invalid translation payload");
  }
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

function validateStoryPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid translation payload");
  }

  const record = payload as {
    hero_name?: unknown;
    steps?: unknown;
    fragments?: unknown;
  };
  if (typeof record.hero_name !== "string" || !record.steps || typeof record.steps !== "object") {
    throw new Error("Invalid translation payload");
  }
  const steps = record.steps as Record<string, unknown>;
  for (const key of ["narration", "intro", "journey", "problem", "solution", "ending"]) {
    if (typeof steps[key] !== "string") {
      throw new Error("Invalid translation payload");
    }
  }
  if (!Array.isArray(record.fragments)) {
    throw new Error("Invalid translation payload");
  }
}

function validateBookPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid translation payload");
  }
  const record = payload as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.author !== "string" ||
    typeof record.description !== "string" ||
    !Array.isArray(record.categories) ||
    !Array.isArray(record.sections) ||
    !Array.isArray(record.tests)
  ) {
    throw new Error("Invalid translation payload");
  }
}

function validateBookPayloadAgainstSource(sourcePayload: unknown, translatedPayload: unknown): void {
  validateBookPayload(translatedPayload);
  if (!sourcePayload || typeof sourcePayload !== "object") {
    throw new Error("Invalid source payload");
  }

  const sourceSections = Array.isArray((sourcePayload as { sections?: unknown }).sections)
    ? (sourcePayload as { sections: unknown[] }).sections
    : [];
  const translatedSections = Array.isArray((translatedPayload as { sections?: unknown }).sections)
    ? (translatedPayload as { sections: unknown[] }).sections
    : [];
  if (translatedSections.length !== sourceSections.length) {
    throw new Error(`Section count mismatch: expected ${sourceSections.length}, got ${translatedSections.length}.`);
  }

  const sourceBySlug = new Map<string, number>();
  sourceSections.forEach((section) => {
    if (!section || typeof section !== "object") return;
    const typed = section as { mode_slug?: unknown; slides?: unknown };
    const modeSlug = typeof typed.mode_slug === "string" ? typed.mode_slug : "";
    if (modeSlug) sourceBySlug.set(modeSlug, Array.isArray(typed.slides) ? typed.slides.length : 0);
  });

  for (const section of translatedSections) {
    if (!section || typeof section !== "object") throw new Error("Invalid translation payload");
    const typed = section as { mode_slug?: unknown; slides?: unknown };
    const modeSlug = typeof typed.mode_slug === "string" ? typed.mode_slug : "";
    const slides = Array.isArray(typed.slides) ? typed.slides : null;
    if (!modeSlug || slides === null) throw new Error("Invalid translation payload");
    const expectedCount = sourceBySlug.get(modeSlug);
    if (expectedCount === undefined) throw new Error(`Unknown section in translation: ${modeSlug}.`);
    if (slides.length !== expectedCount) {
      throw new Error(`Slide count mismatch for section "${modeSlug}": expected ${expectedCount}, got ${slides.length}.`);
    }
  }
}

function validateParrotMusicStylePayload(payload: unknown): void {
  if (!payload || typeof payload !== "object") throw new Error("Invalid translation payload");
  const record = payload as { title?: unknown; description?: unknown; presets?: unknown; slides?: unknown };
  if (
    typeof record.title !== "string" ||
    typeof record.description !== "string" ||
    !Array.isArray(record.slides) ||
    (record.presets !== undefined && !Array.isArray(record.presets))
  ) {
    throw new Error("Invalid translation payload");
  }

  for (const preset of Array.isArray(record.presets) ? record.presets : []) {
    if (!preset || typeof preset !== "object") throw new Error("Invalid translation payload");
    const typedPreset = preset as { preset_key?: unknown; title?: unknown; variants?: unknown };
    if (typeof typedPreset.preset_key !== "string" || typeof typedPreset.title !== "string") {
      throw new Error("Invalid translation payload");
    }
    if (typedPreset.variants !== undefined && !Array.isArray(typedPreset.variants)) {
      throw new Error("Invalid translation payload");
    }
    for (const variant of Array.isArray(typedPreset.variants) ? typedPreset.variants : []) {
      if (!variant || typeof variant !== "object") throw new Error("Invalid translation payload");
      const typedVariant = variant as { variant_key?: unknown; title?: unknown };
      if (typeof typedVariant.variant_key !== "string" || typeof typedVariant.title !== "string") {
        throw new Error("Invalid translation payload");
      }
    }
  }

  for (const slide of record.slides) {
    if (!slide || typeof slide !== "object") throw new Error("Invalid translation payload");
    const typed = slide as { order?: unknown; text?: unknown };
    if (typeof typed.order !== "number" || !Number.isInteger(typed.order) || typeof typed.text !== "string") {
      throw new Error("Invalid translation payload");
    }
  }
}

function validateParrotMusicStylePayloadAgainstSource(sourcePayload: unknown, translatedPayload: unknown): void {
  validateParrotMusicStylePayload(translatedPayload);
  const sourceSlides = Array.isArray((sourcePayload as { slides?: unknown } | null | undefined)?.slides)
    ? (sourcePayload as { slides: unknown[] }).slides
    : [];
  const translatedSlides = Array.isArray((translatedPayload as { slides?: unknown } | null | undefined)?.slides)
    ? (translatedPayload as { slides: unknown[] }).slides
    : [];
  if (translatedSlides.length !== sourceSlides.length) {
    throw new Error(`Slide count mismatch: expected ${sourceSlides.length}, got ${translatedSlides.length}.`);
  }

  const sourcePresets = Array.isArray((sourcePayload as { presets?: unknown } | null | undefined)?.presets)
    ? (sourcePayload as { presets: Array<{ preset_key?: unknown; variants?: unknown }> }).presets
    : [];
  const translatedPresets = Array.isArray((translatedPayload as { presets?: unknown } | null | undefined)?.presets)
    ? (translatedPayload as { presets: Array<{ preset_key?: unknown; variants?: unknown }> }).presets
    : [];
  if (sourcePresets.length !== translatedPresets.length) {
    throw new Error(`Preset count mismatch: expected ${sourcePresets.length}, got ${translatedPresets.length}.`);
  }

  for (const sourcePreset of sourcePresets) {
    const presetKey = typeof sourcePreset.preset_key === "string" ? sourcePreset.preset_key : "";
    const translatedPreset = translatedPresets.find((preset) => preset.preset_key === presetKey);
    if (!translatedPreset) throw new Error(`Missing translated preset "${presetKey}".`);
    const sourceVariants = Array.isArray(sourcePreset.variants) ? sourcePreset.variants : [];
    const translatedVariants = Array.isArray(translatedPreset.variants) ? translatedPreset.variants : [];
    if (sourceVariants.length !== translatedVariants.length) {
      throw new Error(
        `Variant count mismatch for preset "${presetKey}": expected ${sourceVariants.length}, got ${translatedVariants.length}.`,
      );
    }
  }
}

const identitySource = (payload: unknown): unknown => payload;
const identityTranslation = (_sourcePayload: unknown, rawTranslation: unknown): unknown => rawTranslation;

const adapters = {
  lesson: {
    contentType: "lesson",
    buildSourcePayload: coerceLessonPayload,
    normalizeTranslation: (sourcePayload, rawTranslation) =>
      coerceLessonToOriginalShape(
        sourcePayload as LessonTextPayload,
        coerceLessonPayload(rawTranslation),
      ),
    validateTranslation: validateLessonTranslation,
  },
  map_story: {
    contentType: "map_story",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: (_sourcePayload, translation) => validateNonEmptyObjectStrings(translation, ["content"]),
  },
  artwork: {
    contentType: "artwork",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: (_sourcePayload, translation) => validateNonEmptyObjectStrings(translation, ["title", "description"]),
  },
  book: {
    contentType: "book",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: validateBookPayloadAgainstSource,
  },
  story_template: {
    contentType: "story_template",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: (_sourcePayload, translation) => validateStoryPayload(translation),
  },
  story_submission: {
    contentType: "story_submission",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: (_sourcePayload, translation) => validateStoryPayload(translation),
  },
  parrot_music_style: {
    contentType: "parrot_music_style",
    buildSourcePayload: identitySource,
    normalizeTranslation: identityTranslation,
    validateTranslation: validateParrotMusicStylePayloadAgainstSource,
  },
} satisfies Record<TranslationContentType, TranslationAdapter>;

export const TRANSLATION_ADAPTERS: Readonly<Record<TranslationContentType, TranslationAdapter>> = adapters;

export function getTranslationAdapter(contentType: TranslationContentType): TranslationAdapter {
  return TRANSLATION_ADAPTERS[contentType];
}

if (Object.keys(TRANSLATION_ADAPTERS).length !== TRANSLATION_CONTENT_TYPES.length) {
  throw new Error("Translation adapter registry is incomplete.");
}
