import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type MapTargetType =
  | "country"
  | "river"
  | "sea"
  | "physic"
  | "flag"
  | "animal"
  | "culture"
  | "weather"
  | "food";

type MapTargetRow = {
  map_type: MapTargetType;
  target_id: string;
};

export type MapImportStat = {
  mapType: MapTargetType;
  svgPath: string;
  found: number;
  inserted: number;
  error?: string;
};

export type ImportAllMapsResult = {
  totalInserted: number;
  totalFound: number;
  perMapStats: MapImportStat[];
};

const MAP_STORAGE_BUCKET = "map-data";
const EXPECTED_TARGETS_CACHE_TTL_MS = 5 * 60 * 1000;
const mapSvgCache = new Map<string, Promise<string | null>>();
let expectedTargetsCache:
  | {
      expiresAt: number;
      promise: Promise<MapTargetRow[]>;
    }
  | null = null;

export const MAP_CONFIGS: Array<{ type: MapTargetType; svgPath: string }> = [
  { type: "country", svgPath: "countries/countries_interactive.svg" },
  { type: "river", svgPath: "rivers/rivers-with-id-bg-updated.svg" },
  { type: "sea", svgPath: "seas/seas-colored-bordered.svg" },
  { type: "flag", svgPath: "countries/countries_interactive.svg" },
  { type: "animal", svgPath: "biomes/Biomes_of_the_world.svg" },
  { type: "culture", svgPath: "countries/countries_interactive.svg" },
  { type: "weather", svgPath: "biomes/Biomes_of_the_world.svg" },
  { type: "food", svgPath: "countries/countries_interactive.svg" },
  { type: "physic", svgPath: "physic/wonders_colored.svg" },
];

export async function loadExpectedMapTargets(): Promise<MapTargetRow[]> {
  const now = Date.now();

  if (expectedTargetsCache && expectedTargetsCache.expiresAt > now) {
    return expectedTargetsCache.promise;
  }

  const promise = Promise.all(
    MAP_CONFIGS.map(async ({ type, svgPath }) => {
      const svg = await getMapSvg(svgPath);
      if (!svg) {
        return [] as MapTargetRow[];
      }

      return extractIdsFromSvg(svg).map((targetId) => ({
        map_type: type,
        target_id: targetId,
      }));
    }),
  ).then((rows) => rows.flat());

  expectedTargetsCache = {
    expiresAt: now + EXPECTED_TARGETS_CACHE_TTL_MS,
    promise,
  };

  return promise;
}

function getSupabaseAdminClient(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getMapSvg(path: string): Promise<string | null> {
  const cached = mapSvgCache.get(path);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(MAP_STORAGE_BUCKET).download(path);

    if (error) {
      console.error(`[map-targets] failed to download svg path=${path}`, error);
      return null;
    }

    try {
      return await data.text();
    } catch (readError) {
      console.error(`[map-targets] failed to read svg text path=${path}`, readError);
      return null;
    }
  })();

  mapSvgCache.set(path, promise);
  return promise;
}

function extractIdsWithDomParser(svg: string): string[] {
  if (typeof DOMParser === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");
  const paths = Array.from(doc.querySelectorAll("path[id]"));

  return paths
    .map((pathNode) => pathNode.getAttribute("id")?.trim() || "")
    .filter(Boolean);
}

function extractIdsWithRegex(svg: string): string[] {
  const ids: string[] = [];
  const pattern = /<path\b[^>]*\bid=(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(svg)) !== null) {
    const id = match[2]?.trim();
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

function isInvalidTargetId(targetId: string): boolean {
  return /^path\d/i.test(targetId.trim());
}

export function extractIdsFromSvg(svg: string): string[] {
  const extracted = extractIdsWithDomParser(svg);
  const rawIds = extracted.length > 0 ? extracted : extractIdsWithRegex(svg);
  return Array.from(new Set(rawIds)).filter((targetId) => !isInvalidTargetId(targetId));
}

export async function importTargetsForMap(
  type: MapTargetType,
  svgPath: string,
): Promise<MapImportStat> {
  console.log(`[map-targets] importing map_type=${type} svgPath=${svgPath}`);

  try {
    const svg = await getMapSvg(svgPath);

    if (!svg) {
      throw new Error(`SVG not found for path: ${svgPath}`);
    }

    const ids = extractIdsFromSvg(svg);
    console.log(`[map-targets] found ${ids.length} ids for map_type=${type}`);

    if (ids.length === 0) {
      console.log(`[map-targets] inserted 0 rows for map_type=${type} (found=0)`);
      return {
        mapType: type,
        svgPath,
        found: 0,
        inserted: 0,
      };
    }

    const rows: MapTargetRow[] = ids.map((targetId) => ({
      map_type: type,
      target_id: targetId,
    }));

    const supabase = getSupabaseAdminClient();
    const { data, error, count } = await supabase
      .from("map_targets")
      .upsert(rows, {
        onConflict: "map_type,target_id",
        ignoreDuplicates: true,
        count: "exact",
      })
      .select("map_type,target_id");

    if (error) {
      throw error;
    }

    const inserted = typeof count === "number" ? count : Array.isArray(data) ? data.length : 0;
    console.log(
      `[map-targets] inserted ${inserted} rows for map_type=${type} (found=${ids.length})`,
    );

    return {
      mapType: type,
      svgPath,
      found: ids.length,
      inserted,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[map-targets] failed for map_type=${type}`, error);

    return {
      mapType: type,
      svgPath,
      found: 0,
      inserted: 0,
      error: message,
    };
  }
}

export async function importAllMaps(): Promise<ImportAllMapsResult> {
  const perMapStats: MapImportStat[] = [];

  for (const config of MAP_CONFIGS) {
    const stat = await importTargetsForMap(config.type, config.svgPath);
    perMapStats.push(stat);
  }

  const totalInserted = perMapStats.reduce((sum, stat) => sum + stat.inserted, 0);
  const totalFound = perMapStats.reduce((sum, stat) => sum + stat.found, 0);

  console.log(
    `[map-targets] completed import: totalFound=${totalFound} totalInserted=${totalInserted}`,
  );

  return {
    totalInserted,
    totalFound,
    perMapStats,
  };
}
