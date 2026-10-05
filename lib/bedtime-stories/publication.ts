import type { BedtimeStoryPayload, BedtimeStoryStatus } from "./types.ts";

export const LIBRARY_EDITORIAL_STATUSES = ["draft", "archived"] as const satisfies readonly BedtimeStoryStatus[];

export const LIBRARY_PUBLISH_ERRORS = {
  videoMedia: "Upload an MP4 before publishing this video.",
  videoPreview: "Add a poster/cover image before publishing this video.",
  imageMedia: "Upload an image before publishing this item.",
  slideshowSlides: "Slideshow content must contain at least 1 slide.",
} as const;

export function isLibraryEditorialStatus(status: BedtimeStoryStatus): status is typeof LIBRARY_EDITORIAL_STATUSES[number] {
  return LIBRARY_EDITORIAL_STATUSES.some((candidate) => candidate === status);
}

export function getLibraryPublishError(item: BedtimeStoryPayload): string | null {
  if (item.content_type === "slideshow" && item.slides.length === 0) {
    return LIBRARY_PUBLISH_ERRORS.slideshowSlides;
  }
  if (item.content_type === "video") {
    if (!item.media.url) return LIBRARY_PUBLISH_ERRORS.videoMedia;
    if (item.media.mimeType !== "video/mp4") return "Video media must be an MP4 file.";
    if (!item.media.posterUrl && !item.cover_image_url) return LIBRARY_PUBLISH_ERRORS.videoPreview;
  }
  if (item.content_type === "image" && !item.media.url) {
    return LIBRARY_PUBLISH_ERRORS.imageMedia;
  }
  for (const language of ["ru", "en", "he"] as const) {
    if (!item.description[language]?.trim()) return `Description is required in ${language.toUpperCase()} before publishing.`;
  }
  return null;
}

export function canonicalLibraryPublicationFields(
  item: BedtimeStoryPayload,
  now = new Date(),
): Pick<BedtimeStoryPayload, "status" | "is_published" | "publish_date" | "cover_image_url"> {
  return {
    status: "exported",
    is_published: true,
    publish_date: item.publish_date || now.toISOString(),
    cover_image_url: item.media.posterUrl || item.cover_image_url || null,
  };
}

export function getLibraryPublicationStateError(
  item: Pick<BedtimeStoryPayload, "status" | "is_published" | "publish_date">,
): string | null {
  if ((item.status === "draft" || item.status === "archived") && (item.is_published || item.publish_date)) {
    return `${item.status} Library items must remain unpublished.`;
  }
  if (item.status === "published" && (!item.is_published || !item.publish_date)) {
    return "Published Library items require is_published=true and publish_date. Use Publish Library Item.";
  }
  return null;
}

export function isCanonicalLibraryPublicationState(
  item: Pick<BedtimeStoryPayload, "status" | "is_published" | "publish_date">,
) {
  return item.status === "exported" && item.is_published === true && Boolean(item.publish_date);
}
