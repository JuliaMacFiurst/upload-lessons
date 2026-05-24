import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  handleRecipeValidationError,
  loadRecipe,
  updateRecipe,
} from "../../../../lib/server/recipes-admin";
import type { RecipePayload } from "../../../../lib/recipes/types";

type SaveBody = {
  recipe?: RecipePayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const recipeId = typeof req.query.recipeId === "string" ? req.query.recipeId : "";
  if (!recipeId) {
    return res.status(400).json({ error: "Missing `recipeId`." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const recipe = await loadRecipe(supabase, recipeId);
      return res.status(200).json({ recipe });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load recipe.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as SaveBody;
    if (!body.recipe) {
      return res.status(400).json({ error: "Missing recipe payload." });
    }

    const recipe = await updateRecipe(supabase, recipeId, body.recipe);
    return res.status(200).json({ ok: true, recipe });
  } catch (error) {
    const normalized = handleRecipeValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
