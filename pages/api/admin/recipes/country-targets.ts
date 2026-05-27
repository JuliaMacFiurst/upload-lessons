import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";

type CountryTargetRow = {
  target_id: string;
  title_ru: string | null;
  title_en: string | null;
  title_he: string | null;
};

function escapeIlike(value: string) {
  return value.replace(/[%_,]/g, (match) => `\\${match}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(50, Math.max(1, typeof req.query.limit === "string" ? Number(req.query.limit) || 25 : 25));
    let request = supabase
      .from("map_targets")
      .select("target_id,title_ru,title_en,title_he")
      .eq("map_type", "country")
      .order("target_id")
      .limit(limit);

    if (query) {
      const pattern = `%${escapeIlike(query)}%`;
      request = request.or([
        `target_id.ilike.${pattern}`,
        `title_ru.ilike.${pattern}`,
        `title_en.ilike.${pattern}`,
        `title_he.ilike.${pattern}`,
      ].join(","));
    }

    const { data, error } = await request;
    if (error) {
      throw new Error(error.message);
    }

    return res.status(200).json({
      targets: ((data as CountryTargetRow[] | null) ?? []),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load country targets.";
    return res.status(500).json({ error: message });
  }
}
