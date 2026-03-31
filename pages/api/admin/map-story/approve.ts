import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminSession } from "@/lib/server/admin-session";
import { approveMapTargetStory } from "@/lib/server/mapTargets/storyAutomation";

const bodySchema = z.object({
  mapType: z.string().trim().min(1),
  targetId: z.string().trim().min(1),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const result = await approveMapTargetStory(supabase, body.mapType, body.targetId);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }

    const message = error instanceof Error ? error.message : "Failed to approve map story.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
