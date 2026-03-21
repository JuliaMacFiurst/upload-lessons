import type { StoryRoleKey, StoryTemplateInput } from "../books/types";

export const STORY_FLOW = [
  "narration",
  "intro",
  "journey",
  "problem",
  "solution",
  "ending",
] as const satisfies readonly StoryRoleKey[];

export type StoryFlowKey = (typeof STORY_FLOW)[number];

export type StoryPath = Record<StoryFlowKey, 0 | 1 | 2>;

export type StoryContractFragment = {
  text: string;
};

export type StoryContractChoice = {
  text: string;
  short_text: string;
  fragments: StoryContractFragment[];
};

export type StoryContractStep = {
  step_key: StoryFlowKey;
  question: string;
  short_text?: string;
  choices: [StoryContractChoice, StoryContractChoice, StoryContractChoice];
  sharedFragment?: StoryContractFragment;
};

export type StoryContractTwist = {
  text: string;
};

export type StoryContractTemplate = {
  steps: [
    StoryContractStep,
    StoryContractStep,
    StoryContractStep,
    StoryContractStep,
    StoryContractStep,
    StoryContractStep,
  ];
  twists?: StoryContractTwist[];
};

export type StoryAssemblySegment =
  | {
      step: StoryFlowKey;
      question: string;
      choice: string;
      text: string;
      sharedText?: string;
    }
  | {
      twist: string;
    };

export type StoryContractAdaptation = {
  template: StoryContractTemplate;
  warnings: string[];
};

export type StoryTemplateSource = Pick<StoryTemplateInput, "steps" | "fragments" | "twists">;

export function createEmptyContractFragment(): StoryContractFragment {
  return { text: "" };
}

export function createEmptyContractChoice(): StoryContractChoice {
  return { text: "", short_text: "", fragments: [] };
}

export function createEmptyContractStep(step_key: StoryFlowKey): StoryContractStep {
  return {
    step_key,
    question: "",
    choices: [
      createEmptyContractChoice(),
      createEmptyContractChoice(),
      createEmptyContractChoice(),
    ],
  };
}

export function createDefaultStoryPath(): StoryPath {
  return {
    narration: 0,
    intro: 0,
    journey: 0,
    problem: 0,
    solution: 0,
    ending: 0,
  };
}
