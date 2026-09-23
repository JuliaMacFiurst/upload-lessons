const DEFAULT_LAPLAPLA_DEVELOPMENT_URL = "http://localhost:3000";
const QUEST_PRINT_LAB_PATH = "/internal/quest-print-lab";

export function getQuestPrintLabUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_LAPLAPLA_URL?.trim();
  const baseUrl = configuredBaseUrl || DEFAULT_LAPLAPLA_DEVELOPMENT_URL;

  return new URL(QUEST_PRINT_LAB_PATH, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}
