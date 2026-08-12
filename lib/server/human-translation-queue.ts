import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTranslationItemsByScope } from "./translation-content";
import { HUMAN_TRANSLATION_LANGUAGES } from "../translations/human-loop-contract";
import {
  buildHumanTranslationPopulation,
  type ExistingHumanTranslationRow,
} from "../translations/human-loop-queue";

const DB_PAGE_SIZE = 1000;

async function loadAllTranslationRows(supabase: SupabaseClient): Promise<ExistingHumanTranslationRow[]> {
  const rows: ExistingHumanTranslationRow[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("content_translations")
      .select("content_type,content_id,language,source_hash")
      .in("language", [...HUMAN_TRANSLATION_LANGUAGES])
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load content translations: ${error.message}`);
    const batch = (data ?? []) as ExistingHumanTranslationRow[];
    rows.push(...batch);
    if (batch.length < DB_PAGE_SIZE) break;
  }
  return rows;
}

export async function loadHumanTranslationPopulation(supabase: SupabaseClient) {
  const [sourceItems, translations] = await Promise.all([
    loadTranslationItemsByScope(supabase, "all"),
    loadAllTranslationRows(supabase),
  ]);
  return {
    sourceItems,
    translations,
    ...buildHumanTranslationPopulation(sourceItems, translations),
  };
}
