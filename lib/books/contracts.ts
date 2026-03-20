import { z } from "zod";

export const CANONICAL_BOOK_SECTION_KEYS = [
  "plot",
  "characters",
  "main_idea",
  "philosophy",
  "conflicts",
  "author_message",
  "ending_meaning",
  "twenty_seconds",
] as const;

export const STORY_ROLE_KEYS = [
  "intro",
  "journey",
  "problem",
  "solution",
  "ending",
] as const;

export type CanonicalBookSectionKey = (typeof CANONICAL_BOOK_SECTION_KEYS)[number];
export type StoryRoleKey = (typeof STORY_ROLE_KEYS)[number];

export const canonicalSlideSchema = z.object({
  text: z.string().trim().min(1, "Slide text is required.").max(400),
});

export const canonicalExplanationSectionSchema = z.object({
  slides: z.array(canonicalSlideSchema).min(1).max(12),
});

export const canonicalQuizQuestionSchema = z.object({
  question: z.string().trim().min(1, "Question text is required.").max(300),
  options: z
    .array(z.string().trim().min(1, "Answer option is required.").max(220))
    .min(3, "Each question needs at least 3 options.")
    .max(4, "Each question supports up to 4 options."),
  correctAnswerIndex: z.number().int().min(0).max(3),
});

export const canonicalQuizSchema = z.object({
  title: z.string().trim().min(1, "Test title is required.").max(160),
  description: z.string().trim().max(700).optional().nullable(),
  quiz: z.array(canonicalQuizQuestionSchema).min(1, "Add at least one quiz question.").max(20),
});

export const canonicalFullBookSchema = z.object({
  description: z.string().trim().min(1).max(300),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(10),
  plot: canonicalExplanationSectionSchema,
  characters: canonicalExplanationSectionSchema,
  main_idea: canonicalExplanationSectionSchema,
  philosophy: canonicalExplanationSectionSchema,
  conflicts: canonicalExplanationSectionSchema,
  author_message: canonicalExplanationSectionSchema,
  ending_meaning: canonicalExplanationSectionSchema,
  twenty_seconds: canonicalExplanationSectionSchema,
  test: canonicalQuizSchema,
});

export const canonicalStoryPartStepSchema = z.object({
  question: z.string().trim().min(1).max(300),
  step_key: z.enum(STORY_ROLE_KEYS),
});

export const canonicalStoryPartTextSchema = z.object({
  text: z.string().trim().min(1).max(500),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

export const canonicalStoryChoiceSchema = z.object({
  text: z.string().trim().min(1, "Choice text is required.").max(220),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
});

export const canonicalStoryStepSchema = z.object({
  step_key: z.enum(STORY_ROLE_KEYS),
  question: z.string().trim().min(1, "Step question is required.").max(300),
  choices: z.array(canonicalStoryChoiceSchema).max(8),
});

export const canonicalStoryFragmentSchema = z.object({
  step_key: z.enum(STORY_ROLE_KEYS),
  choice_index: z.number().int().min(0).optional().nullable(),
  text: z.string().trim().min(1, "Fragment text is required.").max(500),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
});

export const canonicalStoryTwistSchema = z.object({
  text: z.string().trim().min(1, "Twist text is required.").max(220),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
});

export const canonicalStoryTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  steps: z.array(canonicalStoryStepSchema).length(5),
  fragments: z.array(canonicalStoryFragmentSchema).max(60),
  twists: z.array(canonicalStoryTwistSchema).max(30),
});

export type CanonicalSlide = z.infer<typeof canonicalSlideSchema>;
export type CanonicalExplanationSection = z.infer<typeof canonicalExplanationSectionSchema>;
export type CanonicalQuizQuestion = z.infer<typeof canonicalQuizQuestionSchema>;
export type CanonicalQuiz = z.infer<typeof canonicalQuizSchema>;
export type CanonicalFullBook = z.infer<typeof canonicalFullBookSchema>;
export type CanonicalStoryPartStep = z.infer<typeof canonicalStoryPartStepSchema>;
export type CanonicalStoryPartText = z.infer<typeof canonicalStoryPartTextSchema>;
export type CanonicalStoryChoice = z.infer<typeof canonicalStoryChoiceSchema>;
export type CanonicalStoryStep = z.infer<typeof canonicalStoryStepSchema>;
export type CanonicalStoryFragment = z.infer<typeof canonicalStoryFragmentSchema>;
export type CanonicalStoryTwist = z.infer<typeof canonicalStoryTwistSchema>;
export type CanonicalStoryTemplate = z.infer<typeof canonicalStoryTemplateSchema>;
