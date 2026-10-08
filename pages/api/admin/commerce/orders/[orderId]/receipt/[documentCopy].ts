import type { NextApiRequest, NextApiResponse } from "next";
import { AdminSessionError, requireAdminSession } from "../../../../../../../lib/server/admin-session";
import { downloadCommerceReceiptArtifact } from "../../../../../../../lib/server/commerce-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
  const documentCopy = typeof req.query.documentCopy === "string" ? req.query.documentCopy : "";
  if (!UUID.test(orderId)) return res.status(400).json({ error: "Invalid order ID" });
  if (documentCopy !== "original" && documentCopy !== "copy") return res.status(400).json({ error: "Invalid document copy" });
  try {
    const supabase = await requireAdminSession(req, res);
    const result = await downloadCommerceReceiptArtifact(supabase, orderId, documentCopy);
    if (result.status !== "ready") {
      const notFound = result.status === "receipt_not_found" || result.status === "artifact_not_found";
      return res.status(notFound ? 404 : 409).json({ error: notFound ? "Receipt PDF not found" : "Receipt PDF is not ready" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.fileName}"`);
    res.setHeader("Content-Length", String(result.bytes.byteLength));
    return res.status(200).send(result.bytes);
  } catch (error) {
    const status = error instanceof AdminSessionError ? error.statusCode : 500;
    return res.status(status).json({ error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Unable to download receipt PDF" });
  }
}
