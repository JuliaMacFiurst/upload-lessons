import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  loadHumanTranslationPopulation,
} from "../../../../lib/server/human-translation-queue";
import {
  buildHumanTranslationExport,
  filterAndPaginateHumanTranslationRows,
  type HumanTranslationStatusFilter,
} from "../../../../lib/translations/human-loop-queue";
import {
  TRANSLATION_CONTENT_TYPES,
  isTranslationContentType,
} from "../../../../lib/translations/content-types";
import { MAX_HUMAN_TRANSLATION_BATCH } from "../../../../lib/translations/human-loop-contract";

const STATUS_FILTERS: HumanTranslationStatusFilter[] = [
  "needs_translation",
  "missing_any",
  "outdated_any",
  "missing_both",
  "complete",
  "all",
];

const exportRequestSchema = z.object({
  items: z.array(z.object({
    content_type: z.enum(TRANSLATION_CONTENT_TYPES),
    content_id: z.string().min(1),
  }).strict()).min(1).max(MAX_HUMAN_TRANSLATION_BATCH),
}).strict();

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }

  try {
    if (req.method === "GET") {
      const rawPage = Number(first(req.query.page) ?? "1");
      const rawPageSize = Number(first(req.query.page_size) ?? "50");
      const pageSize = ([25, 50, 100] as const).includes(rawPageSize as 25 | 50 | 100)
        ? rawPageSize as 25 | 50 | 100
        : 50;
      const rawStatus = first(req.query.status) ?? "needs_translation";
      const status = STATUS_FILTERS.includes(rawStatus as HumanTranslationStatusFilter)
        ? rawStatus as HumanTranslationStatusFilter
        : "needs_translation";
      const rawContentType = first(req.query.content_type);
      const contentType = isTranslationContentType(rawContentType) ? rawContentType : undefined;
      const search = first(req.query.search) ?? "";
      const population = await loadHumanTranslationPopulation(supabase);
      const page = filterAndPaginateHumanTranslationRows(population.rows, {
        page: Number.isFinite(rawPage) ? rawPage : 1,
        pageSize,
        status,
        contentType,
        search,
      });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ...page, summary: population.summary });
    }

    if (req.method === "POST") {
      const request = exportRequestSchema.parse(req.body);
      const population = await loadHumanTranslationPopulation(supabase);
      const contract = buildHumanTranslationExport(
        population.sourceItems,
        population.rows,
        request.items,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ contract });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.issues[0]?.message ?? "Invalid human translation request.",
        issues: error.issues,
      });
    }
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Human translation queue failed.",
    });
  }
}
