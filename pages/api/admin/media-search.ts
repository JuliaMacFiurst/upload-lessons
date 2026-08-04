import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "@/lib/server/admin-session";
import { searchMedia } from "@/lib/server/media/searchMedia";
import type { MediaKind, MediaProvider } from "@/lib/media-search/types";

const SOURCES = new Set<MediaProvider>(["pexels", "wikimedia", "giphy"]);
const KINDS = new Set<MediaKind>(["image", "video"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode : 500;
    return res.status(status).json({ error: status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Server configuration error" });
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const source = typeof req.query.source === "string" ? req.query.source : "pexels";
  const kind = typeof req.query.kind === "string" ? req.query.kind : "image";
  const page = Math.max(1, Math.min(50, Number(req.query.cursor ?? "1") || 1));
  if (!query || query.length > 120) return res.status(400).json({ error: "Query must contain 1–120 characters." });
  if (!SOURCES.has(source as MediaProvider) || !KINDS.has(kind as MediaKind)) {
    return res.status(400).json({ error: "Invalid media source or kind." });
  }
  try {
    return res.status(200).json(await searchMedia({ query, source: source as MediaProvider, kind: kind as MediaKind, page }));
  } catch {
    return res.status(502).json({ error: "Не удалось загрузить медиа. Попробуйте ещё раз." });
  }
}
