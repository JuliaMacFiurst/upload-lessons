import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { listPublicR2Objects, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";
import { normalizeStorageSegment } from "../../../../../lib/server/sticker-assets";

type CreateFolderBody = {
  parentPrefix?: string;
  name?: string;
};

function normalizeFolderPrefix(value: string | undefined) {
  const prefix = (value ?? "").replace(/^\/+/, "").replace(/\/+/g, "/");
  return prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
}

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

  try {
    const body = (req.body ?? {}) as CreateFolderBody;
    const parentPrefix = normalizeFolderPrefix(body.parentPrefix);
    const folderName = normalizeStorageSegment(body.name ?? "");
    if (!folderName) {
      return res.status(400).json({ error: "Missing folder name." });
    }

    const prefix = `${parentPrefix}${folderName}/`;
    const existing = await listPublicR2Objects({ prefix, maxKeys: 1 });
    if (existing.objects.length > 0 || existing.folders.length > 0) {
      return res.status(409).json({ error: "Folder already exists." });
    }

    const key = `${prefix}.keep`;
    await uploadPublicR2Object({
      key,
      body: Buffer.from(""),
      contentType: "application/octet-stream",
    });

    return res.status(201).json({ ok: true, prefix, key });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create media folder.";
    return res.status(500).json({ error: message });
  }
}
