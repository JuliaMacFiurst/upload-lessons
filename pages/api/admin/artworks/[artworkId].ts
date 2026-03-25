import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { deleteArtwork, loadArtwork, updateArtwork } from "../../../../lib/server/artworks-admin";
import type { ArtworkEditorInput } from "../../../../lib/artworks/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const artworkId = typeof req.query.artworkId === "string" ? req.query.artworkId : "";

  if (!artworkId) {
    return res.status(400).json({ error: "Missing `artworkId`." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const artwork = await loadArtwork(supabase, artworkId);
      return res.status(200).json(artwork);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load artwork.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method === "POST") {
    try {
      const artwork = await updateArtwork(supabase, artworkId, (req.body ?? {}) as ArtworkEditorInput);
      return res.status(200).json(artwork);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: error.issues[0]?.message ?? "Validation failed.",
          issues: error.issues,
        });
      }
      const message = error instanceof Error ? error.message : "Failed to save artwork.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteArtwork(supabase, artworkId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete artwork.";
      return res.status(500).json({ error: message });
    }
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
