import { z } from "zod";

export const DEFAULT_EXPLANATION_MODE_SLUGS = [
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

export type StoryRoleKey = (typeof STORY_ROLE_KEYS)[number];

export const bookMetaSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Title is required."),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers, and hyphens."),
  author: z.string().trim().max(200).optional().nullable(),
  year: z.number().int().min(0).max(3000).optional().nullable(),
  description: z.string().trim().max(1200).optional().nullable(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30),
  age_group: z.string().trim().max(120).optional().nullable(),
  reading_time: z.number().int().min(0).max(10000).optional().nullable(),
  is_published: z.boolean(),
});

export const bookExplanationSlideSchema = z.object({
  text: z.string().trim().min(1, "Slide text is required.").max(400),
});

export const bookExplanationSchema = z.object({
  id: z.string().uuid().optional(),
  mode_id: z.string().uuid(),
  mode_slug: z.string().trim().min(1),
  mode_name: z.string().trim().min(1),
  is_published: z.boolean().default(false),
  slides: z.array(bookExplanationSlideSchema).max(12),
});

export const bookTestQuestionSchema = z.object({
  question: z.string().trim().min(1, "Question text is required.").max(300),
  options: z
    .array(z.string().trim().min(1, "Answer option is required.").max(220))
    .min(3, "Each question needs at least 3 options.")
    .max(4, "Each question supports up to 4 options."),
  correctAnswerIndex: z.number().int().min(0).max(3),
});

export const bookTestSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Test title is required.").max(160),
  description: z.string().trim().max(700).optional().nullable(),
  is_published: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  quiz: z.array(bookTestQuestionSchema).min(1, "Add at least one quiz question.").max(20),
});

export const storyChoiceSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Choice text is required.").max(220),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
  sort_order: z.number().int().min(0).default(0),
});

export const storyStepSchema = z.object({
  id: z.string().uuid().optional(),
  step_key: z.enum(STORY_ROLE_KEYS),
  question: z.string().trim().min(1, "Step question is required.").max(300),
  sort_order: z.number().int().min(0).default(0),
  choices: z.array(storyChoiceSchema).max(8),
});

export const storyFragmentSchema = z.object({
  id: z.string().uuid().optional(),
  step_key: z.enum(STORY_ROLE_KEYS),
  choice_id: z.string().uuid().optional().nullable(),
  choice_temp_key: z.string().trim().optional().nullable(),
  text: z.string().trim().min(1, "Fragment text is required.").max(500),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
  sort_order: z.number().int().min(0).default(0),
});

export const storyTwistSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Twist text is required.").max(220),
  keywords: z.array(z.string().trim().min(1).max(60)).max(12),
  age_group: z.string().trim().max(120).optional().nullable(),
  is_published: z.boolean().default(true),
});

export const storyTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Template name is required.").max(160),
  slug: z
    .string()
    .trim()
    .min(1, "Template slug is required.")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Template slug must use lowercase letters, numbers, and hyphens."),
  is_published: z.boolean().default(true),
  steps: z.array(storyStepSchema).max(12),
  fragments: z.array(storyFragmentSchema).max(60),
  twists: z.array(storyTwistSchema).max(30),
});

export const bookEditorPayloadSchema = z.object({
  book: bookMetaSchema,
  categoryIds: z.array(z.string().uuid()).max(30),
  explanations: z.array(bookExplanationSchema),
  tests: z.array(bookTestSchema).max(12),
  storyTemplate: storyTemplateSchema.nullable(),
});

export type BookMetaInput = z.infer<typeof bookMetaSchema>;
export type BookExplanationInput = z.infer<typeof bookExplanationSchema>;
export type BookTestInput = z.infer<typeof bookTestSchema>;
export type BookTestQuestionInput = z.infer<typeof bookTestQuestionSchema>;
export type StoryChoiceInput = z.infer<typeof storyChoiceSchema>;
export type StoryStepInput = z.infer<typeof storyStepSchema>;
export type StoryFragmentInput = z.infer<typeof storyFragmentSchema>;
export type StoryTwistInput = z.infer<typeof storyTwistSchema>;
export type StoryTemplateInput = z.infer<typeof storyTemplateSchema>;
export type BookEditorPayload = z.infer<typeof bookEditorPayloadSchema>;

export type CategoryOption = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number | null;
  is_published: boolean | null;
};

export type ExplanationMode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number | null;
  is_published?: boolean | null;
};

export type BookListItem = {
  id: string;
  title: string;
  slug: string;
  author: string | null;
  year: number | null;
  is_published: boolean | null;
  created_at: string | null;
};

export type BookRow = BookMetaInput & {
  id: string;
  created_at?: string | null;
};

export type BookEditorResponse = {
  book: BookRow;
  categoryIds: string[];
  categories: CategoryOption[];
  explanationModes: ExplanationMode[];
  explanations: BookExplanationInput[];
  tests: BookTestInput[];
  storyTemplate: StoryTemplateInput | null;
};

export type StoryBuilderTemplate = StoryTemplateInput;

export type StoryBuilderResponse = {
  templates: StoryBuilderTemplate[];
  twists: StoryTwistInput[];
};
