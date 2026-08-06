import assert from "node:assert/strict";
import test from "node:test";
import { validateCandidateSchema, DB_TABLE_SCHEMAS } from "../lib/server/ai/schemaLayer.ts";
import { validateMapStoryCandidateSchema } from "../lib/server/mapContentWriter/candidateBuilder.ts";

test("1. Valid Candidate passes with 3 canonical keys", () => {
  const validCandidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Река Обь течёт через Сибирь и впадает в Карское море. Русло реки очень широкое и глубокое.",
  };

  const res = validateMapStoryCandidateSchema(validCandidate);
  assert.equal(res.isValid, true);
  assert.equal(res.stopId, undefined);
});

test("2. Missing required field (target_id) triggers STOP-SCHEMA-01", () => {
  const invalidCandidate = {
    map_type: "river",
    content: "Река Обь течёт через Сибирь.",
  };

  const res = validateMapStoryCandidateSchema(invalidCandidate);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SCHEMA-01");
  assert.ok(res.missingFields.includes("target_id"));
});

test("3. Incorrect field name ('type' instead of 'map_type') triggers STOP-SCHEMA-01", () => {
  const invalidCandidate = {
    type: "river",
    target_id: "Ob",
    content: "Река Обь течёт через Сибирь.",
  };

  const res = validateMapStoryCandidateSchema(invalidCandidate);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SCHEMA-01");
  assert.ok(res.missingFields.includes("map_type"));
  assert.ok(res.unknownFields.includes("type"));
});

test("4. Made-up field ('language') triggers STOP-SCHEMA-01 extra field error", () => {
  const invalidCandidate = {
    map_type: "river",
    target_id: "Ob",
    language: "ru",
    content: "Река Обь течёт через Сибирь.",
  };

  const res = validateMapStoryCandidateSchema(invalidCandidate);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SCHEMA-01");
  assert.ok(res.unknownFields.includes("language"));
});

test("5. Extra unknown field blocks candidate", () => {
  const invalidCandidate = {
    map_type: "river",
    target_id: "Ob",
    content: "Текст истории",
    extra_field: "invalid",
  };

  const res = validateMapStoryCandidateSchema(invalidCandidate);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SCHEMA-01");
  assert.ok(res.unknownFields.includes("extra_field"));
});

test("6. target_id is preserved character-for-character", () => {
  const candidate = {
    map_type: "country",
    target_id: "Côte d'Ivoire",
    content: "Кот-д'Ивуар — государство в Западной Африке.",
  };

  const res = validateMapStoryCandidateSchema(candidate);
  assert.equal(res.isValid, true);
  assert.equal(candidate.target_id, "Côte d'Ivoire");
});

test("7. All 9 map types pass with 3-key schema", () => {
  const mapTypes = [
    "country",
    "flag",
    "culture",
    "food",
    "river",
    "sea",
    "animal",
    "weather",
    "physic",
  ];

  mapTypes.forEach((mt) => {
    const res = validateMapStoryCandidateSchema({
      map_type: mt,
      target_id: `test_${mt}`,
      content: `Текст для типа ${mt}`,
    });
    assert.equal(res.isValid, true);
  });
});

test("8. 100 Candidates have identical 3-key structure", () => {
  const batch = Array.from({ length: 100 }, (_, i) => ({
    map_type: "river",
    target_id: `river_${i + 1}`,
    content: `История реки номер ${i + 1}`,
  }));

  batch.forEach((c) => {
    const keys = Object.keys(c).sort();
    assert.deepEqual(keys, ["content", "map_type", "target_id"]);
    const res = validateMapStoryCandidateSchema(c);
    assert.equal(res.isValid, true);
  });
});
