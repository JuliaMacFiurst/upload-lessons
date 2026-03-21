alter table if exists public.story_choices
add column if not exists short_text text;

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
