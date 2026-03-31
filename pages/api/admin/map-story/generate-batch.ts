import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminSession } from "@/lib/server/admin-session";
import { generateMapTargetStoryBatchItem } from "@/lib/server/mapTargets/storyAutomation";

const bodySchema = z.object({
  targets: z
    .array(
      z.object({
        mapType: z.string().trim().min(1),
        targetId: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(50),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const results: Array<{ mapType: string; targetId: string; storyId: string; slidesCount: number }> = [];
    const failures: Array<{ mapType: string; targetId: string; error: string }> = [];

    for (const target of body.targets) {
      try {
        const generated = await generateMapTargetStoryBatchItem(
          supabase,
          target.mapType,
          target.targetId,
        );
        results.push({
          mapType: target.mapType,
          targetId: target.targetId,
          storyId: generated.storyId,
          slidesCount: generated.slidesCount,
        });
      } catch (error) {
        failures.push({
          mapType: target.mapType,
          targetId: target.targetId,
          error: error instanceof Error ? error.message : "Generation failed.",
        });
      }
    }

    return res.status(200).json({
      ok: failures.length === 0,
      total: body.targets.length,
      generated: results.length,
      failed: failures.length,
      results,
      failures,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }

    const message = error instanceof Error ? error.message : "Failed to run map story generation batch.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
