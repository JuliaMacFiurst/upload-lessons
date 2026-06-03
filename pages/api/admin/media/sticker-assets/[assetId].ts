import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { deletePublicR2Object } from "../../../../../lib/server/r2-storage";
import { normalizeStickerTags, normalizeStorageSegment } from "../../../../../lib/server/sticker-assets";

type UpdateBody = {
  title?: string;
  tags?: string[] | string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : "";
  if (!assetId) {
    return res.status(400).json({ error: "Missing assetId." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "PATCH") {
    try {
      const body = (req.body ?? {}) as UpdateBody;
      const title = body.title?.trim();
      if (!title) {
        return res.status(400).json({ error: "Missing title." });
      }

      const { data, error } = await supabase
        .from("sticker_assets")
        .update({
          title,
          slug: normalizeStorageSegment(title),
          tags: normalizeStickerTags(body.tags),
        })
        .eq("id", assetId)
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to update sticker asset: ${error.message}`);
      }

      return res.status(200).json({ sticker: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update sticker asset.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { data, error: loadError } = await supabase
        .from("sticker_assets")
        .select("storage_path")
        .eq("id", assetId)
        .single();

      if (loadError) {
        throw new Error(`Failed to load sticker asset: ${loadError.message}`);
      }

      const storagePath = typeof data?.storage_path === "string" ? data.storage_path : "";
      if (storagePath) {
        await deletePublicR2Object(storagePath);
      }

      const { error: deleteError } = await supabase
        .from("sticker_assets")
        .delete()
        .eq("id", assetId);

      if (deleteError) {
        throw new Error(`Failed to delete sticker asset: ${deleteError.message}`);
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete sticker asset.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
