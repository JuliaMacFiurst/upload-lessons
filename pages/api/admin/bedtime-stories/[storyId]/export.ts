import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  loadBedtimeStory,
  saveBedtimeStoryExportUrl,
} from "../../../../../lib/server/bedtime-stories-admin";
import { hasR2Config, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

type ExportBody = {
  language?: "en" | "ru" | "he";
  slideNumber?: number;
  imageBase64?: string;
  contentType?: string;
  layerName?: string;
};

const FALLBACK_BUCKET = process.env.BEDTIME_STORY_STORAGE_BUCKET || "recipes";

function normalizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function decodeImageBase64(value: string): Buffer {
  const payload = value.includes(",") ? value.split(",").pop() ?? "" : value;
  if (!payload.trim()) {
    throw new Error("Missing image payload.");
  }
  return Buffer.from(payload, "base64");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const storyId = typeof req.query.storyId === "string" ? req.query.storyId : "";
  if (!storyId) {
    return res.status(400).json({ error: "Missing `storyId`." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as ExportBody;
    const language = body.language;
    const slideNumber = Number(body.slideNumber);
    if (language !== "en" && language !== "ru" && language !== "he") {
      return res.status(400).json({ error: "language must be en, ru, or he." });
    }
    if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 10) {
      return res.status(400).json({ error: "slideNumber must be 1-10 for Instagram carousel export." });
    }
    if (!body.imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
    }

    const contentType = body.contentType === "image/webp" ? "image/webp" : "image/png";
    const extension = contentType === "image/webp" ? "webp" : "png";
    const story = await loadBedtimeStory(supabase, storyId);
    const slug = normalizeStorageSegment(story.slug || story.id);
    const buffer = decodeImageBase64(body.imageBase64);
    const layerName = typeof body.layerName === "string" && /^[a-z0-9_-]{1,40}$/i.test(body.layerName)
      ? normalizeStorageSegment(body.layerName)
      : "";
    const path = layerName
      ? `bedtime_story/${slug}/layered/${language}/slide-${String(slideNumber).padStart(2, "0")}/${layerName}.${extension}`
      : `bedtime_story/${slug}/export/${language}/slide-${String(slideNumber).padStart(2, "0")}.${extension}`;
    let publicUrl: string;

    if (hasR2Config()) {
      publicUrl = await uploadPublicR2Object({ key: path, body: buffer, contentType });
    } else {
      const supabasePath = path.replace(/^bedtime_story\//, "");
      const { error: uploadError } = await supabase.storage.from(FALLBACK_BUCKET).upload(supabasePath, buffer, {
        cacheControl: "3600",
        upsert: true,
        contentType,
      });
      if (uploadError) {
        throw new Error(`Failed to upload bedtime story export: ${uploadError.message}`);
      }
      const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(supabasePath);
      publicUrl = data.publicUrl;
    }

    const updatedStory = await saveBedtimeStoryExportUrl(supabase, storyId, language, slideNumber, publicUrl, layerName || undefined);
    return res.status(200).json({ ok: true, language, slideNumber, layerName: layerName || null, path, publicUrl, story: updatedStory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload bedtime story export.";
    return res.status(500).json({ error: message });
  }
}
