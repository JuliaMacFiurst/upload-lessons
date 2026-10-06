import type { NextApiRequest, NextApiResponse } from "next";
import { AdminSessionError, requireAdminSession } from "../../../../../lib/server/admin-session";
import { getCommerceOrderDetail } from "../../../../../lib/server/commerce-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const id = typeof req.query.orderId === "string" ? req.query.orderId : "";
  if (!UUID.test(id)) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const supabase = await requireAdminSession(req, res);
    const order = await getCommerceOrderDetail(supabase, id);
    return order ? res.status(200).json(order) : res.status(404).json({ error: "Order not found" });
  } catch (error) {
    const status = error instanceof AdminSessionError ? error.statusCode : 500;
    return res.status(status).json({ error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Unable to load order" });
  }
}
