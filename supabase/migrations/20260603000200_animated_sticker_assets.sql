create table if not exists public.animated_sticker_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  tags text[] not null default '{}'::text[],
  animation_url text not null,
  preview_url text null,
  storage_path text null unique,
  preview_storage_path text null,
  format text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists animated_sticker_assets_tags_gin_idx
  on public.animated_sticker_assets using gin (tags);

create index if not exists animated_sticker_assets_slug_idx
  on public.animated_sticker_assets (slug);

drop trigger if exists update_animated_sticker_assets_updated_at on public.animated_sticker_assets;
create trigger update_animated_sticker_assets_updated_at
before update on public.animated_sticker_assets
for each row
execute function public.set_updated_at();

alter table public.animated_sticker_assets enable row level security;

drop policy if exists "Public can read animated sticker assets" on public.animated_sticker_assets;
create policy "Public can read animated sticker assets"
on public.animated_sticker_assets
for select
to anon, authenticated
using (true);

drop policy if exists animated_sticker_assets_admin_insert on public.animated_sticker_assets;
create policy animated_sticker_assets_admin_insert
on public.animated_sticker_assets
for insert
to authenticated
with check (public.is_admin());

drop policy if exists animated_sticker_assets_admin_update on public.animated_sticker_assets;
create policy animated_sticker_assets_admin_update
on public.animated_sticker_assets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists animated_sticker_assets_admin_delete on public.animated_sticker_assets;
create policy animated_sticker_assets_admin_delete
on public.animated_sticker_assets
for delete
to authenticated
using (public.is_admin());
