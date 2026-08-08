import test from "node:test";
import assert from "node:assert/strict";
import { insertStagedAiDrafts } from "../lib/server/mapContentWriter/stagedAiDraftWriter.ts";
import { runV2RewriteBatch } from "../lib/server/mapContentWriter/rewriteRunner.ts";
import { generateV2VerifiedCandidate } from "../lib/server/mapContentWriter/v2StoryGenerator.ts";
import { validateDomainSemantics, validateGenericness } from "../lib/server/mapContentWriter/v2Validator.ts";

// Mock Supabase client for unit test isolation
function createMockSupabase(existingRows: any[] = []) {
  const mapStoriesStore = [...existingRows];

  const client: any = {
    from: (tableName: string) => {
      if (tableName === "map_targets") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { map_type: "physic", target_id: "Island Wrangel I.", title_ru: "остров Врангеля" },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (tableName === "map_stories") {
        return {
          select: () => ({
            eq: (col: string, val: any) => ({
              eq: (c2: string, v2: any) => ({
                eq: (c3: string, v3: any) => ({
                  maybeSingle: async () => {
                    const match = mapStoriesStore.find((r) => r.type === val && r.target_id === v2);
                    return { data: match || null, error: null };
                  },
                }),
              }),
            }),
          }),
          insert: async (payload: any) => {
            mapStoriesStore.push({ id: mapStoriesStore.length + 1, ...payload });
            return { error: null };
          },
          update: (updatePayload: any) => ({
            eq: async (col: string, val: any) => {
              const row = mapStoriesStore.find((r) => r.id === val);
              if (row) {
                Object.assign(row, updatePayload);
                return { error: null };
              }
              return { error: new Error("Row not found") };
            },
          }),
        };
      }

      if (tableName === "map_story_rewrite_queue") {
        return {
          select: () => ({
            order: () => ({
              limit: async () => ({
                data: mapStoriesStore
                  .filter((r) => r.needs_rewrite === true)
                  .map((r) => ({
                    story_id: r.id,
                    map_type: r.type,
                    target_id: r.target_id,
                    title_ru: r.target_id,
                    current_content: r.content,
                    content_version: r.content_version,
                  })),
                error: null,
              }),
            }),
          }),
        };
      }

      if (tableName === "map_story_batch_logs") {
        return {
          insert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { batch_id: "batch-1", status: "running", operation: "generation" }, error: null }) }) }),
        };
      }

      return {};
    },
    _getStore: () => mapStoriesStore,
  };

  return client;
}

test("1. Unsupported claim prevents DB insert", async () => {
  const mockDb = createMockSupabase();
  const invalidCandidate = {
    map_type: "physic",
    target_id: "Island Wrangel I.",
    content: "На острове Врангеля построены золотые пирамиды древней цивилизации.",
    stopConditions: ["STOP-FACT-02"],
    errors: ["Unsupported claim: золотые пирамиды"],
  };

  const res = await insertStagedAiDrafts([invalidCandidate], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 0);
  assert.equal(res.rejected, 1);
  assert.equal(mockDb._getStore().length, 0);
});

test("2. Partially supported claim prevents DB insert", async () => {
  const mockDb = createMockSupabase();
  const partiallySupported = {
    map_type: "physic",
    target_id: "Island Spitsbergen",
    content: "Шпицберген целиком состоит из древних гранитных скал.",
    stopConditions: ["STOP-FACT-02"],
    errors: ["Partially supported rock claim: гранитные скалы"],
  };

  const res = await insertStagedAiDrafts([partiallySupported], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 0);
  assert.equal(res.rejected, 1);
  assert.equal(mockDb._getStore().length, 0);
});

test("3. Empty story_sources prevents DB insert", async () => {
  const mockDb = createMockSupabase();
  const candidateNoSources = {
    map_type: "physic",
    target_id: "Island Wrangel I.",
    content: "Чем удивляет геоморфологов рельеф арктического острова Врангеля? Это место в Арктике.",
    story_sources: null,
  };

  const res = await insertStagedAiDrafts([candidateNoSources], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 0);
  assert.equal(res.rejected, 1);
  assert.equal(mockDb._getStore().length, 0);
});

test("4. Non-verified source_validation_status prevents DB insert", async () => {
  const mockDb = createMockSupabase();
  const candidateUnverifiedStatus = {
    map_type: "physic",
    target_id: "Island Wrangel I.",
    content: "Остров Врангеля находится в Арктике.",
    stopConditions: ["SOURCE_VALIDATOR_FAILED"],
    errors: ["Validator status is warning"],
  };

  const res = await insertStagedAiDrafts([candidateUnverifiedStatus], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 0);
  assert.equal(res.rejected, 1);
  assert.equal(mockDb._getStore().length, 0);
});

test("5. Orphan claim prevents DB insert", async () => {
  const mockDb = createMockSupabase();
  const candidateOrphanClaim = {
    map_type: "physic",
    target_id: "Island Wrangel I.",
    content: "Остров Врангеля расположен в Арктике. Здесь цветет пышный кокосовый рай.",
    stopConditions: ["STOP-FACT-02"],
    errors: ["Orphan claim: кокосовый рай"],
  };

  const res = await insertStagedAiDrafts([candidateOrphanClaim], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 0);
  assert.equal(res.rejected, 1);
  assert.equal(mockDb._getStore().length, 0);
});

test("6. Valid candidate persists story_sources", async () => {
  const mockDb = createMockSupabase();
  const v2Cand = await generateV2VerifiedCandidate("physic", "Island Wrangel I.", "остров Врангеля");

  assert.equal(v2Cand.isValid, true);
  const res = await insertStagedAiDrafts([v2Cand], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 1);

  const inserted = mockDb._getStore()[0];
  assert.ok(inserted.story_sources);
  assert.equal(inserted.story_sources.sources.length, 1);
});

test("7. Valid candidate persists source validation metadata", async () => {
  const mockDb = createMockSupabase();
  const v2Cand = await generateV2VerifiedCandidate("physic", "Island Wrangel I.", "остров Врангеля");

  const res = await insertStagedAiDrafts([v2Cand], mockDb, { dryRunOnly: false });
  assert.equal(res.created, 1);

  const inserted = mockDb._getStore()[0];
  assert.equal(inserted.source_validation_status, "verified");
  assert.equal(inserted.source_validation_version, 1);
  assert.ok(inserted.source_validated_at);
  assert.equal(inserted.is_approved, false);
});

test("8. Physic cross-domain filler is rejected", () => {
  const story = "На этом физическом объекте построены отели для туристов, а в море плавают кораллы и редкие рыбы.";
  const res = validateDomainSemantics("physic", story);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-DOMAIN-01");
});

test("9. Generic target-interchangeable story is rejected", () => {
  const story = "Это уникальное место славится тем, что здесь чистейшая вода и невероятная природа, поражающая своей красотой.";
  const res = validateGenericness(story);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-GENERIC-01");
});

test("10. Rewrite does not modify old content before candidate passes", async () => {
  const oldRow = {
    id: 100,
    type: "physic",
    target_id: "Invalid Target",
    content: "Старый плохой текст.",
    content_version: 1,
    needs_rewrite: true,
  };
  const mockDb = createMockSupabase([oldRow]);

  const res = await runV2RewriteBatch(mockDb, { dryRunOnly: false });
  assert.equal(res.rewritten, 0);

  const storeRow = mockDb._getStore()[0];
  assert.equal(storeRow.content, "Старый плохой текст."); // Unchanged!
  assert.equal(storeRow.needs_rewrite, true); // Unchanged!
});

test("11. Successful rewrite increments content_version", async () => {
  const oldRow = {
    id: 100,
    type: "physic",
    target_id: "Island Wrangel I.",
    content: "Старый плохой текст.",
    content_version: 1,
    needs_rewrite: true,
  };
  const mockDb = createMockSupabase([oldRow]);

  const res = await runV2RewriteBatch(mockDb, { dryRunOnly: false });
  assert.equal(res.rewritten, 1);

  const storeRow = mockDb._getStore()[0];
  assert.equal(storeRow.content_version, 2);
});

test("12. Successful rewrite returns is_approved=false", async () => {
  const oldRow = {
    id: 100,
    type: "physic",
    target_id: "Island Wrangel I.",
    content: "Старый плохой текст.",
    content_version: 1,
    needs_rewrite: true,
  };
  const mockDb = createMockSupabase([oldRow]);

  const res = await runV2RewriteBatch(mockDb, { dryRunOnly: false });
  assert.equal(res.rewritten, 1);

  const storeRow = mockDb._getStore()[0];
  assert.equal(storeRow.is_approved, false);
});

test("13. Failed rewrite leaves existing row unchanged", async () => {
  const oldRow = {
    id: 100,
    type: "physic",
    target_id: "Unknown Defective Target",
    content: "Старый текст до фейла.",
    content_version: 1,
    needs_rewrite: true,
  };
  const mockDb = createMockSupabase([oldRow]);

  const res = await runV2RewriteBatch(mockDb, { dryRunOnly: false });
  assert.equal(res.rewritten, 0);

  const storeRow = mockDb._getStore()[0];
  assert.equal(storeRow.content, "Старый текст до фейла.");
  assert.equal(storeRow.content_version, 1);
  assert.equal(storeRow.needs_rewrite, true);
});
