import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listBedtimeStampAssets, syncBedtimeStampAssetsFromR2 } from "../../../../lib/server/bedtime-stories-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) || 80 : 80;
    if (req.query.sync !== "false") {
      await syncBedtimeStampAssetsFromR2(supabase);
    }
    const data = await listBedtimeStampAssets(supabase, limit);
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load bedtime stamps.";
    return res.status(500).json({ error: message });
  }
}
