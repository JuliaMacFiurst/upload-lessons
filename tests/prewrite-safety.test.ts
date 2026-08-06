import assert from "node:assert/strict";
import test from "node:test";
import { validateMapStoryBeforeWrite } from "../lib/server/mapContentWriter/preWriteSafetyLayer.ts";
import { stagedWriteCandidateBatch } from "../lib/server/mapContentWriter/stagedAdminWriter.ts";
import { validateOpenCTA } from "../lib/server/mapContentWriter/ctaValidator.ts";

function createMockSupabase(existingStory: any = null, existingTarget: any = { map_type: "river", target_id: "Ob" }) {
  return {
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === "map_targets") {
            return { data: existingTarget, error: null };
          }
          if (table === "map_stories") {
            return { data: existingStory, error: null };
          }
          return { data: null, error: null };
        },
        insert: async () => ({ error: null }),
      };
      return chain;
    },
  } as any;
}

test("1. Valid candidate passes Pre-Write Safety validation schema check", async () => {
  const candidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Река Обь течёт по живописным просторам Сибири в холодное Карское море 🌊 Водный поток держит путь через знаменитые лесные массивы и тайгу, где к её прохладным берегам приходят напоиться стада диких животных. Течение реки питает густые заросли и дает жизнь многочисленным обитателям северного края. Ближе к устью река соединяется с крупными притоками неподалёку от северных широт. В сухое время года река мелеет, образуя прозрачные тихие заводи, но в сезон таяния снегов превращается в бурный поток. Природа вокруг реки сохраняет свою дикую первозданную красоту. Каким образом дикие животные приспособились к жизни вдоль реки?",
  };

  const mockSupabase = createMockSupabase(null, { map_type: "river", target_id: "Ob" });

  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "Ob" },
    mockSupabase
  );

  assert.equal(res.isValid, true);
  assert.equal(res.stopConditions.length, 0);
  assert.equal(res.candidate?.target_id, "Ob");
});

test("2. Target mismatch triggers STOP-META-01", async () => {
  const candidate = {
    map_type: "river",
    target_id: "ob_lower",
    content: "Река Обь течёт через Сибирь в Карское море.",
  };

  const mockSupabase = createMockSupabase();
  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "Ob" },
    mockSupabase
  );

  assert.equal(res.isValid, false);
  assert.ok(res.stopConditions.includes("STOP-META-01"));
});

test("3. Non-existent target triggers STOP-META-02", async () => {
  const candidate = {
    map_type: "river",
    target_id: "NonExistentRiver",
    content: "Река Обь течёт по живописным просторам Сибири в холодное Карское море 🌊 Водный поток держит путь через знаменитые лесные массивы и тайгу, где к её прохладным берегам приходят напоиться стада диких животных. Течение реки питает густые заросли и дает жизнь многочисленным обитателям северного края. Ближе к устью река соединяется с крупными притоками неподалёку от северных широт. В сухое время года река мелеет, образуя прозрачные тихие заводи, но в сезон таяния снегов превращается в бурный поток. Природа вокруг реки сохраняет свою дикую первозданную красоту. Каким образом дикие животные приспособились к жизни вдоль реки?",
  };

  const mockSupabase = createMockSupabase(null, null);

  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "NonExistentRiver" },
    mockSupabase
  );

  assert.equal(res.isValid, false);
  assert.ok(res.stopConditions.includes("STOP-META-02"));
});

test("4. Existing story triggers STOP-META-03 (Overwrite Protection)", async () => {
  const candidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Река Обь течёт по живописным просторам Сибири в холодное Карское море 🌊 Водный поток держит путь через знаменитые лесные массивы и тайгу, где к её прохладным берегам приходят напоиться стада диких животных. Течение реки питает густые заросли и дает жизнь многочисленным обитателям северного края. Ближе к устью река соединяется с крупными притоками неподалёку от северных широт. В сухое время года река мелеет, образуя прозрачные тихие заводи, но в сезон таяния снегов превращается в бурный поток. Природа вокруг реки сохраняет свою дикую первозданную красоту. Каким образом дикие животные приспособились к жизни вдоль реки?",
  };

  const mockSupabase = createMockSupabase({ id: "123" }, { map_type: "river", target_id: "Ob" });

  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "Ob" },
    mockSupabase
  );

  assert.equal(res.isValid, false);
  assert.ok(res.stopConditions.includes("STOP-META-03"));
});

test("5. Staged writer limits batch size to 5 and respects dryRunOnly", async () => {
  const candidates = Array.from({ length: 10 }, (_, i) => ({
    candidate: {
      map_type: "river",
      target_id: `river_${i + 1}`,
      content: `Текст истории реки ${i + 1}`,
    },
    isValid: true,
    stopConditions: [],
    errors: [],
  }));

  const summary = await stagedWriteCandidateBatch(candidates, {
    dryRunOnly: true,
    maxBatchSize: 5,
  });

  assert.equal(summary.requestedCount, 5);
  assert.equal(summary.createdCount, 5);
  assert.equal(summary.items.length, 5);
});

test("6. Closed CTA 'Хотел бы ты...?' triggers STOP-DOD-01", () => {
  const ctaRes = validateOpenCTA("Хотел бы ты отправиться в экспедицию к берегам реки?");
  assert.equal(ctaRes.isValid, false);
  assert.equal(ctaRes.stopId, "STOP-DOD-01");
});

test("7. Closed CTA 'Хочешь узнать...?' triggers STOP-DOD-01", () => {
  const ctaRes = validateOpenCTA("Хочешь узнать, какие тайны скрывает эта река?");
  assert.equal(ctaRes.isValid, false);
  assert.equal(ctaRes.stopId, "STOP-DOD-01");
});

test("8. Open CTA 'Как ты думаешь, почему...?' passes validation", () => {
  const ctaRes = validateOpenCTA("Как ты думаешь, почему горные реки переносят так много питательных веществ?");
  assert.equal(ctaRes.isValid, true);
});

test("9. Emoji in 2nd sentence triggers STOP-DOD-01 error", async () => {
  const candidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Река Обь течёт по просторам Сибири в Карское море. Водный поток 🌊 держит путь через тайгу и лесные массивы. Берега реки богаты лесами и природными ресурсами. Рыбаки ловят здесь ценные виды рыб. Климат вдоль реки достаточно суровый с длинной зимой. Впадают ли притоки реки в северные моря на границе региона? Каким образом природа выживает здесь?",
  };

  const mockSupabase = createMockSupabase(null, { map_type: "river", target_id: "Ob" });
  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "Ob" },
    mockSupabase
  );

  assert.equal(res.isValid, false);
  assert.ok(res.stopConditions.includes("STOP-DOD-01"));
});

test("10. Emoji in 1st sentence passes validation", async () => {
  const candidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Река Обь течёт по живописным просторам Сибири в холодное Карское море 🌊 Водный поток держит путь через знаменитые лесные массивы и тайгу, где к её прохладным берегам приходят напоиться стада диких животных. Течение реки питает густые заросли и дает жизнь многочисленным обитателям северного края. Ближе к устью река соединяется с крупными притоками неподалёку от северных широт. В сухое время года река мелеет, образуя прозрачные тихие заводи, но в сезон таяния снегов превращается в бурный поток. Природа вокруг реки сохраняет свою дикую первозданную красоту. Каким образом дикие животные приспособились к жизни вдоль реки?",
  };

  const mockSupabase = createMockSupabase(null, { map_type: "river", target_id: "Ob" });
  const res = await validateMapStoryBeforeWrite(
    candidate,
    { map_type: "river", target_id: "Ob" },
    mockSupabase
  );

  assert.equal(res.isValid, true);
});
