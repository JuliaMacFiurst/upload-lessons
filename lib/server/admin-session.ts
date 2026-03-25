import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getServiceSupabaseClient(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase server credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function requireAdminSession(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<SupabaseClient> {
  const sessionClient = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await sessionClient.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return getServiceSupabaseClient();
}
