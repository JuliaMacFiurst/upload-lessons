import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { listRecipeLayoutTemplates } from "../../../../lib/server/recipes-admin";

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
    const currentRecipeId = typeof req.query.currentRecipeId === "string" ? req.query.currentRecipeId : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) || 30 : 30;
    const data = await listRecipeLayoutTemplates(supabase, { currentRecipeId, limit });
    return res.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load recipe templates.";
    return res.status(500).json({ error: message });
  }
}
