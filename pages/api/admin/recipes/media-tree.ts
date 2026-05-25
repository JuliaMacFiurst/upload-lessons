import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listPublicR2Objects } from "../../../../lib/server/r2-storage";

type MediaTreeNode = {
  prefix: string;
  label: string;
  children: MediaTreeNode[];
};

const ROOT_FOLDERS = ["bedtime_story/", "recipes/", "stickers/"];
const KNOWN_FOLDERS_BY_PREFIX: Record<string, string[]> = {
  "recipes/": [
    "recipes/assets/",
    "recipes/exports/",
    "recipes/recipes-pics/",
  ],
  "stickers/": [
    "stickers/capybara-stickers/",
    "stickers/raccoon-stickers/",
  ],
};

function folderLabel(prefix: string) {
  return prefix.split("/").filter(Boolean).pop() ?? "laplapla-public-media";
}

function mergeFolders(prefix: string, folders: string[]) {
  const requiredFolders = prefix ? KNOWN_FOLDERS_BY_PREFIX[prefix] ?? [] : ROOT_FOLDERS;
  return Array.from(new Set([...requiredFolders, ...folders])).sort((left, right) => left.localeCompare(right));
}

async function buildTree(prefix: string, depth: number, visited: Set<string>): Promise<MediaTreeNode> {
  if (visited.has(prefix)) {
    return { prefix, label: folderLabel(prefix), children: [] };
  }
  visited.add(prefix);

  if (depth <= 0) {
    return { prefix, label: folderLabel(prefix), children: [] };
  }

  const result = await listPublicR2Objects({
    prefix,
    delimiter: "/",
    maxKeys: 200,
  });
  const folders = mergeFolders(prefix, result.folders);
  const children = await Promise.all(
    folders.map((folder) => buildTree(folder, depth - 1, visited)),
  );

  return {
    prefix,
    label: prefix ? folderLabel(prefix) : "laplapla-public-media",
    children,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const depth = Math.max(1, Math.min(Number(req.query.depth ?? 6) || 6, 8));
    const tree = await buildTree("", depth, new Set());
    return res.status(200).json({ tree });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load media tree.";
    return res.status(500).json({ error: message });
  }
}
