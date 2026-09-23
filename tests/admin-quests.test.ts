import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getQuestPrintLabUrl } from "../lib/client/quest-print-lab.ts";

const readSource = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AdminTabs exposes Quests and keeps it active for nested routes", async () => {
  const tabs = await readSource("components/AdminTabs.tsx");

  assert.match(tabs, /href: "\/admin\/quests", label: "Квесты"/);
  assert.match(
    tabs,
    /tab\.href === "\/admin\/quests" && router\.pathname\.startsWith\("\/admin\/quests"\)/,
  );
});

test("Quest Print Lab URL uses a local default and supports configuration", () => {
  const originalPrintLabUrl = process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL;
  const originalLapLapLaUrl = process.env.NEXT_PUBLIC_LAPLAPLA_URL;

  try {
    delete process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL;
    delete process.env.NEXT_PUBLIC_LAPLAPLA_URL;
    assert.equal(
      getQuestPrintLabUrl(),
      "http://localhost:3000/internal/quest-print-lab",
    );

    process.env.NEXT_PUBLIC_LAPLAPLA_URL = "http://localhost:3100/";
    assert.equal(
      getQuestPrintLabUrl(),
      "http://localhost:3100/internal/quest-print-lab",
    );

    process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL =
      "http://localhost:3200/custom-print-lab";
    assert.equal(
      getQuestPrintLabUrl(),
      "http://localhost:3200/custom-print-lab",
    );
  } finally {
    if (originalPrintLabUrl === undefined) {
      delete process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL;
    } else {
      process.env.NEXT_PUBLIC_QUEST_PRINT_LAB_URL = originalPrintLabUrl;
    }
    if (originalLapLapLaUrl === undefined) {
      delete process.env.NEXT_PUBLIC_LAPLAPLA_URL;
    } else {
      process.env.NEXT_PUBLIC_LAPLAPLA_URL = originalLapLapLaUrl;
    }
  }
});

test("Quests admin page is a static launcher for the real Print Lab", async () => {
  const page = await readSource("pages/admin/quests.tsx");

  assert.match(page, /<AdminTabs \/>/);
  assert.match(page, /<AdminLogout \/>/);
  assert.match(page, /Sound Case #001/);
  assert.match(page, /href=\{printLabUrl\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.doesNotMatch(page, /<iframe|window\.open|postMessage/);
  assert.doesNotMatch(page, /supabase|\/api\//i);
  assert.doesNotMatch(page, /QuestDocument|SOUND_CASE_001_|QuestPersonalization/);
});
