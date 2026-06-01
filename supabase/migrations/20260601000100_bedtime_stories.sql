do $$
begin
  if not exists (select 1 from pg_type where typname = 'bedtime_story_status') then
    create type public.bedtime_story_status as enum ('draft', 'ready', 'exported', 'scheduled', 'published', 'archived');
  end if;
end $$;

create table if not exists public.bedtime_stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status public.bedtime_story_status not null default 'draft',
  title jsonb not null default '{}'::jsonb,
  emotional_theme jsonb not null default '{}'::jsonb,
  full_json jsonb not null default '{}'::jsonb,
  slides jsonb not null default '[]'::jsonb,
  images jsonb not null default '{}'::jsonb,
  cover_image_url text null,
  instagram_caption jsonb not null default '{}'::jsonb,
  instagram_hashtags text[] not null default '{}'::text[],
  collection_tags text[] not null default '{}'::text[],
  visual_tags text[] not null default '{}'::text[],
  stamp_assets jsonb not null default '[]'::jsonb,
  marker_assets jsonb not null default '[]'::jsonb,
  exported_image_urls jsonb not null default '{}'::jsonb,
  publish_date timestamptz null,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (jsonb_typeof(title) = 'object'),
  check (jsonb_typeof(emotional_theme) = 'object'),
  check (jsonb_typeof(full_json) = 'object'),
  check (jsonb_typeof(slides) = 'array'),
  check (jsonb_array_length(slides) between 1 and 10),
  check (jsonb_typeof(images) = 'object'),
  check (jsonb_typeof(instagram_caption) = 'object'),
  check (jsonb_typeof(stamp_assets) = 'array'),
  check (jsonb_typeof(marker_assets) = 'array'),
  check (jsonb_typeof(exported_image_urls) = 'object')
);

create index if not exists bedtime_stories_publish_date_idx
  on public.bedtime_stories (is_published, publish_date desc);

create index if not exists bedtime_stories_slug_idx
  on public.bedtime_stories (slug);

create index if not exists bedtime_stories_status_idx
  on public.bedtime_stories (status, created_at desc);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    execute $function$
      create function public.set_updated_at()
      returns trigger as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$ language plpgsql
    $function$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_bedtime_stories_updated_at'
      and tgrelid = 'public.bedtime_stories'::regclass
  ) then
    create trigger update_bedtime_stories_updated_at
    before update on public.bedtime_stories
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.bedtime_stories enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'bedtime_stories'
      and policyname = 'Public can read published bedtime stories'
  ) then
    create policy "Public can read published bedtime stories"
    on public.bedtime_stories
    for select
    to anon, authenticated
    using (
      is_published = true
      and publish_date is not null
      and publish_date <= now()
    );
  end if;
end $$;
