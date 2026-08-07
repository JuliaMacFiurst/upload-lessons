import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminSession } from "@/lib/server/admin-session";
import { runCanonicalMapStoryBatch } from "@/lib/server/mapContentWriter/batchRunner";

const bodySchema = z.object({
  requestedCount: z.number().int().min(1).max(100).optional(),
  mapTypeFilter: z.string().trim().optional(),
  dryRunOnly: z.boolean().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});

    const batchReport = await runCanonicalMapStoryBatch(
      {
        requestedCount: body.requestedCount ?? 50,
        mapTypeFilter: body.mapTypeFilter,
        dryRunOnly: body.dryRunOnly,
        operation: "generation",
      },
      supabase
    );

    return res.status(200).json({
      ok: true,
      batchId: batchReport.batchId,
      requested: batchReport.requested,
      inserted: batchReport.inserted,
      rejected: batchReport.rejected,
      duplicate: batchReport.duplicate,
      dbErrors: batchReport.dbErrors,
      durationMs: batchReport.durationMs,
      queueBeforeCount: batchReport.queueBeforeCount,
      queueAfterCount: batchReport.queueAfterCount,
      results: batchReport.stagedWriteResults.itemResults,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }

    const message = error instanceof Error ? error.message : "Failed to run map story generation batch.";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }
}
