import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import {
  getTranslationRunProgress,
  startTranslationRun,
} from "../../../../lib/server/translation-runner";
import type { TranslationScope } from "../../../../lib/server/translation-analysis";

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
    value === "artworks"
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
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

  const { data: runningRow, error: runningError } = await supabase
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

  const { data: createdRun, error: createRunError } = await supabase
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
        await supabase
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
    await supabase
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
