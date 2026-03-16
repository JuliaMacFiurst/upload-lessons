import { createClient } from "@supabase/supabase-js";

function getLoggingClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase server credentials for batch logging.");
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function logBatchError(input: {
  batchId?: string;
  bookTitle?: string;
  stage: string;
  error: unknown;
  rawResponse?: string;
}) {
  try {
    const supabase = getLoggingClient();
    await supabase.from("ai_batch_logs").insert({
      batch_id: input.batchId ?? null,
      book_title: input.bookTitle ?? null,
      stage: input.stage,
      error_message: input.error instanceof Error ? input.error.message : String(input.error),
      raw_response: input.rawResponse ?? null,
    });
  } catch (error) {
    console.error("Failed to log batch error", error);
  }
}
