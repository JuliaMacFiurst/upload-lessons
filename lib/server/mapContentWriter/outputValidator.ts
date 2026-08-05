export type ValidationResult = {
  isValid: boolean;
  isContractTestReport: boolean;
  isCandidateJson: boolean;
  objectsProcessed: number;
  validObjectsCount: number;
  errors: string[];
  warnings: string[];
  parsedData: unknown | null;
};

export type CandidateItem = {
  map_type: string;
  target_id: string;
  content: string;
};

/**
 * Validates the raw model output against the Output Contract rules:
 * - Valid JSON array or Contract Test Report
 * - Exactly 3 keys per object: map_type, target_id, content
 * - Hard word range 80–140
 * - Emoji limit (max 1 in 1st sentence)
 */
export function validatePilotOutput(
  rawOutput: string,
  inputTargets: Array<{ target_id: string; map_type: string }>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let isContractTestReport = false;
  let isCandidateJson = false;
  let parsedData: unknown = null;
  let validObjectsCount = 0;

  const trimmed = rawOutput.trim();

  // 1. Check if response is a Contract Test Report diagnostic format
  if (trimmed.includes("[DRY-RUN CONTRACT TEST RESULT]")) {
    isContractTestReport = true;
    return {
      isValid: true,
      isContractTestReport: true,
      isCandidateJson: false,
      objectsProcessed: inputTargets.length,
      validObjectsCount: inputTargets.length,
      errors: [],
      warnings: [
        "Response is in Contract Test Report diagnostic format (status is IMPLEMENTED). Candidate JSON generation for import is blocked by status policy.",
      ],
      parsedData: { rawReport: trimmed },
    };
  }

  // 2. Try parsing JSON
  let cleanedJsonText = trimmed;
  if (trimmed.startsWith("```json")) {
    cleanedJsonText = trimmed.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    warnings.push("Response was wrapped in markdown code blocks ```json.");
  } else if (trimmed.startsWith("```")) {
    cleanedJsonText = trimmed.replace(/^```\s*/, "").replace(/```$/, "").trim();
    warnings.push("Response was wrapped in generic markdown code blocks ```.");
  }

  try {
    parsedData = JSON.parse(cleanedJsonText);
  } catch (err: unknown) {
    const parseError = err instanceof Error ? err.message : String(err);
    errors.push(`JSON syntax error: ${parseError}`);
    return {
      isValid: false,
      isContractTestReport: false,
      isCandidateJson: false,
      objectsProcessed: inputTargets.length,
      validObjectsCount: 0,
      errors,
      warnings,
      parsedData: null,
    };
  }

  // 3. Validate Candidate JSON array structure
  if (!Array.isArray(parsedData)) {
    errors.push("Root output is not a JSON array.");
    return {
      isValid: false,
      isContractTestReport: false,
      isCandidateJson: false,
      objectsProcessed: inputTargets.length,
      validObjectsCount: 0,
      errors,
      warnings,
      parsedData,
    };
  }

  isCandidateJson = true;

  const items = parsedData as Record<string, unknown>[];
  if (items.length !== inputTargets.length) {
    warnings.push(
      `Received ${items.length} candidate objects, expected ${inputTargets.length} items.`
    );
  }

  const expectedKeys = ["map_type", "target_id", "content"].sort();

  items.forEach((item, index) => {
    const itemErrors: string[] = [];

    if (typeof item !== "object" || item === null) {
      errors.push(`Item [${index}] is not an object.`);
      return;
    }

    const actualKeys = Object.keys(item).sort();

    // Check exactly 3 keys
    if (
      actualKeys.length !== 3 ||
      actualKeys.join(",") !== expectedKeys.join(",")
    ) {
      itemErrors.push(
        `Item [${index}] does not have exactly 3 keys (map_type, target_id, content). Actual keys: [${actualKeys.join(", ")}].`
      );
    }

    const mapType = item.map_type;
    const targetId = item.target_id;
    const content = item.content;

    // Check target_id character-for-character
    const expectedTarget = inputTargets[index]?.target_id;
    if (expectedTarget && targetId !== expectedTarget) {
      itemErrors.push(
        `Item [${index}] target_id mismatch: expected "${expectedTarget}", got "${targetId}".`
      );
    }

    // Check content text properties
    if (typeof content !== "string" || content.trim().length === 0) {
      itemErrors.push(`Item [${index}] content is empty or missing.`);
    } else {
      // Word count check
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < 80 || wordCount > 140) {
        warnings.push(
          `Item [${index}] ("${targetId}") word count is ${wordCount} (outside hard range 80–140 words).`
        );
      }

      // Check emoji count in sentences
      const sentences = content.split(/(?<=[.!?])\s+/);
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

      sentences.forEach((sentence, sIdx) => {
        const matches = sentence.match(emojiRegex);
        if (sIdx > 0 && matches && matches.length > 0) {
          itemErrors.push(
            `Item [${index}] contains ${matches.length} emoji in sentence ${sIdx + 1}. Emoji are allowed ONLY in the 1st sentence.`
          );
        }
        if (sIdx === 0 && matches && matches.length > 1) {
          itemErrors.push(
            `Item [${index}] contains ${matches.length} emojis in sentence 1 (maximum 1 emoji allowed).`
          );
        }
      });
    }

    if (itemErrors.length === 0) {
      validObjectsCount++;
    } else {
      errors.push(...itemErrors);
    }
  });

  return {
    isValid: errors.length === 0,
    isContractTestReport,
    isCandidateJson,
    objectsProcessed: items.length,
    validObjectsCount,
    errors,
    warnings,
    parsedData,
  };
}
