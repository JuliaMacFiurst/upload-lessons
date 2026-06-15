import type { SupabaseClient } from "@supabase/supabase-js";
import { listAllPublicR2ObjectKeys } from "./r2-storage";

const STICKER_R2_PREFIXES = ["stickers/", "stickers-for-"];

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

export function isStickerSourcePath(path: string | null | undefined) {
  return /(^|\/)source\.webp$/i.test(path ?? "");
}

function isManagedStickerPath(path: string | null | undefined) {
  if (!path) {
    return false;
  }
  return STICKER_R2_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function listAllStickerR2ObjectKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const prefix of STICKER_R2_PREFIXES) {
    const prefixedKeys = await listAllPublicR2ObjectKeys(prefix);
    for (const key of prefixedKeys) {
      keys.add(key);
    }
  }
  return keys;
}

export async function upsertStickerAsset(supabase: SupabaseClient, input: StickerAssetInput) {
  if (isStickerSourcePath(input.storagePath)) {
    throw new Error("Source sheet files must not be saved as sticker assets.");
  }

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
  const existingKeys = await listAllStickerR2ObjectKeys();
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
      if (
        row.id &&
        row.storage_path &&
        isManagedStickerPath(row.storage_path) &&
        (isStickerSourcePath(row.storage_path) || !existingKeys.has(row.storage_path))
      ) {
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
