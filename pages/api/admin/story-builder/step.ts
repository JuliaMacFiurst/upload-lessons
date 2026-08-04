import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }

  res.setHeader("Allow", "POST");
  return res.status(410).json({
    error: "Deprecated route. Use /api/admin/story-builder/template for full template save.",
  });
}
