import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import {
  createSupabaseMapTranslationStore,
  insertValidatedMapTranslations,
  validateAndPrepareMapTranslationJson,
} from "@/lib/server/map-translations";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const action = req.body?.action;
  const json = req.body?.json;
  if (action !== "validate" && action !== "upload") {
    return res.status(400).json({ error: "action must be validate or upload." });
  }
  if (typeof json !== "string" || !json) {
    return res.status(400).json({ error: "json is required." });
  }

  const store = createSupabaseMapTranslationStore(supabase);
  try {
    // Upload deliberately repeats every validation against current database values.
    const prepared = await validateAndPrepareMapTranslationJson(json, store);
    const { report } = prepared;
    if (action === "validate" || !report.valid) {
      return res.status(200).json({ report, inserted: 0, repaired: prepared.repaired, repaired_json: prepared.canonicalJson });
    }
    const inserted = await insertValidatedMapTranslations(report, store);
    return res.status(201).json({ report, inserted });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : undefined;
    return res.status(code === "23505" ? 409 : 500).json({
      error: error instanceof Error ? error.message : "Translation import failed.",
      code: code === "23505" ? "DB_CONFLICT" : "IMPORT_FAILED",
    });
  }
}
