import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listPublicR2Objects } from "../../../../lib/server/r2-storage";

const IMAGE_EXTENSIONS = new Set([".apng", ".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const ROOT_FOLDERS = ["bedtime_story/", "recipes/", "stickers/", "stickers-for-laplapla-song/"];
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

function isImageKey(key: string) {
  const lower = key.toLowerCase();
  return Array.from(IMAGE_EXTENSIONS).some((extension) => lower.endsWith(extension));
}

function mergeFolders(prefix: string, folders: string[]) {
  const requiredFolders = prefix ? KNOWN_FOLDERS_BY_PREFIX[prefix] ?? [] : ROOT_FOLDERS;
  return Array.from(new Set([...requiredFolders, ...folders])).sort((left, right) => left.localeCompare(right));
}

async function listAllFolderPrefixes(prefix: string) {
  const folders: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await listPublicR2Objects({
      prefix,
      delimiter: "/",
      continuationToken,
      maxKeys: 500,
    });
    folders.push(...result.folders);
    continuationToken = result.nextContinuationToken ?? undefined;
  } while (continuationToken);

  return folders;
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
    const prefix = typeof req.query.prefix === "string" ? req.query.prefix.replace(/^\/+/, "") : "";
    const continuationToken = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const [result, allFolders] = await Promise.all([
      listPublicR2Objects({
      prefix,
      delimiter: "/",
      continuationToken,
      maxKeys: 200,
      }),
      listAllFolderPrefixes(prefix),
    ]);

    return res.status(200).json({
      ...result,
      folders: mergeFolders(prefix, allFolders),
      objects: result.objects.filter((object) => isImageKey(object.key)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load media library.";
    return res.status(500).json({ error: message });
  }
}
