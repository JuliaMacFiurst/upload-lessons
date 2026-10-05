-- Additive Library fields. Existing rows stay in bedtime_stories and become slideshows.
alter table public.bedtime_stories
  add column if not exists content_type text not null default 'slideshow',
  add column if not exists description jsonb not null default '{}'::jsonb,
  add column if not exists media jsonb not null default '{}'::jsonb;

alter table public.bedtime_stories drop constraint if exists bedtime_stories_content_type_check;
alter table public.bedtime_stories add constraint bedtime_stories_content_type_check
  check (content_type in ('slideshow', 'video', 'image'));

alter table public.bedtime_stories drop constraint if exists bedtime_stories_description_object_check;
alter table public.bedtime_stories add constraint bedtime_stories_description_object_check
  check (jsonb_typeof(description) = 'object');

alter table public.bedtime_stories drop constraint if exists bedtime_stories_media_object_check;
alter table public.bedtime_stories add constraint bedtime_stories_media_object_check
  check (jsonb_typeof(media) = 'object');

update public.bedtime_stories set content_type = 'slideshow'
where content_type is null or content_type = '';

update public.bedtime_stories
set description = jsonb_build_object(
  'en', coalesce(nullif(title->>'en', ''), 'A visual story to watch and discover at LapLapLa.'),
  'ru', coalesce(nullif(title->>'ru', ''), 'Визуальная история, которую можно посмотреть и исследовать в LapLapLa.'),
  'he', coalesce(nullif(title->>'he', ''), 'סיפור חזותי לצפייה ולגילוי ב־LapLapLa.')
)
where description = '{}'::jsonb;

create table if not exists public.library_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  labels jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.bedtime_story_categories (
  story_id uuid not null references public.bedtime_stories(id) on delete cascade,
  category_id uuid not null references public.library_categories(id) on delete cascade,
  primary key (story_id, category_id)
);

create index if not exists bedtime_story_categories_category_idx
  on public.bedtime_story_categories(category_id, story_id);

insert into public.library_categories (slug, labels)
values
  ('stories', '{"en":"Stories","ru":"Истории","he":"סיפורים"}'::jsonb),
  ('crafts', '{"en":"Crafts","ru":"Поделки","he":"יצירה"}'::jsonb),
  ('science', '{"en":"Science","ru":"Наука","he":"מדע"}'::jsonb),
  ('art', '{"en":"Art","ru":"Искусство","he":"אמנות"}'::jsonb)
on conflict (slug) do update set labels = excluded.labels;

insert into public.bedtime_story_categories (story_id, category_id)
select stories.id, categories.id from public.bedtime_stories stories
cross join public.library_categories categories
where stories.content_type = 'slideshow' and categories.slug = 'stories'
on conflict do nothing;

alter table public.library_categories enable row level security;
alter table public.bedtime_story_categories enable row level security;

drop policy if exists "Public can read library categories" on public.library_categories;
create policy "Public can read library categories" on public.library_categories
  for select to anon, authenticated using (true);

drop policy if exists "Public can read published library item categories" on public.bedtime_story_categories;
create policy "Public can read published library item categories" on public.bedtime_story_categories
  for select to anon, authenticated using (exists (
    select 1 from public.bedtime_stories stories
    where stories.id = story_id and (
      stories.status = 'exported' or (
        stories.status = 'published' and stories.is_published = true
        and (stories.publish_date is null or stories.publish_date <= now())
      )
    )
  ));
