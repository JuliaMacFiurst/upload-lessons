do $$
declare
  template_row record;
begin
  for template_row in
    select id
    from public.story_templates
    where name ilike '%story%'
  loop
    perform public.delete_story_template(template_row.id);
  end loop;
end;
$$;
