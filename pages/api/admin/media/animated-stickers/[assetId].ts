import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { normalizeStickerTags, normalizeStorageSegment } from "../../../../../lib/server/sticker-assets";

type AnimatedStickerBody = {
  title?: string;
  tags?: string[] | string;
  animationUrl?: string;
  previewUrl?: string;
  storagePath?: string;
  previewStoragePath?: string;
  format?: string;
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
      const body = (req.body ?? {}) as AnimatedStickerBody;
      const title = body.title?.trim();
      if (!title) {
        return res.status(400).json({ error: "Missing title." });
      }

      const { data, error } = await supabase
        .from("animated_sticker_assets")
        .update({
          title,
          slug: normalizeStorageSegment(title),
          tags: normalizeStickerTags(body.tags),
          animation_url: body.animationUrl?.trim() || null,
          preview_url: body.previewUrl?.trim() || null,
          storage_path: body.storagePath?.trim() || null,
          preview_storage_path: body.previewStoragePath?.trim() || null,
          format: body.format?.trim() || null,
        })
        .eq("id", assetId)
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to update animated sticker: ${error.message}`);
      }

      return res.status(200).json({ sticker: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update animated sticker.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { error } = await supabase
        .from("animated_sticker_assets")
        .delete()
        .eq("id", assetId);

      if (error) {
        throw new Error(`Failed to delete animated sticker: ${error.message}`);
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete animated sticker.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
