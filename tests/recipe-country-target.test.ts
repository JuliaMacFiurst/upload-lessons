import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminSourceUrl = new URL("../lib/server/recipes-admin.ts", import.meta.url);
const apiSourceUrl = new URL("../pages/api/admin/recipes/[recipeId].ts", import.meta.url);
const pageSourceUrl = new URL("../pages/admin/recipes/[recipe_id].tsx", import.meta.url);

test("country target has a dedicated server-owned update path", async () => {
  const source = await readFile(adminSourceUrl, "utf8");
  const generalUpdate = source.slice(
    source.indexOf("export async function updateRecipe("),
    source.indexOf("export async function saveRecipeCountryTarget("),
  );
  const countryUpdate = source.slice(
    source.indexOf("export async function saveRecipeCountryTarget("),
    source.indexOf("export async function saveRecipeExportUrl("),
  );

  assert.doesNotMatch(generalUpdate, /country_target_id\s*:/);
  assert.match(countryUpdate, /\.eq\("map_type", "country"\)/);
  assert.match(countryUpdate, /\.update\(\{ country_target_id: normalizedTargetId \}\)/);
  assert.match(countryUpdate, /return loadRecipe\(supabase, recipeId\)/);
});

test("recipe API exposes an authenticated narrow PATCH contract", async () => {
  const source = await readFile(apiSourceUrl, "utf8");
  assert.match(source, /requireAdminSession\(req, res\)/);
  assert.match(source, /req\.method === "PATCH"/);
  assert.match(source, /"countryTargetId" in body/);
  assert.match(source, /saveRecipeCountryTarget\(supabase, recipeId, body\.countryTargetId\)/);
});

test("panel waits for the server-confirmed recipe instead of selecting optimistically", async () => {
  const source = await readFile(pageSourceUrl, "utf8");
  const handler = source.slice(
    source.indexOf("const selectCountryTarget = async"),
    source.indexOf("const setBrandLogo ="),
  );
  assert.match(handler, /method: "PATCH"/);
  assert.match(handler, /body: JSON\.stringify\(\{ countryTargetId: targetId \}\)/);
  assert.match(handler, /setRecipe\(data\.recipe\)/);
  assert.doesNotMatch(handler, /setRecipe\(\(current\)/);
});

test("empty country search has no permanent result palette", async () => {
  const source = await readFile(pageSourceUrl, "utf8");
  assert.match(source, /if \(!sessionChecked \|\| !query\) \{[\s\S]*?setCountryTargets\(\[\]\)/);
  assert.match(source, /countryTargetQuery\.trim\(\) \? \([\s\S]*?recipe-country-target-results/);
  assert.doesNotMatch(source, /countryTargets\.map\(\(target\)/);
});

test("selected country is compact, removable, and omitted from search results", async () => {
  const source = await readFile(pageSourceUrl, "utf8");
  assert.match(source, /recipe\.country_target_id \? \([\s\S]*?recipe-country-target-current/);
  assert.match(source, /className="recipe-country-target-clear"/);
  assert.match(source, /target\.target_id !== recipe\.country_target_id/);
  assert.match(source, /setCountryTargetQuery\(""\)/);
  assert.match(source, /setCountryTargets\(\[\]\)/);
});
