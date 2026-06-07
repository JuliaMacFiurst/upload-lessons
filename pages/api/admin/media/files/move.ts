import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  deletePublicR2Object,
  fetchPublicR2Object,
  listPublicR2Objects,
  publicR2ObjectUrl,
  uploadPublicR2Object,
} from "../../../../../lib/server/r2-storage";

type MoveFilesBody = {
  keys?: string[];
  targetPrefix?: string;
};

function normalizeObjectKey(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+/g, "/");
}

function normalizeFolderPrefix(value: string | undefined) {
  const prefix = normalizeObjectKey(value ?? "");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

function fileNameFromKey(key: string) {
  return key.split("/").filter(Boolean).pop() ?? "";
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

async function objectExists(key: string) {
  const result = await listPublicR2Objects({ prefix: key, maxKeys: 1 });
  return result.objects.some((object) => object.key === key);
}

async function updateStickerAssetFile(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  oldKey: string,
  newKey: string,
) {
  const setKey = newKey.split("/").filter(Boolean).at(-2) ?? null;
  const { error: storageError } = await supabase
    .from("sticker_assets")
    .update({
      storage_path: newKey,
      public_url: publicR2ObjectUrl(newKey),
      set_key: setKey,
    })
    .eq("storage_path", oldKey);

  if (storageError) {
    throw new Error(`Failed to update sticker file metadata: ${storageError.message}`);
  }

  const { error: sourceError } = await supabase
    .from("sticker_assets")
    .update({ source_path: newKey })
    .eq("source_path", oldKey);

  if (sourceError) {
    throw new Error(`Failed to update sticker source metadata: ${sourceError.message}`);
  }
}

async function updateAnimatedStickerAssetFile(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  oldKey: string,
  newKey: string,
) {
  const { error: storageError } = await supabase
    .from("animated_sticker_assets")
    .update({
      storage_path: newKey,
      animation_url: publicR2ObjectUrl(newKey),
    })
    .eq("storage_path", oldKey);

  if (storageError) {
    throw new Error(`Failed to update animated sticker file metadata: ${storageError.message}`);
  }

  const { error: previewError } = await supabase
    .from("animated_sticker_assets")
    .update({
      preview_storage_path: newKey,
      preview_url: publicR2ObjectUrl(newKey),
    })
    .eq("preview_storage_path", oldKey);

  if (previewError) {
    throw new Error(`Failed to update animated sticker preview metadata: ${previewError.message}`);
  }
}

async function updateBedtimeStampAssetFile(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  oldKey: string,
  newKey: string,
) {
  const { error } = await supabase
    .from("bedtime_stamp_assets")
    .update({
      path: newKey,
      url: publicR2ObjectUrl(newKey),
    })
    .eq("path", oldKey);

  if (error) {
    throw new Error(`Failed to update bedtime stamp metadata: ${error.message}`);
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
    const body = (req.body ?? {}) as MoveFilesBody;
    const targetPrefix = normalizeFolderPrefix(body.targetPrefix);
    const keys = Array.from(new Set((body.keys ?? []).map(normalizeObjectKey).filter((key) => key && !key.endsWith("/")))).slice(0, 100);
    if (keys.length === 0) {
      return res.status(400).json({ error: "Missing files to move." });
    }

    const movePlan = keys
      .map((oldKey) => {
        const fileName = fileNameFromKey(oldKey);
        return fileName ? { oldKey, newKey: `${targetPrefix}${fileName}` } : null;
      })
      .filter((item): item is { oldKey: string; newKey: string } => item !== null)
      .filter((item) => item.oldKey !== item.newKey);

    if (movePlan.length === 0) {
      return res.status(200).json({ ok: true, moved: 0, files: [] });
    }

    const duplicateTarget = movePlan.find((item, index) =>
      movePlan.findIndex((candidate) => candidate.newKey === item.newKey) !== index
    );
    if (duplicateTarget) {
      return res.status(409).json({ error: `Duplicate target file name: ${fileNameFromKey(duplicateTarget.newKey)}.` });
    }

    for (const item of movePlan) {
      if (await objectExists(item.newKey)) {
        return res.status(409).json({ error: `Target file already exists: ${item.newKey}.` });
      }
    }

    const movedFiles: Array<{ oldKey: string; newKey: string }> = [];
    for (const item of movePlan) {
      const buffer = await fetchPublicR2Object(item.oldKey);
      await uploadPublicR2Object({
        key: item.newKey,
        body: buffer,
        contentType: contentTypeForKey(item.oldKey),
      });
      movedFiles.push(item);
    }

    for (const item of movedFiles) {
      await updateStickerAssetFile(supabase, item.oldKey, item.newKey);
      await updateAnimatedStickerAssetFile(supabase, item.oldKey, item.newKey);
      await updateBedtimeStampAssetFile(supabase, item.oldKey, item.newKey);
    }

    for (const item of movedFiles) {
      await deletePublicR2Object(item.oldKey);
    }

    return res.status(200).json({
      ok: true,
      targetPrefix,
      moved: movedFiles.length,
      files: movedFiles,
      skipped: keys.length - movedFiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to move media files.";
    return res.status(500).json({ error: message });
  }
}
