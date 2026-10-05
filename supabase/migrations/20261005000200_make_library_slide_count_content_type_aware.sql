alter table public.bedtime_stories
  drop constraint if exists bedtime_stories_slides_count_check;

alter table public.bedtime_stories
  add constraint bedtime_stories_slides_count_check
  check (
    (content_type = 'slideshow' and jsonb_array_length(slides) between 1 and 10)
    or
    (content_type in ('video', 'image') and jsonb_array_length(slides) between 0 and 10)
  );
