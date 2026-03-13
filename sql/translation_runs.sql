create table if not exists public.translation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null
);

create unique index if not exists translation_runs_one_running_idx
  on public.translation_runs ((status))
  where status = 'running';

