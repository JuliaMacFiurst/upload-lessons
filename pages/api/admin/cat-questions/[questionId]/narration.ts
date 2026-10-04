import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { voiceProcessingSettingsSchema } from "../../../../../lib/cat-questions/production";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import { saveFinalSlideNarration } from "../../../../../lib/server/cat-question-production";
import { deletePublicR2Object, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

export const config = {
  api: { bodyParser: { sizeLimit: "22mb" } },
};

const bodySchema = z.object({
  slideId: z.string().uuid(),
  locale: z.string(),
  audioBase64: z.string().min(1),
  mimeType: z.string(),
  processingSettings: voiceProcessingSettingsSchema,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const questionId = typeof req.query.questionId === "string" ? req.query.questionId : "";
  if (!questionId) return res.status(400).json({ error: "Missing `questionId`." });

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    return res.status(status).json({ error: message });
  }
  res.setHeader("Cache-Control", "private, no-store");

  try {
    const body = bodySchema.parse(req.body);
    const narration = await saveFinalSlideNarration({
      supabase,
      questionId,
      ...body,
      upload: uploadPublicR2Object,
      remove: deletePublicR2Object,
    });
    return res.status(200).json({ ok: true, narration });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid narration payload." });
    const message = error instanceof Error ? error.message : "Narration upload failed.";
    const clientError = /invalid|unsupported|does not belong|exceeds|only pcm/i.test(message);
    return res.status(clientError ? 400 : 500).json({ error: message });
  }
}
