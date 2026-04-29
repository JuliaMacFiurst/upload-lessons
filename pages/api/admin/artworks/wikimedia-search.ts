import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "@/lib/server/admin-session";
import { searchWikimediaCandidates, type WikimediaSearchCandidate } from "@/lib/server/media/resolveMedia";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) {
    return res.status(400).json({ error: "Query is required." });
  }

  try {
    const candidates: WikimediaSearchCandidate[] = await searchWikimediaCandidates(query, 24);
    return res.status(200).json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Wikimedia images.";
    return res.status(500).json({ error: message });
  }
}
