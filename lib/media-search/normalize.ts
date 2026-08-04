import type { MediaProvider, MediaSearchItem } from "./types";

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function dedupeMediaItems(items: MediaSearchItem[]): MediaSearchItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.id}|${canonicalUrl(item.originalUrl)}`;
    const urlKey = canonicalUrl(item.originalUrl);
    if (seen.has(key) || seen.has(urlKey)) return false;
    seen.add(key);
    seen.add(urlKey);
    return true;
  });
}

export function interleaveMediaItems(
  groups: Partial<Record<MediaProvider, MediaSearchItem[]>>,
  limit = 15,
): MediaSearchItem[] {
  const sources: MediaProvider[] = ["pexels", "wikimedia", "giphy"];
  const offsets = new Map(sources.map((source) => [source, 0]));
  const output: MediaSearchItem[] = [];

  while (output.length < limit) {
    let added = false;
    for (const source of sources) {
      const index = offsets.get(source) ?? 0;
      const item = groups[source]?.[index];
      if (!item) continue;
      output.push(item);
      offsets.set(source, index + 1);
      added = true;
      if (output.length === limit) break;
    }
    if (!added) break;
  }

  return dedupeMediaItems(output).slice(0, limit);
}
