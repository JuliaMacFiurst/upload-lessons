import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  deletePublicR2Object,
  fetchPublicR2Object,
  listPublicR2Objects,
  publicR2ObjectUrl,
  uploadPublicR2Object,
} from "../../../../../lib/server/r2-storage";
import { normalizeStorageSegment } from "../../../../../lib/server/sticker-assets";

type MoveFolderBody = {
  sourcePrefix?: string;
  targetParentPrefix?: string;
  newName?: string;
};

function normalizeFolderPrefix(value: string | undefined) {
  const prefix = (value ?? "").replace(/^\/+/, "").replace(/\/+/g, "/");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function folderNameFromPrefix(prefix: string) {
  return prefix.split("/").filter(Boolean).pop() ?? "";
}

function contentTypeForKey(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".apng")) return "image/apng";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function listFolderKeys(prefix: string) {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await listPublicR2Objects({
      prefix,
      continuationToken,
      maxKeys: 500,
    });
    keys.push(...result.objects.map((object) => object.key));
    continuationToken = result.nextContinuationToken ?? undefined;
  } while (continuationToken);

  return keys;
}

async function updateStickerAssets(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  sourcePrefix: string,
  targetPrefix: string,
) {
  const { data: rows, error } = await supabase
    .from("sticker_assets")
    .select("id,storage_path,source_path")
    .or(`storage_path.like.${sourcePrefix}%,source_path.like.${sourcePrefix}%`);

  if (error) {
    throw new Error(`Failed to load sticker metadata: ${error.message}`);
  }

  for (const row of (rows ?? []) as Array<{ id: string; storage_path: string | null; source_path: string | null }>) {
    const storagePath = row.storage_path?.startsWith(sourcePrefix)
      ? row.storage_path.replace(sourcePrefix, targetPrefix)
      : row.storage_path;
    const sourcePath = row.source_path?.startsWith(sourcePrefix)
      ? row.source_path.replace(sourcePrefix, targetPrefix)
      : row.source_path;
    const setKey = storagePath?.split("/").filter(Boolean).at(-2) ?? null;
    const { error: updateError } = await supabase
      .from("sticker_assets")
      .update({
        storage_path: storagePath,
        public_url: storagePath ? publicR2ObjectUrl(storagePath) : null,
        source_path: sourcePath,
        set_key: setKey,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update sticker metadata: ${updateError.message}`);
    }
  }
}

async function updateAnimatedStickerAssets(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  sourcePrefix: string,
  targetPrefix: string,
) {
  const { data: rows, error } = await supabase
    .from("animated_sticker_assets")
    .select("id,storage_path,preview_storage_path,animation_url,preview_url")
    .or(`storage_path.like.${sourcePrefix}%,preview_storage_path.like.${sourcePrefix}%`);

  if (error) {
    throw new Error(`Failed to load animated sticker metadata: ${error.message}`);
  }

  for (const row of (rows ?? []) as Array<{
    id: string;
    storage_path: string | null;
    preview_storage_path: string | null;
    animation_url: string | null;
    preview_url: string | null;
  }>) {
    const storageMoved = row.storage_path?.startsWith(sourcePrefix) === true;
    const previewMoved = row.preview_storage_path?.startsWith(sourcePrefix) === true;
    const storagePath = row.storage_path?.startsWith(sourcePrefix)
      ? row.storage_path.replace(sourcePrefix, targetPrefix)
      : row.storage_path;
    const previewStoragePath = row.preview_storage_path?.startsWith(sourcePrefix)
      ? row.preview_storage_path.replace(sourcePrefix, targetPrefix)
      : row.preview_storage_path;
    const { error: updateError } = await supabase
      .from("animated_sticker_assets")
      .update({
        storage_path: storagePath,
        preview_storage_path: previewStoragePath,
        animation_url: storageMoved && storagePath ? publicR2ObjectUrl(storagePath) : row.animation_url,
        preview_url: previewMoved && previewStoragePath ? publicR2ObjectUrl(previewStoragePath) : row.preview_url,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update animated sticker metadata: ${updateError.message}`);
    }
  }
}

async function updateBedtimeStampAssets(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  sourcePrefix: string,
  targetPrefix: string,
) {
  const { data: rows, error } = await supabase
    .from("bedtime_stamp_assets")
    .select("id,path")
    .like("path", `${sourcePrefix}%`);

  if (error) {
    throw new Error(`Failed to load bedtime stamp metadata: ${error.message}`);
  }

  for (const row of (rows ?? []) as Array<{ id: string; path: string | null }>) {
    const path = row.path?.startsWith(sourcePrefix)
      ? row.path.replace(sourcePrefix, targetPrefix)
      : row.path;
    const { error: updateError } = await supabase
      .from("bedtime_stamp_assets")
      .update({
        path,
        url: path ? publicR2ObjectUrl(path) : null,
      })
      .eq("id", row.id);

    if (updateError) {
      throw new Error(`Failed to update bedtime stamp metadata: ${updateError.message}`);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as MoveFolderBody;
    const sourcePrefix = normalizeFolderPrefix(body.sourcePrefix);
    const targetParentPrefix = normalizeFolderPrefix(body.targetParentPrefix);
    const sourceName = normalizeStorageSegment(folderNameFromPrefix(sourcePrefix));
    const targetName = normalizeStorageSegment(body.newName ?? "") || sourceName;

    if (!sourcePrefix || !sourceName || !targetName) {
      return res.status(400).json({ error: "Missing source folder." });
    }

    const targetPrefix = `${targetParentPrefix}${targetName}/`;
    if (sourcePrefix === targetPrefix) {
      return res.status(200).json({ ok: true, sourcePrefix, targetPrefix, moved: 0 });
    }
    if (targetPrefix.startsWith(sourcePrefix)) {
      return res.status(400).json({ error: "Cannot move a folder into itself." });
    }

    const sourceKeys = await listFolderKeys(sourcePrefix);
    if (sourceKeys.length === 0) {
      return res.status(404).json({ error: "Source folder is empty or does not exist." });
    }

    const existingTargetKeys = await listFolderKeys(targetPrefix);
    if (existingTargetKeys.length > 0) {
      return res.status(409).json({ error: "Target folder already contains files." });
    }

    const movedKeys: Array<{ oldKey: string; newKey: string }> = [];
    for (const oldKey of sourceKeys) {
      const newKey = `${targetPrefix}${oldKey.slice(sourcePrefix.length)}`;
      const buffer = await fetchPublicR2Object(oldKey);
      await uploadPublicR2Object({
        key: newKey,
        body: buffer,
        contentType: contentTypeForKey(oldKey),
      });
      movedKeys.push({ oldKey, newKey });
    }

    await updateStickerAssets(supabase, sourcePrefix, targetPrefix);
    await updateAnimatedStickerAssets(supabase, sourcePrefix, targetPrefix);
    await updateBedtimeStampAssets(supabase, sourcePrefix, targetPrefix);

    for (const item of movedKeys) {
      await deletePublicR2Object(item.oldKey);
    }

    return res.status(200).json({
      ok: true,
      sourcePrefix,
      targetPrefix,
      moved: movedKeys.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move media folder.";
    return res.status(500).json({ error: message });
  }
}
