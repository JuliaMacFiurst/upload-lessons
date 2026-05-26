import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";

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
  if (!/^[a-z0-9._-]+\.ttf$/i.test(file)) {
    return res.status(404).end();
  }

  const fontPath = path.join(process.cwd(), "assets", "fonts", file);
  let data: Buffer;
  try {
    data = await fs.readFile(fontPath);
  } catch {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", "font/ttf");
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return res.status(200).send(data);
}
