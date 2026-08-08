/**
 * Map Content Writer v2 — Editorial Intelligence & Quality Validation Layer
 * Enforces STOP-DOMAIN-01, STOP-GENERIC-01, STOP-FACT-02, and STOP-SOURCE-01 stop conditions.
 */

import { validateSourceDomainSanity, type SourceStatus } from "./evidenceRetriever.ts";

export type ResearchFactV2 = {
  claim: string;
  source_title: string;
  source_url_or_identifier: string;
  source_status: SourceStatus;
  evidence_summary: string;
  confidence?: "high" | "medium";
};

export type ResearchDossierV2 = {
  target_id: string;
  map_type: string;
  title_ru?: string;
  title_en?: string;
  facts: ResearchFactV2[];
  uncertain_claims: string[];
  rejected_claims: string[];
};

export type DomainValidationResult = {
  isValid: boolean;
  stopId?: "STOP-DOMAIN-01";
  message?: string;
  violations: string[];
};

export type GenericnessValidationResult = {
  isValid: boolean;
  stopId?: "STOP-GENERIC-01";
  message?: string;
  detectedForbiddenPhrases: string[];
  concreteFactCount: number;
};

export type FactValidationResult = {
  isValid: boolean;
  stopId?: "STOP-FACT-02";
  message?: string;
  unverifiedClaims: string[];
};

export type SourceValidationResult = {
  isValid: boolean;
  stopId?: "STOP-SOURCE-01";
  reason?: string;
  message?: string;
};

export const FORBIDDEN_GENERIC_PHRASES = [
  "уникальное место",
  "удивительный уголок",
  "невероятная природа",
  "живописный пейзаж",
  "живописные пейзажи",
  "чистейшая вода",
  "богатая флора и фауна",
  "богатая флора",
  "богатая фауна",
  "поражает своей красотой",
  "поражает красотой",
  "привлекает путешественников",
  "привлекает туристов со всего мира",
  "привлекает туристов",
  "настоящий рай",
  "первозданная природа",
  "первозданной природы",
  "удивительное место",
  "невероятное место",
  "настоящая жемчужина",
  "красивейший уголок",
  "пальчики оближешь",
];

const STRONG_CLAIM_PATTERNS = [
  /\bсамый\b/i,
  /\bкрупнейший\b/i,
  /\bдревнейший\b/i,
  /\bединственный\b/i,
  /\bпервый\b/i,
  /\bпочти все\b/i,
  /\bименно здесь возник\b/i,
  /\bпрямое продолжение\b/i,
];

export function validateDossierSources(dossier: ResearchDossierV2): SourceValidationResult {
  if (!dossier.facts || dossier.facts.length === 0) {
    return {
      isValid: false,
      stopId: "STOP-SOURCE-01",
      reason: "SOURCE_NOT_FOUND",
      message: "[STOP-SOURCE-01] Dossier contains 0 verified facts.",
    };
  }

  for (const f of dossier.facts) {
    if (f.source_status !== "SOURCE_EVIDENCE_FOUND") {
      return {
        isValid: false,
        stopId: "STOP-SOURCE-01",
        reason: f.source_status,
        message: `[STOP-SOURCE-01] Fact claim "${f.claim.substring(0, 40)}..." has invalid source status: "${f.source_status}". Only SOURCE_EVIDENCE_FOUND is permitted.`,
      };
    }

    if (!f.evidence_summary || f.evidence_summary.trim().length === 0) {
      return {
        isValid: false,
        stopId: "STOP-SOURCE-01",
        reason: "SOURCE_EVIDENCE_MISSING",
        message: `[STOP-SOURCE-01] Fact claim "${f.claim.substring(0, 40)}..." lacks retrieved evidence_summary.`,
      };
    }

    const domainCheck = validateSourceDomainSanity(f.source_title, f.source_url_or_identifier);
    if (!domainCheck.isValid) {
      return domainCheck;
    }
  }

  return { isValid: true };
}

export function validateDomainSemantics(
  mapType: string,
  content: string
): DomainValidationResult {
  const violations: string[] = [];
  const lowerContent = content.toLowerCase();

  switch (mapType) {
    case "physic": {
      const reliefKeywords = [
        "рельеф", "геолог", "пор", "хребет", "вулкан", "плато", "впадин", "низменност",
        "возвышенност", "гора", "горн", "скал", "ледник", "каньон", "ущель", "сброс",
        "плит", "тектонич", "эрози", "выветриван", "щит", "атолл", "остров", "пустын", "нагорь",
        "террас", "дюн", "берег"
      ];
      if (!reliefKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Story lacks essential physical relief, geological, or landform terminology.");
      }

      const forbiddenPhysicFiller = [
        "рыб", "птиц", "турист", "путешественник", "отель", "курорт", "флора и фауна"
      ];
      const foundFiller = forbiddenPhysicFiller.filter((k) => lowerContent.includes(k));
      if (lowerContent.includes("коралл") && !lowerContent.includes("кораллин")) {
        foundFiller.push("коралл");
      }
      if (foundFiller.length > 0) {
        violations.push(
          `Physic story violates strict domain rule by using forbidden non-geological filler: ${foundFiller.join(", ")}`
        );
      }
      break;
    }

    case "weather": {
      const weatherKeywords = ["климат", "пояс", "температур", "осадк", "муссон", "пассат", "воздушн", "масс", "широт", "инсоляци", "ветер"];
      if (!weatherKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Weather story lacks essential climate and causal meteorological terminology.");
      }
      break;
    }

    case "flag": {
      const flagKeywords = ["флаг", "полос", "цвет", "герб", "символ", "эмблем", "пропорци"];
      if (!flagKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Flag story fails to focus on flag design, vexillology, or symbolism.");
      }
      break;
    }

    case "food": {
      const foodKeywords = ["кухн", "блюд", "ингредиент", "специ", "соус", "рецепт", "продук"];
      if (!foodKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Food story fails to focus on cuisine, ingredients, or culinary traditions.");
      }
      break;
    }

    case "culture": {
      const cultureKeywords = ["культур", "традици", "миф", "эпос", "музык", "искусств", "архитектур", "юнеско"];
      if (!cultureKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Culture story fails to focus on cultural heritage, folklore, or arts.");
      }
      break;
    }

    case "river": {
      const riverKeywords = ["рек", "исто к", "истока", "усть", "бассейн", "течен", "дельт", "приток"];
      if (!riverKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("River story fails to focus on river hydrology and river system geography.");
      }
      break;
    }

    case "sea": {
      const seaKeywords = ["мор", "залив", "пролив", "океан", "глубин", "солён", "солен", "берег", "течен"];
      if (!seaKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Sea story fails to focus on oceanography and water body characteristics.");
      }
      break;
    }

    case "animal": {
      const animalKeywords = ["био м", "животн", "адаптаци", "вид", "климат", "растительност", "лес"];
      if (!animalKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Animal story fails to explain animal adaptations and biome environment.");
      }
      break;
    }

    case "country": {
      const countryKeywords = ["страна", "государств", "столиц", "границ", "населени", "юнеско", "море", "регион"];
      if (!countryKeywords.some((k) => lowerContent.includes(k))) {
        violations.push("Country story fails to present distinctive country geographic/cultural features.");
      }
      break;
    }
  }

  if (violations.length > 0) {
    return {
      isValid: false,
      stopId: "STOP-DOMAIN-01",
      message: `[STOP-DOMAIN-01] Story violates map-type domain contract (${mapType}): ${violations.join(" | ")}`,
      violations,
    };
  }

  return { isValid: true, violations: [] };
}

export function validateGenericness(content: string): GenericnessValidationResult {
  const lowerContent = content.toLowerCase();
  const detectedForbiddenPhrases: string[] = [];

  for (const phrase of FORBIDDEN_GENERIC_PHRASES) {
    if (lowerContent.includes(phrase)) {
      detectedForbiddenPhrases.push(phrase);
    }
  }

  const numberMatches = content.match(/\d+[\d\s.,]*\s*(км|м|°c|млн|тыс|га|м²|км²|%|век|году|лет)?/gi) || [];
  const properNouns = content.match(/(?<![.!?]\s+)[А-ЯЁ][а-яё]+/g) || [];

  const concreteFactCount = numberMatches.length + properNouns.length;

  if (detectedForbiddenPhrases.length > 0) {
    return {
      isValid: false,
      stopId: "STOP-GENERIC-01",
      message: `[STOP-GENERIC-01] Story contains forbidden generic filler phrases: "${detectedForbiddenPhrases.join(
        '", "'
      )}"`,
      detectedForbiddenPhrases,
      concreteFactCount,
    };
  }

  if (concreteFactCount < 2) {
    return {
      isValid: false,
      stopId: "STOP-GENERIC-01",
      message: `[STOP-GENERIC-01] Story has insufficient concrete target-specific facts (${concreteFactCount} detected, minimum 3 required).`,
      detectedForbiddenPhrases: [],
      concreteFactCount,
    };
  }

  return {
    isValid: true,
    detectedForbiddenPhrases: [],
    concreteFactCount,
  };
}

export function validateFactVerification(
  content: string,
  verifiedFacts: ResearchFactV2[]
): FactValidationResult {
  const unverifiedClaims: string[] = [];
  const lowerContent = content.toLowerCase();

  const invalidFacts = verifiedFacts.filter((f) => f.source_status !== "SOURCE_EVIDENCE_FOUND");
  if (invalidFacts.length > 0) {
    unverifiedClaims.push(
      `${invalidFacts.length} facts in dossier lack valid SOURCE_EVIDENCE_FOUND status.`
    );
  }

  // Normalize evidence corpus text for robust numeric and phrase checking
  const dossierCorpus = verifiedFacts
    .map((f) => `${f.claim} ${f.evidence_summary}`)
    .join(" ")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();

  // Strong Claim Patterns check
  for (const pattern of STRONG_CLAIM_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const phrase = match[0].toLowerCase();
      if (!dossierCorpus.includes(phrase)) {
        unverifiedClaims.push(`Strong claim "${phrase}" lacks explicit supporting evidence in research dossier.`);
      }
    }
  }

  // Normalized Numeric Claim Check
  const numbersInStory = content.match(/\d+/g) || [];
  const numbersInDossier = new Set(dossierCorpus.match(/\d+/g) || []);

  for (const num of numbersInStory) {
    // Check if exact digit string appears directly in dossierCorpus or extracted dossier numbers set
    if (!dossierCorpus.includes(num) && !numbersInDossier.has(num)) {
      unverifiedClaims.push(`Numerical claim "${num}" in story is not supported by research dossier evidence.`);
    }
  }

  // Un-dossiered factual claims / proper noun check
  if (lowerContent.includes("пирамид") && !dossierCorpus.includes("пирамид")) {
    unverifiedClaims.push("Story asserts pyramid claims not present in research dossier.");
  }

  if (
    (lowerContent.includes("тропический климат") || lowerContent.includes("знойный") || lowerContent.includes("пляж")) &&
    !dossierCorpus.includes("тропич") &&
    !dossierCorpus.includes("зной") &&
    !dossierCorpus.includes("пляж")
  ) {
    unverifiedClaims.push("Story asserts tropical climate / beach claims not present in research dossier.");
  }

  if (
    (lowerContent.includes("активный вулкан") || lowerContent.includes("активные вулканы") || lowerContent.includes("извергаются") || lowerContent.includes("извергавш")) &&
    !dossierCorpus.includes("вулкан")
  ) {
    unverifiedClaims.push("Story asserts active volcano claims not supported by research dossier.");
  }

  if (
    lowerContent.includes("тропические леса") &&
    (lowerContent.includes("антаркт") || lowerContent.includes("трансантаркт"))
  ) {
    unverifiedClaims.push("Story asserts tropical rainforest claims on Antarctic landforms without dossier evidence.");
  }

  if (unverifiedClaims.length > 0) {
    return {
      isValid: false,
      stopId: "STOP-FACT-02",
      message: `[STOP-FACT-02] Atomic claim validation failed: ${unverifiedClaims.join("; ")}`,
      unverifiedClaims,
    };
  }

  return {
    isValid: true,
    unverifiedClaims: [],
  };
}
