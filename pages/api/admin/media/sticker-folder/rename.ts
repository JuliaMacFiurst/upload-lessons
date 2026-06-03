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

type RenameFolderBody = {
  oldSetKey?: string;
  newSetKey?: string;
  basePrefix?: "stickers" | "stickers/raccoon-stickers";
};

function contentTypeForKey(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
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
    const body = (req.body ?? {}) as RenameFolderBody;
    const basePrefix = body.basePrefix === "stickers/raccoon-stickers" ? "stickers/raccoon-stickers" : "stickers";
    const oldSetKey = normalizeStorageSegment(body.oldSetKey ?? "");
    const newSetKey = normalizeStorageSegment(body.newSetKey ?? "");

    if (!oldSetKey || !newSetKey) {
      return res.status(400).json({ error: "Missing oldSetKey or newSetKey." });
    }
    if (oldSetKey === newSetKey) {
      return res.status(200).json({ ok: true, oldSetKey, newSetKey, moved: 0 });
    }

    const oldPrefix = `${basePrefix}/${oldSetKey}/`;
    const newPrefix = `${basePrefix}/${newSetKey}/`;
    const oldKeys = await listFolderKeys(oldPrefix);
    if (oldKeys.length === 0) {
      return res.status(404).json({ error: "Source folder is empty or does not exist." });
    }

    const existingNewKeys = await listFolderKeys(newPrefix);
    if (existingNewKeys.length > 0) {
      return res.status(409).json({ error: "Target folder already contains files." });
    }

    const movedKeys: Array<{ oldKey: string; newKey: string }> = [];
    for (const oldKey of oldKeys) {
      const newKey = `${newPrefix}${oldKey.slice(oldPrefix.length)}`;
      const buffer = await fetchPublicR2Object(oldKey);
      await uploadPublicR2Object({
        key: newKey,
        body: buffer,
        contentType: contentTypeForKey(oldKey),
      });
      movedKeys.push({ oldKey, newKey });
    }

    const { data: rows, error: loadError } = await supabase
      .from("sticker_assets")
      .select("id,storage_path,source_path")
      .like("storage_path", `${oldPrefix}%`);

    if (loadError) {
      throw new Error(`Failed to load sticker metadata: ${loadError.message}`);
    }

    for (const row of (rows ?? []) as Array<{ id: string; storage_path: string; source_path: string | null }>) {
      const storagePath = row.storage_path.replace(oldPrefix, newPrefix);
      const sourcePath = row.source_path?.startsWith(oldPrefix)
        ? row.source_path.replace(oldPrefix, newPrefix)
        : row.source_path;
      const { error: updateError } = await supabase
        .from("sticker_assets")
        .update({
          storage_path: storagePath,
          public_url: publicR2ObjectUrl(storagePath),
          source_path: sourcePath,
          set_key: newSetKey,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Failed to update sticker metadata: ${updateError.message}`);
      }
    }

    for (const item of movedKeys) {
      await deletePublicR2Object(item.oldKey);
    }

    return res.status(200).json({
      ok: true,
      oldSetKey,
      newSetKey,
      moved: movedKeys.length,
      basePrefix,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rename sticker folder.";
    return res.status(500).json({ error: message });
  }
}
