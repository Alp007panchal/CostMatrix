-- Local test shim: a minimal stand-in for the parts of Supabase the migrations
-- rely on. Supabase provides all of this in a real project; this file exists so
-- the migrations and the isolation tests can run against a plain Postgres, both
-- here and in CI. It is never applied to a Supabase project.

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- Mirrors Supabase's own auth.uid(): reads the signed-in user out of the
-- request settings the API sets per connection.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
