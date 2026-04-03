create or replace function public._tmp_sanitize_map_story_text(input_text text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(input_text, ''), '\[oai_citation:[^]]*]', '', 'gi'),
            '\[([^]]+)]\((https?://[^)[:space:]]+)\)',
            '\1',
            'gi'
          ),
          'https?://[^)[:space:]]+',
          '',
          'gi'
        ),
        '[[:space:]]+([,.;:!?])',
        '\1',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public._tmp_sanitize_map_story_content(input_text text)
returns text
language sql
immutable
as $$
  with normalized as (
    select replace(
      replace(
        replace(
          replace(
            replace(coalesce(input_text, ''), '/n/n/', E'\n\n'),
            E'\\n\\n',
            E'\n\n'
          ),
          '/n/',
          E'\n'
        ),
        E'\\n',
        E'\n'
      ),
      E'\r\n',
      E'\n'
    ) as content
  ),
  lines as (
    select
      ordinality,
      public._tmp_sanitize_map_story_text(
        regexp_replace(
          regexp_replace(
            regexp_replace(trim(line), '^[[:space:]]*#{1,6}[[:space:]]*', ''),
            '^[[:space:]]*[*•\-/]+[[:space:]]*',
            ''
          ),
          '[*/#]+$',
          ''
        )
      ) as cleaned_line
    from normalized,
    regexp_split_to_table(content, E'\n') with ordinality as split(line, ordinality)
  )
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          coalesce(
            (
              select string_agg(cleaned_line, E'\n' order by ordinality)
              from lines
              where cleaned_line is not null
            ),
            ''
          ),
          E'\n{3,}',
          E'\n\n',
          'g'
        ),
        '[[:blank:]]{2,}',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

update public.map_stories
set content = public._tmp_sanitize_map_story_content(content)
where content is not null
  and content is distinct from public._tmp_sanitize_map_story_content(content);

update public.map_story_slides
set text = public._tmp_sanitize_map_story_text(text)
where text is not null
  and text is distinct from public._tmp_sanitize_map_story_text(text);

drop function public._tmp_sanitize_map_story_content(text);
drop function public._tmp_sanitize_map_story_text(text);
