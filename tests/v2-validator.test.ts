import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDomainSemantics,
  validateGenericness,
  validateFactVerification,
  validateDossierSources,
  type ResearchFactV2,
  type ResearchDossierV2,
} from "../lib/server/mapContentWriter/v2Validator.ts";
import { validateStorySources } from "../lib/server/mapContentWriter/mapSourceValidator.ts";

test("1. Unsupported factual sentence triggers STOP-FACT-02", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров Врангеля расположен в Северном Ледовитом океане.",
      source_title: "Wikipedia RU",
      source_url_or_identifier: "https://ru.wikipedia.org/wiki/Остров_Врангеля",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Остров Врангеля расположен в Северном Ледовитом океане.",
      confidence: "high",
    },
  ];

  const storyWithUnsupportedSentence =
    "Остров Врангеля расположен в Северном Ледовитом океане. На острове построены огромные золотые пирамиды древней цивилизации.";
  const res = validateFactVerification(storyWithUnsupportedSentence, facts);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-FACT-02");
});

test("2. Unsupported number triggers STOP-FACT-02", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Высота вершины составляет 8848 метров.",
      source_title: "USGS",
      source_url_or_identifier: "https://pubs.usgs.gov/everest",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Высота горы 8848 метров.",
      confidence: "high",
    },
  ];

  const storyWithUnsupportedNumber = "Высота вершины составляет 9500 метров над уровнем моря.";
  const res = validateFactVerification(storyWithUnsupportedNumber, facts);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-FACT-02");
});

test("3. Unsupported geological causality triggers STOP-FACT-02", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров сложен известняковыми породами.",
      source_title: "Wikipedia RU",
      source_url_or_identifier: "https://ru.wikipedia.org/wiki/Мафия",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Остров состоит из кораллинового известняка.",
      confidence: "high",
    },
  ];

  const storyWithFalseCausality =
    "Остров сложен известняком, поэтому здесь постоянно извергаются активные вулканы и течет раскаленная лава.";
  const res = validateFactVerification(storyWithFalseCausality, facts);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-FACT-02");
});

test("4. Missing source URL triggers STOP-SOURCE-01", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров имеет материковое происхождение.",
      source_title: "Reference",
      source_url_or_identifier: "",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Материковый остров.",
      confidence: "high",
    },
  ];

  const dossier: ResearchDossierV2 = {
    target_id: "test",
    map_type: "physic",
    facts,
    uncertain_claims: [],
    rejected_claims: [],
  };

  const res = validateDossierSources(dossier);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SOURCE-01");
});

test("5. HTTP/source status not SOURCE_EVIDENCE_FOUND triggers STOP-SOURCE-01", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров имеет вулканическое происхождение.",
      source_title: "USGS",
      source_url_or_identifier: "https://pubs.usgs.gov/notfound",
      source_status: "SOURCE_NOT_FOUND",
      evidence_summary: "",
      confidence: "medium",
    },
  ];

  const dossier: ResearchDossierV2 = {
    target_id: "test",
    map_type: "physic",
    facts,
    uncertain_claims: [],
    rejected_claims: [],
  };

  const res = validateDossierSources(dossier);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SOURCE-01");
});

test("6. Evidence summary missing triggers STOP-SOURCE-01", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров сложен докембрийским гранитом.",
      source_title: "Seychelles Authority",
      source_url_or_identifier: "https://ru.wikipedia.org/wiki/Маэ",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "",
      confidence: "high",
    },
  ];

  const dossier: ResearchDossierV2 = {
    target_id: "test",
    map_type: "physic",
    facts,
    uncertain_claims: [],
    rejected_claims: [],
  };

  const res = validateDossierSources(dossier);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SOURCE-01");
});

test("7. Domain mismatch triggers STOP-SOURCE-01", () => {
  const facts: ResearchFactV2[] = [
    {
      claim: "Остров Танзании состоит из известняков.",
      source_title: "Tanzania Geological Survey",
      source_url_or_identifier: "https://mme.gov.na/mgs/mafia",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Tanzania survey on Namibia domain",
      confidence: "high",
    },
  ];

  const dossier: ResearchDossierV2 = {
    target_id: "test",
    map_type: "physic",
    facts,
    uncertain_claims: [],
    rejected_claims: [],
  };

  const res = validateDossierSources(dossier);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-SOURCE-01");
  assert.equal(res.reason, "SOURCE_DOMAIN_MISMATCH");
});

test("8. Physic fauna/tourism filler triggers STOP-DOMAIN-01", () => {
  const story =
    "На этом физическом объекте построены пятизвездочные отели для туристов, а в море плавают яркие кораллы и редкие рыбы.";
  const res = validateDomainSemantics("physic", story);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-DOMAIN-01");
});

test("9. Generic interchangeable prose triggers STOP-GENERIC-01", () => {
  const genericStory =
    "Это уникальное место славится тем, что здесь чистейшая вода и невероятная природа, поражающая своей красотой.";
  const res = validateGenericness(genericStory);
  assert.equal(res.isValid, false);
  assert.equal(res.stopId, "STOP-GENERIC-01");
});

test("10. Fully supported candidate passes all validations", () => {
  const story =
    "В чём заключается геологическое своеобразие сибирских гор Западный Саян? Горы Западный Саян протянулись в самом центре Азии. В результате постоянного морозного выветривания верхушки скал разрушаются, образуя курумы — подвижные каменные реки из многотонных глыб, сползающие по склонам. Узкие каньоны рек прорезают скальные хребты. Сможешь представить, как каменная река может течь без воды на высоте 2000 метров?";

  const facts: ResearchFactV2[] = [
    {
      claim: "Западный Саян — горная система протяженностью 650 км в Южной Сибири.",
      source_title: "Wikipedia RU: Западный Саян",
      source_url_or_identifier: "https://ru.wikipedia.org/wiki/Западный_Саян",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Запа́дный Сая́н — горная система протяженностью около 650 км в Южной Сибири. Преобладающие высоты 2000 метров.",
      confidence: "high",
    },
    {
      claim: "Морозное выветривание образует каменные реки (курумы).",
      source_title: "Wikipedia RU: Западный Саян",
      source_url_or_identifier: "https://ru.wikipedia.org/wiki/Западный_Саян",
      source_status: "SOURCE_EVIDENCE_FOUND",
      evidence_summary: "Характерны курумы и каменные осыпи.",
      confidence: "high",
    },
  ];

  const domainRes = validateDomainSemantics("physic", story);
  const genericRes = validateGenericness(story);
  const factRes = validateFactVerification(story, facts);

  assert.equal(domainRes.isValid, true);
  assert.equal(genericRes.isValid, true);
  assert.equal(factRes.isValid, true);
});

test("11. Map Source Validator verifies story_sources contract", async () => {
  const storySourcesPayload = {
    version: 1,
    researched_at: "2026-08-08T14:00:00Z",
    sources: [
      {
        source_id: "src-1",
        source_title: "Wikipedia RU: Западный Саян",
        source_url: "https://ru.wikipedia.org/wiki/Западный_Саян",
        source_tier: "B",
        publisher: "Wikimedia",
        source_status: "SOURCE_EVIDENCE_FOUND",
        retrieved_at: "2026-08-08T14:00:00Z",
        claims: [
          {
            claim_id: "fact-1",
            claim: "Западный Саян — горная система в Сибири.",
            evidence_summary: "Горная система в Сибири.",
            verification_status: "VERIFIED",
          },
        ],
      },
    ],
  };

  const report = await validateStorySources("Западный Саян — горы в Сибири.", storySourcesPayload, "Range/mtn Western Sayan Mts.", "physic");
  assert.equal(report.overall_status, "verified");
  assert.equal(report.claims_verified, 1);
  assert.equal(report.claims_failed, 0);
});

test("12. Map Source Validator flags invalid source_status as failed", async () => {
  const invalidPayload = {
    version: 1,
    researched_at: "2026-08-08T14:00:00Z",
    sources: [
      {
        source_id: "src-1",
        source_title: "Fake Source",
        source_url: "https://fake.domain/page",
        source_tier: "C",
        publisher: "Fake",
        source_status: "SOURCE_NOT_FOUND",
        retrieved_at: "2026-08-08T14:00:00Z",
        claims: [
          {
            claim_id: "fact-1",
            claim: "Fake claim",
            evidence_summary: "",
            verification_status: "FAILED",
          },
        ],
      },
    ],
  };

  const report = await validateStorySources("Fake story text.", invalidPayload, "test-target", "physic");
  assert.equal(report.overall_status, "failed");
  assert.equal(report.claims_failed, 1);
});
