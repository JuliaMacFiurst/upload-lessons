import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  importParrotMusicStylesFromCapybara,
  handleParrotMusicStyleValidationError,
} from "../../../../lib/server/parrot-music-styles-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const result = await importParrotMusicStylesFromCapybara(supabase);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const normalized = handleParrotMusicStyleValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
