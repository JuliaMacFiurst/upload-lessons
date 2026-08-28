import type { RecipeRecord, RecipeTranslation } from "./types";

export type RecipeExportLanguage = "ru" | "en" | "he";

export const RECIPE_EXPORT_WIDTH = 1000;
export const RECIPE_EXPORT_HEIGHT = 1500;
export const RECIPE_EXPORT_MIN_WIDTH = 800;
export const RECIPE_EXPORT_MIN_HEIGHT = 1200;
export const RECIPE_EXPORT_ASPECT_RATIO = 2 / 3;
export const RECIPE_EXPORT_ASPECT_RATIO_TOLERANCE = 0.04;
export const RECIPE_EXPORT_FORMAT_ERROR = "Recipe export must be a PNG image.";
export const RECIPE_EXPORT_GEOMETRY_ERROR = "Recipe export should be a vertical image with approximately a 2:3 aspect ratio.";
export const RECIPE_EXPORT_SIZE_ERROR = "Recipe export image is too small. Use at least 800 × 1200 px.";

type ExportRecipeData = {
  title?: string;
  country?: string;
  description?: string;
  ingredients?: string[];
  cooking_time?: string;
  cooking_steps?: Array<{ order: number; text: string }>;
  fact?: string;
  raccoon_caption?: string;
  raccoon_advice?: string;
  serving_instructions?: string;
  laplapla_interaction_caption?: string;
};

export type RecipePosterContent = {
  title: string;
  region?: string;
  cookingTime?: string;
  ingredients: string[];
  steps: string[];
  characterNote?: string;
  raccoonTip?: string;
  servingTip?: string;
  interestingFact?: string;
  callToAction?: string;
};

type RecipePosterLabels = {
  ingredients: string;
  steps: string;
  raccoonTip: string;
  serving: string;
  fact: string;
};

const RECIPE_POSTER_LABELS: Record<RecipeExportLanguage, RecipePosterLabels> = {
  ru: {
    ingredients: "Ингредиенты",
    steps: "Как приготовить",
    raccoonTip: "Совет енотика",
    serving: "К столу",
    fact: "Интересный факт",
  },
  en: {
    ingredients: "Ingredients",
    steps: "Let's cook",
    raccoonTip: "Raccoon's tip",
    serving: "Serve with",
    fact: "Did you know?",
  },
  he: {
    ingredients: "מרכיבים",
    steps: "איך מכינים",
    raccoonTip: "הטיפ של הדביבון",
    serving: "להגשה",
    fact: "הידעת?",
  },
};

const DEFAULT_POSTER_CTA: Record<RecipeExportLanguage, string> = {
  ru: "Сохрани рецепт на LapLapLa",
  en: "Save this recipe on LapLapLa",
  he: "שמרו את המתכון ב-LapLapLa",
};

function compactRecipeData(data: ExportRecipeData): ExportRecipeData {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => (
      Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim().length > 0 : value != null
    )),
  ) as ExportRecipeData;
}

function translatedRecipeData(translation: RecipeTranslation): ExportRecipeData {
  return compactRecipeData({
    title: translation.title,
    country: translation.country,
    description: translation.description,
    ingredients: translation.ingredients,
    cooking_time: translation.cooking_time,
    cooking_steps: translation.cooking_steps,
    fact: translation.fact,
    raccoon_caption: translation.raccoon_caption,
    raccoon_advice: translation.raccoon_advice,
    serving_instructions: translation.serving_instructions,
    laplapla_interaction_caption: translation.laplapla_interaction_caption,
  });
}

export function getLocalizedRecipeExportData(
  recipe: RecipeRecord,
  language: RecipeExportLanguage,
): ExportRecipeData {
  if (language !== "ru") {
    return translatedRecipeData(recipe.translations[language] ?? {});
  }

  return compactRecipeData({
    title: recipe.title,
    country: recipe.country ?? undefined,
    description: recipe.description ?? undefined,
    ingredients: recipe.ingredients,
    cooking_time: recipe.cooking_time ?? undefined,
    cooking_steps: recipe.cooking_steps,
    fact: recipe.fact ?? undefined,
    raccoon_caption: recipe.raccoon_caption ?? undefined,
    raccoon_advice: recipe.raccoon_advice ?? undefined,
    serving_instructions: recipe.serving_instructions ?? undefined,
    laplapla_interaction_caption: recipe.laplapla_interaction_caption ?? undefined,
  });
}

export function buildRecipePosterContent(
  recipe: RecipeRecord,
  language: RecipeExportLanguage,
): RecipePosterContent {
  const localized = getLocalizedRecipeExportData(recipe, language);
  const sourceCta = localized.laplapla_interaction_caption?.trim();

  return {
    title: localized.title?.trim() ?? "",
    region: localized.country?.trim() || undefined,
    cookingTime: localized.cooking_time?.trim() || undefined,
    ingredients: localized.ingredients?.map((item) => item.trim()).filter(Boolean) ?? [],
    steps: localized.cooking_steps
      ?.filter((step) => step.text.trim().length > 0)
      .map((step) => `${step.order}. ${step.text.trim()}`) ?? [],
    characterNote: localized.raccoon_caption?.trim() || undefined,
    raccoonTip: localized.raccoon_advice?.trim() || undefined,
    servingTip: localized.serving_instructions?.trim() || undefined,
    interestingFact: localized.fact?.trim() || undefined,
    callToAction: sourceCta && sourceCta.length <= 100 ? sourceCta : DEFAULT_POSTER_CTA[language],
  };
}

function quoted(value: string): string {
  return `'${value}'`;
}

function formatProcessAssets(content: RecipePosterContent): string {
  const assets: string[] = [];

  for (const ingredient of content.ingredients) {
    assets.push(`- A delicate die-cut spot illustration of the actual ingredient named in: ${quoted(ingredient)}. Preserve its stated form and quantity; do not add a substitute, garnish, container, or preparation state that is not supplied.`);
  }
  for (const step of content.steps) {
    assets.push(`- A tiny process vignette corresponding exactly to: ${quoted(step)}. Illustrate only the action, food, and tools explicitly named or unavoidably implied by this instruction; do not invent another action or ingredient.`);
  }

  return assets.length > 0
    ? assets.join("\n")
    : "- No process props are specified. Keep decoration botanical and paper-based; do not invent food ingredients or cooking actions.";
}

function formatVisiblePosterText(
  content: RecipePosterContent,
  language: RecipeExportLanguage,
): string {
  const labels = RECIPE_POSTER_LABELS[language];
  const blocks: string[] = [
    `TITLE — display only the dish name, with no label:\n${quoted(content.title)}`,
  ];

  const tags = [content.region, content.cookingTime].filter((value): value is string => Boolean(value));
  if (tags.length > 0) {
    blocks.push(`SMALL PINNED TAGS — no extra labels:\n${tags.map(quoted).join("\n")}`);
  }
  if (content.ingredients.length > 0) {
    blocks.push(`INGREDIENTS SECTION\nVisible heading: ${quoted(labels.ingredients)}\nVisible lines:\n${content.ingredients.map(quoted).join("\n")}`);
  }
  if (content.steps.length > 0) {
    blocks.push(`PREPARATION SECTION\nVisible heading: ${quoted(labels.steps)}\nVisible numbered steps:\n${content.steps.map(quoted).join("\n")}`);
  }
  if (content.raccoonTip) {
    blocks.push(`RACCOON TIP NOTE\nVisible heading: ${quoted(labels.raccoonTip)}\nVisible text: ${quoted(content.raccoonTip)}`);
  }
  if (content.characterNote) {
    blocks.push(`CHARACTER SPEECH BUBBLE — show this beside a raccoon with NO heading:\n${quoted(content.characterNote)}`);
  }
  if (content.servingTip) {
    blocks.push(`SERVING NOTE\nVisible heading: ${quoted(labels.serving)}\nVisible text: ${quoted(content.servingTip)}`);
  }
  if (content.interestingFact) {
    blocks.push(`FACT NOTE\nVisible heading: ${quoted(labels.fact)}\nVisible text: ${quoted(content.interestingFact)}`);
  }
  if (content.callToAction) {
    blocks.push(`TINY CTA TAG — no extra label:\n${quoted(content.callToAction)}`);
  }

  return blocks.join("\n\n");
}

export function buildRecipeExportImagePrompt(
  recipe: RecipeRecord,
  language: RecipeExportLanguage,
): string {
  const posterContent = buildRecipePosterContent(recipe, language);
  const visibleText = formatVisiblePosterText(posterContent, language);
  const processAssets = formatProcessAssets(posterContent);
  const languageName = language === "ru" ? "Russian" : language === "en" ? "English" : "Hebrew";
  const hebrewInstructions = language === "he" ? `
HEBREW AND RTL REQUIREMENTS
- All Hebrew must be valid Hebrew and rendered RIGHT-TO-LEFT.
- Maintain logical Unicode order. Do not reverse individual words and do not mirror Hebrew characters.
- Align Hebrew text appropriately for RTL and preserve numbers, units, and punctuation in mixed RTL text.
- Do not insert English or Russian labels.
` : "";

  return `Create a stunning vertical vintage scrapbook recipe poster for LapLapLa Raccoons: a richly detailed, layered handmade storybook recipe page with tactile paper-collage depth and tiny visual discoveries.

OUTPUT CONTRACT
- Exactly 1000 × 1500 pixels, portrait 2:3, final format PNG.
- One finished flat image: no mockup, phone, tablet, frame, or surrounding background outside the poster.

NON-NEGOTIABLE ART DIRECTION
- Traditional handmade storybook watercolor and fine-line ink illustration on textured off-white watercolor paper.
- Use delicate ink-and-watercolor linework, fine-line pen hatching and cross-hatching, subtle graphite-pencil underdrawing, expressive loose ink contours, and translucent layered watercolor washes with soft organic pigment blooms.
- Aim for a whimsical Beatrix Potter / classic storybook illustration aesthetic: observational hand drawing, gentle humor, natural textures, and authored imperfections. Do not copy any existing composition, character, or artwork.
- Create a richly detailed layered vintage scrapbook / storybook recipe poster: tactile layered paper collage, dimensional 2.5D scrapbook feeling, textured kraft paper, lined notebook paper, torn paper edges, pastel washi tape, pins, lace, dried flowers, tiny decorative stickers, layered paper depth, and soft realistic drop shadows beneath dimensional paper layers.
- Food should look appetizing and carefully observed through ink-and-watercolor illustration, never like a photorealistic render, plastic object, or glossy 3D asset.
- NO glossy 3D renders, NO plastic or toy-like characters, NO flat vector/Canva clip-art, NO generic digital icons, NO corporate infographic, NO UI cards, NO sterile geometric layout, and NO repeated identical rectangular sections.
- Do not copy exact artwork or individual elements from any existing reference image. Follow only this described artistic language.

RACCOON CHARACTERS
- Draw every raccoon by hand in a delicate ink-and-watercolor storybook style: expressive fine ink contours, fine pen hatching, soft fluffy watercolor fur texture, lively dark expressive eyes, tiny whiskers, tiny paws, and warm individual expressions.
- Hero raccoon: an adorable baby raccoon chef in a soft linen chef hat, interacting directly with a real action from the supplied cooking process.
- Include several tiny hand-drawn raccoon vignettes scattered across the page: peeking from behind a note, cooking or dusting flour only when supported by the supplied recipe, holding a process-appropriate tool, tasting a crumb, carrying one supplied ingredient, or sitting near the finished dish.
- Choose only scenes that make visual sense for THIS recipe. These scenes are playful visual storytelling and must never introduce new recipe facts, ingredients, tools required by the instructions, or preparation steps.
- Never render a flat vector mascot, glossy 3D sticker, corporate kawaii icon, clipart character, or sterile cartoon infographic.

STEP-BY-STEP PROCESS ASSETS & PROPS — CRITICAL
Surround the text and paper notes with delicate hand-painted ink-and-watercolor die-cut spot illustrations tied directly to the localized recipe content. Treat every bullet below as a concrete micro-illustration brief. Do not merge in generic kitchen props that are absent from the source.

${processAssets}

RICH RECIPE-SPECIFIC DETAILS
- Make the page abundant with tiny discoveries; do not leave large empty areas merely for minimalist styling.
- Surround the content with hand-painted elements specifically connected to this recipe: its listed ingredients, the finished dish, appropriate tableware and kitchen tools, towels, flowers, leaves, berries, tiny hearts and stars, ribbons, decorative tape, paper tags, torn notebook scraps, pencil doodles, crumbs, and small watercolor ornaments.
- Details must create one coherent story about this particular recipe, not look like a random collection of stickers.
- Make the finished dish large, beautiful, appetizing, visually prominent, and rendered as a lovingly observed watercolor food illustration.
- Regional or cultural visual hints may be used only when appropriate, respectful, and supported by the supplied recipe context.

BACKGROUND AND COLOR
- Never use a flat single-color digital background or a sharp digital gradient.
- Build a warm gentle pastel cream/beige background with a subtle gradient, paper texture, watercolor softness, and nuanced blush, peach, pale yellow, dusty blue, or sage transitions chosen to suit the dish.
- Select a harmonious palette suited to the dish from warm cream, blush pink, peach, dusty blue, sage, pale yellow, and related nuanced colors.
- Color transitions must look like several watercolor pigments naturally spreading and blending on paper. Keep the background calm enough for excellent text readability while still giving the artwork depth and tactile richness.

ILLUSTRATED COOKBOOK TYPOGRAPHY
- Do not use generic bold sans-serif typography throughout.
- Make the dish name large, expressive, rounded or dimensional cookbook display lettering, with a tasteful outline or shadow where appropriate: decorative but highly readable and integrated into the illustration.
- Use charming hand-lettered headings and playful handwritten display typography for section headings; restrained calligraphic accents are welcome.
- Body text must use clean readable print with high contrast and no distortion. Small notes may use elegant handwritten or calligraphic lettering.
- Use 2–3 harmonious lettering styles with clear typography hierarchy. Do not render every line in the same generic bold sans-serif font.

VISIBLE TEXT — SOURCE OF TRUTH
Render only the exact text inside single quotation marks below. Preserve every quoted character, number, unit, and punctuation mark. Uppercase English structural directions are instructions to you and must not appear in the artwork. Empty optional sections have already been removed.

${visibleText}

SCRAPBOOK COMPOSITION
- TOP: large expressive recipe title. Place the region and cooking time nearby as small pinned tags when supplied.
- SIDE: ingredients on one irregular kraft-paper or lined-notebook sheet with tactile holes, a pin, or washi tape.
- CENTER: a large hero illustration of the finished dish together with the baby raccoon chef.
- LOWER AREA AND AROUND THE CENTER: arrange numbered steps as individual varied paper notes attached with washi tape, not identical UI cards.
- Show a raccoon tip as a torn-paper speech bubble or handwritten note. Use a vintage postcard, floral label, or small decorative paper for a serving note or fact. Put the CTA on a tiny kraft tag tied with string.
- Keep the composition asymmetrical, layered, dimensional, lively, and clearly readable. Allow illustrations to overlap paper edges, but never cover important text.
- Use supplied ingredients and dish details as visual inspiration for tiny illustrations and props. Never add an ingredient not present in VISIBLE TEXT.

NEVER DISPLAY
- Never display JSON, braces, code, schema identifiers, database field names, CMS terminology, internal English structural directions, or technical labels.
- Never show labels equivalent to “Interaction”, “Raccoon caption”, “Serving instructions”, or other backend terminology in any language.
- The viewer must never be able to tell that the poster was generated from structured database fields.

FACTUAL FIDELITY
- The quoted VISIBLE TEXT is the sole factual source of truth.
- Do not invent or alter ingredients, quantities, temperatures, times, steps, numbers, units, country/region, historical facts, or serving instructions. Do not remove meaningful steps.
- Preserve the exact localized meaning. If a value is absent, do not fabricate it.

TYPOGRAPHY AND TEXT QUALITY
- All visible recipe text must be in ${languageName} only, except universal numeric values/units and unavoidable proper names.
- Preserve names, numbers, temperatures, times, measurements, punctuation, and factual meaning.
- Use highly legible, correctly spelled text, generous spacing, clear hierarchy, and strong foreground/background contrast.
- No decorative object may cover important text.
- No warped letters, random characters, duplicate ingredients or steps, truncated words, gibberish, watermark, AI-generator signature, or unrelated text.
${hebrewInstructions}
EMOTIONAL RESULT
The final artwork should feel sweet, cozy, warm, whimsical, handcrafted and full of tiny discoveries. It should invite the viewer to look closer and notice small illustrated details. It should feel created by a children's-book watercolor artist, not assembled by an infographic generator.

MANDATORY PRE-RENDER QUALITY CHECK
Before rendering, inspect the proposed design. If it resembles a generic AI infographic, Canva template, vector poster, educational worksheet, UI dashboard, flat kawaii sticker sheet or corporate recipe card, reject that composition and redesign it as a handmade watercolor illustrated cookbook page.
The accepted design must instead look like a richly illustrated vintage scrapbook, a whimsical children's cookbook, a layered handmade storybook recipe page, and a tactile paper collage with depth and tiny visual discoveries.`;
}

export function mergeRecipeExportUrl(
  current: Record<string, string>,
  language: RecipeExportLanguage,
  publicUrl: string,
): Record<string, string> {
  return { ...current, [language]: publicUrl };
}

export function normalizeRecipeExportSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function buildRecipeExportObjectKey(input: {
  slug: string;
  language: RecipeExportLanguage;
  versionId: string;
}): string {
  const slug = normalizeRecipeExportSlug(input.slug);
  return `recipes/exports/${slug}/${slug}-${input.language}-pinterest-${input.versionId}.png`;
}

export function validateRecipeExportImageMetadata(metadata: {
  width?: number;
  height?: number;
  format?: string;
}): void {
  if (metadata.format !== "png") {
    throw new Error(RECIPE_EXPORT_FORMAT_ERROR);
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const ratio = height > 0 ? width / height : 0;
  if (
    width <= 0
    || height <= 0
    || width >= height
    || Math.abs(ratio - RECIPE_EXPORT_ASPECT_RATIO) > RECIPE_EXPORT_ASPECT_RATIO_TOLERANCE
  ) {
    throw new Error(RECIPE_EXPORT_GEOMETRY_ERROR);
  }
  if (width < RECIPE_EXPORT_MIN_WIDTH || height < RECIPE_EXPORT_MIN_HEIGHT) {
    throw new Error(RECIPE_EXPORT_SIZE_ERROR);
  }
}

export function validateRecipeExportDeclaredFormat(input: {
  contentType: string;
  fileName?: string;
}): void {
  if (
    input.contentType !== "image/png"
    || (input.fileName !== undefined && !/\.png$/i.test(input.fileName))
  ) {
    throw new Error(RECIPE_EXPORT_FORMAT_ERROR);
  }
}
