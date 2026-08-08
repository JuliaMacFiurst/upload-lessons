-- Migration: 20260808000200_map_story_v2_remediation_backlog.sql
-- Description: Create database-first remediation backlog view for remaining defective 07.08.2026 PHYSIC stories.

CREATE OR REPLACE VIEW map_story_v2_remediation_backlog AS
SELECT
  ms.id AS story_id,
  ms.target_id,
  ms.type AS map_type,
  mt.title_ru,
  ms.is_approved,
  ms.story_status,
  ms.content_version,
  ms.source_validation_status,
  ms.needs_rewrite,
  ms.created_at
FROM map_stories ms
LEFT JOIN map_targets mt ON ms.target_id = mt.target_id
WHERE ms.type = 'physic'
  AND ms.language = 'ru'
  AND ms.auto_generated = true
  AND ms.auto_generation_model = 'antigravity-ide'
  AND ms.created_at >= '2026-08-06T21:00:00.000Z'
  AND ms.created_at <= '2026-08-07T20:59:59.999Z'
  AND NOT (
    ms.content_version > 1
    AND ms.source_validation_status = 'verified'
    AND ms.needs_rewrite = false
  )
ORDER BY ms.id ASC;

COMMENT ON VIEW map_story_v2_remediation_backlog IS 'Dynamic remediation backlog containing defective 07.08.2026 PHYSIC stories awaiting V2 rewrite.';
