import { createClient } from "@supabase/supabase-js";
import confirmedCountryCodes from "./confirmed_country_codes.json";

const FLAGS_BUCKET = "flags-svg";
const FLAGS_PREFIX = "flags-svg";

export type FlagMedia = {
  type: "image";
  url: string;
  creditLine: string;
  source: "flags-bucket";
};

function getSupabaseAdminClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function buildCandidateCodes(targetId: string): string[] {
  const normalized = targetId.trim().toLowerCase();
  const mappedCode = confirmedCountryCodes[normalized as keyof typeof confirmedCountryCodes];

  return Array.from(
    new Set([
      mappedCode,
      normalized,
      normalized.replace(/\s+/g, "-"),
      normalized.replace(/\s+/g, "_"),
    ].filter(Boolean)),
  );
}

async function flagExists(path: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(FLAGS_BUCKET).download(path);

  if (error || !data) {
    return false;
  }

  return true;
}

export async function getFlagMedia(targetId: string): Promise<FlagMedia | null> {
  const candidates = buildCandidateCodes(targetId);

  for (const candidate of candidates) {
    const path = `${FLAGS_PREFIX}/${candidate}.svg`;
    const exists = await flagExists(path);

    if (!exists) {
      continue;
    }

    return {
      type: "image",
      url: `${process.env.SUPABASE_URL}/storage/v1/object/public/${FLAGS_BUCKET}/${path}`,
      creditLine: "Flag SVG from Supabase bucket flags-svg",
      source: "flags-bucket",
    };
  }

  return null;
}
