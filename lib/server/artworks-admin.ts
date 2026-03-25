import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildArtistDescriptionPrompt, buildArtistNameCandidatesPrompt } from "../ai/artworkGenerationProfile";
import { runGeminiJsonPrompt } from "./book-admin";
import {
  artworkEditorSchema,
  artworkRecordSchema,
  normalizeArtworkSlug,
  type ArtworkEditorInput,
  type ArtworkListItem,
  type ArtworkRecord,
} from "../artworks/types";

type ArtworkRow = {
  id: string;
  title: string;
  artist: string;
  description: string | null;
  category_slug: string;
  tags: string[] | null;
  image_url: unknown;
};

const artistCandidatesSchema = z.object({
  candidates: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
});

const artistDescriptionSchema = z.object({
  description: z.string().trim().min(20).max(800),
});

function normalizeImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function toArtworkRecord(row: ArtworkRow): ArtworkRecord {
  return artworkRecordSchema.parse({
    id: row.id,
    title: row.title,
    artist: row.artist,
    description: row.description,
    category_slug: row.category_slug,
    tags: row.tags ?? [],
    image_url: normalizeImageUrls(row.image_url),
  });
}

export async function listArtworks(supabase: SupabaseClient, query: string): Promise<ArtworkListItem[]> {
  const trimmed = query.trim();
  let builder = supabase
    .from("artworks")
    .select("id,title,artist,description,category_slug,tags,image_url")
    .order("title", { ascending: true })
    .limit(200);

  if (trimmed) {
    builder = builder.or(`title.ilike.%${trimmed}%,artist.ilike.%${trimmed}%,category_slug.ilike.%${trimmed}%`);
  }

  const { data, error } = await builder;
  if (error) {
    throw new Error(`Failed to load artworks: ${error.message}`);
  }

  return ((data as ArtworkRow[] | null) ?? []).map((row) => ({
    ...toArtworkRecord(row),
    description: row.description ?? null,
  }));
}

export async function loadArtwork(supabase: SupabaseClient, artworkId: string): Promise<ArtworkRecord> {
  const { data, error } = await supabase
    .from("artworks")
    .select("id,title,artist,description,category_slug,tags,image_url")
    .eq("id", artworkId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Artwork not found.");
  }

  return toArtworkRecord(data as ArtworkRow);
}

export async function createUniqueArtworkArtist(
  supabase: SupabaseClient,
  value: string,
  excludeId?: string,
): Promise<string> {
  const base = normalizeArtworkSlug(value);

  for (let index = 0; index < 200; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    let query = supabase.from("artworks").select("id").eq("artist", candidate).limit(1);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to check artwork slug: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return candidate;
    }
  }

  throw new Error("Failed to generate unique artwork slug.");
}

export async function createArtwork(
  supabase: SupabaseClient,
  payload: ArtworkEditorInput,
): Promise<ArtworkRecord> {
  const parsed = artworkEditorSchema.parse(payload);

  const { data, error } = await supabase
    .from("artworks")
    .insert({
      title: parsed.title,
      artist: parsed.artist,
      description: parsed.description || null,
      category_slug: parsed.category_slug,
      tags: parsed.tags,
      image_url: parsed.image_url,
    })
    .select("id,title,artist,description,category_slug,tags,image_url")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create artwork.");
  }

  return toArtworkRecord(data as ArtworkRow);
}

export async function updateArtwork(
  supabase: SupabaseClient,
  artworkId: string,
  payload: ArtworkEditorInput,
): Promise<ArtworkRecord> {
  const parsed = artworkEditorSchema.parse(payload);

  const { data, error } = await supabase
    .from("artworks")
    .update({
      title: parsed.title,
      artist: parsed.artist,
      description: parsed.description || null,
      category_slug: parsed.category_slug,
      tags: parsed.tags,
      image_url: parsed.image_url,
    })
    .eq("id", artworkId)
    .select("id,title,artist,description,category_slug,tags,image_url")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update artwork.");
  }

  return toArtworkRecord(data as ArtworkRow);
}

export async function deleteArtworkStorageFolder(supabase: SupabaseClient, artist: string): Promise<void> {
  const bucket = "artworks";
  const normalizedArtist = normalizeArtworkSlug(artist);

  console.log("[artworks.storage] list folder", {
    bucket,
    path: normalizedArtist,
  });

  const { data, error } = await supabase.storage.from(bucket).list(normalizedArtist, { limit: 1000 });
  if (error) {
    console.error("[artworks.storage] list error", {
      bucket,
      path: normalizedArtist,
      error,
    });
    throw new Error(`Failed to list storage folder ${normalizedArtist}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return;
  }

  const filePaths = data
    .filter((item) => Boolean(item.name))
    .map((item) => `${normalizedArtist}/${item.name}`);

  if (filePaths.length === 0) {
    return;
  }

  const { error: removeError } = await supabase.storage.from(bucket).remove(filePaths);
  if (removeError) {
    console.error("[artworks.storage] remove error", {
      bucket,
      path: normalizedArtist,
      filePaths,
      error: removeError,
    });
    throw new Error(`Failed to delete storage files: ${removeError.message}`);
  }
}

export async function deleteArtwork(supabase: SupabaseClient, artworkId: string): Promise<void> {
  const current = await loadArtwork(supabase, artworkId);
  await deleteArtworkStorageFolder(supabase, current.artist);

  const { error } = await supabase.from("artworks").delete().eq("id", artworkId);
  if (error) {
    throw new Error(`Failed to delete artwork: ${error.message}`);
  }
}

export async function generateArtistNameCandidates() {
  const raw = await runGeminiJsonPrompt<unknown>(buildArtistNameCandidatesPrompt());
  return artistCandidatesSchema.parse(raw).candidates;
}

export async function generateArtistDescription(title: string) {
  const raw = await runGeminiJsonPrompt<unknown>(buildArtistDescriptionPrompt(title));
  return artistDescriptionSchema.parse(raw).description;
}
