import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateGeographicSearchCandidates, sanitizeSearchTerm } from "../lib/server/mapContentWriter/evidenceRetriever.ts";
import { validateFactVerification, type ResearchFactV2 } from "../lib/server/mapContentWriter/v2Validator.ts";
import { generateV2VerifiedCandidate } from "../lib/server/mapContentWriter/v2StoryGenerator.ts";

describe("V2 Remediation Regression Tests (4 Pilot Failures)", () => {
  test("1. Diacritic sanitization & Geographic term resolution for Sarïr Kalanshiyu", () => {
    const sanitized = sanitizeSearchTerm("Desert Sarïr Kalanshiyu");
    assert.equal(sanitized, "Desert Sarir Kalanshiyu");

    const candidates = generateGeographicSearchCandidates("Desert Sarïr Kalanshiyu ar Ramli al Kabi", "Сарир-Каланшо");
    assert.ok(candidates.includes("Сарир-Каланшо"));
    assert.ok(candidates.includes("Большое Песчаное море"));
  });

  test("2. Geographic resolution for Banaadir Coast", () => {
    const candidates = generateGeographicSearchCandidates("Geoarea Banaadir Coast", "Бенадир");
    assert.ok(candidates.includes("Бенадир"));
    assert.ok(candidates.includes("Banaadir"));
  });

  test("3. Numeric Evidence Normalization for ranges and units (40m, 180km)", () => {
    const facts: ResearchFactV2[] = [
      {
        claim: "Дюны высотой 20–40 м протяженностью 180 км",
        source_title: "Test Source",
        source_url_or_identifier: "https://ru.wikipedia.org/wiki/Test",
        source_status: "SOURCE_EVIDENCE_FOUND",
        evidence_summary: "Рельеф сложен продольными дюнами высотой от 20 до 40 метров и длиной до 180 км",
      },
    ];

    const storyText = "Рельеф пустыни состоит из дюн высотой 40 метров, тянущихся на 180 километров.";
    const result = validateFactVerification(storyText, facts);

    assert.equal(result.isValid, true);
    assert.equal(result.unverifiedClaims.length, 0);
  });

  test("4. Full Candidate Generation for all 4 Remediated Target IDs", async () => {
    const targets = [
      { id: "Desert Sarïr Kalanshiyu ar Ramli al Kabi", type: "physic" },
      { id: "Desert Simpson Desert", type: "physic" },
      { id: "Desert Wahiba Sands", type: "physic" },
      { id: "Geoarea Banaadir Coast", type: "physic" },
    ];

    for (const t of targets) {
      const res = await generateV2VerifiedCandidate(t.type, t.id, t.id);
      assert.equal(res.isValid, true, `Target ${t.id} failed validation: ${res.errors.join(", ")}`);
      assert.equal(res.stopConditions.length, 0);
    }
  });
});
