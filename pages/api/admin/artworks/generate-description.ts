import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { generateArtistDescription } from "../../../../lib/server/artworks-admin";

type Body = {
  title?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as Body;
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return res.status(400).json({ error: "Title is required." });
  }

  try {
    await requireAdminSession(req, res);
    const description = await generateArtistDescription(title);
    return res.status(200).json({ description });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate description.";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }
}
