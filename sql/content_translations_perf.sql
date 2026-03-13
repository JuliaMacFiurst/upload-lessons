create index if not exists content_translations_updated_at_idx
  on content_translations(updated_at desc);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_content_translations_updated_at on content_translations;

create trigger update_content_translations_updated_at
before update on content_translations
for each row
execute function set_updated_at();

