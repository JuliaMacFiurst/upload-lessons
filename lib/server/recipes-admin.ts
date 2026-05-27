import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildSourceHash } from "./translation-content";
import {
  recipePayloadSchema,
  recipeRecordSchema,
  type RecipeListItem,
  type RecipeLayoutTemplate,
  type RecipePayload,
  type RecipeRecord,
  type RecipeStep,
  type RecipeTranslation,
  type RecipeTranslations,
} from "../recipes/types";

type RecipeRow = Omit<RecipeRecord, "translations">;

type TranslationRow = {
  language: "en" | "he";
  translation: unknown;
};

function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function normalizeSteps(value: unknown): RecipeStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return { order: index + 1, text: item.trim() };
      }
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const orderValue = record.order ?? record.step_order;
      const order = typeof orderValue === "number" && Number.isInteger(orderValue) ? orderValue : index + 1;
      const text = getString(record, ["text", "description", "step"]) ?? "";
      return text ? { order, text } : null;
    })
    .filter((step): step is RecipeStep => step !== null)
    .sort((left, right) => left.order - right.order)
    .map((step, index) => ({ ...step, order: index + 1 }));
}

function normalizeTranslation(value: unknown): RecipeTranslation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const translation: RecipeTranslation = {
    title: getString(record, ["title"]),
    description: getString(record, ["description"]),
    country: getString(record, ["country"]),
    ingredients: getStringArray(record, ["ingredients"]),
    fact: getString(record, ["fact"]),
    raccoon_caption: getString(record, ["raccoon_caption", "raccoon-capture", "raccoon_capture"]),
    cooking_time: getString(record, ["cooking_time", "cooking-time"]),
    cooking_steps: normalizeSteps(record.cooking_steps ?? record["cooking-steps"]),
    raccoon_advice: getString(record, ["raccoon_advice", "raccoon-advise"]),
    serving_instructions: getString(record, ["serving_instructions", "serving-instructions"]),
    laplapla_interaction_caption: getString(record, [
      "laplapla_interaction_caption",
      "laplapla-interaction-cupture",
      "laplapla_interaction_cupture",
    ]),
    pinterest_description: getString(record, ["pinterest_description"]),
    hashtags: getStringArray(record, ["hashtags"]),
  };

  const hasValue = Object.values(translation).some((field) => Array.isArray(field) ? field.length > 0 : Boolean(field));
  return hasValue ? translation : undefined;
}

function normalizeTranslations(value: unknown): RecipeTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    ...(normalizeTranslation(record.en) ? { en: normalizeTranslation(record.en) } : {}),
    ...(normalizeTranslation(record.he) ? { he: normalizeTranslation(record.he) } : {}),
  };
}

function normalizePublishDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error("publish_date must be a valid ISO date or datetime.");
  }
  return new Date(timestamp).toISOString();
}

function toSourcePayload(payload: RecipePayload) {
  return {
    title: payload.title,
    description: payload.description ?? "",
    country: payload.country ?? "",
    ingredients: payload.ingredients,
    fact: payload.fact ?? "",
    raccoon_caption: payload.raccoon_caption ?? "",
    cooking_time: payload.cooking_time ?? "",
    cooking_steps: payload.cooking_steps,
    raccoon_advice: payload.raccoon_advice ?? "",
    serving_instructions: payload.serving_instructions ?? "",
    laplapla_interaction_caption: payload.laplapla_interaction_caption ?? "",
    pinterest_description: payload.pinterest_description ?? "",
    hashtags: payload.hashtags,
  };
}

export function parseRecipeJson(value: string): RecipePayload {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  return recipePayloadSchema.parse({
    slug: getString(record, ["slug"]),
    title: getString(record, ["title"]),
    description: getString(record, ["description"]),
    image_url: getString(record, ["image_url", "imageUrl"]),
    country: getString(record, ["country"]),
    country_target_id: getString(record, ["country_target_id", "countryTargetId"]),
    ingredients: getStringArray(record, ["ingredients"]),
    fact: getString(record, ["fact"]),
    raccoon_caption: getString(record, ["raccoon_caption", "raccoon-capture", "raccoon_capture"]),
    cooking_time: getString(record, ["cooking_time", "cooking-time"]),
    cooking_steps: normalizeSteps(record.cooking_steps ?? record["cooking-steps"]),
    raccoon_advice: getString(record, ["raccoon_advice", "raccoon-advise"]),
    serving_instructions: getString(record, ["serving_instructions", "serving-instructions"]),
    publish_date: getString(record, ["publish_date", "publishDate"]),
    pinterest_status: getString(record, ["pinterest_status"]) ?? "draft",
    pinterest_description: getString(record, ["pinterest_description"]),
    laplapla_interaction_caption: getString(record, [
      "laplapla_interaction_caption",
      "laplapla-interaction-cupture",
      "laplapla_interaction_cupture",
    ]),
    hashtags: getStringArray(record, ["hashtags"]),
    exported_image_urls: record.exported_image_urls ?? {},
    asset_set_key: getString(record, ["asset_set_key", "assetSetKey"]),
    sticker_set_key: getString(record, ["sticker_set_key", "stickerSetKey"]),
    layout_json: record.layout_json && typeof record.layout_json === "object" ? record.layout_json : {},
    gradient_from: getString(record, ["gradient_from", "gradientFrom"]),
    gradient_to: getString(record, ["gradient_to", "gradientTo"]),
    is_active: typeof record.is_active === "boolean" ? record.is_active : true,
    translations: normalizeTranslations(record.translations),
  });
}

async function ensureUniqueSlug(supabase: SupabaseClient, slug: string, excludeId?: string) {
  let query = supabase.from("recipes").select("id").eq("slug", slug).limit(1);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to validate recipe slug: ${error.message}`);
  }
  if ((data ?? []).length > 0) {
    throw new Error("Recipe slug must be unique.");
  }
}

async function loadRecipeTranslations(
  supabase: SupabaseClient,
  recipeId: string,
): Promise<RecipeTranslations> {
  const { data, error } = await supabase
    .from("content_translations")
    .select("language,translation")
    .eq("content_type", "recipe")
    .eq("content_id", recipeId)
    .in("language", ["en", "he"]);

  if (error) {
    throw new Error(`Failed to load recipe translations: ${error.message}`);
  }

  const translations: RecipeTranslations = {};
  for (const row of ((data as TranslationRow[] | null) ?? [])) {
    const payload = normalizeTranslation(row.translation);
    if (payload) {
      translations[row.language] = payload;
    }
  }
  return translations;
}

async function saveRecipeTranslations(
  supabase: SupabaseClient,
  recipeId: string,
  sourcePayload: ReturnType<typeof toSourcePayload>,
  translations: RecipeTranslations,
) {
  const { error: deleteError } = await supabase
    .from("content_translations")
    .delete()
    .eq("content_type", "recipe")
    .eq("content_id", recipeId);

  if (deleteError) {
    throw new Error(`Failed to reset recipe translations: ${deleteError.message}`);
  }

  const sourceHash = buildSourceHash(sourcePayload);
  const rows = (["en", "he"] as const)
    .map((language) => {
      const translation = translations[language];
      if (!translation) {
        return null;
      }
      return {
        content_type: "recipe",
        content_id: recipeId,
        language,
        source_hash: sourceHash,
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
    throw new Error(`Failed to save recipe translations: ${error.message}`);
  }
}

async function upsertRecipeSchedule(supabase: SupabaseClient, recipeId: string, publishDate: string | null) {
  if (!publishDate) {
    const { error } = await supabase
      .from("publication_schedule_items")
      .delete()
      .eq("content_type", "recipe")
      .eq("content_id", recipeId);
    if (error) {
      throw new Error(`Failed to clear recipe schedule: ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("publication_schedule_items").upsert(
    {
      slot_key: "friday_recipe",
      content_type: "recipe",
      content_id: recipeId,
      publish_at: publishDate,
      status: "scheduled",
      metadata: {},
    },
    { onConflict: "slot_key,content_type,content_id" },
  );

  if (error) {
    throw new Error(`Failed to save recipe schedule: ${error.message}`);
  }
}

function toRecipeRecord(row: RecipeRow, translations: RecipeTranslations): RecipeRecord {
  return recipeRecordSchema.parse({
    ...row,
    translations,
  });
}

export async function listRecipes(
  supabase: SupabaseClient,
  args: { search: string; page: number; limit: number },
): Promise<{ recipes: RecipeListItem[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, args.page);
  const limit = Math.min(50, Math.max(1, args.limit));
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const search = args.search.trim();

  let query = supabase
    .from("recipes")
    .select("id,slug,title,country,publish_date,pinterest_status,is_active,created_at", { count: "exact" })
    .order("publish_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`slug.ilike.%${search}%,title.ilike.%${search}%,country.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`Failed to load recipes: ${error.message}`);
  }

  return {
    recipes: ((data as RecipeListItem[] | null) ?? []),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function listRecipeLayoutTemplates(
  supabase: SupabaseClient,
  args: { currentRecipeId?: string; limit?: number },
): Promise<{ templates: RecipeLayoutTemplate[] }> {
  const limit = Math.min(60, Math.max(1, args.limit ?? 30));
  let query = supabase
    .from("recipes")
    .select("id,slug,title,country,updated_at,gradient_from,gradient_to,layout_json,exported_image_urls")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (args.currentRecipeId) {
    query = query.neq("id", args.currentRecipeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load recipe templates: ${error.message}`);
  }

  const templates = ((data as Array<Record<string, unknown>> | null) ?? [])
    .map((row): RecipeLayoutTemplate | null => {
      const layoutJson = row.layout_json;
      if (!layoutJson || typeof layoutJson !== "object" || Array.isArray(layoutJson)) {
        return null;
      }
      const elements = (layoutJson as { elements?: unknown }).elements;
      if (!Array.isArray(elements) || elements.length === 0) {
        return null;
      }
      const exportedImageUrls = row.exported_image_urls && typeof row.exported_image_urls === "object" && !Array.isArray(row.exported_image_urls)
        ? row.exported_image_urls as Record<string, unknown>
        : {};
      const previewUrl = typeof exportedImageUrls.ru === "string"
        ? exportedImageUrls.ru
        : typeof exportedImageUrls.en === "string"
          ? exportedImageUrls.en
          : typeof exportedImageUrls.he === "string"
            ? exportedImageUrls.he
            : null;

      return {
        id: String(row.id ?? ""),
        slug: String(row.slug ?? ""),
        title: String(row.title ?? "Recipe template"),
        country: typeof row.country === "string" ? row.country : null,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
        gradient_from: typeof row.gradient_from === "string" ? row.gradient_from : null,
        gradient_to: typeof row.gradient_to === "string" ? row.gradient_to : null,
        layout_json: layoutJson as Record<string, unknown>,
        preview_url: previewUrl,
      };
    })
    .filter((template): template is RecipeLayoutTemplate => template !== null);

  return { templates };
}

export async function loadRecipe(supabase: SupabaseClient, recipeId: string): Promise<RecipeRecord> {
  const [{ data, error }, translations] = await Promise.all([
    supabase
      .from("recipes")
      .select("*")
      .eq("id", recipeId)
      .single(),
    loadRecipeTranslations(supabase, recipeId),
  ]);

  if (error || !data) {
    throw new Error(error?.message ?? "Recipe not found.");
  }

  return toRecipeRecord(data as RecipeRow, translations);
}

export async function createRecipe(supabase: SupabaseClient, payload: RecipePayload): Promise<RecipeRecord> {
  const parsed = recipePayloadSchema.parse(payload);
  await ensureUniqueSlug(supabase, parsed.slug);
  const publishDate = normalizePublishDate(parsed.publish_date);

  const { data, error } = await supabase
    .from("recipes")
    .insert({
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description,
      image_url: parsed.image_url,
      country: parsed.country,
      country_target_id: parsed.country_target_id,
      ingredients: parsed.ingredients,
      fact: parsed.fact,
      raccoon_caption: parsed.raccoon_caption,
      cooking_time: parsed.cooking_time,
      cooking_steps: parsed.cooking_steps,
      raccoon_advice: parsed.raccoon_advice,
      serving_instructions: parsed.serving_instructions,
      laplapla_interaction_caption: parsed.laplapla_interaction_caption,
      hashtags: parsed.hashtags,
      publish_date: publishDate,
      pinterest_status: parsed.pinterest_status,
      pinterest_description: parsed.pinterest_description,
      exported_image_urls: parsed.exported_image_urls,
      asset_set_key: parsed.asset_set_key,
      sticker_set_key: parsed.sticker_set_key,
      layout_json: parsed.layout_json,
      gradient_from: parsed.gradient_from,
      gradient_to: parsed.gradient_to,
      is_active: parsed.is_active,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create recipe.");
  }

  await saveRecipeTranslations(supabase, data.id, toSourcePayload(parsed), parsed.translations);
  await upsertRecipeSchedule(supabase, data.id, publishDate);

  return loadRecipe(supabase, data.id);
}

export async function updateRecipe(
  supabase: SupabaseClient,
  recipeId: string,
  payload: RecipePayload,
): Promise<RecipeRecord> {
  const parsed = recipePayloadSchema.parse(payload);
  await ensureUniqueSlug(supabase, parsed.slug, recipeId);
  const publishDate = normalizePublishDate(parsed.publish_date);

  const { error } = await supabase
    .from("recipes")
    .update({
      slug: parsed.slug,
      title: parsed.title,
      description: parsed.description,
      image_url: parsed.image_url,
      country: parsed.country,
      country_target_id: parsed.country_target_id,
      ingredients: parsed.ingredients,
      fact: parsed.fact,
      raccoon_caption: parsed.raccoon_caption,
      cooking_time: parsed.cooking_time,
      cooking_steps: parsed.cooking_steps,
      raccoon_advice: parsed.raccoon_advice,
      serving_instructions: parsed.serving_instructions,
      laplapla_interaction_caption: parsed.laplapla_interaction_caption,
      hashtags: parsed.hashtags,
      publish_date: publishDate,
      pinterest_status: parsed.pinterest_status,
      pinterest_description: parsed.pinterest_description,
      exported_image_urls: parsed.exported_image_urls,
      asset_set_key: parsed.asset_set_key,
      sticker_set_key: parsed.sticker_set_key,
      layout_json: parsed.layout_json,
      gradient_from: parsed.gradient_from,
      gradient_to: parsed.gradient_to,
      is_active: parsed.is_active,
    })
    .eq("id", recipeId);

  if (error) {
    throw new Error(`Failed to update recipe: ${error.message}`);
  }

  await saveRecipeTranslations(supabase, recipeId, toSourcePayload(parsed), parsed.translations);
  await upsertRecipeSchedule(supabase, recipeId, publishDate);

  return loadRecipe(supabase, recipeId);
}

export async function saveRecipeExportUrl(
  supabase: SupabaseClient,
  recipeId: string,
  language: "ru" | "en" | "he",
  publicUrl: string,
): Promise<RecipeRecord> {
  const current = await loadRecipe(supabase, recipeId);
  const exportedImageUrls = {
    ...current.exported_image_urls,
    [language]: publicUrl,
  };

  const { error } = await supabase
    .from("recipes")
    .update({
      exported_image_urls: exportedImageUrls,
      pinterest_status: current.pinterest_status === "draft" ? "exported" : current.pinterest_status,
    })
    .eq("id", recipeId);

  if (error) {
    throw new Error(`Failed to save recipe export URL: ${error.message}`);
  }

  return loadRecipe(supabase, recipeId);
}

export async function saveRecipeMediaUrl(
  supabase: SupabaseClient,
  recipeId: string,
  patch: {
    image_url?: string;
    asset_set_key?: string | null;
    sticker_set_key?: string | null;
  },
): Promise<RecipeRecord> {
  const { error } = await supabase
    .from("recipes")
    .update({
      ...(patch.image_url !== undefined ? { image_url: patch.image_url } : {}),
      ...(patch.asset_set_key !== undefined ? { asset_set_key: patch.asset_set_key } : {}),
      ...(patch.sticker_set_key !== undefined ? { sticker_set_key: patch.sticker_set_key } : {}),
    })
    .eq("id", recipeId);

  if (error) {
    throw new Error(`Failed to save recipe media URL: ${error.message}`);
  }

  return loadRecipe(supabase, recipeId);
}

export function handleRecipeValidationError(error: unknown) {
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
      error: error instanceof Error ? error.message : "Recipe request failed.",
    },
  };
}
