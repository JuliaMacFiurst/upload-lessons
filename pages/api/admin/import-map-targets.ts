import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "@/lib/server/admin-session";
import { importAllMaps } from "@/lib/server/mapTargets/importMapTargets";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await importAllMaps();
    return res.status(200).json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import map targets.";
    return res.status(500).json({ error: message });
  }
}
