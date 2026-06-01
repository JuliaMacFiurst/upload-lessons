import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import {
  deleteBedtimeStory,
  handleBedtimeStoryValidationError,
  loadBedtimeStory,
  updateBedtimeStory,
} from "../../../../lib/server/bedtime-stories-admin";
import type { BedtimeStoryPayload } from "../../../../lib/bedtime-stories/types";

type SaveBody = {
  story?: BedtimeStoryPayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const storyId = typeof req.query.storyId === "string" ? req.query.storyId : "";
  if (!storyId) {
    return res.status(400).json({ error: "Missing `storyId`." });
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
      const story = await loadBedtimeStory(supabase, storyId);
      return res.status(200).json({ story });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load bedtime story.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      await deleteBedtimeStory(supabase, storyId);
      return res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete bedtime story.";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as SaveBody;
    if (!body.story) {
      return res.status(400).json({ error: "Missing bedtime story payload." });
    }

    const story = await updateBedtimeStory(supabase, storyId, body.story);
    return res.status(200).json({ ok: true, story });
  } catch (error) {
    const normalized = handleBedtimeStoryValidationError(error);
    return res.status(normalized.status).json(normalized.body);
  }
}
