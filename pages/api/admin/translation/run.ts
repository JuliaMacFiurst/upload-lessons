import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import {
  getTranslationRunProgress,
  startTranslationRun,
} from "../../../../lib/server/translation-runner";
import type { TranslationScope } from "../../../../lib/server/translation-analysis";
import { requireAdminSession } from "../../../../lib/server/admin-session";

type StartRunBody = {
  lang?: string;
  scope?: TranslationScope;
  firstN?: number;
  batchSize?: number;
  confirmed?: boolean;
};

function isValidScope(value: unknown): value is TranslationScope {
  return (
    value === "all" ||
    value === "lessons" ||
    value === "map_stories" ||
    value === "artworks" ||
    value === "books" ||
    value === "stories" ||
    value === "parrot_music_styles"
  );
}

function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    return res.status(200).json(getTranslationRunProgress());
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body ?? {}) as StartRunBody;
  const lang = typeof body.lang === "string" ? body.lang.trim() : "";
  const scope = body.scope;
  const firstN =
    typeof body.firstN === "number" && Number.isFinite(body.firstN) && body.firstN > 0
      ? Math.floor(body.firstN)
      : undefined;
  const batchSize =
    typeof body.batchSize === "number" && Number.isFinite(body.batchSize) && body.batchSize > 0
      ? Math.floor(body.batchSize)
      : undefined;

  if (!lang) {
    return res.status(400).json({ error: "Missing `lang`." });
  }
  if (!isValidScope(scope)) {
    return res.status(400).json({ error: "Invalid `scope`." });
  }
  if (body.confirmed !== true) {
    return res
      .status(400)
      .json({ error: "Run must be explicitly confirmed by admin (`confirmed=true`)." });
  }

  let serviceSupabase;
  try {
    serviceSupabase = createSupabaseServiceClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }

  const { data: runningRow, error: runningError } = await serviceSupabase
    .from("translation_runs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();

  if (runningError) {
    return res.status(500).json({ error: runningError.message });
  }
  if (runningRow?.id) {
    return res
      .status(409)
      .json({ error: "Translation run already in progress" });
  }

  const { data: createdRun, error: createRunError } = await serviceSupabase
    .from("translation_runs")
    .insert({
      status: "running",
    })
    .select("id")
    .single();

  if (createRunError || !createdRun?.id) {
    const message = createRunError?.message ?? "Failed to create translation run record.";
    if (message.toLowerCase().includes("translation_runs_one_running_idx")) {
      return res
        .status(409)
        .json({ error: "Translation run already in progress" });
    }
    return res.status(500).json({ error: message });
  }

  try {
    const { runId } = startTranslationRun({
      lang,
      scope,
      firstN,
      batchSize,
      onSettled: async () => {
        await serviceSupabase
          .from("translation_runs")
          .update({
            status: "finished",
            finished_at: new Date().toISOString(),
          })
          .eq("id", createdRun.id);
      },
    });
    return res.status(202).json({ ok: true, runId });
  } catch (error) {
    await serviceSupabase
      .from("translation_runs")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
      })
      .eq("id", createdRun.id);

    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
}
