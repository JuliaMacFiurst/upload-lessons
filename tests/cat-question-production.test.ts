import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
  PROCESSOR_VERSION,
  buildProductionBrief,
  calculateNarrationReadiness,
  productionBriefImportSchema,
  type CatQuestionProductionManifest,
} from "../lib/cat-questions/production.ts";
import { saveDirtyNarrations } from "../lib/cat-questions/narration-batch.ts";
import { LAPLAPLA_VOICE_PARAMETERS } from "../lib/client/laplapla-voice-processing.ts";
import {
  buildNarrationStorageKey,
  buildProductionBriefImportPlan,
  deleteFinalSlideNarration,
  inspectPcmWav,
  saveCatQuestionProductionDirections,
  saveFinalSlideNarration,
} from "../lib/server/cat-question-production.ts";

const questionId = "11111111-1111-4111-8111-111111111111";
const slideId = "22222222-2222-4222-8222-222222222222";
const secondSlideId = "33333333-3333-4333-8333-333333333333";

function productionManifest(): CatQuestionProductionManifest {
  const slides = [
    { id: slideId, order: 1, narrationText: { ru: "Первый" }, direction: { visualIdea: "Old visual", sceneIntent: "Old intent" }, narrationAssets: {} },
    { id: secondSlideId, order: 2, narrationText: { ru: "Второй" }, direction: { visualIdea: "Second visual" }, narrationAssets: {} },
  ];
  return {
    schemaVersion: 1,
    question: { id: questionId, legacyId: "legacy", baseKey: "base", series: "cat_explains", kind: "text", category: null, isActive: true, title: { ru: "Вопрос" } },
    locales: ["ru"],
    direction: { videoConcept: "Old concept", mood: "Curious", productionMode: null },
    slides,
    readiness: calculateNarrationReadiness(slides, ["ru"]),
    timingPolicy: { source: "final_processed_narration", alignment: "forced_alignment_per_slide", sceneDuration: "aligned_words_plus_editorial_pause" },
  } as CatQuestionProductionManifest;
}

function pcmWav(durationMs = 100) {
  const sampleRate = 48_000;
  const samples = Math.round(sampleRate * durationMs / 1000);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

function narrationSupabase(options?: { previousKey?: string; dbError?: string; validSlide?: boolean }) {
  let saved: Record<string, unknown> | null = null;
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let upserted: Record<string, unknown> | null = null;
      const builder = {
        select() { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        upsert(row: Record<string, unknown>) { upserted = row; return builder; },
        async maybeSingle() {
          if (table === "cat_preset_slides") return { data: options?.validSlide === false ? null : { id: slideId, preset_id: questionId }, error: null };
          if (table === "cat_slide_narrations") return { data: options?.previousKey ? { storage_key: options.previousKey } : null, error: null };
          return { data: null, error: null };
        },
        async single() {
          if (options?.dbError) return { data: null, error: { message: options.dbError } };
          saved = { ...upserted, updated_at: "2026-10-05T00:00:00.000Z" };
          return { data: saved, error: null };
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, saved: () => saved };
}

test("RU scientific narration defaults to Louder + Child Voice, without Enhance", () => {
  assert.deepEqual(DEFAULT_RU_SCIENTIFIC_VOICE_PRESET, { enhance: false, louder: true, child: true });
});

test("ported Studio voice parameters remain deterministic", () => {
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.recording.highpassHz, 80);
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.recording.ratio, 3);
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.child.playbackRate, 1.14);
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.compressor.ratio, 3.5);
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.louder.outputGain, 1.35);
  assert.equal(LAPLAPLA_VOICE_PARAMETERS.limiter.ceiling, 0.92);
  assert.ok(Math.abs((1 / LAPLAPLA_VOICE_PARAMETERS.child.playbackRate) - 0.87719) < 0.0001);
});

test("PCM WAV inspection derives server-authoritative duration", () => {
  assert.deepEqual(inspectPcmWav(pcmWav(250)), { durationMs: 250, container: "wav" });
  assert.throws(() => inspectPcmWav(Buffer.from("not wav")), /Only PCM WAV|offset|bounds/i);
});

test("narration upload persists final metadata and replaces the previous active object", async () => {
  const fake = narrationSupabase({ previousKey: "narration/questions/old.wav" });
  const uploads: string[] = [];
  const removals: string[] = [];
  const bytes = pcmWav(120);
  const narration = await saveFinalSlideNarration({
    supabase: fake.client, questionId, slideId, locale: "ru", mimeType: "audio/wav",
    audioBase64: bytes.toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async ({ key }) => { uploads.push(key); return `https://media.laplapla.com/${key}`; },
    remove: async (key) => { removals.push(key); },
  });
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(uploads[0], buildNarrationStorageKey(questionId, "ru", slideId, sha));
  assert.deepEqual(removals, ["narration/questions/old.wav"]);
  assert.equal(narration.durationMs, 120);
  assert.equal(narration.processorVersion, PROCESSOR_VERSION);
  assert.deepEqual(narration.processingSettings, DEFAULT_RU_SCIENTIFIC_VOICE_PRESET);
  assert.equal(fake.saved()?.sha256, sha);
});

test("R2 failure does not write metadata and DB failure removes the newly uploaded final object", async () => {
  const activeKey = "narration/questions/existing-good.wav";
  const uploadFailure = narrationSupabase({ previousKey: activeKey });
  const uploadFailureRemovals: string[] = [];
  await assert.rejects(saveFinalSlideNarration({
    supabase: uploadFailure.client, questionId, slideId, locale: "ru", mimeType: "audio/wav",
    audioBase64: pcmWav().toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async () => { throw new Error("R2 unavailable"); }, remove: async (key) => { uploadFailureRemovals.push(key); },
  }), /R2 unavailable/);
  assert.equal(uploadFailure.saved(), null);
  assert.deepEqual(uploadFailureRemovals, []);

  const dbFailure = narrationSupabase({ dbError: "DB unavailable", previousKey: activeKey });
  const removed: string[] = [];
  await assert.rejects(saveFinalSlideNarration({
    supabase: dbFailure.client, questionId, slideId, locale: "ru", mimeType: "audio/wav",
    audioBase64: pcmWav().toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async ({ key }) => `https://media.laplapla.com/${key}`,
    remove: async (key) => { removed.push(key); },
  }), /DB unavailable/);
  assert.equal(removed.length, 1);
  assert.notEqual(removed[0], activeKey);
});

test("DB failure never deletes an already-active object when bytes and deterministic key are unchanged", async () => {
  const bytes = pcmWav();
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const key = buildNarrationStorageKey(questionId, "ru", slideId, sha);
  const dbFailure = narrationSupabase({ dbError: "DB unavailable", previousKey: key });
  const removed: string[] = [];
  await assert.rejects(saveFinalSlideNarration({
    supabase: dbFailure.client, questionId, slideId, locale: "ru", mimeType: "audio/wav",
    audioBase64: bytes.toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async () => `https://media.laplapla.com/${key}`,
    remove: async (value) => { removed.push(value); },
  }), /DB unavailable/);
  assert.deepEqual(removed, []);
});

test("invalid slide and unsupported final format are rejected", async () => {
  const fake = narrationSupabase({ validSlide: false });
  await assert.rejects(saveFinalSlideNarration({
    supabase: fake.client, questionId, slideId, locale: "ru", mimeType: "audio/wav",
    audioBase64: pcmWav().toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async () => "unused", remove: async () => undefined,
  }), /does not belong/);
  await assert.rejects(saveFinalSlideNarration({
    supabase: fake.client, questionId, slideId, locale: "ru", mimeType: "audio/webm",
    audioBase64: pcmWav().toString("base64"), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET,
    upload: async () => "unused", remove: async () => undefined,
  }), /Unsupported audio format/);
});

test("production directions validate locale/slide association before persistence", async () => {
  const writes: Array<{ table: string; value: unknown }> = [];
  const client = {
    from(table: string) {
      const builder = {
        select() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "cat_preset_slides") return Promise.resolve(resolve({ data: [{ id: slideId }], error: null }));
          return Promise.resolve(resolve({ data: null, error: null }));
        },
        upsert(value: unknown) { writes.push({ table, value }); return builder; },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  await saveCatQuestionProductionDirections(client, questionId, {
    question: { videoConcept: "Curious science" }, slides: [{ slideId, visualIdea: "Paper collage atom" }],
  });
  assert.deepEqual(writes.map((item) => item.table), ["cat_question_production", "cat_question_slide_production"]);
  await assert.rejects(saveCatQuestionProductionDirections(client, questionId, {
    question: {}, slides: [{ slideId: "33333333-3333-4333-8333-333333333333" }],
  }), /does not belong/);
});

test("Production Brief import validates full/partial JSON and preserves omitted values", () => {
  const full = buildProductionBriefImportPlan(productionManifest(), {
    production: { video_concept: "New concept", mood: "Playful" },
    slides: [{ slide_number: 1, visual_idea: "New visual", production_notes: "Note" }],
  });
  assert.equal(full.questionRow?.video_concept, "New concept");
  assert.equal(full.questionRow?.mood, "Playful");
  assert.equal(full.questionRow?.production_mode, null);
  assert.equal(full.slideRows[0]?.slide_id, slideId);
  assert.equal(full.slideRows[0]?.visual_idea, "New visual");
  assert.equal(full.slideRows[0]?.scene_intent, "Old intent");

  const partial = buildProductionBriefImportPlan(productionManifest(), { production: { pacing: "Fast" } });
  assert.equal(partial.questionRow?.video_concept, "Old concept");
  assert.equal(partial.questionRow?.mood, "Curious");
  assert.equal(partial.questionRow?.pacing, "Fast");
  assert.deepEqual(partial.slideRows, []);
  assert.throws(() => productionBriefImportSchema.parse({ production: { unknown: true } }), /unrecognized/i);
  assert.throws(() => productionBriefImportSchema.parse({}), /must contain/i);
});

test("Production Brief import rejects unknown and duplicate slide mappings", () => {
  assert.throws(() => buildProductionBriefImportPlan(productionManifest(), {
    slides: [{ slide_number: 99, visual_idea: "Wrong" }],
  }), /Unknown slide reference/);
  assert.throws(() => buildProductionBriefImportPlan(productionManifest(), {
    slides: [
      { slide_id: slideId, visual_idea: "One" },
      { slide_number: 1, visual_idea: "Duplicate" },
    ],
  }), /Duplicate slide reference/);
  assert.throws(() => productionBriefImportSchema.parse({ slides: [{ slide_id: slideId, slide_number: 1 }] }), /exactly one/);
});

test("Save All uploads only dirty takes, isolates partial failure, and retries only remaining dirty items", async () => {
  let firstDirty = true;
  let secondDirty = true;
  let secondAttempts = 0;
  const first = async () => { firstDirty = false; return true; };
  const second = async () => { secondAttempts += 1; if (secondAttempts === 1) return false; secondDirty = false; return true; };
  const initial = await saveDirtyNarrations([
    { slideId, dirty: firstDirty, save: first },
    { slideId: secondSlideId, dirty: secondDirty, save: second },
    { slideId: "saved", dirty: false, save: async () => { throw new Error("must not run"); } },
  ]);
  assert.deepEqual(initial.saved, [slideId]);
  assert.deepEqual(initial.failed, [secondSlideId]);
  assert.deepEqual(initial.skipped, ["saved"]);
  const retry = await saveDirtyNarrations([
    { slideId, dirty: firstDirty, save: first },
    { slideId: secondSlideId, dirty: secondDirty, save: second },
  ]);
  assert.deepEqual(retry.saved, [secondSlideId]);
  assert.deepEqual(retry.skipped, [slideId]);
});

test("Delete removes narration metadata before deleting the unreferenced R2 object", async () => {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      let operation = "select";
      const builder = {
        select() { operation = "select"; return builder; },
        delete() { operation = "delete"; calls.push("db-delete-request"); return builder; },
        eq() { return builder; },
        async maybeSingle() {
          if (table === "cat_preset_slides") return { data: { id: slideId, preset_id: questionId }, error: null };
          return { data: { storage_key: "narration/questions/old.wav" }, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          if (operation === "delete") { calls.push("db-delete-success"); return Promise.resolve(resolve({ error: null })); }
          return Promise.resolve(resolve({ count: 0, error: null }));
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const result = await deleteFinalSlideNarration({
    supabase: client, questionId, slideId, locale: "ru",
    remove: async (key) => { calls.push(`r2-delete:${key}`); },
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls, ["db-delete-request", "db-delete-success", "r2-delete:narration/questions/old.wav"]);
});

test("question edits preserve existing slide identities used by narration metadata", async () => {
  const [server, editor] = await Promise.all([
    readFile(new URL("../lib/server/cat-questions-admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../pages/admin/cat-questions/[question_id].tsx", import.meta.url), "utf8"),
  ]);
  assert.match(server, /syncCatSlides\(supabase, id/);
  assert.match(server, /\.update\(row\)\.eq\("id", slide\.id\)/);
  assert.match(editor, /id: slide\.id\.startsWith\("new-"\) \? undefined : slide\.id/);
});

test("manifest readiness and production brief keep narration optional outside RU", () => {
  const asset = { slideId, locale: "ru", storageKey: "narration/final.wav", publicUrl: "https://media.laplapla.com/narration/final.wav", mimeType: "audio/wav", container: "wav", durationMs: 1200, sha256: "a".repeat(64), processingSettings: DEFAULT_RU_SCIENTIFIC_VOICE_PRESET, processorVersion: PROCESSOR_VERSION, updatedAt: "2026-10-05T00:00:00Z" };
  const slides = [{ id: slideId, order: 1, narrationText: { ru: "Почему?", en: "Why?", he: "למה?" }, direction: {}, narrationAssets: { ru: asset } }];
  const readiness = calculateNarrationReadiness(slides, ["ru", "en", "he"]);
  assert.deepEqual(readiness.ru, { recorded: 1, total: 1, ready: true });
  assert.deepEqual(readiness.en, { recorded: 0, total: 1, ready: false });
  const manifest = { schemaVersion: 1, question: { id: questionId, legacyId: "q-ru-001", baseKey: "q", series: "cat_explains", kind: "text", category: "Физика", isActive: true, title: { ru: "Почему?", en: "Why?", he: "למה?" } }, locales: ["ru", "en", "he"], direction: {}, slides, readiness, timingPolicy: { source: "final_processed_narration", alignment: "forced_alignment_per_slide", sceneDuration: "aligned_words_plus_editorial_pause" } } as CatQuestionProductionManifest;
  const brief = buildProductionBrief(manifest);
  assert.match(brief, /Human narration: https:\/\/media\.laplapla\.com\/narration\/final\.wav/);
  assert.match(brief, /Processing settings: \{"enhance":false,"louder":true,"child":true\}/);
  assert.match(brief, new RegExp(`Processor version: ${PROCESSOR_VERSION}`));
  assert.match(brief, /Readiness: SAVED/);
  assert.match(brief, /Canonical for production: YES/);
  assert.match(brief, /RU narration: READY/);
  assert.doesNotMatch(JSON.stringify(manifest), /service.role|secret.access|r2_access/i);
});

test("server schema persists no raw narration asset or raw archive", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261005000100_cat_question_production.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /raw_(?:audio|narration)|original_(?:audio|recording)|version_history/i);
  assert.match(migration, /primary key \(slide_id, locale\)/);
});

test("mobile recorder has codec fallbacks, secure-context permission handling, cancel, and Blob cleanup", async () => {
  const [processor, recorder] = await Promise.all([
    readFile(new URL("../lib/client/laplapla-voice-processing.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/admin/cat-questions/ProductionWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(processor, /audio\/webm;codecs=opus/);
  assert.match(processor, /audio\/mp4;codecs=mp4a\.40\.2/);
  assert.match(processor, /MediaRecorder\.isTypeSupported/);
  assert.match(recorder, /window\.isSecureContext/);
  assert.match(recorder, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(recorder, /cancelRecording/);
  assert.match(recorder, /URL\.revokeObjectURL/);
  assert.match(recorder, /Save All Recordings/);
  assert.match(recorder, /Import Production Brief/);
  assert.match(recorder, /processed_unsaved/);
  assert.match(recorder, /method: "DELETE"/);
});

test("production and narration APIs remain behind the guarded admin service client", async () => {
  const [productionApi, narrationApi] = await Promise.all([
    readFile(new URL("../pages/api/admin/cat-questions/[questionId]/production.ts", import.meta.url), "utf8"),
    readFile(new URL("../pages/api/admin/cat-questions/[questionId]/narration.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [productionApi, narrationApi]) {
    assert.match(source, /requireAdminSession/);
    assert.doesNotMatch(source, /createClientComponentClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  }
});

test("Question JSON import remains separate from Production Brief import", async () => {
  const [questionImport, productionWorkspace] = await Promise.all([
    readFile(new URL("../pages/admin/cat-questions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin/cat-questions/ProductionWorkspace.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(questionImport, /\/api\/admin\/cat-questions/);
  assert.doesNotMatch(questionImport, /Import Production Brief/);
  assert.match(productionWorkspace, /Import Production Brief/);
  assert.match(productionWorkspace, /method: "POST"/);
  assert.match(productionWorkspace, /body: JSON\.stringify\(\{ brief \}\)/);
});
