import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import {
  requireAdminSession,
  saveStoryFragmentsBlock,
} from "../../../../lib/server/book-admin";
import { STORY_ROLE_KEYS } from "../../../../lib/books/types";

const schema = z.object({
  templateId: z.string().uuid(),
  role: z.enum(STORY_ROLE_KEYS),
  fragments: z.array(z.any()),
  steps: z.array(z.any()),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = schema.parse(req.body ?? {});
    console.log("STORY FRAGMENTS API PAYLOAD", body);
    const fragments = await saveStoryFragmentsBlock(
      supabase,
      body.templateId,
      body.role,
      body.fragments,
      body.steps,
    );
    console.log("STORY FRAGMENTS API RESPONSE", {
      templateId: body.templateId,
      role: body.role,
      fragmentsCount: fragments.length,
    });
    return res.status(200).json({ fragments });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save story fragments.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
