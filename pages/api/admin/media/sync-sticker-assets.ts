import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listAllPublicR2ObjectKeys } from "../../../../lib/server/r2-storage";

async function syncStickerAssetsWithR2Inline(supabase: Awaited<ReturnType<typeof requireAdminSession>>) {
  const existingKeys = await listAllPublicR2ObjectKeys("stickers/");
  const staleIds: string[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("sticker_assets")
      .select("id,storage_path")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load sticker assets: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{ id: string; storage_path: string | null }>;
    for (const row of rows) {
      if (row.id && row.storage_path && !existingKeys.has(row.storage_path)) {
        staleIds.push(row.id);
      }
    }

    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  for (let index = 0; index < staleIds.length; index += 200) {
    const ids = staleIds.slice(index, index + 200);
    const { error } = await supabase
      .from("sticker_assets")
      .delete()
      .in("id", ids);

    if (error) {
      throw new Error(`Failed to delete stale sticker assets: ${error.message}`);
    }
  }

  return {
    scannedR2Objects: existingKeys.size,
    deleted: staleIds.length,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const result = await syncStickerAssetsWithR2Inline(supabase);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync sticker assets.";
    return res.status(500).json({ error: message });
  }
}
