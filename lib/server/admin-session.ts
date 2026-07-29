import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class AdminSessionError extends Error {
  readonly statusCode: 401 | 403 | 500;

  constructor(
    message: string,
    statusCode: 401 | 403 | 500,
  ) {
    super(message);
    this.name = "AdminSessionError";
    this.statusCode = statusCode;
  }
}

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
    throw new AdminSessionError("Admin access is not configured.", 500);
  }

  return allowedEmails.includes(email.trim().toLowerCase());
}

export function getServiceSupabaseClient(): SupabaseClient {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AdminSessionError("Analytics service is not configured.", 500);
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

  if (error || !user) {
    throw new AdminSessionError("Unauthorized", 401);
  }
  if (!isAllowedAdminEmail(user.email)) {
    throw new AdminSessionError("Forbidden", 403);
  }

  return getServiceSupabaseClient();
}
