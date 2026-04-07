begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'authenticated'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('juliamakhlinfiurst@gmail.com');
$$;

comment on function public.is_admin() is 'Returns true only for the configured admin email.';

do $$
declare
  map_table record;
  existing_policy record;
begin
  for map_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'map\_%' escape '\'
  loop
    execute format(
      'alter table public.%I enable row level security',
      map_table.tablename
    );

    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = map_table.tablename
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        map_table.tablename
      );
    end loop;

    execute format(
      'create policy "Public read" on public.%I for select to anon, authenticated using (true)',
      map_table.tablename
    );

    execute format(
      'create policy "Admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      map_table.tablename
    );
  end loop;
end
$$;

do $$
declare
  expected_tables text[];
  actual_tables text[];
  table_name text;
begin
  select coalesce(array_agg(tablename order by tablename), '{}'::text[])
  into expected_tables
  from pg_tables
  where schemaname = 'public'
    and tablename like 'map\_%' escape '\';

  select coalesce(array_agg(distinct tablename order by tablename), '{}'::text[])
  into actual_tables
  from pg_policies
  where schemaname = 'public'
    and tablename like 'map\_%' escape '\'
    and policyname in ('Public read', 'Admin write');

  if expected_tables <> actual_tables then
    raise exception
      'Map RLS verification failed. Expected policy coverage for %, got %.',
      expected_tables,
      actual_tables;
  end if;

  foreach table_name in array expected_tables
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'Public read'
        and cmd = 'SELECT'
        and roles @> array['anon'::name, 'authenticated'::name]
        and cardinality(roles) = 2
    ) then
      raise exception 'Missing or invalid Public read policy on public.%', table_name;
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'Admin write'
        and cmd = 'ALL'
        and roles @> array['authenticated'::name]
        and cardinality(roles) = 1
    ) then
      raise exception 'Missing or invalid Admin write policy on public.%', table_name;
    end if;
  end loop;
end
$$;

commit;
