import sharp from "sharp";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  addBedtimeStoryAsset,
  loadBedtimeStory,
  saveBedtimeStorySlideImage,
} from "../../../../../lib/server/bedtime-stories-admin";
import { hasR2Config, uploadPublicR2Object } from "../../../../../lib/server/r2-storage";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "35mb",
    },
  },
};

type MediaBody = {
  kind?: "slide" | "stamp" | "marker";
  language?: "en" | "ru" | "he";
  slideNumber?: number;
  imageBase64?: string;
  fileName?: string;
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

async function imageToWebp(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: 2600,
      height: 2600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

async function uploadMedia(
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  path: string,
  buffer: Buffer,
): Promise<string> {
  if (hasR2Config()) {
    return uploadPublicR2Object({
      key: path,
      body: buffer,
      contentType: "image/webp",
    });
  }

  const supabasePath = path.replace(/^bedtime_story\//, "");
  const { error } = await supabase.storage.from(FALLBACK_BUCKET).upload(supabasePath, buffer, {
    cacheControl: "3600",
    upsert: true,
    contentType: "image/webp",
  });

  if (error) {
    throw new Error(`Failed to upload bedtime story media: ${error.message}`);
  }

  const { data } = supabase.storage.from(FALLBACK_BUCKET).getPublicUrl(supabasePath);
  return data.publicUrl;
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
    const body = (req.body ?? {}) as MediaBody;
    if (body.kind !== "slide" && body.kind !== "stamp" && body.kind !== "marker") {
      return res.status(400).json({ error: "Unsupported media kind." });
    }
    if (!body.imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64." });
    }

    const story = await loadBedtimeStory(supabase, storyId);
    const slug = normalizeStorageSegment(story.slug || story.id);
    const input = decodeImageBase64(body.imageBase64);
    const webp = await imageToWebp(input);

    if (body.kind === "slide") {
      const language = body.language;
      const slideNumber = Number(body.slideNumber);
      if (language !== "en" && language !== "ru" && language !== "he") {
        return res.status(400).json({ error: "language must be en, ru, or he." });
      }
      if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 10) {
        return res.status(400).json({ error: "slideNumber must be 1-10." });
      }

      const path = `bedtime_story/${slug}/${language}/slide-${String(slideNumber).padStart(2, "0")}.webp`;
      const publicUrl = await uploadMedia(supabase, path, webp);
      const updatedStory = await saveBedtimeStorySlideImage(supabase, story.id, slideNumber, publicUrl);
      return res.status(200).json({ ok: true, kind: body.kind, path, publicUrl, story: updatedStory });
    }

    const assetName = normalizeStorageSegment(body.fileName?.replace(/\.[^/.]+$/, "") || `${body.kind}-${Date.now()}`) || `${body.kind}-${Date.now()}`;
    const path = `bedtime_story/${slug}/${body.kind}s/${assetName}.webp`;
    const publicUrl = await uploadMedia(supabase, path, webp);
    const updatedStory = await addBedtimeStoryAsset(supabase, story.id, {
      id: `${body.kind}-${Date.now().toString(36)}`,
      kind: body.kind,
      name: assetName,
      path,
      url: publicUrl,
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, kind: body.kind, path, publicUrl, story: updatedStory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process bedtime story media.";
    return res.status(500).json({ error: message });
  }
}
