create table if not exists public.sticker_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  tags text[] not null default '{}'::text[],
  storage_path text not null unique,
  public_url text not null,
  set_key text null,
  source_path text null,
  source_kind text not null default 'raccoon_sticker',
  crop jsonb not null default '{}'::jsonb,
  width integer null,
  height integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (jsonb_typeof(crop) = 'object')
);

create index if not exists sticker_assets_tags_gin_idx
  on public.sticker_assets using gin (tags);

create index if not exists sticker_assets_slug_idx
  on public.sticker_assets (slug);

create index if not exists sticker_assets_set_key_idx
  on public.sticker_assets (set_key)
  where set_key is not null;

drop trigger if exists update_sticker_assets_updated_at on public.sticker_assets;
create trigger update_sticker_assets_updated_at
before update on public.sticker_assets
for each row
execute function public.set_updated_at();

alter table public.sticker_assets enable row level security;

drop policy if exists "Public can read sticker assets" on public.sticker_assets;
create policy "Public can read sticker assets"
on public.sticker_assets
for select
to anon, authenticated
using (true);

drop policy if exists sticker_assets_admin_insert on public.sticker_assets;
create policy sticker_assets_admin_insert
on public.sticker_assets
for insert
to authenticated
with check (public.is_admin());

drop policy if exists sticker_assets_admin_update on public.sticker_assets;
create policy sticker_assets_admin_update
on public.sticker_assets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists sticker_assets_admin_delete on public.sticker_assets;
create policy sticker_assets_admin_delete
on public.sticker_assets
for delete
to authenticated
using (public.is_admin());
