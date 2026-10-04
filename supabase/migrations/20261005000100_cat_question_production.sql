create table if not exists public.cat_question_production (
  preset_id uuid primary key references public.cat_presets(id) on delete cascade,
  video_concept text null,
  production_mode text null,
  overall_visual_direction text null,
  mood text null,
  pacing text null,
  music_direction text null,
  continuity_idea text null,
  production_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cat_question_slide_production (
  slide_id uuid primary key references public.cat_preset_slides(id) on delete cascade,
  scene_intent text null,
  visual_idea text null,
  important_constraints text null,
  things_to_avoid text null,
  asset_search_hints text null,
  visual_style_hint text null,
  continuity_transition_hint text null,
  generation_notes text null,
  production_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cat_slide_narrations (
  slide_id uuid not null references public.cat_preset_slides(id) on delete cascade,
  locale text not null check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  storage_key text not null,
  public_url text not null,
  mime_type text not null,
  container text not null,
  duration_ms integer not null check (duration_ms > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  processing_settings jsonb not null,
  processor_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slide_id, locale)
);

create index if not exists cat_slide_narrations_locale_idx
  on public.cat_slide_narrations (locale, updated_at desc);

drop trigger if exists update_cat_question_production_updated_at on public.cat_question_production;
create trigger update_cat_question_production_updated_at
before update on public.cat_question_production
for each row execute function public.set_updated_at();

drop trigger if exists update_cat_question_slide_production_updated_at on public.cat_question_slide_production;
create trigger update_cat_question_slide_production_updated_at
before update on public.cat_question_slide_production
for each row execute function public.set_updated_at();

drop trigger if exists update_cat_slide_narrations_updated_at on public.cat_slide_narrations;
create trigger update_cat_slide_narrations_updated_at
before update on public.cat_slide_narrations
for each row execute function public.set_updated_at();

alter table public.cat_question_production enable row level security;
alter table public.cat_question_slide_production enable row level security;
alter table public.cat_slide_narrations enable row level security;

-- Intentionally no anon/authenticated policies. These production-only tables are
-- reachable through the allowlisted admin API, whose server-side client uses the
-- service role. The public R2 object URL is disclosed only by that guarded API.
