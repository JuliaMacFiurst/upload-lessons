do $$
begin
  if not exists (select 1 from pg_type where typname = 'cat_preset_kind') then
    create type public.cat_preset_kind as enum ('full', 'text');
  end if;

  if not exists (select 1 from pg_type where typname = 'cat_media_type') then
    create type public.cat_media_type as enum ('gif', 'video');
  end if;
end $$;

create extension if not exists pg_trgm with schema public;

create table if not exists public.cat_presets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text not null,
  base_key text not null,
  kind public.cat_preset_kind not null default 'text',
  lang text not null default 'ru' check (lang = 'ru'),
  prompt text not null,
  category text null,
  is_active boolean not null default true,
  sort_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (base_key, kind)
);

create table if not exists public.cat_preset_slides (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.cat_presets(id) on delete cascade,
  slide_order integer not null check (slide_order > 0),
  text text not null,
  media_url text null,
  media_type public.cat_media_type null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (preset_id, slide_order),
  check (
    (media_url is null and media_type is null)
    or
    (media_url is not null and media_type is not null)
  )
);

create index if not exists cat_presets_active_kind_idx
  on public.cat_presets (is_active, kind, sort_order);

create index if not exists cat_presets_prompt_trgm_idx
  on public.cat_presets using gin (prompt gin_trgm_ops);

create index if not exists cat_preset_slides_preset_order_idx
  on public.cat_preset_slides (preset_id, slide_order);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_cat_presets_updated_at on public.cat_presets;
create trigger update_cat_presets_updated_at
before update on public.cat_presets
for each row
execute function public.set_updated_at();

drop trigger if exists update_cat_preset_slides_updated_at on public.cat_preset_slides;
create trigger update_cat_preset_slides_updated_at
before update on public.cat_preset_slides
for each row
execute function public.set_updated_at();

alter table public.cat_presets enable row level security;
alter table public.cat_preset_slides enable row level security;

drop policy if exists "Public can read active cat presets" on public.cat_presets;
create policy "Public can read active cat presets"
on public.cat_presets
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read slides of active cat presets" on public.cat_preset_slides;
create policy "Public can read slides of active cat presets"
on public.cat_preset_slides
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.cat_presets p
    where p.id = cat_preset_slides.preset_id
      and p.is_active = true
  )
);

do $$
begin
  if to_regclass('public.content_translations') is not null then
    execute 'drop policy if exists "Public can read active cat preset translations" on public.content_translations';

    execute $policy$
      create policy "Public can read active cat preset translations"
      on public.content_translations
      for select
      to anon, authenticated
      using (
        content_type = 'cat_preset'
        and exists (
          select 1
          from public.cat_presets p
          where p.id::text = content_translations.content_id::text
            and p.is_active = true
        )
      )
    $policy$;
  end if;
end $$;
