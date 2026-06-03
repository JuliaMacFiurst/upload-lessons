import type { SupabaseClient } from "@supabase/supabase-js";
import { listAllPublicR2ObjectKeys } from "./r2-storage";

export type StickerAssetInput = {
  title: string;
  tags: string[];
  storagePath: string;
  publicUrl: string;
  setKey: string;
  sourcePath: string;
  sourceKind?: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  width: number;
  height: number;
};

export function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function normalizeStickerTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,|;/)
      : [];

  return Array.from(
    new Set(
      raw
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter(Boolean)
        .map((item) => item.replace(/^#/, ""))
        .map((item) => item.replace(/\s+/g, "-")),
    ),
  ).slice(0, 40);
}

export function stickerTitleFromPath(path: string) {
  const fileName = path.split("/").filter(Boolean).pop() ?? path;
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

export function extensionForPath(path: string) {
  return path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
}

export async function upsertStickerAsset(supabase: SupabaseClient, input: StickerAssetInput) {
  const title = input.title.trim() || stickerTitleFromPath(input.storagePath);
  const slug = normalizeStorageSegment(title) || normalizeStorageSegment(stickerTitleFromPath(input.storagePath));
  const tags = normalizeStickerTags(input.tags);

  const { data, error } = await supabase
    .from("sticker_assets")
    .upsert(
      {
        title,
        slug,
        tags,
        storage_path: input.storagePath,
        public_url: input.publicUrl,
        set_key: input.setKey || null,
        source_path: input.sourcePath || null,
        source_kind: input.sourceKind || "raccoon_sticker",
        crop: input.crop,
        width: input.width,
        height: input.height,
      },
      { onConflict: "storage_path" },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save sticker metadata: ${error.message}`);
  }

  return data;
}

export async function syncStickerAssetsWithR2(supabase: SupabaseClient) {
  const existingKeys = await listAllPublicR2ObjectKeys("stickers/");
  const staleIds: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("sticker_assets")
      .select("id,storage_path")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load sticker assets: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ id: string; storage_path: string | null }>;
    for (const row of rows) {
      if (row.id && row.storage_path && !existingKeys.has(row.storage_path)) {
        staleIds.push(row.id);
      }
    }

    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  for (let index = 0; index < staleIds.length; index += 200) {
    const ids = staleIds.slice(index, index + 200);
    const { error } = await supabase
      .from("sticker_assets")
      .delete()
      .in("id", ids);

    if (error) {
      throw new Error(`Failed to delete stale sticker assets: ${error.message}`);
    }
  }

  return {
    scannedR2Objects: existingKeys.size,
    deleted: staleIds.length,
  };
}
