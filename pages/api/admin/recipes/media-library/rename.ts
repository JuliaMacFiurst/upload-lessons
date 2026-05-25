import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { deletePublicR2Object, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

const ALLOWED_TAGS = new Set([
  "asset",
  "decor",
  "food",
  "frame",
  "label",
  "line",
  "logo",
  "ribbon",
  "star",
  "sticker",
]);

type RenameBody = {
  key?: string;
  name?: string;
  tag?: string;
  deleteOriginal?: boolean;
};

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extensionForKey(key: string) {
  const match = key.match(/(\.[a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? ".webp";
}

function contentTypeForExtension(extension: string) {
  switch (extension) {
    case ".apng":
      return "image/apng";
    case ".avif":
      return "image/avif";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function publicMediaUrl(path: string) {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base) {
    throw new Error("Missing R2_PUBLIC_URL.");
  }
  return `${base}/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
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
    const body = (req.body ?? {}) as RenameBody;
    const key = body.key?.replace(/^\/+/, "");
    if (!key || key.endsWith("/")) {
      return res.status(400).json({ error: "Missing key." });
    }

    const currentFileName = key.split("/").pop() ?? "";
    if (currentFileName === "source.webp") {
      return res.status(400).json({ error: "Source sheet лучше не переименовывать." });
    }

    const tag = normalizeStorageSegment(body.tag ?? "");
    if (tag && !ALLOWED_TAGS.has(tag)) {
      return res.status(400).json({ error: "Unsupported asset tag." });
    }

    const extension = extensionForKey(key);
    const currentName = normalizeStorageSegment(currentFileName.replace(/\.[a-z0-9]+$/i, ""));
    const cleanName = normalizeStorageSegment(body.name || currentName);
    if (!cleanName) {
      return res.status(400).json({ error: "Missing new name." });
    }

    const folder = key.split("/").slice(0, -1).join("/");
    const taggedName = tag && !cleanName.startsWith(`${tag}-`) ? `${tag}-${cleanName}` : cleanName;
    const nextKey = `${folder}/${taggedName}${extension}`;

    if (nextKey === key) {
      return res.status(200).json({
        ok: true,
        key,
        publicUrl: publicMediaUrl(key),
      });
    }

    const sourceResponse = await fetch(publicMediaUrl(key), { cache: "no-store" });
    if (!sourceResponse.ok) {
      throw new Error(`Failed to load source object (${sourceResponse.status}).`);
    }

    const publicUrl = await uploadPublicR2Object({
      key: nextKey,
      body: Buffer.from(await sourceResponse.arrayBuffer()),
      contentType: sourceResponse.headers.get("content-type") || contentTypeForExtension(extension),
    });

    if (body.deleteOriginal !== false) {
      await deletePublicR2Object(key);
    }

    return res.status(200).json({
      ok: true,
      key: nextKey,
      oldKey: key,
      publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rename media object.";
    return res.status(500).json({ error: message });
  }
}
