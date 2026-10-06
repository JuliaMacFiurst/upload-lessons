import type { NextApiRequest, NextApiResponse } from "next";
import { AdminSessionError, requireAdminSession } from "../../../../../lib/server/admin-session";
import { listCommerceOrders, normalizeCommerceFilters } from "../../../../../lib/server/commerce-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const supabase = await requireAdminSession(req, res);
    return res.status(200).json(await listCommerceOrders(supabase, normalizeCommerceFilters(req.query)));
  } catch (error) {
    const status = error instanceof AdminSessionError ? error.statusCode : 500;
    return res.status(status).json({ error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Unable to load orders" });
  }
}
