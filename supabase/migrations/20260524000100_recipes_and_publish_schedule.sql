do $$
begin
  if not exists (select 1 from pg_type where typname = 'recipe_pinterest_status') then
    create type public.recipe_pinterest_status as enum ('draft', 'exported', 'scheduled', 'uploaded', 'published');
  end if;

  if not exists (select 1 from pg_type where typname = 'publication_schedule_status') then
    create type public.publication_schedule_status as enum ('draft', 'scheduled', 'published', 'skipped');
  end if;
end $$;

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text null,
  image_url text null,
  country text null,
  country_target_id text null,
  ingredients jsonb not null default '[]'::jsonb,
  fact text null,
  raccoon_caption text null,
  cooking_time text null,
  cooking_steps jsonb not null default '[]'::jsonb,
  raccoon_advice text null,
  serving_instructions text null,
  laplapla_interaction_caption text null,
  hashtags jsonb not null default '[]'::jsonb,
  publish_date timestamptz null,
  pinterest_status public.recipe_pinterest_status not null default 'draft',
  pinterest_description text null,
  exported_image_urls jsonb not null default '{}'::jsonb,
  asset_set_key text null,
  sticker_set_key text null,
  layout_json jsonb not null default '{}'::jsonb,
  gradient_from text null,
  gradient_to text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (jsonb_typeof(ingredients) = 'array'),
  check (jsonb_typeof(cooking_steps) = 'array'),
  check (jsonb_typeof(hashtags) = 'array'),
  check (jsonb_typeof(exported_image_urls) = 'object'),
  check (jsonb_typeof(layout_json) = 'object')
);

create table if not exists public.publication_schedule_items (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null,
  content_type text not null,
  content_id text not null,
  publish_at timestamptz not null,
  status public.publication_schedule_status not null default 'scheduled',
  sort_order integer null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (slot_key, content_type, content_id),
  check (jsonb_typeof(metadata) = 'object')
);

insert into storage.buckets (id, name, public)
values ('recipes', 'recipes', true)
on conflict (id) do update
set public = true;

alter table public.lessons
  add column if not exists publish_date timestamptz null,
  add column if not exists home_slot text null,
  add column if not exists home_featured_image_url text null;

create index if not exists recipes_publish_date_idx
  on public.recipes (is_active, publish_date desc);

create index if not exists recipes_slug_idx
  on public.recipes (slug);

create index if not exists recipes_country_target_id_idx
  on public.recipes (country_target_id)
  where country_target_id is not null;

create index if not exists publication_schedule_slot_publish_idx
  on public.publication_schedule_items (slot_key, status, publish_at);

create index if not exists lessons_publish_date_idx
  on public.lessons (publish_date desc)
  where publish_date is not null;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_recipes_updated_at on public.recipes;
create trigger update_recipes_updated_at
before update on public.recipes
for each row
execute function public.set_updated_at();

drop trigger if exists update_publication_schedule_items_updated_at on public.publication_schedule_items;
create trigger update_publication_schedule_items_updated_at
before update on public.publication_schedule_items
for each row
execute function public.set_updated_at();

alter table public.recipes enable row level security;
alter table public.publication_schedule_items enable row level security;

drop policy if exists "Public can read recipe storage objects" on storage.objects;
create policy "Public can read recipe storage objects"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'recipes');

drop policy if exists "Public can read published recipes" on public.recipes;
create policy "Public can read published recipes"
on public.recipes
for select
to anon, authenticated
using (
  is_active = true
  and publish_date is not null
  and publish_date <= now()
);

drop policy if exists "Public can read published schedule items" on public.publication_schedule_items;
create policy "Public can read published schedule items"
on public.publication_schedule_items
for select
to anon, authenticated
using (
  status = 'published'
  and publish_at <= now()
);

do $$
begin
  if to_regclass('public.content_translations') is not null then
    execute 'drop policy if exists "Public can read published recipe translations" on public.content_translations';

    execute $policy$
      create policy "Public can read published recipe translations"
      on public.content_translations
      for select
      to anon, authenticated
      using (
        content_type = 'recipe'
        and exists (
          select 1
          from public.recipes r
          where r.id::text = content_translations.content_id::text
            and r.is_active = true
            and r.publish_date is not null
            and r.publish_date <= now()
        )
      )
    $policy$;
  end if;
end $$;
