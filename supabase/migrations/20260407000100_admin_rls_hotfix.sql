begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'authenticated'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('juliamakhlinfiurst@gmail.com');
$$;

comment on function public.is_admin() is 'Returns true only for the configured admin email.';

drop policy if exists "Allow anon insert" on public.lessons;

create policy lessons_admin_insert
on public.lessons
for insert
to authenticated
with check (public.is_admin());

create policy lessons_admin_update
on public.lessons
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy lessons_admin_delete
on public.lessons
for delete
to authenticated
using (public.is_admin());

drop policy if exists "authenticated insert videos" on public.videos;
drop policy if exists "authenticated update videos" on public.videos;
drop policy if exists "authenticated delete videos" on public.videos;
drop policy if exists "authenticated read all videos" on public.videos;

create policy videos_admin_insert
on public.videos
for insert
to authenticated
with check (public.is_admin());

create policy videos_admin_update
on public.videos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy videos_admin_delete
on public.videos
for delete
to authenticated
using (public.is_admin());

create policy videos_admin_read_all
on public.videos
for select
to authenticated
using (public.is_admin());

drop policy if exists "admin insert artworks" on public.artworks;
drop policy if exists "admin update artworks" on public.artworks;
drop policy if exists "admin delete artworks" on public.artworks;

create policy artworks_admin_insert
on public.artworks
for insert
to authenticated
with check (public.is_admin());

create policy artworks_admin_update
on public.artworks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy artworks_admin_delete
on public.artworks
for delete
to authenticated
using (public.is_admin());

drop policy if exists "Allow authenticated upload 145d8b_0" on storage.objects;
drop policy if exists "Allow authenticated upload 145d8b_1" on storage.objects;
drop policy if exists "upload artworks" on storage.objects;
drop policy if exists "delete artworks" on storage.objects;

create policy lessons_bucket_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lessons'
  and public.is_admin()
);

create policy lessons_bucket_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lessons'
  and public.is_admin()
)
with check (
  bucket_id = 'lessons'
  and public.is_admin()
);

create policy lessons_bucket_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lessons'
  and public.is_admin()
);

create policy artworks_bucket_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'artworks'
  and public.is_admin()
);

create policy artworks_bucket_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'artworks'
  and public.is_admin()
)
with check (
  bucket_id = 'artworks'
  and public.is_admin()
);

create policy artworks_bucket_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'artworks'
  and public.is_admin()
);

drop policy if exists "public read books" on public.books;
drop policy if exists "public read book_explanations" on public.book_explanations;
drop policy if exists "public read book_tests" on public.book_tests;
drop policy if exists "public read explanation_modes" on public.explanation_modes;
drop policy if exists "public read story_templates" on public.story_templates;

commit;
