import type { NextApiRequest, NextApiResponse } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";
import {
  MAP_TRANSLATION_TYPES,
  MAX_MAP_TRANSLATION_BATCH,
  type MapTranslationType,
} from "@/lib/map-translations/contract";
import {
  createMapTranslationExport,
  filterAndPaginateMapTranslationRows,
  loadMapTranslationPopulation,
  type ApprovalFilter,
  type TranslationStatusFilter,
} from "@/lib/server/map-translations";

const STATUS_FILTERS = ["all", "missing_any", "missing_en", "missing_he", "missing_both", "complete"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let supabase: SupabaseClient;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500).json({ error: message });
  }

  try {
    if (req.method === "GET") {
      const rawPage = Number(first(req.query.page) ?? "1");
      const rawPageSize = Number(first(req.query.page_size) ?? "50");
      const pageSize = ([25, 50, 100] as const).includes(rawPageSize as 25 | 50 | 100)
        ? rawPageSize as 25 | 50 | 100
        : 50;
      const rawMapType = first(req.query.map_type);
      const mapType = MAP_TRANSLATION_TYPES.includes(rawMapType as MapTranslationType)
        ? rawMapType as MapTranslationType
        : undefined;
      const rawStatus = first(req.query.status) ?? "missing_any";
      const status = STATUS_FILTERS.includes(rawStatus)
        ? rawStatus as TranslationStatusFilter
        : "missing_any";
      const approval: ApprovalFilter = first(req.query.approval) === "all" ? "all" : "approved";
      const search = first(req.query.search) ?? "";
      const population = await loadMapTranslationPopulation(supabase);
      const page = filterAndPaginateMapTranslationRows(population.rows, {
        page: Number.isFinite(rawPage) ? rawPage : 1,
        pageSize,
        mapType,
        status,
        approval,
        search,
      });
      return res.status(200).json({ ...page, summary: population.summary });
    }

    if (req.method === "POST") {
      const ids = req.body?.content_ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        return res.status(400).json({ error: "content_ids must be an array of exact string IDs." });
      }
      if (ids.length > MAX_MAP_TRANSLATION_BATCH) {
        return res.status(400).json({ error: `Maximum translation batch is ${MAX_MAP_TRANSLATION_BATCH} stories.` });
      }
      const contract = await createMapTranslationExport(supabase, ids);
      return res.status(200).json({ contract });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Map translation queue failed." });
  }
}
