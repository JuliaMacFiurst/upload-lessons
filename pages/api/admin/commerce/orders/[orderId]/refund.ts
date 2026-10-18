import type { NextApiRequest, NextApiResponse } from "next";
import { AdminSessionError, requireAdminSession } from "../../../../../../lib/server/admin-session";
import { getRefundPreview, reconcileFullRefund, RefundError, startFullRefund } from "../../../../../../lib/server/commerce-refunds";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" });
  }
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
  if (!UUID.test(orderId)) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const db = await requireAdminSession(req, res);
    if (req.method === "GET") return res.status(200).json(await getRefundPreview(db, orderId));
    const origin = req.headers.origin;
    const host = req.headers.host;
    let parsedOrigin: URL | null = null;
    try { if (origin) parsedOrigin = new URL(origin); } catch { /* Reject malformed origin. */ }
    if (!parsedOrigin || !host || parsedOrigin.host !== host || (parsedOrigin.protocol !== "https:" && process.env.NODE_ENV === "production")) {
      return res.status(403).json({ error: "Invalid origin" });
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) return res.status(415).json({ error: "JSON required" });
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ error: "Invalid request" });
    if (body.action === "refund" && body.confirm === true && Object.keys(body).length === 2) {
      return res.status(200).json(await startFullRefund(db, orderId));
    }
    if (body.action === "reconcile" && typeof body.refundId === "string" && Object.keys(body).length === 2) {
      return res.status(200).json(await reconcileFullRefund(db, orderId, body.refundId));
    }
    return res.status(400).json({ error: "Invalid request" });
  } catch (error) {
    const status = error instanceof AdminSessionError ? error.statusCode : error instanceof RefundError ? error.httpStatus : 500;
    const code = error instanceof AdminSessionError ? status === 401 ? "unauthorized" : "forbidden" : error instanceof RefundError ? error.code : "refund_unavailable";
    return res.status(status).json({ error: code, ...(error instanceof RefundError && error.refundId ? { refundId: error.refundId } : {}) });
  }
}
