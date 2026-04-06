begin;

create policy "public read books"
on public.books
for select
to anon
using (true);

create policy "public read book_explanations"
on public.book_explanations
for select
to anon
using (true);

create policy "public read book_tests"
on public.book_tests
for select
to anon
using (true);

create policy "public read explanation_modes"
on public.explanation_modes
for select
to anon
using (true);

create policy "public read story_templates"
on public.story_templates
for select
to anon
using (true);

commit;
