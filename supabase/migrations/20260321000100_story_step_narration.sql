alter table if exists public.story_steps
add column if not exists narration text;

update public.story_steps as steps
set narration = coalesce(nullif(steps.narration, ''), repaired.narration_text)
from (
  select
    template_id,
    trim(string_agg(text, ' ' order by sort_order asc, id asc)) as narration_text
  from public.story_fragments
  where step_key = 'intro'
    and choice_id is null
  group by template_id
) as repaired
where steps.template_id = repaired.template_id
  and steps.step_key = 'intro'
  and coalesce(nullif(steps.narration, ''), '') = '';

delete from public.story_fragments
where step_key = 'intro'
  and choice_id is null;
