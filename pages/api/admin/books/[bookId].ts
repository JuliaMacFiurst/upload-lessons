import type { NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";
import { loadBookEditorData, requireAdminSession, saveBookEditorData } from "../../../../lib/server/book-admin";
import type { BookEditorPayload } from "../../../../lib/books/types";
import type { ImportedBookTranslationPayload } from "../../../../lib/books/book-json-import";
import { loadTranslationItemByContent } from "../../../../lib/server/translation-content";

type BookTranslationRow = {
  translation: Record<string, unknown> | null;
};

type BookRequestBody = BookEditorPayload & {
  importedTranslations?: Partial<Record<"en" | "he", ImportedBookTranslationPayload>>;
};

function mergeBookTranslationPayload(
  existing: Record<string, unknown> | null | undefined,
  incoming: ImportedBookTranslationPayload,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(existing ?? {}),
  };

  if (incoming.title !== undefined) {
    merged.title = incoming.title;
  }
  if (incoming.author !== undefined) {
    merged.author = incoming.author;
  }
  if (incoming.description !== undefined) {
    merged.description = incoming.description;
  }
  if (incoming.categories !== undefined) {
    merged.categories = incoming.categories;
  }
  if (incoming.tests !== undefined) {
    merged.tests = incoming.tests;
  }
  if (incoming.sections !== undefined) {
    const existingSections = Array.isArray(existing?.sections)
      ? (existing?.sections as Array<Record<string, unknown>>)
      : [];
    const sectionBySlug = new Map<string, Record<string, unknown>>();

    existingSections.forEach((section) => {
      const slug = typeof section.mode_slug === "string" ? section.mode_slug : "";
      if (slug) {
        sectionBySlug.set(slug, section);
      }
    });

    incoming.sections.forEach((section) => {
      sectionBySlug.set(section.mode_slug, {
        ...(sectionBySlug.get(section.mode_slug) ?? {}),
        mode_slug: section.mode_slug,
        slides: section.slides,
      });
    });

    merged.sections = Array.from(sectionBySlug.values()).sort((left, right) =>
      String(left.mode_slug ?? "").localeCompare(String(right.mode_slug ?? "")),
    );
  }

  return merged;
}

function hasOnlyCategoryTranslation(payload: ImportedBookTranslationPayload): boolean {
  const keys = Object.keys(payload);
  return keys.length > 0 && keys.every((key) => key === "categories");
}

async function upsertImportedBookTranslations(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: Awaited<ReturnType<typeof requireAdminSession>>,
  bookId: string,
  importedTranslations: Partial<Record<"en" | "he", ImportedBookTranslationPayload>> | undefined,
): Promise<void> {
  const entries = Object.entries(importedTranslations ?? {}).filter((entry): entry is ["en" | "he", ImportedBookTranslationPayload] =>
    Boolean(entry[1]) && Object.keys(entry[1] ?? {}).length > 0,
  );

  if (entries.length === 0) {
    return;
  }

  const sourceItem = await loadTranslationItemByContent(supabase, "book", bookId);

  for (const [language, incomingPayload] of entries) {
    const { data: existingRow, error: existingError } = await supabase
      .from("content_translations")
      .select("translation")
      .eq("content_type", "book")
      .eq("content_id", bookId)
      .eq("language", language)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Failed to load existing book translation: ${existingError.message}`);
    }

    if (!existingRow?.translation && hasOnlyCategoryTranslation(incomingPayload)) {
      continue;
    }

    const mergedPayload = mergeBookTranslationPayload(
      (existingRow as BookTranslationRow | null)?.translation ?? null,
      incomingPayload,
    );

    const { error: upsertError } = await supabase.from("content_translations").upsert(
      {
        content_type: "book",
        content_id: bookId,
        language,
        source_hash: sourceItem.sourceHash,
        translation: mergedPayload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "content_type,content_id,language" },
    );

    if (upsertError) {
      throw new Error(`Failed to save imported book translation: ${upsertError.message}`);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const bookId = typeof req.query.bookId === "string" ? req.query.bookId : "";

  if (!bookId) {
    return res.status(400).json({ error: "Missing `bookId`." });
  }

  let supabase;
  try {
    supabase = await requireAdminSession(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return res.status(message === "Unauthorized" ? 401 : 500).json({ error: message });
  }

  if (req.method === "GET") {
    try {
      const data = await loadBookEditorData(supabase, bookId);
      return res.status(200).json(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load book editor.";
      const status = message.toLowerCase().includes("not found") ? 404 : 500;
      return res.status(status).json({ error: message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = (req.body ?? {}) as BookRequestBody;
    await saveBookEditorData(supabase, bookId, body as BookEditorPayload);
    await upsertImportedBookTranslations(req, res, supabase, bookId, body.importedTranslations);
    const data = await loadBookEditorData(supabase, bookId);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: error.issues[0]?.message ?? "Validation failed.",
        issues: error.issues,
      });
    }
    const message = error instanceof Error ? error.message : "Failed to save book.";
    return res.status(500).json({ error: message });
  }
}
