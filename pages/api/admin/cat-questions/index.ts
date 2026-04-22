import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  createCatQuestion,
  handleCatQuestionValidationError,
  listCatQuestions,
  parseCatQuestionJson,
} from "../../../../lib/server/cat-questions-admin";
import type { CatQuestionPayload } from "../../../../lib/cat-questions/types";

type CreateBody = {
  json?: string;
  question?: CatQuestionPayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const search = typeof req.query.q === "string" ? req.query.q : "";
      const page = typeof req.query.page === "string" ? Number(req.query.page) || 1 : 1;
      const limit = typeof req.query.limit === "string" ? Number(req.query.limit) || 100 : 100;
      const data = await listCatQuestions(supabase, { search, page, limit });
      return res.status(200).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load cat questions.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as CreateBody;
    const payload = typeof body.json === "string" ? parseCatQuestionJson(body.json) : body.question;
    if (!payload) {
      return res.status(400).json({ error: "Missing question JSON." });
    }

    const question = await createCatQuestion(supabase, payload);
    return res.status(201).json({ question });
  } catch (error) {
    const normalized = handleCatQuestionValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
