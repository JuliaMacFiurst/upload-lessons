import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdminSession } from "../../../../../../lib/server/admin-session";
import { loadBedtimeStory, saveLibraryMedia } from "../../../../../../lib/server/bedtime-stories-admin";
import { finalizeLibraryVideoUpload } from "../../../../../../lib/server/library-video-upload";
import {
  deletePublicR2Object,
  headPublicR2Object,
  parsePublicR2ObjectKey,
  publicR2ObjectUrl,
} from "../../../../../../lib/server/r2-storage";

type FinalizeBody = {
  uploadToken?: string;
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
    const body = (req.body ?? {}) as FinalizeBody;
    if (typeof body.uploadToken !== "string" || !body.uploadToken) {
      return res.status(400).json({ error: "Missing video upload authorization." });
    }
    const story = await loadBedtimeStory(supabase, storyId);
    const finalized = await finalizeLibraryVideoUpload(story, body.uploadToken, {
      headObject: headPublicR2Object,
      saveMedia: (media) => saveLibraryMedia(supabase, story.id, media),
      deleteObject: deletePublicR2Object,
      publicUrl: publicR2ObjectUrl,
      parsePublicKey: parsePublicR2ObjectKey,
    });
    return res.status(200).json({ ok: true, ...finalized });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize video upload.";
    const invalid = /authorization|only available|not found|metadata|changed during upload|expired/i.test(message);
    return res.status(invalid ? 400 : 500).json({ error: message });
  }
}
