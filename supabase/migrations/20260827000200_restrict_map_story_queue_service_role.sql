begin;

revoke all on table public.map_story_generation_queue
  from service_role;

revoke all on table public.map_story_rewrite_queue
  from service_role;

grant select on table public.map_story_generation_queue
  to service_role;

grant select on table public.map_story_rewrite_queue
  to service_role;

commit;