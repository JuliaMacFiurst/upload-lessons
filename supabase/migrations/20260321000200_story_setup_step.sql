do $$
declare
  template_record record;
  narration_exists boolean;
  narration_present boolean;
  narration_step_status text;
  narration_status text;
begin
  for template_record in
    select distinct template_id
    from public.story_steps
  loop
    select exists(
      select 1
      from public.story_steps
      where template_id = template_record.template_id
        and step_key = 'narration'
    )
    into narration_exists;

    if not narration_exists then
      insert into public.story_steps (
        template_id,
        step_key,
        question,
        narration,
        sort_order
      )
      values (
        template_record.template_id,
        'narration',
        'Как начинается история?',
        null,
        0
      );

      narration_step_status := 'created';
    else
      narration_step_status := 'already existed';
    end if;

    update public.story_steps
    set step_key = 'narration'
    where template_id = template_record.template_id
      and step_key = 'setup';

    update public.story_steps
    set
      question = case
        when step_key = 'narration' and coalesce(nullif(question, ''), '') = '' then 'Как начинается история?'
        else question
      end,
      sort_order = case step_key
        when 'narration' then 0
        when 'intro' then 1
        when 'journey' then 2
        when 'problem' then 3
        when 'solution' then 4
        when 'ending' then 5
        else sort_order
      end
    where template_id = template_record.template_id
      and step_key in ('narration', 'intro', 'journey', 'problem', 'solution', 'ending', 'setup');

    select exists(
      select 1
      from public.story_steps
      where template_id = template_record.template_id
        and step_key = 'narration'
        and coalesce(nullif(trim(narration), ''), '') <> ''
    )
    into narration_present;

    narration_status := case
      when narration_present then 'narration found'
      else 'narration missing'
    end;

    raise notice 'story narration migration: template %, narration step %, %',
      template_record.template_id,
      narration_step_status,
      narration_status;
  end loop;
end
$$;
