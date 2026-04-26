import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  createParrotMusicStyle,
  handleParrotMusicStyleValidationError,
  listParrotMusicStyles,
} from "../../../../lib/server/parrot-music-styles-admin";
import type { ParrotMusicStylePayload } from "../../../../lib/parrot-music-styles/types";

type CreateBody = {
  style?: ParrotMusicStylePayload;
};

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
      const styles = await listParrotMusicStyles(supabase, q);
      return res.status(200).json({ styles });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load parrot music styles.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as CreateBody;
    if (!body.style) {
      return res.status(400).json({ error: "Missing style payload." });
    }

    const style = await createParrotMusicStyle(supabase, body.style);
    return res.status(201).json({ style });
  } catch (error) {
    const normalized = handleParrotMusicStyleValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
