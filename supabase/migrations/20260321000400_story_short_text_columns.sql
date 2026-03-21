alter table if exists public.story_steps
add column if not exists short_text text;

alter table if exists public.story_fragments
add column if not exists short_text text;

update public.story_steps
set short_text = case
  when step_key = 'narration' and coalesce(short_text, '') = '' and coalesce(question, '') <> '' and question <> 'Как начинается история?'
    then question
  else short_text
end
where step_key = 'narration';

update public.story_steps
set question = 'Как начинается история?'
where step_key = 'narration'
  and coalesce(question, '') <> 'Как начинается история?';

update public.story_fragments
set short_text = array_to_string(keywords, ', ')
where coalesce(short_text, '') = ''
  and keywords is not null
  and array_length(keywords, 1) > 0;
