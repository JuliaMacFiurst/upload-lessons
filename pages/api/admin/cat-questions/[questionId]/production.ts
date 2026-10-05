import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  importCatQuestionProductionBrief,
  loadCatQuestionProductionManifest,
  saveCatQuestionProductionDirections,
} from "../../../../../lib/server/cat-question-production";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    if (req.method === "GET") {
      return res.status(200).json(await loadCatQuestionProductionManifest(supabase, questionId));
    }
    if (req.method === "PATCH") {
      await saveCatQuestionProductionDirections(supabase, questionId, req.body);
      return res.status(200).json(await loadCatQuestionProductionManifest(supabase, questionId));
    }
    if (req.method === "POST") {
      await importCatQuestionProductionBrief(supabase, questionId, req.body?.brief);
      return res.status(200).json(await loadCatQuestionProductionManifest(supabase, questionId));
    }
    res.setHeader("Allow", "GET, PATCH, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid production payload." });
    const message = error instanceof Error ? error.message : "Production request failed.";
    const lower = message.toLowerCase();
    const status = lower.includes("not found") ? 404 : /unknown slide|duplicate slide|does not belong/.test(lower) ? 400 : 500;
    return res.status(status).json({ error: message });
  }
}
