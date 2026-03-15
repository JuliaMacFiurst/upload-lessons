import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import { requireAdminSession, saveStoryTwists } from "../../../../lib/server/book-admin";

const schema = z.object({
  twists: z.array(z.any()),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = schema.parse(req.body ?? {});
    const twists = await saveStoryTwists(supabase, body.twists);
    return res.status(200).json({ twists });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to save twists.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
