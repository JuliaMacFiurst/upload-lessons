import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { loadHumanTranslationPopulation } from "../../../../lib/server/human-translation-queue";
import {
  parseHumanTranslationJson,
  prepareHumanTranslationImport,
  validateHumanTranslationImport,
} from "../../../../lib/server/human-translation-import";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }

  try {
    const input = typeof req.body?.json === "string"
      ? parseHumanTranslationJson(req.body.json)
      : req.body?.batch;
    const population = await loadHumanTranslationPopulation(supabase);
    const action = req.body?.action === "save" ? "save" : "validate";
    if (action === "save") {
      const prepared = prepareHumanTranslationImport(input, population.sourceItems, population.translations);
      if (prepared.saveRows.length === 0) {
        return res.status(422).json({
          error: "No valid translation objects are ready to save.",
          preview: prepared.preview,
        });
      }
      if (prepared.preview.overwrite_objects > 0 && req.body?.confirmOverwrite !== true) {
        return res.status(409).json({
          error: `${prepared.preview.overwrite_objects} objects already have stored translations. Explicit overwrite confirmation is required.`,
          requiresOverwriteConfirmation: true,
          preview: prepared.preview,
        });
      }
      const updatedAt = new Date().toISOString();
      const { error: upsertError } = await supabase.from("content_translations").upsert(
        prepared.saveRows.map((row) => ({ ...row, updated_at: updatedAt })),
        { onConflict: "content_type,content_id,language" },
      );
      if (upsertError) {
        return res.status(500).json({ error: `Failed to save translations: ${upsertError.message}` });
      }

      const readyIndexSet = new Set(prepared.readyIndexes);
      const rawItems = input && typeof input === "object" && Array.isArray((input as { items?: unknown }).items)
        ? (input as { items: unknown[] }).items
        : [];
      const remainingItems = rawItems.filter((_item, index) => !readyIndexSet.has(index));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        preview: prepared.preview,
        savedObjects: prepared.preview.ready,
        savedRows: prepared.saveRows.length,
        remainingBatch: remainingItems.length > 0
          ? { contract_version: 1, items: remainingItems }
          : null,
      });
    }
    const preview = validateHumanTranslationImport(input, population.sourceItems, population.translations);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ preview });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof SyntaxError
        ? "The pasted text is not valid JSON."
        : error instanceof Error ? error.message : "Translation batch validation failed.",
    });
  }
}
