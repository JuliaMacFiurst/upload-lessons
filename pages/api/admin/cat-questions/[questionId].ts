import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  deleteCatQuestion,
  handleCatQuestionValidationError,
  loadCatQuestionEditor,
  updateCatQuestion,
} from "../../../../lib/server/cat-questions-admin";
import type { CatQuestionPayload } from "../../../../lib/cat-questions/types";

type SaveBody = {
  question?: CatQuestionPayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const questionId = typeof req.query.questionId === "string" ? req.query.questionId : "";
  if (!questionId) {
    return res.status(400).json({ error: "Missing `questionId`." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const question = await loadCatQuestionEditor(supabase, questionId);
      return res.status(200).json({ question });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load cat question.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteCatQuestion(supabase, questionId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete cat question.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as SaveBody;
    if (!body.question) {
      return res.status(400).json({ error: "Missing question payload." });
    }

    const question = await updateCatQuestion(supabase, questionId, body.question);
    return res.status(200).json({ ok: true, question });
  } catch (error) {
    const normalized = handleCatQuestionValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
