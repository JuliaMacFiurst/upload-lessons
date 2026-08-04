import type {
  MediaKind,
  MediaProvider,
  MediaSearchItem,
  MediaSearchResponse,
} from "../../media-search/types";

const PROVIDER_LIMIT = 15;
const REQUEST_TIMEOUT_MS = 7000;

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function searchPexels(query: string, kind: MediaKind, page: number): Promise<MediaSearchItem[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("Pexels is not configured");
  const params = new URLSearchParams({ query, page: String(page), per_page: String(PROVIDER_LIMIT) });
  const isVideo = kind === "video";
  const response = await fetchWithTimeout(
    `https://api.pexels.com/${isVideo ? "videos/search" : "v1/search"}?${params}`,
    { headers: { Authorization: key } },
  );
  if (!response.ok) throw new Error(`Pexels request failed: ${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  const rows = (isVideo ? payload.videos : payload.photos) as Array<Record<string, unknown>> | undefined;
  return (rows ?? []).flatMap((row): MediaSearchItem[] => {
    if (isVideo) {
      const files = (row.video_files as Array<Record<string, unknown>> | undefined) ?? [];
      const file = files.filter((entry) => typeof entry.link === "string").sort((a, b) =>
        Math.abs(Number(a.width ?? 0) - 1280) - Math.abs(Number(b.width ?? 0) - 1280))[0];
      const pictures = (row.video_pictures as Array<Record<string, unknown>> | undefined) ?? [];
      if (!file?.link) return [];
      const author = (row.user as Record<string, unknown> | undefined)?.name;
      return [{
        id: `pexels-video-${String(row.id)}`,
        source: "pexels",
        kind: "video",
        thumbnailUrl: String(pictures[0]?.picture ?? ""),
        previewUrl: String(file.link),
        originalUrl: String(file.link),
        width: Number(file.width) || undefined,
        height: Number(file.height) || undefined,
        duration: Number(row.duration) || undefined,
        author: typeof author === "string" ? author : undefined,
        attributionUrl: typeof row.url === "string" ? row.url : undefined,
        creditLine: `Video by ${typeof author === "string" ? author : "Pexels author"} on Pexels`,
      }];
    }
    const src = row.src as Record<string, unknown> | undefined;
    const url = src?.large2x ?? src?.large ?? src?.medium ?? src?.original;
    if (typeof url !== "string") return [];
    const author = typeof row.photographer === "string" ? row.photographer : undefined;
    return [{
      id: `pexels-photo-${String(row.id)}`,
      source: "pexels",
      kind: "image",
      thumbnailUrl: String(src?.medium ?? url),
      originalUrl: url,
      width: Number(row.width) || undefined,
      height: Number(row.height) || undefined,
      author,
      attributionUrl: typeof row.url === "string" ? row.url : undefined,
      creditLine: `Photo by ${author ?? "Pexels author"} on Pexels`,
    }];
  });
}

async function searchGiphy(query: string, kind: MediaKind, page: number): Promise<MediaSearchItem[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) throw new Error("Giphy is not configured");
  const params = new URLSearchParams({
    api_key: key,
    q: query,
    limit: String(PROVIDER_LIMIT),
    offset: String((page - 1) * PROVIDER_LIMIT),
    rating: "g",
    lang: "en",
  });
  const response = await fetchWithTimeout(`https://api.giphy.com/v1/gifs/search?${params}`);
  if (!response.ok) throw new Error(`Giphy request failed: ${response.status}`);
  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  return (payload.data ?? []).flatMap((row): MediaSearchItem[] => {
    const images = row.images as Record<string, Record<string, unknown>> | undefined;
    const original = images?.original;
    const preview = images?.fixed_width_small ?? images?.fixed_width ?? images?.preview_gif;
    const originalUrl = kind === "video" ? original?.mp4 : original?.url;
    if (typeof originalUrl !== "string") return [];
    const title = typeof row.title === "string" ? row.title : undefined;
    return [{
      id: `giphy-${String(row.id)}-${kind}`,
      source: "giphy",
      kind,
      animated: kind === "image",
      thumbnailUrl: String(preview?.url ?? preview?.mp4 ?? originalUrl),
      previewUrl: kind === "video" ? String(preview?.mp4 ?? originalUrl) : undefined,
      originalUrl,
      width: Number(original?.width) || undefined,
      height: Number(original?.height) || undefined,
      title,
      attributionUrl: typeof row.url === "string" ? row.url : undefined,
      creditLine: `Powered by Giphy${title ? ` | ${title}` : ""}`,
    }];
  });
}

async function searchWikimedia(query: string, kind: MediaKind, page: number): Promise<MediaSearchItem[]> {
  if (kind === "video") return [];
  const params = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "search",
    gsrsearch: query, gsrnamespace: "6", gsrlimit: String(PROVIDER_LIMIT),
    gsroffset: String((page - 1) * PROVIDER_LIMIT), prop: "imageinfo",
    iiprop: "url|user|extmetadata", iiurlwidth: "600",
  });
  const response = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!response.ok) throw new Error(`Wikimedia request failed: ${response.status}`);
  const payload = await response.json() as { query?: { pages?: Record<string, Record<string, unknown>> } };
  return Object.values(payload.query?.pages ?? {}).flatMap((row): MediaSearchItem[] => {
    const info = (row.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!info || typeof info.url !== "string" || typeof info.descriptionurl !== "string") return [];
    const metadata = info.extmetadata as Record<string, { value?: string }> | undefined;
    const license = metadata?.LicenseShortName?.value?.replace(/<[^>]+>/g, "");
    const author = typeof info.user === "string" ? info.user : undefined;
    const creditLine = ["Wikimedia Commons", author ? `author: ${author}` : "", license ?? ""].filter(Boolean).join(" | ");
    return [{
    id: `wikimedia-${String(row.pageid ?? row.title)}`,
    source: "wikimedia",
    kind: "image",
    thumbnailUrl: typeof info.thumburl === "string" ? info.thumburl : info.url,
    originalUrl: info.url,
    title: typeof row.title === "string" ? row.title : undefined,
    author,
    attributionUrl: info.descriptionurl,
    license,
    creditLine,
  }];
  });
}

const SEARCHERS: Record<MediaProvider, typeof searchPexels> = {
  pexels: searchPexels,
  wikimedia: searchWikimedia,
  giphy: searchGiphy,
};

export async function searchMedia(input: {
  query: string;
  source: MediaProvider;
  kind: MediaKind;
  page: number;
}): Promise<MediaSearchResponse> {
  if (input.source === "wikimedia" && input.kind === "video") {
    return { items: [], nextCursor: null, hasMore: false };
  }
  const items = (await SEARCHERS[input.source](input.query, input.kind, input.page)).slice(0, 15);
  const hasMore = items.length > 0;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? String(input.page + 1) : null,
  };
}
