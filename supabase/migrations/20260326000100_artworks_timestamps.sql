alter table public.artworks
alter column created_at set default now();

update public.artworks
set created_at = now()
where created_at is null;

alter table public.artworks
alter column created_at set not null;

alter table public.artworks
add column if not exists updated_at timestamp with time zone default now();

create or replace function public.set_artworks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_artworks_updated_at on public.artworks;

create trigger set_artworks_updated_at
before update on public.artworks
for each row
execute function public.set_artworks_updated_at();
