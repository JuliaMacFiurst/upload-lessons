import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError, z } from "zod";
import {
  buildFullExplanationPrompt,
  loadExplanationModes,
  requireAdminSession,
  runGeminiJsonPrompt,
} from "../../../lib/server/book-admin";
import { bookExplanationSlideSchema } from "../../../lib/books/types";

const bodySchema = z.object({
  bookId: z.string().uuid(),
  title: z.string().trim().min(1),
  author: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
});

const generatedSchema = z.object({
  items: z.array(
    z.object({
      mode: z.string().trim().min(1),
      slides: z.array(bookExplanationSlideSchema).min(1).max(6),
    }),
  ),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = await requireAdminSession(req, res);
    const body = bodySchema.parse(req.body ?? {});
    const [modes, existingRes] = await Promise.all([
      loadExplanationModes(supabase),
      supabase.from("book_explanations").select("mode_id").eq("book_id", body.bookId),
    ]);

    if (existingRes.error) {
      throw new Error(`Failed to load existing explanations: ${existingRes.error.message}`);
    }

    const existingModeIds = new Set(
      (((existingRes.data as Array<{ mode_id: string }> | null) ?? []).map((item) => item.mode_id)),
    );
    const missingModes = modes.filter((mode) => !existingModeIds.has(mode.id));

    if (missingModes.length === 0) {
      return res.status(200).json({ items: [], skipped: "All explanation modes already exist in the database." });
    }

    const generated = await runGeminiJsonPrompt<unknown>(
      buildFullExplanationPrompt({
        title: body.title,
        author: body.author,
        description: body.description,
        modes: missingModes.map((mode) => ({ slug: mode.slug, name: mode.name })),
      }),
    );

    const parsed = generatedSchema.parse(generated);
    const items = missingModes
      .map((mode) => {
        const generatedMode = parsed.items.find((item) => item.mode === mode.slug);
        if (!generatedMode) {
          return null;
        }
        return {
          mode_id: mode.id,
          mode_slug: mode.slug,
          mode_name: mode.name,
          slides: generatedMode.slides,
          is_published: false,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return res.status(200).json({ items });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Validation failed." });
    }
    const message = error instanceof Error ? error.message : "Failed to generate explanations.";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }
}
