import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecipeExportImagePrompt,
  buildRecipeExportObjectKey,
  buildRecipePosterContent,
  getLocalizedRecipeExportData,
  mergeRecipeExportUrl,
  validateRecipeExportDeclaredFormat,
  validateRecipeExportImageMetadata,
} from "../lib/recipes/export-image.ts";
import type { RecipeRecord } from "../lib/recipes/types.ts";

const recipe: RecipeRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "friday-family-pelmeni",
  title: "Семейные пельмени",
  description: "Домашний рецепт",
  image_url: "https://example.com/dish.webp",
  country: "Россия",
  country_target_id: "russia",
  ingredients: ["Мука — 300 г", "Вода — 120 мл"],
  fact: "Семейная традиция",
  raccoon_caption: "Лепим вместе",
  cooking_time: "60 минут",
  cooking_steps: [{ order: 1, text: "Замесить тесто" }],
  raccoon_advice: "Не торопитесь",
  serving_instructions: "Подавать горячими",
  laplapla_interaction_caption: "Сохрани рецепт",
  hashtags: ["пельмени"],
  publish_date: null,
  pinterest_status: "draft",
  pinterest_description: null,
  exported_image_urls: { ru: "https://media.example/ru.jpg", en: "https://media.example/en.jpg" },
  asset_set_key: null,
  sticker_set_key: null,
  layout_json: { secretLayoutInternal: true },
  gradient_from: null,
  gradient_to: null,
  is_active: true,
  translations: {
    en: {
      title: "Family Pelmeni",
      country: "Russia",
      ingredients: ["Flour — 300 g", "Water — 120 ml"],
      cooking_steps: [{ order: 1, text: "Knead the dough" }],
    },
    he: {
      title: "כיסונים משפחתיים",
      country: "רוסיה",
      ingredients: ["קמח — 300 גרם"],
      cooking_steps: [{ order: 1, text: "ללוש את הבצק" }],
    },
  },
};

test("prompt contains localized current recipe content and the output contract", () => {
  const ru = buildRecipeExportImagePrompt(recipe, "ru");
  const en = buildRecipeExportImagePrompt(recipe, "en");
  const he = buildRecipeExportImagePrompt(recipe, "he");
  assert.match(ru, /Семейные пельмени/);
  assert.match(en, /Family Pelmeni/);
  assert.match(he, /כיסונים משפחתיים/);
  assert.match(he, /ללוש את הבצק/);
  assert.doesNotMatch(he, /םייתחפשמ/);
  assert.match(he, /RIGHT-TO-LEFT/);
  assert.match(ru, /Exactly 1000 × 1500 pixels, portrait 2:3, final format PNG\./);
  assert.doesNotMatch(ru, /JPEG|JPG/);
});

test("poster presentation model replaces storage-shaped data with editorial content", () => {
  assert.deepEqual(buildRecipePosterContent(recipe, "ru"), {
    title: "Семейные пельмени",
    region: "Россия",
    cookingTime: "60 минут",
    ingredients: ["Мука — 300 г", "Вода — 120 мл"],
    steps: ["1. Замесить тесто"],
    characterNote: "Лепим вместе",
    raccoonTip: "Не торопитесь",
    servingTip: "Подавать горячими",
    interestingFact: "Семейная традиция",
    callToAction: "Сохрани рецепт",
  });
});

test("final prompt contains no raw JSON or storage schema keys", () => {
  const prompt = buildRecipeExportImagePrompt(recipe, "ru");
  assert.doesNotMatch(prompt, /\{\s*"|"title"\s*:|SOURCE RECIPE (?:DATA|JSON)/);
  assert.doesNotMatch(prompt, /laplapla_interaction_caption|raccoon_caption|serving_instructions|cooking_steps/);
  assert.match(prompt, /Never display JSON/);
});

test("RU and EN prompts use human-readable editorial labels and quoted recipe text", () => {
  const ru = buildRecipeExportImagePrompt(recipe, "ru");
  const en = buildRecipeExportImagePrompt(recipe, "en");
  assert.match(ru, /Visible heading: 'Ингредиенты'/);
  assert.match(ru, /Visible heading: 'Как приготовить'/);
  assert.match(ru, /Visible heading: 'Совет енотика'/);
  assert.match(ru, /Visible heading: 'К столу'/);
  assert.match(ru, /Visible heading: 'Интересный факт'/);
  assert.match(ru, /'Семейные пельмени'/);
  assert.match(ru, /'1\. Замесить тесто'/);
  assert.match(en, /Visible heading: 'Ingredients'/);
  assert.match(en, /Visible heading: 'Let's cook'/);
});

test("HE prompt uses native labels, true source order, and quoted visible text", () => {
  const he = buildRecipeExportImagePrompt(recipe, "he");
  assert.match(he, /Visible heading: 'מרכיבים'/);
  assert.match(he, /Visible heading: 'איך מכינים'/);
  assert.match(he, /'כיסונים משפחתיים'/);
  assert.match(he, /'1\. ללוש את הבצק'/);
  assert.doesNotMatch(he, /םייתחפשמ/);
  assert.match(he, /logical Unicode order/);
});

test("empty optional sections are omitted from the final prompt", () => {
  const sparse: RecipeRecord = {
    ...recipe,
    country: null,
    cooking_time: null,
    ingredients: [],
    cooking_steps: [],
    raccoon_caption: null,
    raccoon_advice: null,
    serving_instructions: null,
    fact: null,
    laplapla_interaction_caption: null,
  };
  const prompt = buildRecipeExportImagePrompt(sparse, "ru");
  assert.doesNotMatch(prompt, /SMALL PINNED TAGS|INGREDIENTS SECTION|PREPARATION SECTION|RACCOON TIP NOTE|CHARACTER SPEECH BUBBLE|SERVING NOTE|FACT NOTE/);
  assert.match(prompt, /TINY CTA TAG/);
});

test("visual brief requires dimensional vintage scrapbook art and typography hierarchy", () => {
  const prompt = buildRecipeExportImagePrompt(recipe, "en");
  assert.match(prompt, /vintage scrapbook/i);
  assert.match(prompt, /layered paper/i);
  assert.match(prompt, /2\.5D/);
  assert.match(prompt, /soft realistic drop shadows/);
  assert.match(prompt, /baby raccoon chef/);
  assert.match(prompt, /lively dark expressive eyes/);
  assert.match(prompt, /typography hierarchy/);
  assert.match(prompt, /reject that composition and redesign it/);
  assert.match(prompt, /delicate ink-and-watercolor linework/);
  assert.match(prompt, /fine-line pen hatching/);
  assert.match(prompt, /expressive loose ink contours/);
  assert.match(prompt, /Beatrix Potter \/ classic storybook illustration aesthetic/);
  assert.match(prompt, /NO glossy 3D renders/);
});

test("process assets are enumerated from actual ingredients and steps", () => {
  const prompt = buildRecipeExportImagePrompt(recipe, "ru");
  assert.match(prompt, /STEP-BY-STEP PROCESS ASSETS & PROPS/);
  assert.match(prompt, /die-cut spot illustration of the actual ingredient named in: 'Мука — 300 г'/);
  assert.match(prompt, /tiny process vignette corresponding exactly to: '1\. Замесить тесто'/);
  assert.match(prompt, /do not invent another action or ingredient/);
});

test("factual safety instructions remain explicit", () => {
  const prompt = buildRecipeExportImagePrompt(recipe, "ru");
  assert.match(prompt, /Do not invent or alter ingredients, quantities, temperatures, times, steps/);
  assert.match(prompt, /Never add an ingredient not present in VISIBLE TEXT/);
  assert.match(prompt, /Preserve the exact localized meaning/);
});

test("localized prompt JSON excludes technical metadata and does not fall back to Russian", () => {
  const data = getLocalizedRecipeExportData(recipe, "en");
  assert.equal(data.title, "Family Pelmeni");
  assert.equal(data.description, undefined);
  const prompt = buildRecipeExportImagePrompt(recipe, "en");
  assert.doesNotMatch(prompt, /secretLayoutInternal|exported_image_urls|image_url|country_target_id|11111111/);
  assert.doesNotMatch(prompt, /Домашний рецепт/);
});

test("language URL merge and replacement preserve sibling exports", () => {
  const added = mergeRecipeExportUrl(recipe.exported_image_urls, "he", "https://media.example/he.png");
  assert.deepEqual(added, {
    ru: "https://media.example/ru.jpg",
    en: "https://media.example/en.jpg",
    he: "https://media.example/he.png",
  });
  const replaced = mergeRecipeExportUrl(added, "en", "https://media.example/en-v2.png");
  assert.equal(replaced.ru, added.ru);
  assert.equal(replaced.he, added.he);
  assert.equal(replaced.en, "https://media.example/en-v2.png");
});

test("PNG geometry accepts preferred and nearby generated portrait sizes", () => {
  assert.doesNotThrow(() => validateRecipeExportImageMetadata({ width: 1000, height: 1500, format: "png" }));
  assert.doesNotThrow(() => validateRecipeExportImageMetadata({ width: 1022, height: 1536, format: "png" }));
  assert.doesNotThrow(() => validateRecipeExportImageMetadata({ width: 900, height: 1320, format: "png" }));
});

test("PNG geometry rejects landscape, wrong-ratio, and undersized images with specific errors", () => {
  assert.throws(
    () => validateRecipeExportImageMetadata({ width: 1500, height: 1000, format: "png" }),
    /vertical image with approximately a 2:3 aspect ratio/,
  );
  assert.throws(
    () => validateRecipeExportImageMetadata({ width: 1000, height: 1200, format: "png" }),
    /vertical image with approximately a 2:3 aspect ratio/,
  );
  assert.throws(
    () => validateRecipeExportImageMetadata({ width: 600, height: 900, format: "png" }),
    /too small.*800 × 1200/,
  );
});

test("declared MIME and extension must both be PNG", () => {
  assert.doesNotThrow(() => validateRecipeExportDeclaredFormat({ contentType: "image/png", fileName: "poster.png" }));
  assert.throws(() => validateRecipeExportDeclaredFormat({ contentType: "image/jpeg", fileName: "poster.png" }), /must be a PNG image/);
  assert.throws(() => validateRecipeExportDeclaredFormat({ contentType: "image/png", fileName: "poster.jpg" }), /must be a PNG image/);
  assert.throws(() => validateRecipeExportDeclaredFormat({ contentType: "image/webp", fileName: "poster.webp" }), /must be a PNG image/);
});

test("JPEG bytes renamed to png are rejected by decoded format validation", () => {
  assert.doesNotThrow(() => validateRecipeExportDeclaredFormat({ contentType: "image/png", fileName: "renamed.png" }));
  assert.throws(
    () => validateRecipeExportImageMetadata({ width: 1000, height: 1500, format: "jpeg" }),
    /must be a PNG image/,
  );
});

test("R2 key preserves the existing recipe export naming convention", () => {
  assert.equal(
    buildRecipeExportObjectKey({ slug: recipe.slug, language: "he", versionId: "v123456" }),
    "recipes/exports/friday-family-pelmeni/friday-family-pelmeni-he-pinterest-v123456.png",
  );
});
