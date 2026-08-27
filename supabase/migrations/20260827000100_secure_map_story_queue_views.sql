begin;

alter view public.map_story_generation_queue
  set (security_invoker = true);

alter view public.map_story_rewrite_queue
  set (security_invoker = true);

revoke all on table public.map_story_generation_queue
  from anon, authenticated;

revoke all on table public.map_story_rewrite_queue
  from anon, authenticated;

grant select on table public.map_story_generation_queue
  to service_role;

grant select on table public.map_story_rewrite_queue
  to service_role;

commit;
