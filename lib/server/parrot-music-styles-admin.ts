import fs from "fs/promises";
import path from "path";
import vm from "vm";
import ts from "typescript";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildSourceHash } from "./translation-content";
import {
  parrotMusicStylePayloadSchema,
  parrotMusicStyleRecordSchema,
  type ParrotMusicStyleListItem,
  type ParrotMusicStylePayload,
  type ParrotMusicStylePresetInput,
  type ParrotMusicStyleRecord,
  type ParrotMusicStyleSlideInput,
  type ParrotMusicStyleTranslationPayload,
  type ParrotMusicStyleTranslations,
  type ParrotMusicStyleVariantInput,
} from "../parrot-music-styles/types";

type StyleRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  search_artist: string | null;
  search_genre: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type PresetRow = {
  id: string;
  style_id: string;
  preset_key: string;
  title: string;
  icon_url: string | null;
  sort_order: number | null;
  default_on: boolean;
  default_variant_key: string | null;
};

type VariantRow = {
  id: string;
  preset_id: string;
  variant_key: string;
  title: string | null;
  audio_url: string;
  sort_order: number | null;
};

type SlideRow = {
  id: string;
  style_id: string;
  slide_order: number;
  text: string;
  media_url: string | null;
  media_type: "gif" | "image" | "video" | null;
};

type TranslationRow = {
  content_id: string;
  language: "en" | "he";
  translation: unknown;
};

type TranslationShape = {
  title?: unknown;
  description?: unknown;
  slides?: Array<{
    order?: unknown;
    text?: unknown;
  }>;
};

type CapybaraVariant = {
  id: string;
  src: string;
  label?: string;
};

type CapybaraLoop = {
  id: string;
  label: string;
  variants: CapybaraVariant[];
  defaultIndex?: number;
  defaultOn?: boolean;
};

type CapybaraPreset = {
  id: string;
  title: string;
  description: string;
  loops: CapybaraLoop[];
  searchArtist: string;
  searchGenre: string;
};

type CapybaraStyleSlide = {
  text: string;
  mediaUrl?: string;
  mediaType?: "gif" | "image" | "video";
};

type CapybaraStyleContent = {
  slug: string;
  title: string;
  description?: string;
  slides: CapybaraStyleSlide[];
};

type CapybaraMusicStylesModule = {
  musicStyles_ru: CapybaraStyleContent[];
  musicStyles_i18n: {
    en?: CapybaraStyleContent[];
    he?: CapybaraStyleContent[];
  };
};

type CapybaraParrotPresetsModule = {
  PARROT_PRESETS: CapybaraPreset[];
  iconForInstrument: (labelOrId: string) => string;
  iconForMusicStyle: (styleId: string) => string;
};

type ImportedStyleSeed = ParrotMusicStylePayload;

const CAPYBARA_ROOT = path.resolve(process.cwd(), "..", "capybara_tales");
const CAPYBARA_AUDIO_BUCKET =
  "https://wazoncnmsxbjzvbjenpw.supabase.co/storage/v1/object/public/parrot-audio";

function normalizeTranslationPayload(value: unknown): ParrotMusicStyleTranslationPayload | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as TranslationShape;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const slides = Array.isArray(record.slides)
    ? record.slides
        .map((slide) => {
          const order = typeof slide?.order === "number" && Number.isInteger(slide.order) ? slide.order : null;
          const text = typeof slide?.text === "string" ? slide.text.trim() : "";
          if (!order || !text) {
            return null;
          }
          return { order, text };
        })
        .filter((slide): slide is NonNullable<typeof slide> => slide !== null)
    : [];

  if (!title && !description && slides.length === 0) {
    return undefined;
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    slides,
  };
}

function normalizeSlides(slides: ParrotMusicStyleSlideInput[]): ParrotMusicStyleSlideInput[] {
  return [...slides]
    .sort((left, right) => left.slide_order - right.slide_order)
    .map((slide, index) => ({
      ...slide,
      slide_order: index + 1,
      text: slide.text.trim(),
      media_url: slide.media_url?.trim() || null,
      media_type: slide.media_type ?? null,
    }));
}

function normalizeVariants(variants: ParrotMusicStyleVariantInput[]): ParrotMusicStyleVariantInput[] {
  return variants.map((variant, index) => ({
    ...variant,
    variant_key: variant.variant_key.trim(),
    title: variant.title?.trim() || null,
    audio_url: variant.audio_url.trim(),
    sort_order: variant.sort_order ?? index,
  }));
}

function normalizePresets(presets: ParrotMusicStylePresetInput[]): ParrotMusicStylePresetInput[] {
  return presets.map((preset, index) => ({
    ...preset,
    preset_key: preset.preset_key.trim(),
    title: preset.title.trim(),
    icon_url: preset.icon_url?.trim() || null,
    sort_order: preset.sort_order ?? index,
    default_variant_key: preset.default_variant_key?.trim() || null,
    variants: normalizeVariants(preset.variants),
  }));
}

function normalizeTranslations(
  translations: ParrotMusicStyleTranslations,
): ParrotMusicStyleTranslations {
  const normalized: ParrotMusicStyleTranslations = {};

  for (const language of ["en", "he"] as const) {
    const payload = translations[language];
    if (!payload) {
      continue;
    }

    const title = payload.title?.trim() || "";
    const description = payload.description?.trim() || "";
    const slides = (payload.slides ?? [])
      .map((slide) => ({
        order: slide.order,
        text: slide.text.trim(),
      }))
      .filter((slide) => slide.text.length > 0)
      .sort((left, right) => left.order - right.order);

    if (!title && !description && slides.length === 0) {
      continue;
    }

    normalized[language] = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      slides,
    };
  }

  return normalized;
}

function assertPresetDefaults(presets: ParrotMusicStylePresetInput[]) {
  for (const preset of presets) {
    if (preset.default_variant_key) {
      const exists = preset.variants.some((variant) => variant.variant_key === preset.default_variant_key);
      if (!exists) {
        throw new Error(`Preset "${preset.preset_key}" has unknown default_variant_key.`);
      }
    }
  }
}

function assertMediaPairs(slides: ParrotMusicStyleSlideInput[]) {
  for (const slide of slides) {
    if ((slide.media_url && !slide.media_type) || (!slide.media_url && slide.media_type)) {
      throw new Error("Each slide media block must include both media_url and media_type.");
    }
  }
}

function toSourcePayload(payload: ParrotMusicStylePayload) {
  return {
    title: payload.title,
    description: payload.description ?? "",
    slides: payload.slides.map((slide) => ({
      order: slide.slide_order,
      text: slide.text,
    })),
  };
}

function toEditorRecord(
  row: StyleRow,
  presets: PresetRow[],
  variantsByPresetId: Map<string, VariantRow[]>,
  slides: SlideRow[],
  translations: ParrotMusicStyleTranslations,
): ParrotMusicStyleRecord {
  return parrotMusicStyleRecordSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    icon_url: row.icon_url,
    search_artist: row.search_artist,
    search_genre: row.search_genre,
    is_active: row.is_active,
    sort_order: row.sort_order,
    presets: presets
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map((preset) => ({
        id: preset.id,
        preset_key: preset.preset_key,
        title: preset.title,
        icon_url: preset.icon_url,
        sort_order: preset.sort_order,
        default_on: preset.default_on,
        default_variant_key: preset.default_variant_key,
        variants: (variantsByPresetId.get(preset.id) ?? [])
          .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
          .map((variant) => ({
            id: variant.id,
            variant_key: variant.variant_key,
            title: variant.title,
            audio_url: variant.audio_url,
            sort_order: variant.sort_order,
          })),
      })),
    slides: slides
      .sort((left, right) => left.slide_order - right.slide_order)
      .map((slide) => ({
        id: slide.id,
        slide_order: slide.slide_order,
        text: slide.text,
        media_url: slide.media_url,
        media_type: slide.media_type,
      })),
    translations,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

async function ensureUniqueSlug(supabase: SupabaseClient, slug: string, excludeId?: string) {
  let query = supabase.from("parrot_music_styles").select("id").eq("slug", slug).limit(1);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to validate slug: ${error.message}`);
  }

  if ((data ?? []).length > 0) {
    throw new Error("Style slug must be unique.");
  }
}

async function saveTranslations(
  supabase: SupabaseClient,
  styleId: string,
  sourcePayload: ReturnType<typeof toSourcePayload>,
  translations: ParrotMusicStyleTranslations,
) {
  const { error: deleteError } = await supabase
    .from("content_translations")
    .delete()
    .eq("content_type", "parrot_music_style")
    .eq("content_id", styleId);

  if (deleteError) {
    throw new Error(`Failed to reset style translations: ${deleteError.message}`);
  }

  const rows = (["en", "he"] as const)
    .map((language) => {
      const translation = translations[language];
      if (!translation) {
        return null;
      }
      return {
        content_type: "parrot_music_style",
        content_id: styleId,
        language,
        source_hash: buildSourceHash(sourcePayload),
        translation,
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
    throw new Error(`Failed to save style translations: ${error.message}`);
  }
}

async function replaceStyleChildren(
  supabase: SupabaseClient,
  styleId: string,
  presets: ParrotMusicStylePresetInput[],
  slides: ParrotMusicStyleSlideInput[],
) {
  const { error: slidesDeleteError } = await supabase
    .from("parrot_music_style_slides")
    .delete()
    .eq("style_id", styleId);
  if (slidesDeleteError) {
    throw new Error(`Failed to reset style slides: ${slidesDeleteError.message}`);
  }

  const { error: presetsDeleteError } = await supabase
    .from("parrot_music_style_presets")
    .delete()
    .eq("style_id", styleId);
  if (presetsDeleteError) {
    throw new Error(`Failed to reset style presets: ${presetsDeleteError.message}`);
  }

  const presetRows = presets.map((preset, presetIndex) => {
    const id = crypto.randomUUID();
    return {
      id,
      style_id: styleId,
      preset_key: preset.preset_key,
      title: preset.title,
      icon_url: preset.icon_url ?? null,
      sort_order: preset.sort_order ?? presetIndex,
      default_on: preset.default_on,
      default_variant_key: preset.default_variant_key ?? null,
      variants: preset.variants,
    };
  });

  if (presetRows.length > 0) {
    const { error: insertPresetError } = await supabase
      .from("parrot_music_style_presets")
      .insert(
        presetRows.map(({ variants: _variants, ...row }) => row),
      );
    if (insertPresetError) {
      throw new Error(`Failed to save style presets: ${insertPresetError.message}`);
    }
  }

  const variantRows = presetRows.flatMap((preset) =>
    preset.variants.map((variant, variantIndex) => ({
      id: crypto.randomUUID(),
      preset_id: preset.id,
      variant_key: variant.variant_key,
      title: variant.title ?? null,
      audio_url: variant.audio_url,
      sort_order: variant.sort_order ?? variantIndex,
    })),
  );

  if (variantRows.length > 0) {
    const { error: insertVariantError } = await supabase
      .from("parrot_music_style_variants")
      .insert(variantRows);
    if (insertVariantError) {
      throw new Error(`Failed to save style variants: ${insertVariantError.message}`);
    }
  }

  const slideRows = slides.map((slide, index) => ({
    id: crypto.randomUUID(),
    style_id: styleId,
    slide_order: slide.slide_order ?? index + 1,
    text: slide.text,
    media_url: slide.media_url ?? null,
    media_type: slide.media_type ?? null,
  }));

  const { error: insertSlideError } = await supabase
    .from("parrot_music_style_slides")
    .insert(slideRows);
  if (insertSlideError) {
    throw new Error(`Failed to save style slides: ${insertSlideError.message}`);
  }
}

async function readCapybaraModule<T>(
  filePath: string,
  injectedRequire?: (specifier: string) => unknown,
): Promise<T> {
  const source = await fs.readFile(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} as Record<string, unknown> };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: (specifier: string) => {
      if (injectedRequire) {
        return injectedRequire(specifier);
      }
      throw new Error(`Unsupported import in importer: ${specifier}`);
    },
    __dirname: path.dirname(filePath),
    __filename: filePath,
    console,
  });

  vm.runInContext(transpiled, context, { filename: filePath });
  return module.exports as T;
}

async function loadCapybaraSeeds(): Promise<ImportedStyleSeed[]> {
  const presetsModule = await readCapybaraModule<CapybaraParrotPresetsModule>(
    path.join(CAPYBARA_ROOT, "utils", "parrot-presets.ts"),
    (specifier) => {
      if (specifier === "@/utils/storageParrot") {
        return {
          getParrotLoopUrl: (relativePath: string) => `${CAPYBARA_AUDIO_BUCKET}/${relativePath}`,
        };
      }
      throw new Error(`Unsupported import in parrot-presets.ts: ${specifier}`);
    },
  );
  const contentModule = await readCapybaraModule<CapybaraMusicStylesModule>(
    path.join(CAPYBARA_ROOT, "content", "parrots", "musicStyles.ts"),
  );

  const ruBySlug = new Map(contentModule.musicStyles_ru.map((style) => [style.slug, style]));
  const enBySlug = new Map((contentModule.musicStyles_i18n.en ?? []).map((style) => [style.slug, style]));
  const heBySlug = new Map((contentModule.musicStyles_i18n.he ?? []).map((style) => [style.slug, style]));

  return presetsModule.PARROT_PRESETS.map((preset, index) => {
    const ru = ruBySlug.get(preset.id);
    const en = enBySlug.get(preset.id);
    const he = heBySlug.get(preset.id);

    const payload: ImportedStyleSeed = {
      slug: preset.id,
      title: ru?.title ?? preset.title,
      description: ru?.description ?? preset.description,
      icon_url: presetsModule.iconForMusicStyle(preset.id),
      search_artist: preset.searchArtist,
      search_genre: preset.searchGenre,
      is_active: true,
      sort_order: index,
      presets: preset.loops.map((loop, loopIndex) => ({
        preset_key: loop.id,
        title: loop.label,
        icon_url: presetsModule.iconForInstrument(loop.label || loop.id),
        sort_order: loopIndex,
        default_on: Boolean(loop.defaultOn),
        default_variant_key:
          typeof loop.defaultIndex === "number" && loop.defaultIndex >= 0
            ? loop.variants[loop.defaultIndex]?.id ?? null
            : null,
        variants: loop.variants.map((variant, variantIndex) => ({
          variant_key: variant.id,
          title: variant.label ?? null,
          audio_url: variant.src,
          sort_order: variantIndex,
        })),
      })),
      slides: (ru?.slides ?? []).map((slide, slideIndex) => ({
        slide_order: slideIndex + 1,
        text: slide.text,
        media_url: slide.mediaUrl ?? null,
        media_type: slide.mediaType ?? null,
      })),
      translations: {
        ...(en
          ? {
              en: {
                title: en.title,
                ...(en.description ? { description: en.description } : {}),
                slides: en.slides.map((slide, slideIndex) => ({
                  order: slideIndex + 1,
                  text: slide.text,
                })),
              },
            }
          : {}),
        ...(he
          ? {
              he: {
                title: he.title,
                ...(he.description ? { description: he.description } : {}),
                slides: he.slides.map((slide, slideIndex) => ({
                  order: slideIndex + 1,
                  text: slide.text,
                })),
              },
            }
          : {}),
      },
    };

    return parrotMusicStylePayloadSchema.parse(payload);
  });
}

async function loadTranslationsForStyle(
  supabase: SupabaseClient,
  styleId: string,
): Promise<ParrotMusicStyleTranslations> {
  const { data, error } = await supabase
    .from("content_translations")
    .select("content_id,language,translation")
    .eq("content_type", "parrot_music_style")
    .eq("content_id", styleId)
    .in("language", ["en", "he"]);

  if (error) {
    throw new Error(`Failed to load style translations: ${error.message}`);
  }

  const translations: ParrotMusicStyleTranslations = {};
  for (const row of ((data as TranslationRow[] | null) ?? [])) {
    const payload = normalizeTranslationPayload(row.translation);
    if (payload) {
      translations[row.language] = payload;
    }
  }

  return translations;
}

export async function listParrotMusicStyles(
  supabase: SupabaseClient,
  query: string,
): Promise<ParrotMusicStyleListItem[]> {
  const trimmed = query.trim();
  let builder = supabase
    .from("parrot_music_styles")
    .select("id,slug,title,search_artist,search_genre,is_active,sort_order,created_at")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(200);

  if (trimmed) {
    builder = builder.or(
      `slug.ilike.%${trimmed}%,title.ilike.%${trimmed}%,search_artist.ilike.%${trimmed}%,search_genre.ilike.%${trimmed}%`,
    );
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Failed to load parrot music styles: ${error.message}`);
  }

  const rows = (data as Array<Omit<ParrotMusicStyleListItem, "preset_count" | "slide_count">> | null) ?? [];
  const ids = rows.map((row) => row.id);
  const [presetsRes, slidesRes] = await Promise.all([
    ids.length > 0
      ? supabase.from("parrot_music_style_presets").select("style_id").in("style_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? supabase.from("parrot_music_style_slides").select("style_id").in("style_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (presetsRes.error) {
    throw new Error(`Failed to load preset counts: ${presetsRes.error.message}`);
  }
  if (slidesRes.error) {
    throw new Error(`Failed to load slide counts: ${slidesRes.error.message}`);
  }

  const presetCounts = new Map<string, number>();
  const slideCounts = new Map<string, number>();

  for (const row of ((presetsRes.data as Array<{ style_id: string }> | null) ?? [])) {
    presetCounts.set(row.style_id, (presetCounts.get(row.style_id) ?? 0) + 1);
  }
  for (const row of ((slidesRes.data as Array<{ style_id: string }> | null) ?? [])) {
    slideCounts.set(row.style_id, (slideCounts.get(row.style_id) ?? 0) + 1);
  }

  return rows.map((row) => ({
    ...row,
    preset_count: presetCounts.get(row.id) ?? 0,
    slide_count: slideCounts.get(row.id) ?? 0,
  }));
}

export async function loadParrotMusicStyle(
  supabase: SupabaseClient,
  styleId: string,
): Promise<ParrotMusicStyleRecord> {
  const [styleRes, presetsRes, slidesRes, translations] = await Promise.all([
    supabase
      .from("parrot_music_styles")
      .select("id,slug,title,description,icon_url,search_artist,search_genre,is_active,sort_order,created_at,updated_at")
      .eq("id", styleId)
      .single(),
    supabase
      .from("parrot_music_style_presets")
      .select("id,style_id,preset_key,title,icon_url,sort_order,default_on,default_variant_key")
      .eq("style_id", styleId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("parrot_music_style_slides")
      .select("id,style_id,slide_order,text,media_url,media_type")
      .eq("style_id", styleId)
      .order("slide_order", { ascending: true }),
    loadTranslationsForStyle(supabase, styleId),
  ]);

  if (styleRes.error || !styleRes.data) {
    throw new Error(styleRes.error?.message ?? "Parrot music style not found.");
  }
  if (presetsRes.error) {
    throw new Error(`Failed to load style presets: ${presetsRes.error.message}`);
  }
  if (slidesRes.error) {
    throw new Error(`Failed to load style slides: ${slidesRes.error.message}`);
  }

  const presets = (presetsRes.data as PresetRow[] | null) ?? [];
  const presetIds = presets.map((preset) => preset.id);
  const { data: variantsData, error: variantsError } = await supabase
    .from("parrot_music_style_variants")
    .select("id,preset_id,variant_key,title,audio_url,sort_order")
    .in("preset_id", presetIds.length > 0 ? presetIds : ["__none__"])
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (variantsError) {
    throw new Error(`Failed to load style variants: ${variantsError.message}`);
  }

  const variantsByPresetId = new Map<string, VariantRow[]>();
  for (const variant of ((variantsData as VariantRow[] | null) ?? [])) {
    const bucket = variantsByPresetId.get(variant.preset_id) ?? [];
    bucket.push(variant);
    variantsByPresetId.set(variant.preset_id, bucket);
  }

  return toEditorRecord(
    styleRes.data as StyleRow,
    presets,
    variantsByPresetId,
    ((slidesRes.data as SlideRow[] | null) ?? []),
    translations,
  );
}

export async function createParrotMusicStyle(
  supabase: SupabaseClient,
  payload: ParrotMusicStylePayload,
): Promise<ParrotMusicStyleRecord> {
  const parsed = parrotMusicStylePayloadSchema.parse(payload);
  await ensureUniqueSlug(supabase, parsed.slug);

  const presets = normalizePresets(parsed.presets);
  const slides = normalizeSlides(parsed.slides);
  const translations = normalizeTranslations(parsed.translations);

  assertPresetDefaults(presets);
  assertMediaPairs(slides);

  const { data, error } = await supabase
    .from("parrot_music_styles")
    .insert({
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description ?? null,
      icon_url: parsed.icon_url ?? null,
      search_artist: parsed.search_artist ?? null,
      search_genre: parsed.search_genre ?? null,
      is_active: parsed.is_active,
      sort_order: parsed.sort_order ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create parrot music style.");
  }

  await replaceStyleChildren(supabase, data.id, presets, slides);
  await saveTranslations(supabase, data.id, toSourcePayload({ ...parsed, presets, slides, translations }), translations);

  return loadParrotMusicStyle(supabase, data.id);
}

export async function updateParrotMusicStyle(
  supabase: SupabaseClient,
  styleId: string,
  payload: ParrotMusicStylePayload,
): Promise<ParrotMusicStyleRecord> {
  const parsed = parrotMusicStylePayloadSchema.parse(payload);
  await ensureUniqueSlug(supabase, parsed.slug, styleId);

  const presets = normalizePresets(parsed.presets);
  const slides = normalizeSlides(parsed.slides);
  const translations = normalizeTranslations(parsed.translations);

  assertPresetDefaults(presets);
  assertMediaPairs(slides);

  const { error } = await supabase
    .from("parrot_music_styles")
    .update({
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description ?? null,
      icon_url: parsed.icon_url ?? null,
      search_artist: parsed.search_artist ?? null,
      search_genre: parsed.search_genre ?? null,
      is_active: parsed.is_active,
      sort_order: parsed.sort_order ?? null,
    })
    .eq("id", styleId);

  if (error) {
    throw new Error(`Failed to update parrot music style: ${error.message}`);
  }

  await replaceStyleChildren(supabase, styleId, presets, slides);
  await saveTranslations(supabase, styleId, toSourcePayload({ ...parsed, presets, slides, translations }), translations);

  return loadParrotMusicStyle(supabase, styleId);
}

export async function deleteParrotMusicStyle(supabase: SupabaseClient, styleId: string): Promise<void> {
  const { error: translationError } = await supabase
    .from("content_translations")
    .delete()
    .eq("content_type", "parrot_music_style")
    .eq("content_id", styleId);
  if (translationError) {
    throw new Error(`Failed to delete style translations: ${translationError.message}`);
  }

  const { error } = await supabase.from("parrot_music_styles").delete().eq("id", styleId);
  if (error) {
    throw new Error(`Failed to delete parrot music style: ${error.message}`);
  }
}

export async function importParrotMusicStylesFromCapybara(
  supabase: SupabaseClient,
): Promise<{ imported: number; slugs: string[] }> {
  const seeds = await loadCapybaraSeeds();

  for (const seed of seeds) {
    const { data, error } = await supabase
      .from("parrot_music_styles")
      .select("id")
      .eq("slug", seed.slug)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to locate existing style "${seed.slug}": ${error.message}`);
    }

    if (data?.id) {
      await updateParrotMusicStyle(supabase, data.id, seed);
    } else {
      await createParrotMusicStyle(supabase, seed);
    }
  }

  return {
    imported: seeds.length,
    slugs: seeds.map((seed) => seed.slug),
  };
}

export function createEmptyParrotMusicStylePayload(): ParrotMusicStylePayload {
  return {
    slug: "",
    title: "",
    description: "",
    icon_url: "",
    search_artist: "",
    search_genre: "",
    is_active: true,
    sort_order: null,
    presets: [
      {
        preset_key: "",
        title: "",
        icon_url: "",
        sort_order: 0,
        default_on: false,
        default_variant_key: null,
        variants: [
          {
            variant_key: "",
            title: "",
            audio_url: "https://example.com/audio.mp3",
            sort_order: 0,
          },
        ],
      },
    ],
    slides: [
      {
        slide_order: 1,
        text: "",
        media_url: null,
        media_type: null,
      },
    ],
    translations: {},
  };
}

export function handleParrotMusicStyleValidationError(error: unknown) {
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
      error: error instanceof Error ? error.message : "Parrot music style request failed.",
    },
  };
}
