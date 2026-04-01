export type ResolveMediaInput = {
  slideText: string;
  targetId: string;
  mapType: string;
  existingUrls?: string[];
  searchQuery?: string;
  preferredSource?: "auto" | "wikimedia" | "pexels" | "giphy";
  preferredType?: "image" | "video";
};

export type ResolveMediaResult = {
  type: "image" | "video";
  url: string;
  creditLine: string;
  source: string;
};

type ResolveAttemptInput = ResolveMediaInput & {
  deadlineAt?: number;
};

type WikimediaImageCandidate = {
  title: string;
  url: string;
  user: string | null;
  licenseShortName: string | null;
  descriptionUrl: string;
};

type WikimediaSearchResponse = {
  query?: {
    search?: Array<{ title?: string }>;
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url?: string;
          descriptionurl?: string;
          user?: string;
          extmetadata?: {
            LicenseShortName?: { value?: string };
          };
        }>;
      }
    >;
  };
};

type PexelsVideosResponse = {
  videos?: Array<{
    user?: {
      name?: string;
      url?: string;
    };
    url?: string;
    video_files?: Array<{
      quality?: string;
      width?: number;
      height?: number;
      link?: string;
      file_type?: string;
    }>;
  }>;
};

type PexelsVideo = NonNullable<PexelsVideosResponse["videos"]>[number];

type PexelsPhotosResponse = {
  photos?: Array<{
    url?: string;
    photographer?: string;
    photographer_url?: string;
    src?: {
      original?: string;
      large2x?: string;
      large?: string;
      medium?: string;
    };
  }>;
};

type PexelsPhoto = NonNullable<PexelsPhotosResponse["photos"]>[number];

type GiphyResponse = {
  data?: Array<{
    url?: string;
    title?: string;
    images?: {
      original?: {
        url?: string;
        mp4?: string;
      };
      downsized_large?: {
        url?: string;
      };
      fixed_height?: {
        url?: string;
      };
      preview_gif?: {
        url?: string;
      };
      preview_mp4?: {
        mp4?: string;
      };
    };
  }>;
};

const WIKIMEDIA_API_URL = "https://commons.wikimedia.org/w/api.php";
const WIKIMEDIA_MIN_REQUEST_INTERVAL_MS = 1200;
const WIKIMEDIA_CACHE_TTL_MS = 5 * 60 * 1000;
const WIKIMEDIA_MAX_RETRIES = 2;
const MAX_MEDIA_QUERIES = 4;
const TOTAL_RESOLVE_TIMEOUT_MS = 8000;
const WIKIMEDIA_FETCH_TIMEOUT_MS = 2500;
const PEXELS_FETCH_TIMEOUT_MS = 2500;
const GIPHY_FETCH_TIMEOUT_MS = 2500;

let wikimediaNextRequestAt = 0;
let wikimediaRequestQueue: Promise<void> = Promise.resolve();
const wikimediaSearchCache = new Map<
  string,
  {
    expiresAt: number;
    value: Promise<WikimediaImageCandidate[]>;
  }
>();

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "и",
  "в",
  "во",
  "на",
  "но",
  "не",
  "что",
  "это",
  "как",
  "по",
  "из",
  "к",
  "у",
  "за",
  "от",
  "над",
  "под",
  "для",
  "о",
  "об",
  "про",
  "то",
  "та",
  "тот",
  "эта",
  "этот",
  "эти",
  "его",
  "ее",
  "её",
  "их",
]);

const TARGET_NOISE_WORDS = new Set([
  "north",
  "south",
  "east",
  "west",
  "central",
  "american",
  "european",
  "african",
  "asian",
  "tropical",
  "subtropical",
  "temperate",
  "moist",
  "dry",
  "broadleaf",
  "coniferous",
  "mixed",
  "leaf",
  "federation",
  "republic",
  "kingdom",
  "state",
  "states",
  "region",
  "regions",
  "zone",
  "zones",
]);

const TARGET_FOCUS_WORDS = new Set([
  "forest",
  "forests",
  "river",
  "rivers",
  "sea",
  "seas",
  "ocean",
  "oceans",
  "lake",
  "lakes",
  "mountain",
  "mountains",
  "desert",
  "deserts",
  "island",
  "islands",
  "valley",
  "valleys",
  "canyon",
  "canyons",
  "waterfall",
  "waterfalls",
  "volcano",
  "volcanoes",
  "glacier",
  "glaciers",
]);

function buildFallbackImage(input: ResolveMediaInput): ResolveMediaResult {
  const label = `${input.mapType}: ${input.targetId}`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#17324d" />
          <stop offset="100%" stop-color="#3f7aa0" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" rx="32" />
      <circle cx="1080" cy="120" r="180" fill="rgba(255,255,255,0.10)" />
      <circle cx="180" cy="620" r="220" fill="rgba(255,255,255,0.08)" />
      <text x="96" y="310" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="700">
        Media Placeholder
      </text>
      <text x="96" y="380" fill="#dbeafe" font-family="Arial, sans-serif" font-size="28">
        ${escapeXml(label)}
      </text>
    </svg>
  `.trim();

  return {
    type: "image",
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    creditLine: "Auto fallback placeholder",
    source: "fallback",
  };
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase();
}

function isDisallowedMediaUrl(url: string): boolean {
  return /\.(pdf|svg|djvu|djv|ogg|oga|tif|tiff)(\?.*)?$/i.test(url.trim());
}

function buildExistingUrlSet(input: ResolveMediaInput): Set<string> {
  return new Set((input.existingUrls ?? []).map((url) => normalizeUrl(url)).filter(Boolean));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSentenceStart(text: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const char = text[cursor];

    if (/\s/.test(char) || /["'([{]/.test(char)) {
      continue;
    }

    return /[.!?…]/.test(char);
  }

  return true;
}

function isUppercaseWord(word: string): boolean {
  const firstChar = word[0];
  return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
}

function extractKeywords(slideText: string): string[] {
  const pattern = /\p{L}[\p{L}\p{N}-]*/gu;
  const preferred: string[] = [];
  const secondary: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(slideText)) !== null) {
    const rawWord = match[0]?.trim() ?? "";
    const normalizedWord = rawWord.toLowerCase();

    if (normalizedWord.length < 4 || STOPWORDS.has(normalizedWord) || seen.has(normalizedWord)) {
      continue;
    }

    seen.add(normalizedWord);

    if (isUppercaseWord(rawWord) && !isSentenceStart(slideText, match.index)) {
      preferred.push(normalizedWord);
      continue;
    }

    secondary.push(normalizedWord);
  }

  return [...preferred, ...secondary].slice(0, 8);
}

function normalizeTargetIdForSearch(targetId: string): string[] {
  const normalized = targetId
    .replace(/[_/,-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return [];
  }

  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length <= 3 && normalized.length <= 32) {
    return [normalized];
  }

  const focusWords = words.filter((word) => TARGET_FOCUS_WORDS.has(word));
  const compactWords = words.filter(
    (word) => word.length >= 4 && !STOPWORDS.has(word) && !TARGET_NOISE_WORDS.has(word),
  );
  const lastMeaningful = compactWords[compactWords.length - 1];
  const lastTwo = compactWords.slice(-2).join(" ").trim();
  const focused = focusWords[focusWords.length - 1];

  return Array.from(
    new Set(
      [
        focused,
        lastTwo,
        lastMeaningful,
        compactWords.slice(0, 3).join(" ").trim(),
        normalized,
      ].filter(Boolean),
    ),
  );
}

function buildMediaQueries(input: ResolveMediaInput): string[] {
  const targetTerms = normalizeTargetIdForSearch(input.targetId);
  const primaryTargetTerm = targetTerms[0] ?? input.targetId.replace(/[_-]+/g, " ").trim().toLowerCase();
  const mapTypeToken = input.mapType.trim().toLowerCase();
  const manualQuery = input.searchQuery?.trim();

  if (manualQuery) {
    return Array.from(
      new Set(
        [
          ...targetTerms.map((targetTerm) => `${targetTerm} ${manualQuery}`.trim()),
          `${mapTypeToken} ${primaryTargetTerm} ${manualQuery}`.trim(),
          `${primaryTargetTerm} ${manualQuery}`.trim(),
          `${primaryTargetTerm}`.trim(),
        ].filter(Boolean),
      ),
    );
  }

  const keywords = extractKeywords(input.slideText);
  return Array.from(
    new Set(
      [
        ...targetTerms,
        ...keywords.map((keyword) => `${primaryTargetTerm} ${keyword}`.trim()),
        ...keywords.map((keyword) => `${mapTypeToken} ${primaryTargetTerm} ${keyword}`.trim()),
        `${mapTypeToken} ${primaryTargetTerm}`.trim(),
        `${primaryTargetTerm}`.trim(),
      ].filter(Boolean),
    ),
  ).slice(0, MAX_MEDIA_QUERIES);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function getRemainingTimeMs(input: ResolveAttemptInput): number | null {
  if (!input.deadlineAt) {
    return null;
  }

  return input.deadlineAt - Date.now();
}

function hasTimedOut(input: ResolveAttemptInput, bufferMs = 0): boolean {
  const remainingMs = getRemainingTimeMs(input);
  return remainingMs !== null && remainingMs <= bufferMs;
}

async function fetchWithTimeout(
  input: ResolveAttemptInput,
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const remainingMs = getRemainingTimeMs(input);
  const effectiveTimeoutMs =
    remainingMs === null ? timeoutMs : Math.max(1, Math.min(timeoutMs, remainingMs));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Timed out after ${effectiveTimeoutMs}ms`));
  }, effectiveTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function enqueueWikimediaRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = wikimediaRequestQueue
    .catch(() => undefined)
    .then(async () => {
      const waitMs = wikimediaNextRequestAt - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      try {
        return await task();
      } finally {
        wikimediaNextRequestAt = Math.max(wikimediaNextRequestAt, Date.now() + WIKIMEDIA_MIN_REQUEST_INTERVAL_MS);
      }
    });

  wikimediaRequestQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

async function searchWikimediaImages(
  input: ResolveAttemptInput,
  query: string,
  limit: number,
): Promise<WikimediaImageCandidate[]> {
  const cacheKey = `${query.trim().toLowerCase()}::${limit}`;
  const cached = wikimediaSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const request = enqueueWikimediaRequest(async () => {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: String(limit),
      prop: "imageinfo",
      iiprop: "url|user|extmetadata",
      iiurlwidth: "1600",
    });

    for (let attempt = 0; attempt <= WIKIMEDIA_MAX_RETRIES; attempt += 1) {
      if (hasTimedOut(input, 150)) {
        return [];
      }

      const response = await fetchWithTimeout(
        input,
        `${WIKIMEDIA_API_URL}?${params.toString()}`,
        undefined,
        WIKIMEDIA_FETCH_TIMEOUT_MS,
      );
      if (response.ok) {
        const data = (await response.json()) as WikimediaSearchResponse;
        const pages = Object.values(data.query?.pages ?? {});
        return pages
          .map((page) => {
            const info = page?.imageinfo?.[0];

            if (!page?.title || !info?.url || !info.descriptionurl) {
              return null;
            }

            if (isDisallowedMediaUrl(info.url)) {
              return null;
            }

            return {
              title: page.title,
              url: info.url,
              user: info.user ?? null,
              licenseShortName: info.extmetadata?.LicenseShortName?.value ?? null,
              descriptionUrl: info.descriptionurl,
            };
          })
          .filter((item): item is WikimediaImageCandidate => item !== null);
      }

      if (response.status !== 429) {
        throw new Error(`Wikimedia request failed: ${response.status}`);
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const backoffMs = retryAfterMs ?? WIKIMEDIA_MIN_REQUEST_INTERVAL_MS * (attempt + 2);

      if (attempt === WIKIMEDIA_MAX_RETRIES) {
        console.warn(`[resolve-media] wikimedia rate limited for query "${query}"`);
        return [];
      }

      wikimediaNextRequestAt = Math.max(wikimediaNextRequestAt, Date.now() + backoffMs);
      await sleep(backoffMs);
    }

    return [];
  }).catch((error) => {
    wikimediaSearchCache.delete(cacheKey);
    throw error;
  });

  wikimediaSearchCache.set(cacheKey, {
    expiresAt: Date.now() + WIKIMEDIA_CACHE_TTL_MS,
    value: request,
  });

  return request;
}

function formatWikimediaCredit(candidate: WikimediaImageCandidate): string {
  const parts = [`Wikimedia Commons`];
  if (candidate.user) {
    parts.push(`author: ${candidate.user}`);
  }
  if (candidate.licenseShortName) {
    parts.push(candidate.licenseShortName.replace(/<[^>]+>/g, ""));
  }
  return parts.join(" | ");
}

async function resolveFromWikimedia(input: ResolveMediaInput): Promise<ResolveMediaResult | null> {
  const queries = buildMediaQueries(input);
  const existingUrlSet = buildExistingUrlSet(input);

  for (const query of queries) {
    if (hasTimedOut(input, 200)) {
      return null;
    }

    let candidates: WikimediaImageCandidate[] = [];

    try {
      candidates = await searchWikimediaImages(input, query, 8);
    } catch (error) {
      console.error("[resolve-media] wikimedia search failed", error);
      continue;
    }

    const candidate = candidates.find((item) => !existingUrlSet.has(normalizeUrl(item.url)));
    if (!candidate) {
      continue;
    }

    return {
      type: "image",
      url: candidate.url,
      creditLine: formatWikimediaCredit(candidate),
      source: `wikimedia:${candidate.descriptionUrl}`,
    };
  }

  return null;
}

function pickBestPexelsVideoFile(video: NonNullable<PexelsVideosResponse["videos"]>[number]) {
  const files = [...(video.video_files ?? [])].filter((file) => Boolean(file.link));
  files.sort((left, right) => {
    const leftScore = Math.abs((left.width ?? 0) - 1280);
    const rightScore = Math.abs((right.width ?? 0) - 1280);
    return leftScore - rightScore;
  });
  return files[0] ?? null;
}

function pickBestPexelsVideo(
  videos: PexelsVideo[],
  existingUrlSet: Set<string>,
): { video: PexelsVideo; url: string } | null {
  for (const video of videos) {
    const file = pickBestPexelsVideoFile(video);
    if (!file?.link) {
      continue;
    }

    if (isDisallowedMediaUrl(file.link)) {
      continue;
    }

    if (existingUrlSet.has(normalizeUrl(file.link))) {
      continue;
    }

    return {
      video,
      url: file.link,
    };
  }

  return null;
}

function pickBestPexelsPhoto(
  photos: PexelsPhoto[],
  existingUrlSet: Set<string>,
): { photo: PexelsPhoto; url: string } | null {
  for (const photo of photos) {
    const url = photo.src?.large2x ?? photo.src?.large ?? photo.src?.medium ?? photo.src?.original;
    if (!url) {
      continue;
    }

    if (isDisallowedMediaUrl(url)) {
      continue;
    }

    if (existingUrlSet.has(normalizeUrl(url))) {
      continue;
    }

    return {
      photo,
      url,
    };
  }

  return null;
}

async function resolveFromPexelsPhotos(input: ResolveAttemptInput): Promise<ResolveMediaResult | null> {
  if (!process.env.PEXELS_API_KEY) {
    return null;
  }

  const queries = buildMediaQueries(input);
  const existingUrlSet = buildExistingUrlSet(input);

  for (const query of queries) {
    if (hasTimedOut(input, 200)) {
      return null;
    }

    const params = new URLSearchParams({
      query,
      per_page: "8",
      orientation: "landscape",
      size: "medium",
      locale: "en-US",
    });

    const response = await fetchWithTimeout(
      input,
      `https://api.pexels.com/v1/search?${params.toString()}`,
      {
        headers: {
          Authorization: process.env.PEXELS_API_KEY,
        },
      },
      PEXELS_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Pexels photo request failed: ${response.status}`);
    }

    const data = (await response.json()) as PexelsPhotosResponse;
    const selected = pickBestPexelsPhoto(data.photos ?? [], existingUrlSet);
    if (!selected) {
      continue;
    }

    return {
      type: "image",
      url: selected.url,
      creditLine: `Photo by ${selected.photo.photographer ?? "Pexels author"} on Pexels`,
      source: selected.photo.url ?? "pexels",
    };
  }

  return null;
}

async function resolveFromPexels(input: ResolveAttemptInput): Promise<ResolveMediaResult | null> {
  if (!process.env.PEXELS_API_KEY) {
    return null;
  }

  const queries = buildMediaQueries(input);
  const existingUrlSet = buildExistingUrlSet(input);

  for (const query of queries) {
    if (hasTimedOut(input, 200)) {
      return null;
    }

    const params = new URLSearchParams({
      query,
      per_page: "8",
      orientation: "landscape",
      size: "medium",
      locale: "en-US",
    });

    const response = await fetchWithTimeout(
      input,
      `https://api.pexels.com/videos/search?${params.toString()}`,
      {
        headers: {
          Authorization: process.env.PEXELS_API_KEY,
        },
      },
      PEXELS_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Pexels request failed: ${response.status}`);
    }

    const data = (await response.json()) as PexelsVideosResponse;
    const selected = pickBestPexelsVideo(data.videos ?? [], existingUrlSet);
    if (!selected) {
      continue;
    }

    return {
      type: "video",
      url: selected.url,
      creditLine: `Video by ${selected.video.user?.name ?? "Pexels author"} on Pexels`,
      source: selected.video.url ?? "pexels",
    };
  }

  return null;
}

async function resolveFromGiphy(input: ResolveAttemptInput): Promise<ResolveMediaResult | null> {
  if (!process.env.GIPHY_API_KEY) {
    return null;
  }

  const queries = buildMediaQueries(input);
  const existingUrlSet = buildExistingUrlSet(input);
  const preferredType = input.preferredType ?? "image";

  for (const query of queries) {
    if (hasTimedOut(input, 200)) {
      return null;
    }

    const params = new URLSearchParams({
      api_key: process.env.GIPHY_API_KEY,
      q: query,
      limit: "12",
      rating: "g",
      lang: "en",
    });

    const response = await fetchWithTimeout(
      input,
      `https://api.giphy.com/v1/gifs/search?${params.toString()}`,
      undefined,
      GIPHY_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Giphy request failed: ${response.status}`);
    }

    const data = (await response.json()) as GiphyResponse;
    const items = data.data ?? [];

    for (const item of items) {
      const gifUrl =
        item.images?.downsized_large?.url ??
        item.images?.fixed_height?.url ??
        item.images?.preview_gif?.url ??
        item.images?.original?.url;
      const mp4Url =
        item.images?.preview_mp4?.mp4 ??
        item.images?.original?.mp4;
      const nextUrl = preferredType === "video" ? mp4Url : gifUrl;

      if (!nextUrl || isDisallowedMediaUrl(nextUrl) || existingUrlSet.has(normalizeUrl(nextUrl))) {
        continue;
      }

      return {
        type: preferredType === "video" && mp4Url ? "video" : "image",
        url: nextUrl,
        creditLine: `Powered by Giphy${item.title ? ` | ${item.title}` : ""}`,
        source: item.url ?? "giphy",
      };
    }
  }

  return null;
}

export async function resolveMedia(input: ResolveMediaInput): Promise<ResolveMediaResult> {
  const timedInput: ResolveAttemptInput = {
    ...input,
    deadlineAt: Date.now() + TOTAL_RESOLVE_TIMEOUT_MS,
  };
  const preferredSource = input.preferredSource ?? "auto";
  const preferredType = input.preferredType;

  if (preferredSource === "wikimedia") {
    try {
      const wikimedia = await resolveFromWikimedia(timedInput);
      if (wikimedia) {
        return wikimedia;
      }
    } catch (error) {
      console.error("[resolve-media] preferred wikimedia failed", error);
    }

    return buildFallbackImage(input);
  }

  if (preferredSource === "pexels") {
    try {
      if (preferredType === "image") {
        const photo = await resolveFromPexelsPhotos(timedInput);
        if (photo) {
          return photo;
        }
      } else if (preferredType === "video") {
        const video = await resolveFromPexels(timedInput);
        if (video) {
          return video;
        }
      } else {
        const photo = await resolveFromPexelsPhotos(timedInput);
        if (photo) {
          return photo;
        }

        const video = await resolveFromPexels(timedInput);
        if (video) {
          return video;
        }
      }
    } catch (error) {
      console.error("[resolve-media] preferred pexels failed", error);
    }

    return buildFallbackImage(input);
  }

  if (preferredSource === "giphy") {
    try {
      const giphy = await resolveFromGiphy(timedInput);
      if (giphy) {
        return giphy;
      }
    } catch (error) {
      console.error("[resolve-media] preferred giphy failed", error);
    }
    return buildFallbackImage(input);
  }

  try {
    const wikimedia = await resolveFromWikimedia(timedInput);
    if (wikimedia) {
      return wikimedia;
    }
  } catch (error) {
    console.error("[resolve-media] wikimedia failed", error);
  }

  try {
    if (preferredType === "video") {
      const giphyVideo = await resolveFromGiphy({
        ...timedInput,
        preferredSource: "giphy",
        preferredType: "video",
      });
      if (giphyVideo) {
        return giphyVideo;
      }
    }

    if (!preferredType) {
      const giphyImage = await resolveFromGiphy({
        ...timedInput,
        preferredSource: "giphy",
        preferredType: "image",
      });
      if (giphyImage) {
        return giphyImage;
      }
    }

    if (preferredType === "image") {
      const pexelsPhoto = await resolveFromPexelsPhotos(timedInput);
      if (pexelsPhoto) {
        return pexelsPhoto;
      }
    }

    if (preferredType === "video") {
      const pexelsVideo = await resolveFromPexels(timedInput);
      if (pexelsVideo) {
        return pexelsVideo;
      }
    }

    if (!preferredType) {
      const pexelsPhoto = await resolveFromPexelsPhotos(timedInput);
      if (pexelsPhoto) {
        return pexelsPhoto;
      }
    }

    const pexels = await resolveFromPexels(timedInput);
    if (pexels) {
      return pexels;
    }
  } catch (error) {
    console.error("[resolve-media] media provider failed", error);
  }

  return buildFallbackImage(input);
}
