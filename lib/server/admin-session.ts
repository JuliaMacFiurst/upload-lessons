import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getAllowedAdminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const allowedEmails = getAllowedAdminEmails();
  if (allowedEmails.length === 0) {
    throw new Error("Missing ADMIN_EMAIL.");
  }

  return allowedEmails.includes(email.trim().toLowerCase());
}

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
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  if (error || !user || !isAllowedAdminEmail(user.email)) {
    throw new Error("Unauthorized");
  }

  return getServiceSupabaseClient();
}
