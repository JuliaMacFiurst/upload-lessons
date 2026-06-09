const PARROT_AUDIO_PREFIX = "parrot-audio";
const PARROT_STYLE_MEDIA_PREFIX = "parrot-style-media";
const PARROT_STYLE_MEDIA_R2_PREFIX = "parrot-audio/parrot-style-media";

function getR2MediaBaseUrl() {
  const base =
    process.env.NEXT_PUBLIC_R2_MEDIA_URL?.trim() ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim() ||
    process.env.R2_PUBLIC_URL?.trim();

  if (!base) {
    throw new Error("Missing NEXT_PUBLIC_R2_MEDIA_URL.");
  }

  return base.replace(/\/+$/, "");
}

function encodeMediaPath(path: string) {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function pathFromUrlOrPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).pathname;
  } catch {
    return trimmed;
  }
}

function normalizeParrotMediaPath(value: string, prefixes: string[]) {
  let path = pathFromUrlOrPath(value).replace(/^\/+/, "");
  const legacyPrefixes = prefixes.flatMap((prefix) => [
    `storage/v1/object/public/${prefix}/`,
    `supabase-storage/${prefix}/`,
    `${prefix}/`,
  ]);

  for (const legacyPrefix of legacyPrefixes) {
    if (path.startsWith(legacyPrefix)) {
      path = path.slice(legacyPrefix.length);
      break;
    }
  }

  return path.replace(/^\/+/, "");
}

function isParrotMediaReference(value: string, prefixes: string[]) {
  const path = pathFromUrlOrPath(value).replace(/^\/+/, "");
  return prefixes
    .flatMap((prefix) => [
      `storage/v1/object/public/${prefix}/`,
      `supabase-storage/${prefix}/`,
      `${prefix}/`,
    ])
    .some((legacyPrefix) => path.startsWith(legacyPrefix));
}

export function normalizeParrotAudioPath(value: string): string {
  return normalizeParrotMediaPath(value, [PARROT_AUDIO_PREFIX]);
}

export function normalizeParrotStyleMediaPath(value: string): string {
  const path = normalizeParrotMediaPath(value, [PARROT_STYLE_MEDIA_R2_PREFIX, PARROT_STYLE_MEDIA_PREFIX]);
  if (!path) {
    return "";
  }
  return path.startsWith("styles/") ? path : `styles/${path}`;
}

export function getParrotAudioUrl(path: string): string {
  return `${getR2MediaBaseUrl()}/${PARROT_AUDIO_PREFIX}/${encodeMediaPath(normalizeParrotAudioPath(path))}`;
}

export function getParrotStyleMediaUrl(path: string): string {
  return `${getR2MediaBaseUrl()}/${PARROT_STYLE_MEDIA_R2_PREFIX}/${encodeMediaPath(normalizeParrotStyleMediaPath(path))}`;
}

export function normalizeParrotAudioUrl(value: string): string {
  return isParrotMediaReference(value, [PARROT_AUDIO_PREFIX]) ? getParrotAudioUrl(value) : value;
}

export function normalizeParrotStyleMediaUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) {
    return getParrotStyleMediaUrl(trimmed);
  }

  return isParrotMediaReference(trimmed, [PARROT_STYLE_MEDIA_R2_PREFIX, PARROT_STYLE_MEDIA_PREFIX])
    ? getParrotStyleMediaUrl(value)
    : value;
}

export function getParrotAudioObjectKey(path: string): string {
  return `${PARROT_AUDIO_PREFIX}/${normalizeParrotAudioPath(path)}`;
}

export function getParrotStyleMediaObjectKey(path: string): string {
  return `${PARROT_STYLE_MEDIA_R2_PREFIX}/${normalizeParrotStyleMediaPath(path)}`;
}
