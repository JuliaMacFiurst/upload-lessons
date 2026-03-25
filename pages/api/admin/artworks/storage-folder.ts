import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { deleteArtworkStorageFolder } from "../../../../lib/server/artworks-admin";

type DeleteBody = {
  artists?: string[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  const body = (req.body ?? {}) as DeleteBody;
  const artists = Array.isArray(body.artists)
    ? body.artists.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  try {
    console.log("[api/admin/artworks/storage-folder] delete request", {
      bucket: "artworks",
      artists,
    });
    await Promise.all(artists.map((artist) => deleteArtworkStorageFolder(supabase, artist)));
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete storage folder.";
    console.error("[api/admin/artworks/storage-folder] error", error);
    return res.status(500).json({ error: message });
  }
}
