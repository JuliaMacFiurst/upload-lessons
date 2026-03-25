import { z } from "zod";

export const STORY_SUBMISSION_STEP_KEYS = [
  "narration",
  "intro",
  "journey",
  "problem",
  "solution",
  "ending",
] as const;

export type StorySubmissionStepKey = (typeof STORY_SUBMISSION_STEP_KEYS)[number];

export const STORY_SUBMISSION_STATUS = ["pending", "approved", "rejected"] as const;

export const storySubmissionStatusSchema = z.enum(STORY_SUBMISSION_STATUS);
export const storySubmissionStepKeySchema = z.enum(STORY_SUBMISSION_STEP_KEYS);

export const STORY_SUBMISSION_STEP_LABELS: Record<StorySubmissionStepKey, string> = {
  narration: "Наррация",
  intro: "Начало",
  journey: "Путь",
  problem: "Проблема",
  solution: "Решение",
  ending: "Финал",
};

export const storySubmissionStepSchema = z.object({
  key: storySubmissionStepKeySchema,
  label: z.string().trim().min(1),
  text: z.string().default(""),
  keywords: z.array(z.string().trim().min(1)).default([]),
  preview: z.string().optional().nullable(),
  slideMediaUrl: z.string().default(""),
});

export const storySubmissionAssembledStorySchema = z.object({
  steps: z.array(storySubmissionStepSchema).length(STORY_SUBMISSION_STEP_KEYS.length),
});

export const storySubmissionSchema = z.object({
  id: z.string().uuid(),
  heroName: z.string().default(""),
  mode: z.string().default(""),
  status: storySubmissionStatusSchema.default("pending"),
  createdAt: z.string().nullable(),
  reviewedAt: z.string().nullable().optional(),
  snippet: z.string().default(""),
  reviewerNotes: z.string().default(""),
  assembledStory: storySubmissionAssembledStorySchema,
});

export const storySubmissionListItemSchema = storySubmissionSchema.pick({
  id: true,
  heroName: true,
  mode: true,
  status: true,
  createdAt: true,
  snippet: true,
});

export const storySubmissionPatchSchema = z.object({
  hero_name: z.string().default(""),
  reviewer_notes: z.string().default(""),
  assembled_story: z.object({
    steps: z.array(
      z.object({
        key: storySubmissionStepKeySchema,
        text: z.string().default(""),
        keywords: z.array(z.string().trim().min(1)).default([]),
        preview: z.string().optional().nullable(),
        mediaUrl: z.string().default(""),
      }),
    ).length(STORY_SUBMISSION_STEP_KEYS.length),
  }),
});

export const storySubmissionRejectSchema = z.object({
  reviewerNotes: z.string().default(""),
});

export type StorySubmissionStatus = z.infer<typeof storySubmissionStatusSchema>;
export type StorySubmissionStep = z.infer<typeof storySubmissionStepSchema>;
export type StorySubmission = z.infer<typeof storySubmissionSchema>;
export type StorySubmissionListItem = z.infer<typeof storySubmissionListItemSchema>;
export type StorySubmissionPatchInput = z.infer<typeof storySubmissionPatchSchema>;
export type StorySubmissionRejectInput = z.infer<typeof storySubmissionRejectSchema>;
