create table if not exists public.ai_batch_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id text,
  book_title text,
  stage text,
  error_message text,
  raw_response text,
  created_at timestamp with time zone default now()
);
