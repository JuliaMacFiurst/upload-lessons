import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../../lib/server/admin-session";
import {
  deletePublicR2Object,
  fetchPublicR2Object,
  publicR2ObjectUrl,
  uploadPublicR2Object,
} from "../../../../../../lib/server/r2-storage";
import { removeEdgeWhiteBackground } from "../../../../../../lib/server/media/removeWhiteBackground";

type RemoveWhiteBody = {
  intensity?: number;
};

function webpPathFor(path: string) {
  return path.replace(/\.[a-z0-9]+$/i, ".webp");
}

function backupPathFor(path: string, assetId: string) {
  const cleanId = assetId.replace(/[^a-z0-9-]/gi, "");
  const fileName = path.split("/").filter(Boolean).pop() ?? "sticker.webp";
  return `.undo/sticker-assets/${cleanId}-${Date.now()}-${fileName}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : "";
  if (!assetId) {
    return res.status(400).json({ error: "Missing assetId." });
  }

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
    const body = (req.body ?? {}) as RemoveWhiteBody;
    const { data: asset, error: loadError } = await supabase
      .from("sticker_assets")
      .select("*")
      .eq("id", assetId)
      .single();

    if (loadError) {
      throw new Error(`Failed to load sticker asset: ${loadError.message}`);
    }

    const storagePath = typeof asset?.storage_path === "string" ? asset.storage_path : "";
    if (!storagePath) {
      return res.status(400).json({ error: "Sticker asset has no storage_path." });
    }

    const original = await fetchPublicR2Object(storagePath);
    const backupPath = backupPathFor(storagePath, assetId);
    await uploadPublicR2Object({
      key: backupPath,
      body: original,
      contentType: "application/octet-stream",
    });

    const nextPath = webpPathFor(storagePath);
    const processed = await removeEdgeWhiteBackground(
      sharp(original, { limitInputPixels: 80_000_000 }).rotate(),
      body.intensity,
    );
    const publicUrl = await uploadPublicR2Object({
      key: nextPath,
      body: processed,
      contentType: "image/webp",
    });

    const { data: updated, error: updateError } = await supabase
      .from("sticker_assets")
      .update({
        storage_path: nextPath,
        public_url: publicUrl,
      })
      .eq("id", assetId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(`Failed to update sticker asset: ${updateError.message}`);
    }

    if (nextPath !== storagePath) {
      await deletePublicR2Object(storagePath);
    }

    return res.status(200).json({
      sticker: updated,
      backupPath,
      originalPath: storagePath,
      processedPath: nextPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove sticker background.";
    return res.status(500).json({ error: message });
  }
}
