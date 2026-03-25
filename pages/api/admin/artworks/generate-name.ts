import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { generateArtistNameCandidates } from "../../../../lib/server/artworks-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
    const candidates = await generateArtistNameCandidates();
    return res.status(200).json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate artist names.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
