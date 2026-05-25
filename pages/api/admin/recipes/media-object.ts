import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { fetchPublicR2Object } from "../../../../lib/server/r2-storage";

function contentTypeForKey(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith(".apng")) return "image/apng";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function keyFromRequest(req: NextApiRequest) {
  const rawKey = typeof req.query.key === "string" ? req.query.key : "";
  if (rawKey) {
    return decodeURIComponent(rawKey).replace(/^\/+/, "").split("?")[0];
  }

  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
  if (!rawUrl) {
    return "";
  }

  const mediaBase = (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  const url = new URL(rawUrl);
  const base = new URL(mediaBase);
  if (url.host !== base.host) {
    throw new Error("Unsupported media host.");
  }
  return decodeURIComponent(url.pathname.replace(/^\/+/, "")).split("?")[0];
}

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

  try {
    const key = keyFromRequest(req);
    if (!key) {
      return res.status(400).json({ error: "Missing media key." });
    }

    const body = await fetchPublicR2Object(key);
    res.setHeader("Content-Type", contentTypeForKey(key));
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load media object.";
    return res.status(500).json({ error: message });
  }
}
