begin;

-- Keep the email allowlist in one database function. These are the two admin
-- identities already established by the existing policies and this change.
create or replace function public.is_laplapla_admin()
returns boolean
language sql
stable
as $$
  select
    auth.role() = 'authenticated'
    and lower(coalesce(auth.jwt() ->> 'email', '')) = any (
      array[
        lower('juliamakhlinfiurst@gmail.com'),
        lower('olgamakhlina@gmail.com')
      ]
    );
$$;

comment on function public.is_laplapla_admin() is
  'Returns true only for an explicitly allowlisted LapLapLa administrator email.';

-- Existing table and Storage policies call public.is_admin(). Preserve that
-- contract so the migration updates every policy without dropping or widening it.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.is_laplapla_admin();
$$;

comment on function public.is_admin() is
  'Compatibility wrapper for existing LapLapLa table and Storage admin policies.';

commit;
