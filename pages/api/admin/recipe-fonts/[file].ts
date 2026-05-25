import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";

const ALLOWED_FONTS = new Set([
  "AmaticSC-Bold.ttf",
  "AmaticSC-Regular.ttf",
  "Caveat-VariableFont_wght.ttf",
  "Nunito-VariableFont_wght.ttf",
  "VarelaRound-Regular.ttf",
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  try {
    await requireAdminSession(req, res);
  } catch {
    return res.status(401).end();
  }

  const file = typeof req.query.file === "string" ? req.query.file : "";
  if (!ALLOWED_FONTS.has(file)) {
    return res.status(404).end();
  }

  const fontPath = path.join(process.cwd(), "assets", "fonts", file);
  const data = await fs.readFile(fontPath);
  res.setHeader("Content-Type", "font/ttf");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return res.status(200).send(data);
}
