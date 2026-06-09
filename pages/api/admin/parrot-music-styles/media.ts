import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../lib/server/admin-session";
import { uploadPublicR2Object } from "../../../../lib/server/r2-storage";
import {
  getParrotAudioObjectKey,
  getParrotStyleMediaObjectKey,
} from "../../../../lib/parrot-music-styles/media-urls";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

type MediaUploadBody = {
  kind?: "audio" | "styleMedia";
  path?: string;
  fileBase64?: string;
  contentType?: string;
};

function decodeBase64(value: string): Buffer {
  const payload = value.includes(",") ? value.split(",").pop() ?? "" : value;
  if (!payload.trim()) {
    throw new Error("Missing file payload.");
  }
  return Buffer.from(payload, "base64");
}

function validateObjectPath(value: string) {
  const path = value.trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\")) {
    throw new Error("Invalid media path.");
  }
  return path;
}

function ensureMp3Path(value: string) {
  return value.replace(/\.[a-z0-9]+$/i, "") + ".mp3";
}

function isWavContentType(contentType: string) {
  return ["audio/wav", "audio/wave", "audio/x-wav", "audio/vnd.wave"].includes(contentType);
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

async function wavToMp3(input: Buffer): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "parrot-audio-"));
  const inputPath = path.join(tempDir, "input.wav");
  const outputPath = path.join(tempDir, "output.mp3");
  try {
    await writeFile(inputPath, input);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-codec:a",
      "libmp3lame",
      "-q:a",
      "2",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  try {
    const body = (req.body ?? {}) as MediaUploadBody;
    const kind = body.kind;
    if (kind !== "audio" && kind !== "styleMedia") {
      return res.status(400).json({ error: "Unsupported media kind." });
    }
    if (!body.path || !body.fileBase64) {
      return res.status(400).json({ error: "Missing media upload payload." });
    }

    const contentType = body.contentType?.trim() || "application/octet-stream";
    if (kind === "audio" && contentType !== "audio/mpeg" && contentType !== "audio/mp3" && !isWavContentType(contentType)) {
      return res.status(400).json({ error: "Audio uploads must be mp3 or wav." });
    }
    if (kind === "styleMedia" && contentType !== "image/webp") {
      return res.status(400).json({ error: "Style media uploads must be webp." });
    }

    const relativePath = kind === "audio"
      ? ensureMp3Path(validateObjectPath(body.path))
      : validateObjectPath(body.path);
    const key = kind === "audio" ? getParrotAudioObjectKey(relativePath) : getParrotStyleMediaObjectKey(relativePath);
    const decoded = decodeBase64(body.fileBase64);
    const uploadBody = kind === "audio" && isWavContentType(contentType) ? await wavToMp3(decoded) : decoded;
    const publicUrl = await uploadPublicR2Object({
      key,
      body: uploadBody,
      contentType: kind === "audio" ? "audio/mpeg" : "image/webp",
    });

    return res.status(200).json({ ok: true, path: relativePath, publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload parrot media.";
    return res.status(500).json({ error: message });
  }
}
