import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  deleteParrotMusicStyle,
  handleParrotMusicStyleValidationError,
  loadParrotMusicStyle,
  updateParrotMusicStyle,
} from "../../../../lib/server/parrot-music-styles-admin";
import type { ParrotMusicStylePayload } from "../../../../lib/parrot-music-styles/types";

type SaveBody = {
  style?: ParrotMusicStylePayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const styleId = typeof req.query.styleId === "string" ? req.query.styleId : "";
  if (!styleId) {
    return res.status(400).json({ error: "Missing `styleId`." });
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
      const style = await loadParrotMusicStyle(supabase, styleId);
      return res.status(200).json({ style });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load parrot music style.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteParrotMusicStyle(supabase, styleId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete parrot music style.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as SaveBody;
    if (!body.style) {
      return res.status(400).json({ error: "Missing style payload." });
    }

    const style = await updateParrotMusicStyle(supabase, styleId, body.style);
    return res.status(200).json({ ok: true, style });
  } catch (error) {
    const normalized = handleParrotMusicStyleValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
