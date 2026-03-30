import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "@/lib/server/admin-session";
import { resolveMedia } from "@/lib/server/media/resolveMedia";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const slideText = typeof req.body?.slideText === "string" ? req.body.slideText.trim() : "";
  const targetId = typeof req.body?.targetId === "string" ? req.body.targetId.trim() : "";
  const mapType = typeof req.body?.mapType === "string" ? req.body.mapType.trim() : "";
  const searchQuery = typeof req.body?.searchQuery === "string" ? req.body.searchQuery.trim() : "";
  const preferredSource =
    req.body?.preferredSource === "wikimedia" ||
    req.body?.preferredSource === "pexels" ||
    req.body?.preferredSource === "giphy"
      ? req.body.preferredSource
      : "auto";
  const preferredType =
    req.body?.preferredType === "image" || req.body?.preferredType === "video"
      ? req.body.preferredType
      : undefined;
  const existingUrls = Array.isArray(req.body?.existingUrls)
    ? req.body.existingUrls.filter((value: unknown): value is string => typeof value === "string")
    : [];

  if (!slideText || !targetId || !mapType) {
    return res.status(400).json({ error: "slideText, targetId and mapType are required." });
  }

  if (preferredSource === "pexels" && !process.env.PEXELS_API_KEY) {
    return res.status(500).json({
      error: "PEXELS_API_KEY is not configured on the server.",
    });
  }

  if (preferredSource === "giphy" && !process.env.GIPHY_API_KEY) {
    return res.status(500).json({
      error: "GIPHY_API_KEY is not configured on the server.",
    });
  }

  try {
    const result = await resolveMedia({
      slideText,
      targetId,
      mapType,
      existingUrls,
      searchQuery,
      preferredSource,
      preferredType,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve media.";
    return res.status(500).json({ error: message });
  }
}
