create table if not exists public.bedtime_stamp_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  path text not null unique,
  url text not null,
  prompt text null,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bedtime_stamp_assets_created_at_idx
  on public.bedtime_stamp_assets (created_at desc);

create index if not exists bedtime_stamp_assets_name_idx
  on public.bedtime_stamp_assets (name);

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
    where tgname = 'update_bedtime_stamp_assets_updated_at'
      and tgrelid = 'public.bedtime_stamp_assets'::regclass
  ) then
    create trigger update_bedtime_stamp_assets_updated_at
    before update on public.bedtime_stamp_assets
    for each row
    execute function public.set_updated_at();
  end if;
end $$;

alter table public.bedtime_stamp_assets enable row level security;
