-- Migration: 20260807000300_batch_traceability_and_schema_extension.sql
-- Goal: Deterministic Batch Traceability and Extended Batch Log Accounting

-- 1. Add generation_batch_id to map_stories for deterministic auditability
ALTER TABLE public.map_stories
ADD COLUMN IF NOT EXISTS generation_batch_id text;

CREATE INDEX IF NOT EXISTS idx_map_stories_generation_batch_id
  ON public.map_stories (generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;

-- 2. Extend map_story_batch_logs table schema
ALTER TABLE public.map_story_batch_logs
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'generation',
ADD COLUMN IF NOT EXISTS updated_count integer NOT NULL DEFAULT 0;

-- 3. Add check constraints for status and operation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_map_story_batch_logs_status'
    ) THEN
        ALTER TABLE public.map_story_batch_logs
        ADD CONSTRAINT chk_map_story_batch_logs_status
        CHECK (status IN ('running', 'completed', 'failed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_map_story_batch_logs_operation'
    ) THEN
        ALTER TABLE public.map_story_batch_logs
        ADD CONSTRAINT chk_map_story_batch_logs_operation
        CHECK (operation IN ('generation', 'remediation', 'smoke_test'));
    END IF;
END $$;

-- 4. Reclassify historical remediation log row correctly
UPDATE public.map_story_batch_logs
SET 
  operation = 'remediation',
  updated_count = 100,
  status = 'completed'
WHERE batch_id = 'remediation-defective-100-batch-20260807';

COMMENT ON COLUMN public.map_stories.generation_batch_id IS 'System audit batch_id of the canonical factory run that created this story.';
COMMENT ON COLUMN public.map_story_batch_logs.status IS 'Batch execution lifecycle status: running, completed, failed.';
COMMENT ON COLUMN public.map_story_batch_logs.operation IS 'Type of operation: generation, remediation, smoke_test.';
COMMENT ON COLUMN public.map_story_batch_logs.updated_count IS 'Count of updated rows for remediation operations.';
