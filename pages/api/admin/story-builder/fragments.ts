import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Allow", "POST");
  return res.status(410).json({
    error: "Deprecated route. Use /api/admin/story-builder/template for full template save.",
  });
}
