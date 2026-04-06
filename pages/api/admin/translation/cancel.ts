import type { NextApiRequest, NextApiResponse } from "next";
import { requestTranslationRunCancel } from "../../../../lib/server/translation-runner";
import { requireAdminSession } from "../../../../lib/server/admin-session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  const cancelled = requestTranslationRunCancel();
  if (!cancelled) {
    return res.status(409).json({ error: "No translation run is in progress." });
  }

  return res.status(200).json({ ok: true });
}
