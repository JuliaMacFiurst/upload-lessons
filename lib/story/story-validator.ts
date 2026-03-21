import {
  STORY_FLOW,
  type StoryContractChoice,
  type StoryContractTemplate,
  type StoryFlowKey,
} from "./story-contract";

export type StoryValidationResult = {
  errors: string[];
  warnings: string[];
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function similarityKey(choice: StoryContractChoice) {
  return normalizeText(choice.text)
    .replace(/[.,!?;:]/g, "")
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function collectStepNarrativeText(template: StoryContractTemplate, stepIndex: number) {
  const step = template.steps[stepIndex];
  const fragmentsText = step.choices.flatMap((choice) => choice.fragments.map((fragment) => fragment.text));
  const shared = step.sharedFragment?.text ? [step.sharedFragment.text] : [];
  return [step.question, ...fragmentsText, ...shared].join(" ").trim();
}

export function validateStoryStructure(
  template: StoryContractTemplate,
  scope?: StoryFlowKey,
): StoryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!scope && template.steps.length !== STORY_FLOW.length) {
    errors.push(`Story must have exactly ${STORY_FLOW.length} steps.`);
  }

  STORY_FLOW.forEach((expectedStepKey, stepIndex) => {
    if (scope && expectedStepKey !== scope) {
      return;
    }
    const step = template.steps[stepIndex];
    if (!step) {
      errors.push(`Missing step ${expectedStepKey}.`);
      return;
    }

    if (step.step_key !== expectedStepKey) {
      errors.push(`Step ${stepIndex + 1} must be ${expectedStepKey}, received ${step.step_key}.`);
    }

    if (expectedStepKey !== "narration" && !step.question.trim()) {
      errors.push(`Step ${expectedStepKey} has an empty question.`);
    }

    if (expectedStepKey !== "narration" && step.choices.length !== 3) {
      errors.push(`Step ${expectedStepKey} must have exactly 3 choices.`);
    }

    if (expectedStepKey === "narration") {
      if (!step.question.trim()) {
        errors.push("Не указан герой");
      }
      if (!step.sharedFragment?.text.trim()) {
        errors.push("Step narration does not have opening narration yet.");
      }
      return;
    }

    const choiceSimilarity = new Set<string>();
    step.choices.forEach((choice, choiceIndex) => {
      if (!choice.text.trim()) {
        errors.push(`Step ${expectedStepKey}, choice ${choiceIndex + 1} has empty text.`);
      }
      if (!choice.short_text.trim()) {
        errors.push(`Step ${expectedStepKey}, choice ${choiceIndex + 1} has empty short_text.`);
      }

      if (choice.fragments.length < 1) {
        errors.push(`Step ${expectedStepKey}, choice ${choiceIndex + 1} must have at least 1 fragment.`);
      }

      choice.fragments.forEach((fragment, fragmentIndex) => {
        if (!fragment.text.trim()) {
          errors.push(
            `Step ${expectedStepKey}, choice ${choiceIndex + 1}, fragment ${fragmentIndex + 1} has empty text.`,
          );
        }
      });

      const key = similarityKey(choice);
      if (key) {
        if (choiceSimilarity.has(key)) {
          warnings.push(`Step ${expectedStepKey} has semantically similar choice texts.`);
        }
        choiceSimilarity.add(key);
      }
    });

    if (step.sharedFragment && !step.sharedFragment.text.trim()) {
      errors.push(`Step ${expectedStepKey} has an empty shared fragment.`);
    }
  });

  return { errors, warnings };
}

export function validateStoryFlowWarnings(
  template: StoryContractTemplate,
  scope?: StoryFlowKey,
): string[] {
  const warnings: string[] = [];

  const introText = collectStepNarrativeText(template, 0);
  const journeyText = collectStepNarrativeText(template, 1);
  const problemText = collectStepNarrativeText(template, 2);
  const solutionText = collectStepNarrativeText(template, 3);
  const endingText = collectStepNarrativeText(template, 4);

  if ((!scope || scope === "journey" || scope === "intro") && normalizeText(introText) === normalizeText(journeyText) && introText && journeyText) {
    warnings.push("Journey reads too similarly to intro.");
  }

  if (
    (!scope || scope === "problem" || scope === "solution") &&
    problemText &&
    solutionText &&
    /проблем|трудност|потер|меша|опасн/i.test(problemText) &&
    !/реш|справ|помог|нашл|выход/i.test(solutionText)
  ) {
    warnings.push("Solution may not resolve the problem.");
  }

  if ((!scope || scope === "ending") && /нов[а-я]+\s+проблем|снова\s+беда|вдруг\s+появилась\s+проблем/i.test(endingText)) {
    warnings.push("Ending appears to introduce a new problem.");
  }

  STORY_FLOW.slice(1).forEach((stepKey, index) => {
    if (scope && stepKey !== scope) {
      return;
    }
    const previousText = collectStepNarrativeText(template, index);
    const currentText = collectStepNarrativeText(template, index + 1);
    if (!previousText || !currentText) {
      return;
    }

    const previousWords = new Set(
      normalizeText(previousText)
        .split(" ")
        .filter((word) => word.length > 4),
    );
    const overlap = normalizeText(currentText)
      .split(" ")
      .filter((word) => word.length > 4 && previousWords.has(word));

    if (overlap.length === 0) {
      warnings.push(`Step ${stepKey} may not connect clearly to the previous step.`);
    }
  });

  return warnings;
}

export function validateStoryTemplate(
  template: StoryContractTemplate,
  scope?: StoryFlowKey,
): StoryValidationResult {
  const structure = validateStoryStructure(template, scope);
  return {
    errors: structure.errors,
    warnings: [...structure.warnings, ...validateStoryFlowWarnings(template, scope)],
  };
}
