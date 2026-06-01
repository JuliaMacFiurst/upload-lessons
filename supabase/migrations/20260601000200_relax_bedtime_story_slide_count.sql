do $$
declare
  old_constraint_name text;
begin
  select con.conname
  into old_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'bedtime_stories'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%jsonb_array_length(slides) = 10%'
  limit 1;

  if old_constraint_name is not null then
    execute format('alter table public.bedtime_stories drop constraint %I', old_constraint_name);
  end if;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'bedtime_stories'
      and con.conname = 'bedtime_stories_slides_count_check'
  ) then
    alter table public.bedtime_stories
      add constraint bedtime_stories_slides_count_check
      check (jsonb_array_length(slides) between 1 and 10);
  end if;
end $$;
