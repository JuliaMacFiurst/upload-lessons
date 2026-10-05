import type {
  BedtimeStoryRecord,
  BedtimeStorySlidePatch,
} from "./types.ts";

export function normalizeLibraryEditorStory(story: BedtimeStoryRecord): BedtimeStoryRecord {
  return story.content_type === "video" && story.slides.length > 0
    ? { ...story, slides: [] }
    : story;
}

export function buildLibrarySlidesSavePatch(
  story: BedtimeStoryRecord,
  includePage2: boolean,
  ruPage1: string,
  ruPage2: string,
): {
  slides: BedtimeStorySlidePatch[];
  replaceSlides: boolean;
  deleteSlideNumbers: number[];
} {
  if (story.content_type === "video") {
    return { slides: [], replaceSlides: true, deleteSlideNumbers: [] };
  }

  const slides: BedtimeStorySlidePatch[] = [
    {
      slide_number: 1,
      illustration_prompt: story.slides[0]?.illustration_prompt ?? "",
      stamp_prompt: story.slides[0]?.stamp_prompt ?? "",
      marker_prompt: story.slides[0]?.marker_prompt ?? "",
      image_url: ruPage1 || story.slides[0]?.image_url || "",
      layers: story.slides[0]?.layers ?? [],
      text: story.slides[0]?.text || { ru: "", en: "", he: "" },
    },
  ];

  if (includePage2) {
    slides.push({
      slide_number: 2,
      illustration_prompt: story.slides[1]?.illustration_prompt ?? "",
      stamp_prompt: story.slides[1]?.stamp_prompt ?? "",
      marker_prompt: story.slides[1]?.marker_prompt ?? "",
      image_url: ruPage2 || story.slides[1]?.image_url || "",
      layers: story.slides[1]?.layers ?? [],
      text: story.slides[1]?.text || { ru: "", en: "", he: "" },
    });
  }

  for (let index = 2; index < story.slides.length; index += 1) {
    const slide = story.slides[index];
    slides.push({
      slide_number: slide.slide_number,
      text: slide.text,
      illustration_prompt: slide.illustration_prompt,
      stamp_prompt: slide.stamp_prompt,
      marker_prompt: slide.marker_prompt,
      image_url: slide.image_url,
      layers: slide.layers,
    });
  }

  return {
    slides,
    replaceSlides: false,
    deleteSlideNumbers: !includePage2 && story.slides.some((slide) => slide.slide_number === 2) ? [2] : [],
  };
}
