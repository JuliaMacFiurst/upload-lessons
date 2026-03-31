alter table public.map_stories
  add column if not exists auto_generated boolean not null default false;

alter table public.map_stories
  add column if not exists auto_generation_model text null;
