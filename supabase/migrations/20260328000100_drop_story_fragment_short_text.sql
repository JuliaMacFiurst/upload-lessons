do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'story_fragments'
      and column_name = 'short_text'
  ) then
    update public.story_choices as c
    set short_text = source.short_text
    from (
      select distinct on (choice_id)
        choice_id,
        short_text
      from public.story_fragments
      where choice_id is not null
        and coalesce(short_text, '') <> ''
      order by choice_id, sort_order asc, id asc
    ) as source
    where c.id = source.choice_id
      and coalesce(c.short_text, '') = '';

    alter table public.story_fragments
    drop column short_text;
  end if;
end $$;
