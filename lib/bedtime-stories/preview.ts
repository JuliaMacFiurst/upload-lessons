import type { BedtimeStoryLanguage, BedtimeStoryRecord } from "./types.ts";

export function getBedtimePreviewPages(story: BedtimeStoryRecord, language: BedtimeStoryLanguage) {
  return story.slides.map((slide) => {
    const number = String(slide.slide_number).padStart(2, "0");
    const exact = story.exported_image_urls[`${language}-${number}`]?.trim() || "";
    const legacyRu = language === "ru" && !exact
      ? slide.image_url?.trim() || story.images[number]?.trim() || ""
      : "";
    return {
      pageNumber: slide.slide_number,
      imageUrl: legacyRu.includes("/en/") || legacyRu.includes("/he/") ? exact : exact || legacyRu,
      text: slide.text[language] || "",
    };
  });
}
