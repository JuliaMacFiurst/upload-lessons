import { z } from "zod";
import {
  CANONICAL_BOOK_SECTION_KEYS,
  STORY_ROLE_KEYS,
  canonicalExplanationSectionSchema,
  canonicalQuizQuestionSchema,
  canonicalQuizSchema,
  canonicalSlideSchema,
  canonicalStoryChoiceSchema,
  canonicalStoryFragmentSchema,
  canonicalStoryStepSchema,
  canonicalStoryTwistSchema,
  type StoryRoleKey,
} from "./contracts";

export const DEFAULT_EXPLANATION_MODE_SLUGS = CANONICAL_BOOK_SECTION_KEYS;
export { STORY_ROLE_KEYS };
export type { StoryRoleKey };

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

export const bookExplanationSlideSchema = canonicalSlideSchema;

export const bookExplanationSchema = z.object({
  id: z.string().uuid().optional(),
  mode_id: z.string().uuid(),
  mode_slug: z.string().trim().min(1),
  mode_name: z.string().trim().min(1),
  is_published: z.boolean().default(false),
  slides: canonicalExplanationSectionSchema.shape.slides,
});

export const bookTestQuestionSchema = canonicalQuizQuestionSchema;

export const bookTestSchema = canonicalQuizSchema.extend({
  id: z.string().uuid().optional(),
  is_published: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const storyChoiceSchema = canonicalStoryChoiceSchema.extend({
  id: z.string().uuid().optional(),
  short_text: z.string().trim().max(220).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
});

export const storyStepSchema = canonicalStoryStepSchema.extend({
  id: z.string().uuid().optional(),
  short_text: z.string().trim().max(220).optional().nullable(),
  narration: z.string().trim().max(1000).optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
  choices: z.array(storyChoiceSchema).max(8),
});

export const storyFragmentSchema = canonicalStoryFragmentSchema.extend({
  id: z.string().uuid().optional(),
  choice_id: z.string().uuid().optional().nullable(),
  choice_temp_key: z.string().trim().optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
}).omit({ choice_index: true });

export const storyTwistSchema = canonicalStoryTwistSchema.extend({
  id: z.string().uuid().optional(),
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
  progress_percent?: number | null;
  missing_sections?: string[];
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

export type StoryTemplateOverviewRow = {
  id: string;
  name: string;
  description: string | null;
  age_group: string | null;
  step_key: StoryRoleKey;
  choices_count: number;
  narration_filled?: boolean;
  question?: string | null;
  short_text?: string | null;
  narration?: string | null;
  choices?: Array<{
    id: string;
    text: string | null;
    short_text: string | null;
    fragments_count: number;
    fragments?: Array<{
      text: string | null;
    }>;
  }>;
};
