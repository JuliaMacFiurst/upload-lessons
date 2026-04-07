import type { Session } from "@supabase/supabase-js";

const DEFAULT_LOCAL_LAPLAPLA_URL = "http://localhost:3000";
const DEFAULT_PRODUCTION_LAPLAPLA_URL = "https://laplapla.com";
const DEFAULT_LAPLAPLA_PATH = "/raccoons?lang=ru";

export function getLapLapLaBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_LAPLAPLA_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return process.env.NODE_ENV === "production"
    ? DEFAULT_PRODUCTION_LAPLAPLA_URL
    : DEFAULT_LOCAL_LAPLAPLA_URL;
}

export function buildLapLapLaAdminHandoffUrl(session: Session): string {
  if (!session.access_token || !session.refresh_token) {
    throw new Error("Missing Supabase session tokens for admin handoff.");
  }

  const targetUrl = new URL(DEFAULT_LAPLAPLA_PATH, getLapLapLaBaseUrl());
  const hash = new URLSearchParams({
    admin_handoff: "1",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: String(session.expires_at ?? ""),
    token_type: session.token_type ?? "bearer",
  });

  targetUrl.hash = hash.toString();
  return targetUrl.toString();
}
