import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { createArtwork, listArtworks } from "../../../../lib/server/artworks-admin";
import type { ArtworkEditorInput } from "../../../../lib/artworks/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const artworks = await listArtworks(supabase, q);
      return res.status(200).json({ artworks });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load artworks.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const artwork = await createArtwork(supabase, (req.body ?? {}) as ArtworkEditorInput);
    return res.status(201).json(artwork);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: error.issues[0]?.message ?? "Validation failed.",
        issues: error.issues,
      });
    }
    const message = error instanceof Error ? error.message : "Failed to create artwork.";
    return res.status(500).json({ error: message });
  }
}
