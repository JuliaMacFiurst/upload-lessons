import type { NextApiRequest, NextApiResponse } from "next";
import { buildAdminAnalytics, normalizeAnalyticsPeriod } from "../../../../lib/server/admin-analytics";
import { requireAdminSession } from "../../../../lib/server/admin-session";

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
    const data = await buildAdminAnalytics(supabase, normalizeAnalyticsPeriod(req.query.period));
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics.";
    return res.status(500).json({ error: message });
  }
}
