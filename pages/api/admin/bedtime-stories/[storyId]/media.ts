import sharp from "sharp";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../lib/server/admin-session";
import {
  addBedtimeStoryAsset,
  createBedtimeStampAsset,
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

async function stampToTransparentWebpWithSharp(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const brightness = (red + green + blue) / 3;
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);

    if (brightness > 220 && spread < 42) {
      data[index + 3] = 0;
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const errors: Buffer[] = [];
    child.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed (${code}): ${Buffer.concat(errors).toString("utf8").slice(0, 600)}`));
    });
  });
}

async function stampToTransparentWebp(input: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "bedtime-stamp-"));
  const inputPath = path.join(tempDir, "input-image");
  const outputPath = path.join(tempDir, "stamp.webp");
  try {
    await writeFile(inputPath, input);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vf",
      "format=rgba,colorkey=0xffffff:0.24:0.00",
      "-loop",
      "0",
      "-compression_level",
      "6",
      "-quality",
      "92",
      outputPath,
    ]);
    return await readFile(outputPath);
  } catch (error) {
    console.warn("ffmpeg stamp processing failed; falling back to sharp.", error);
    return stampToTransparentWebpWithSharp(input);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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

    if (body.kind === "slide") {
      const language = body.language;
      const slideNumber = Number(body.slideNumber);
      if (language !== "en" && language !== "ru" && language !== "he") {
        return res.status(400).json({ error: "language must be en, ru, or he." });
      }
      if (!Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 10) {
        return res.status(400).json({ error: "slideNumber must be 1-10 for Instagram carousel export." });
      }

      const webp = await imageToWebp(input);
      const path = `bedtime_story/${slug}/${language}/slide-${String(slideNumber).padStart(2, "0")}.webp`;
      const publicUrl = await uploadMedia(supabase, path, webp);
      const updatedStory = await saveBedtimeStorySlideImage(supabase, story.id, slideNumber, publicUrl);
      return res.status(200).json({ ok: true, kind: body.kind, path, publicUrl, story: updatedStory });
    }

    const assetName = normalizeStorageSegment(body.fileName?.replace(/\.[^/.]+$/, "") || `${body.kind}-${Date.now()}`) || `${body.kind}-${Date.now()}`;
    const webp = body.kind === "stamp" ? await stampToTransparentWebp(input) : await imageToWebp(input);
    const path = body.kind === "stamp"
      ? `bedtime_story/stamps/${assetName}.webp`
      : `bedtime_story/${slug}/${body.kind}s/${assetName}.webp`;
    const publicUrl = await uploadMedia(supabase, path, webp);
    const savedStamp = body.kind === "stamp"
      ? await createBedtimeStampAsset(supabase, {
          name: assetName,
          path,
          url: publicUrl,
          prompt: "Natural ink stamp impression on watercolor paper, slightly aged, softly blurred, transparent background, containing one recognizable detail from a specific story.",
          tags: ["bedtime-story", "watercolor-stamp"],
        })
      : null;
    const updatedStory = await addBedtimeStoryAsset(supabase, story.id, {
      id: savedStamp?.id ?? `${body.kind}-${Date.now().toString(36)}`,
      kind: body.kind,
      name: savedStamp?.name ?? assetName,
      path: savedStamp?.path ?? path,
      url: savedStamp?.url ?? publicUrl,
      created_at: savedStamp?.created_at ?? new Date().toISOString(),
    });

    return res.status(200).json({ ok: true, kind: body.kind, path, publicUrl, story: updatedStory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process bedtime story media.";
    return res.status(500).json({ error: message });
  }
}
