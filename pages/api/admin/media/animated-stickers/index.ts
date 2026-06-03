import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { normalizeStickerTags, normalizeStorageSegment, stickerTitleFromPath } from "../../../../../lib/server/sticker-assets";

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
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limit = typeof req.query.limit === "string" ? Math.min(200, Math.max(1, Number(req.query.limit) || 80)) : 80;
      let query = supabase
        .from("animated_sticker_assets")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (search) {
        query = query.or(`title.ilike.%${search}%,animation_url.ilike.%${search}%,storage_path.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to load animated stickers: ${error.message}`);
      }

      return res.status(200).json({ stickers: data ?? [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load animated stickers.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    try {
      const body = (req.body ?? {}) as AnimatedStickerBody;
      const animationUrl = body.animationUrl?.trim();
      if (!animationUrl) {
        return res.status(400).json({ error: "Missing animationUrl." });
      }

      const title = body.title?.trim() || stickerTitleFromPath(body.storagePath || animationUrl);
      const { data, error } = await supabase
        .from("animated_sticker_assets")
        .insert({
          title,
          slug: normalizeStorageSegment(title),
          tags: normalizeStickerTags(body.tags),
          animation_url: animationUrl,
          preview_url: body.previewUrl?.trim() || null,
          storage_path: body.storagePath?.trim() || null,
          preview_storage_path: body.previewStoragePath?.trim() || null,
          format: body.format?.trim() || null,
        })
        .select("*")
        .single();

      if (error) {
        throw new Error(`Failed to create animated sticker: ${error.message}`);
      }

      return res.status(201).json({ sticker: data });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create animated sticker.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
