import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../../lib/server/admin-session";
import {
  deletePublicR2Object,
  fetchPublicR2Object,
  uploadPublicR2Object,
} from "../../../../../../lib/server/r2-storage";
import { extensionForPath } from "../../../../../../lib/server/sticker-assets";

function webpPathFor(path: string) {
  return path.replace(/\.[a-z0-9]+$/i, ".webp");
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
    if (extensionForPath(storagePath) === "webp") {
      return res.status(200).json({ sticker: asset, converted: false });
    }

    const nextPath = webpPathFor(storagePath);
    const source = await fetchPublicR2Object(storagePath);
    const webp = await sharp(source, { limitInputPixels: 80_000_000 })
      .rotate()
      .webp({ quality: 92, alphaQuality: 95 })
      .toBuffer();
    const publicUrl = await uploadPublicR2Object({
      key: nextPath,
      body: webp,
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

    await deletePublicR2Object(storagePath);
    return res.status(200).json({ sticker: updated, converted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to convert sticker asset.";
    return res.status(500).json({ error: message });
  }
}
