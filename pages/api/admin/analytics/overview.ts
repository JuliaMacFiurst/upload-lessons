import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "node:crypto";
import { buildAdminAnalytics, normalizeAnalyticsPeriod } from "../../../../lib/server/admin-analytics";
import { AdminSessionError, requireAdminSession } from "../../../../lib/server/admin-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestId = randomUUID();
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Request-ID", requestId);

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const status = error instanceof AdminSessionError ? error.statusCode : 500;
    console.error("[admin-analytics] access failed", { requestId, status });
    return res.status(status).json({
      error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Не удалось загрузить аналитику",
      requestId,
    });
  }

  try {
    const data = await buildAdminAnalytics(supabase, normalizeAnalyticsPeriod(req.query.period));
    return res.status(200).json(data);
  } catch (error) {
    console.error("[admin-analytics] query failed", {
      requestId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return res.status(500).json({ error: "Не удалось загрузить аналитику", requestId });
  }
}
