import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getRemediationBacklogStats, selectNextRewriteBatch } from "../lib/server/mapContentWriter/remediationBacklog.ts";

describe("V2 Remediation Backlog Unit & Audit Tests", () => {
  test("1. getRemediationBacklogStats returns expected counts", async () => {
    const stats = await getRemediationBacklogStats();

    assert.equal(stats.originalDefectiveTotal, 494);
    assert.equal(stats.v2RewrittenTotal, 20);
    assert.equal(stats.remainingBacklogTotal, 474);
    assert.equal(stats.remainingReadyCount, 324);
    assert.equal(stats.remainingDraftCount, 150);
  });

  test("2. selectNextRewriteBatch is pure read-only and returns ordered batch", async () => {
    const batch = await selectNextRewriteBatch(20);

    assert.equal(batch.length, 20);
    assert.equal(batch[0].story_id, 1418);

    // Verify ordering story_id ASC
    for (let i = 1; i < batch.length; i++) {
      assert.ok(batch[i].story_id > batch[i - 1].story_id);
    }
  });

  test("3. Pilot 20 IDs are excluded from remediation backlog", async () => {
    const pilotIds = [1398, 1399, 1400, 1401, 1402, 1403, 1404, 1405, 1406, 1407, 1408, 1409, 1410, 1411, 1412, 1413, 1414, 1415, 1416, 1417];
    const allBacklog = await selectNextRewriteBatch(500);

    const overlap = allBacklog.filter((b) => pilotIds.includes(b.story_id));
    assert.equal(overlap.length, 0, "Pilot 20 IDs MUST NOT be present in remediation backlog");
  });
});
