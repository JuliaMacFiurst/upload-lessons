-- Migration: 20260807000100_map_story_database_first_queue.sql
-- Goal: Database-First Content Queue, Generated story_status Column, and Hard Unique Constraint

-- 1. Generated Column: story_status
ALTER TABLE map_stories
ADD COLUMN IF NOT EXISTS story_status text
GENERATED ALWAYS AS (
  CASE 
    WHEN is_approved = true THEN 'ready'
    ELSE 'draft'
  END
) STORED;

-- 2. Hard Database Duplicate Protection: UNIQUE Constraint
-- Pre-checked in audit: 0 duplicates exist in production
CREATE UNIQUE INDEX IF NOT EXISTS map_stories_type_target_id_language_idx
ON map_stories (type, target_id, language);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'map_stories_type_target_id_language_key'
    ) THEN
        ALTER TABLE map_stories
        ADD CONSTRAINT map_stories_type_target_id_language_key
        UNIQUE USING INDEX map_stories_type_target_id_language_idx;
    END IF;
END $$;

-- 3. Database-First Generation Queue View
CREATE OR REPLACE VIEW map_story_generation_queue AS
SELECT mt.*
FROM map_targets mt
WHERE NOT EXISTS (
  SELECT 1
  FROM map_stories ms
  WHERE ms.type = mt.map_type
    AND ms.target_id = mt.target_id
    AND ms.language = 'ru'
);

COMMENT ON COLUMN map_stories.story_status IS 'Generated column: ready if is_approved is true, otherwise draft.';
COMMENT ON VIEW map_story_generation_queue IS 'Database-first queue for Map Content Writer. Contains only map_targets with NO Russian story in map_stories (neither draft nor ready).';
