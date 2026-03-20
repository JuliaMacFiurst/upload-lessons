import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError } from "zod";
import {
  normalizeKeywords,
  requireAdminSession,
  saveStoryTwists,
} from "../../../../lib/server/book-admin";

const schema = z.object({
  twists: z.array(z.any()),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const supabase = await requireAdminSession(req, res);
      const { data, error } = await supabase.from("story_twists").select("*").order("created_at", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        twists: ((data ?? []) as Array<{
          id: string;
          text: string;
          keywords: string[] | null;
          age_group: string | null;
          is_published: boolean | null;
        }>).map((twist) => ({
          id: twist.id,
          text: twist.text,
          keywords: normalizeKeywords(twist.keywords),
          age_group: twist.age_group,
          is_published: twist.is_published ?? true,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load twists.";
      return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
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
