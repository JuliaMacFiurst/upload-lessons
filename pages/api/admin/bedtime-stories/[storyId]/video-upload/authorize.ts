import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../../lib/server/admin-session";
import { loadBedtimeStory } from "../../../../../../lib/server/bedtime-stories-admin";
import { createLibraryVideoUploadAuthorization } from "../../../../../../lib/server/library-video-upload";
import { createPresignedR2PutUrl } from "../../../../../../lib/server/r2-storage";

type AuthorizeBody = {
  contentType?: string;
  sizeBytes?: number;
  fileName?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const storyId = typeof req.query.storyId === "string" ? req.query.storyId : "";
  if (!storyId) return res.status(400).json({ error: "Missing `storyId`." });

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : "Unauthorized" });
  }

  try {
    const body = (req.body ?? {}) as AuthorizeBody;
    const story = await loadBedtimeStory(supabase, storyId);
    const authorization = createLibraryVideoUploadAuthorization(story, {
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      sizeBytes: typeof body.sizeBytes === "number" ? body.sizeBytes : Number.NaN,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
    }, {
      createUploadUrl: createPresignedR2PutUrl,
    });
    return res.status(200).json(authorization);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to authorize video upload.";
    const invalid = /only available|only mp4|size|too large|invalid|missing r2/i.test(message);
    return res.status(invalid ? 400 : 500).json({ error: message });
  }
}
