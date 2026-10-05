import type { LibraryContentType } from "./types.ts";

export const canonicalLibrarySlideshowImportExample = {
  slug: "moon-train-memory",
  status: "draft",
  content_type: "slideshow",
  title: {
    en: "The Moon Train Remembered My Name",
    ru: "Лунный поезд помнил мое имя",
    he: "רכבת הירח זכרה את שמי",
  },
  description: {
    en: "A quiet illustrated memory for bedtime.",
    ru: "Тихое иллюстрированное воспоминание перед сном.",
    he: "זיכרון מאויר ושקט לפני השינה.",
  },
  emotional_theme: {
    en: "A remembered journey that feels almost real.",
    ru: "Вспомненное путешествие, которое почти было настоящим.",
    he: "מסע זכור שמרגיש כמעט אמיתי.",
  },
  category_slugs: ["stories"],
  collection_tags: ["dream travel", "moon"],
  visual_tags: ["watercolor", "night train"],
  instagram_caption: {
    en: "A tiny bedtime carousel about a soft moon train and the names it keeps.",
    ru: "Маленькая карусель перед сном про мягкий лунный поезд и имена, которые он хранит.",
    he: "קרוסלת לילה קטנה על רכבת ירח רכה והשמות שהיא שומרת.",
  },
  hashtags: ["#bedtimestory", "#illustratedstory", "#laplapla"],
  slides: [
    {
      slide_number: 1,
      text: {
        en: "I found the moon train waiting where the road became silver.",
        ru: "Я нашла лунный поезд там, где дорога стала серебряной.",
        he: "מצאתי את רכבת הירח במקום שבו הדרך הפכה כסופה.",
      },
      illustration_prompt: "watercolor moon train at a quiet silver road, storybook, soft night",
      stamp_prompt: "tiny moon ticket stamp",
      marker_prompt: "silver rail marker",
      image_url: "",
      layers: [],
    },
  ],
} as const;

export const canonicalLibraryVideoImportExample = {
  slug: "moving-paper-desert",
  status: "draft",
  content_type: "video",
  title: {
    en: "Make a Moving Paper Desert",
    ru: "Сделай движущуюся бумажную пустыню",
    he: "יוצרים מדבר נייר שזז",
  },
  description: {
    en: "A hands-on paper craft with a moving sun.",
    ru: "Бумажная поделка с движущимся солнцем.",
    he: "יצירת נייר מעשית עם שמש זזה.",
  },
  emotional_theme: {
    en: "A tiny paper desert where a simple hidden mechanism makes the sun move.",
    ru: "Маленькая бумажная пустыня, в которой простой скрытый механизм заставляет солнце двигаться.",
    he: "מדבר נייר קטן שבו מנגנון נסתר ופשוט גורם לשמש לזוז.",
  },
  category_slugs: ["crafts", "science"],
  collection_tags: ["crafts", "science", "paper craft", "moving paper", "desert"],
  visual_tags: ["paper desert", "layered dunes", "moving sun", "paper slider", "hands-on craft"],
  instagram_caption: {
    en: "Make a tiny paper desert that actually moves. Cut three wavy dune layers, hide a simple paper slider behind them, add a sun and pull. ☀️🏜️ Then see if you can make the dune sing.",
    ru: "Сделай маленькую бумажную пустыню, которая действительно движется. Вырежи три волнистых слоя дюн, спрячь за ними простой бумажный слайдер, добавь солнце и потяни. ☀️🏜️ А потом попробуй заставить дюну петь.",
    he: "יוצרים מדבר נייר קטן שבאמת זז. גוזרים שלוש שכבות גליות של דיונות, מחביאים מאחוריהן סליידר פשוט מנייר, מוסיפים שמש ומושכים. ☀️🏜️ ואז נסו לגרום לדיונה לשיר.",
  },
  hashtags: ["#papercraft", "#kidscrafts", "#craftideas", "#stemactivities", "#creativelearning", "#laplapla"],
  media: {
    url: "",
    posterUrl: "",
    mimeType: "",
  },
  slides: [],
} as const;

export function libraryImportExampleForContentType(contentType: LibraryContentType) {
  return contentType === "video"
    ? canonicalLibraryVideoImportExample
    : canonicalLibrarySlideshowImportExample;
}

export function libraryImportExampleJson(contentType: LibraryContentType) {
  return JSON.stringify(libraryImportExampleForContentType(contentType), null, 2);
}
