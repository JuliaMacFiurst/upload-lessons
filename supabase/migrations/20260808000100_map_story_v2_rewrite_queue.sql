-- Migration: 20260808000100_map_story_v2_rewrite_queue.sql
-- Goal: Map Content Writer v2 Schema Extensions, Story Provenance (story_sources), Source Validation Status, and Rewrite Queue View

-- 1. Schema Extensions for public.map_stories
ALTER TABLE public.map_stories
  ADD COLUMN IF NOT EXISTS needs_rewrite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS story_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_validation_status text NOT NULL DEFAULT 'not_checked',
  ADD COLUMN IF NOT EXISTS source_validated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS source_validation_version integer NOT NULL DEFAULT 1;

-- 2. Add Check Constraint for source_validation_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_map_stories_source_validation_status'
  ) THEN
    ALTER TABLE public.map_stories
      ADD CONSTRAINT chk_map_stories_source_validation_status
      CHECK (source_validation_status IN ('not_checked', 'verified', 'warning', 'failed'));
  END IF;
END $$;

-- 3. Partial Index for Efficient Rewrite Queue Queries
CREATE INDEX IF NOT EXISTS idx_map_stories_needs_rewrite
  ON public.map_stories (needs_rewrite)
  WHERE needs_rewrite = true;

-- 4. Index for Source Validation Status
CREATE INDEX IF NOT EXISTS idx_map_stories_source_val_status
  ON public.map_stories (source_validation_status);

-- 5. Database-First Rewrite Queue View
-- Selects existing Russian map stories marked for rewrite (needs_rewrite = true)
CREATE OR REPLACE VIEW public.map_story_rewrite_queue AS
SELECT
  ms.id AS story_id,
  ms.type AS map_type,
  ms.target_id,
  mt.title_ru,
  mt.title_en,
  ms.content AS current_content,
  ms.content_version,
  ms.is_approved,
  ms.story_status,
  ms.story_sources,
  ms.source_validation_status,
  ms.source_validated_at,
  ms.generation_batch_id,
  ms.created_at,
  ms.updated_at
FROM public.map_stories ms
JOIN public.map_targets mt ON ms.type = mt.map_type AND ms.target_id = mt.target_id
WHERE ms.language = 'ru'
  AND ms.needs_rewrite = true;

-- Comment on View
COMMENT ON VIEW public.map_story_rewrite_queue IS 'Database-first queue for Map Content Writer v2 existing stories requiring rewrite.';
