create or replace function public.delete_story_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  step_ids uuid[];
  choice_ids uuid[];
begin
  select coalesce(array_agg(id), '{}')
  into step_ids
  from public.story_steps
  where template_id = p_template_id;

  select coalesce(array_agg(id), '{}')
  into choice_ids
  from public.story_choices
  where step_id = any(step_ids);

  delete from public.story_fragments
  where template_id = p_template_id;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_fragments'
      and column_name = 'step_id'
  ) and array_length(step_ids, 1) is not null then
    execute 'delete from public.story_fragments where step_id = any($1)'
    using step_ids;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_fragments'
      and column_name = 'story_step_id'
  ) and array_length(step_ids, 1) is not null then
    execute 'delete from public.story_fragments where story_step_id = any($1)'
    using step_ids;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_fragments'
      and column_name = 'choice_id'
  ) and array_length(choice_ids, 1) is not null then
    execute 'delete from public.story_fragments where choice_id = any($1)'
    using choice_ids;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_fragments'
      and column_name = 'story_choice_id'
  ) and array_length(choice_ids, 1) is not null then
    execute 'delete from public.story_fragments where story_choice_id = any($1)'
    using choice_ids;
  end if;

  if array_length(step_ids, 1) is not null then
    delete from public.story_choices
    where step_id = any(step_ids);
  end if;

  delete from public.story_steps
  where template_id = p_template_id;

  delete from public.story_templates
  where id = p_template_id;
end;
$$;
