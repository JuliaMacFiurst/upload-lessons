import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../../lib/server/admin-session";
import {
  deletePublicR2Object,
  fetchPublicR2Object,
  publicR2ObjectUrl,
  uploadPublicR2Object,
} from "../../../../../../lib/server/r2-storage";

type RestoreBody = {
  backupPath?: string;
  originalPath?: string;
  processedPath?: string;
};

function contentTypeForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".apng")) return "image/apng";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const assetId = typeof req.query.assetId === "string" ? req.query.assetId : "";
  if (!assetId) {
    return res.status(400).json({ error: "Missing assetId." });
  }

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
    const body = (req.body ?? {}) as RestoreBody;
    const backupPath = body.backupPath?.replace(/^\/+/, "");
    const originalPath = body.originalPath?.replace(/^\/+/, "");
    const processedPath = body.processedPath?.replace(/^\/+/, "");
    if (!backupPath || !originalPath || !backupPath.startsWith(".undo/sticker-assets/")) {
      return res.status(400).json({ error: "Missing undo backup." });
    }

    const backup = await fetchPublicR2Object(backupPath);
    await uploadPublicR2Object({
      key: originalPath,
      body: backup,
      contentType: contentTypeForPath(originalPath),
    });

    const { data: updated, error: updateError } = await supabase
      .from("sticker_assets")
      .update({
        storage_path: originalPath,
        public_url: publicR2ObjectUrl(originalPath),
      })
      .eq("id", assetId)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(`Failed to restore sticker asset: ${updateError.message}`);
    }

    await deletePublicR2Object(backupPath);
    if (processedPath && processedPath !== originalPath) {
      await deletePublicR2Object(processedPath);
    }
    return res.status(200).json({ sticker: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restore sticker background.";
    return res.status(500).json({ error: message });
  }
}
