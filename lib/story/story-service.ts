import type { StoryTemplateInput } from "../books/types";
import {
  STORY_FLOW,
  createDefaultStoryPath,
  createEmptyContractStep,
  type StoryAssemblySegment,
  type StoryContractAdaptation,
  type StoryContractFragment,
  type StoryContractTemplate,
  type StoryContractTwist,
  type StoryFlowKey,
  type StoryPath,
  type StoryTemplateSource,
} from "./story-contract";
import { validateStoryTemplate, type StoryValidationResult } from "./story-validator";

function toContractFragment(text: string): StoryContractFragment {
  return {
    text: text.trim(),
  };
}

function findChoiceIndex(step: StoryTemplateInput["steps"][number] | undefined, fragment: StoryTemplateInput["fragments"][number]) {
  if (!step) {
    return null;
  }

  if (fragment.choice_temp_key !== null && fragment.choice_temp_key !== undefined && fragment.choice_temp_key !== "") {
    const parsed = Number(fragment.choice_temp_key);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < step.choices.length) {
      return parsed;
    }
  }

  if (fragment.choice_id) {
    const choiceIndex = step.choices.findIndex((choice) => choice.id === fragment.choice_id);
    return choiceIndex >= 0 ? choiceIndex : null;
  }

  return null;
}

export function adaptStoryTemplateToContract(source: StoryTemplateSource): StoryContractAdaptation {
  const warnings: string[] = [];
  const steps = STORY_FLOW.map((stepKey) => {
    const sourceStep = source.steps.find((step) => step.step_key === stepKey);
    const contractStep = createEmptyContractStep(stepKey);

    if (!sourceStep) {
      warnings.push(`Missing source step ${stepKey}; created empty placeholder.`);
      return contractStep;
    }

    contractStep.question = sourceStep.question.trim();
    if (sourceStep.narration?.trim()) {
      contractStep.sharedFragment = toContractFragment(sourceStep.narration);
    }
    contractStep.choices = [0, 1, 2].map((choiceIndex) => {
      const sourceChoice = sourceStep.choices[choiceIndex];
      if (stepKey === "narration") {
        return {
          text: "",
          short_text: "",
          fragments: [] as StoryContractFragment[],
        };
      }
      if (!sourceChoice) {
        warnings.push(`Step ${stepKey} is missing choice ${choiceIndex + 1}; created empty placeholder.`);
        return {
          text: "",
          short_text: "",
          fragments: [],
        };
      }

      return {
        text: sourceChoice.text.trim(),
        short_text: sourceChoice.short_text?.trim() ?? "",
        fragments: [] as StoryContractFragment[],
      };
    }) as StoryContractTemplate["steps"][number]["choices"];

    return contractStep;
  }) as StoryContractTemplate["steps"];

  source.fragments.forEach((fragment) => {
    const step = steps.find((item) => item.step_key === fragment.step_key);
    if (!step) {
      warnings.push(`Fragment for unknown step ${fragment.step_key} was ignored.`);
      return;
    }

    const contractFragment = toContractFragment(fragment.text);
    const choiceIndex = findChoiceIndex(
      source.steps.find((item) => item.step_key === fragment.step_key),
      fragment,
    );

    if (choiceIndex === null) {
      if (!step.sharedFragment) {
        step.sharedFragment = contractFragment;
      } else {
        warnings.push(`Step ${fragment.step_key} has multiple shared fragments; only the first was kept in contract view.`);
      }
      return;
    }

    step.choices[choiceIndex].fragments.push(contractFragment);
  });

  return {
    template: {
      steps,
      twists: source.twists.map((twist) => ({
        text: twist.text.trim(),
      })),
    },
    warnings,
  };
}

export function buildStory(
  template: StoryContractTemplate,
  path: StoryPath = createDefaultStoryPath(),
  twist?: StoryContractTwist,
): StoryAssemblySegment[] {
  const result: StoryAssemblySegment[] = [];

  for (const stepKey of STORY_FLOW) {
    const stepData = template.steps.find((step) => step.step_key === stepKey);
    if (!stepData) {
      continue;
    }

    const choiceIndex = path[stepKey];
    const choice = stepData.choices[choiceIndex];
    const fragment = choice?.fragments[0];

    result.push({
      step: stepKey,
      question: stepData.question,
      choice: choice?.text ?? "",
      text: fragment?.text ?? "",
      ...(stepData.sharedFragment?.text ? { sharedText: stepData.sharedFragment.text } : {}),
    });

    if ((stepKey === "problem" || stepKey === "solution") && twist?.text) {
      result.push({ twist: twist.text });
    }
  }

  return result;
}

export function buildStoryPreviewText(
  template: StoryContractTemplate,
  path: StoryPath = createDefaultStoryPath(),
  twist?: StoryContractTwist,
) {
  return buildStory(template, path, twist)
    .map((segment) => {
      if ("twist" in segment) {
        return `Twist: ${segment.twist}`;
      }

      return [
        `${segment.step}: ${segment.question}`,
        `Choice: ${segment.choice}`,
        segment.text,
        segment.sharedText ?? "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function validateStoryTemplateSource(
  source: StoryTemplateSource,
  options?: { scope?: StoryFlowKey },
): StoryValidationResult & { adaptationWarnings: string[] } {
  const adapted = adaptStoryTemplateToContract(source);
  const validation = validateStoryTemplate(adapted.template, options?.scope);
  return {
    errors: validation.errors,
    warnings: [...adapted.warnings, ...validation.warnings],
    adaptationWarnings: adapted.warnings,
  };
}
