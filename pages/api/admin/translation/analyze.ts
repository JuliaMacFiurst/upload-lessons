import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import {
  analyzeTranslationState,
  type TranslationScope,
} from "../../../../lib/server/translation-analysis";

function parseScope(value: string | string[] | undefined): TranslationScope {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    raw === "all" ||
    raw === "lessons" ||
    raw === "map_stories" ||
    raw === "artworks"
  ) {
    return raw;
  }
  return "all";
}

function parseFirstN(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const lang = typeof req.query.lang === "string" ? req.query.lang.trim() : "";
  if (!lang) {
    return res.status(400).json({ error: "Missing query param `lang`." });
  }

  const scope = parseScope(req.query.scope);
  const firstN = parseFirstN(req.query.firstN);

  try {
    const result = await analyzeTranslationState({ lang, scope, firstN });
    return res.status(200).json({
      ...result,
      mockModeActive: process.env.TRANSLATION_MOCK_MODEL === "true",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
