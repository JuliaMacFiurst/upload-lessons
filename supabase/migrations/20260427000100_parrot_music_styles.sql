create table if not exists public.parrot_music_styles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text null,
  icon_url text null,
  search_artist text null,
  search_genre text null,
  is_active boolean not null default true,
  sort_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parrot_music_style_presets (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.parrot_music_styles(id) on delete cascade,
  preset_key text not null,
  title text not null,
  icon_url text null,
  sort_order integer null,
  default_on boolean not null default false,
  default_variant_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (style_id, preset_key)
);

create table if not exists public.parrot_music_style_variants (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.parrot_music_style_presets(id) on delete cascade,
  variant_key text not null,
  title text null,
  audio_url text not null,
  sort_order integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (preset_id, variant_key)
);

create table if not exists public.parrot_music_style_slides (
  id uuid primary key default gen_random_uuid(),
  style_id uuid not null references public.parrot_music_styles(id) on delete cascade,
  slide_order integer not null check (slide_order > 0),
  text text not null,
  media_url text null,
  media_type text null check (media_type in ('gif', 'image', 'video')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (style_id, slide_order),
  check (
    (media_url is null and media_type is null)
    or
    (media_url is not null and media_type is not null)
  )
);

create index if not exists parrot_music_styles_active_sort_idx
  on public.parrot_music_styles (is_active, sort_order, created_at);

create index if not exists parrot_music_style_presets_style_sort_idx
  on public.parrot_music_style_presets (style_id, sort_order, created_at);

create index if not exists parrot_music_style_variants_preset_sort_idx
  on public.parrot_music_style_variants (preset_id, sort_order, created_at);

create index if not exists parrot_music_style_slides_style_order_idx
  on public.parrot_music_style_slides (style_id, slide_order);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_parrot_music_styles_updated_at on public.parrot_music_styles;
create trigger update_parrot_music_styles_updated_at
before update on public.parrot_music_styles
for each row
execute function public.set_updated_at();

drop trigger if exists update_parrot_music_style_presets_updated_at on public.parrot_music_style_presets;
create trigger update_parrot_music_style_presets_updated_at
before update on public.parrot_music_style_presets
for each row
execute function public.set_updated_at();

drop trigger if exists update_parrot_music_style_variants_updated_at on public.parrot_music_style_variants;
create trigger update_parrot_music_style_variants_updated_at
before update on public.parrot_music_style_variants
for each row
execute function public.set_updated_at();

drop trigger if exists update_parrot_music_style_slides_updated_at on public.parrot_music_style_slides;
create trigger update_parrot_music_style_slides_updated_at
before update on public.parrot_music_style_slides
for each row
execute function public.set_updated_at();

alter table public.parrot_music_styles enable row level security;
alter table public.parrot_music_style_presets enable row level security;
alter table public.parrot_music_style_variants enable row level security;
alter table public.parrot_music_style_slides enable row level security;

drop policy if exists "Public can read active parrot music styles" on public.parrot_music_styles;
create policy "Public can read active parrot music styles"
on public.parrot_music_styles
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read active parrot music style presets" on public.parrot_music_style_presets;
create policy "Public can read active parrot music style presets"
on public.parrot_music_style_presets
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.parrot_music_styles s
    where s.id = parrot_music_style_presets.style_id
      and s.is_active = true
  )
);

drop policy if exists "Public can read active parrot music style variants" on public.parrot_music_style_variants;
create policy "Public can read active parrot music style variants"
on public.parrot_music_style_variants
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.parrot_music_style_presets p
    join public.parrot_music_styles s on s.id = p.style_id
    where p.id = parrot_music_style_variants.preset_id
      and s.is_active = true
  )
);

drop policy if exists "Public can read active parrot music style slides" on public.parrot_music_style_slides;
create policy "Public can read active parrot music style slides"
on public.parrot_music_style_slides
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.parrot_music_styles s
    where s.id = parrot_music_style_slides.style_id
      and s.is_active = true
  )
);

do $$
begin
  if to_regclass('public.content_translations') is not null then
    execute 'drop policy if exists "Public can read active parrot music style translations" on public.content_translations';

    execute $policy$
      create policy "Public can read active parrot music style translations"
      on public.content_translations
      for select
      to anon, authenticated
      using (
        content_type = 'parrot_music_style'
        and exists (
          select 1
          from public.parrot_music_styles s
          where s.id::text = content_translations.content_id::text
            and s.is_active = true
        )
      )
    $policy$;
  end if;
end $$;
