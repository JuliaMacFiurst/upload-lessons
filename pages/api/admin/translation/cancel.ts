import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import { requestTranslationRunCancel } from "../../../../lib/server/translation-runner";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cancelled = requestTranslationRunCancel();
  if (!cancelled) {
    return res.status(409).json({ error: "No translation run is in progress." });
  }

  return res.status(200).json({ ok: true });
}
