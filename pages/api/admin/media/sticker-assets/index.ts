import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = typeof req.query.limit === "string" ? Math.min(200, Math.max(1, Number(req.query.limit) || 80)) : 80;
    let query = supabase
      .from("sticker_assets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (search) {
      query = query.or(`title.ilike.%${search}%,storage_path.ilike.%${search}%,set_key.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load sticker assets: ${error.message}`);
    }

    return res.status(200).json({ stickers: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sticker assets.";
    return res.status(500).json({ error: message });
  }
}
