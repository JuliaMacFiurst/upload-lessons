alter table public.recipes
  add column if not exists country_target_id text null;

create index if not exists recipes_country_target_id_idx
  on public.recipes (country_target_id)
  where country_target_id is not null;
