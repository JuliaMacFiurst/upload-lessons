-- Migration: Add map_story_batch_logs table for Content Factory Batch Execution Auditing
-- Created: 2026-08-07

CREATE TABLE IF NOT EXISTS public.map_story_batch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  requested integer NOT NULL DEFAULT 0,
  inserted integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  duplicate integer NOT NULL DEFAULT 0,
  db_errors integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  rejection_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  rejected_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text NOT NULL DEFAULT 'antigravity-ide',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_story_batch_logs_created_at
  ON public.map_story_batch_logs (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_map_story_batch_logs_batch_id
  ON public.map_story_batch_logs (batch_id);

ALTER TABLE public.map_story_batch_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.map_story_batch_logs FROM anon;
REVOKE ALL ON public.map_story_batch_logs FROM authenticated;

GRANT ALL ON public.map_story_batch_logs TO service_role;

COMMENT ON TABLE public.map_story_batch_logs IS
  'Production audit log for Map Content Writer batch executions and diagnostics.';
