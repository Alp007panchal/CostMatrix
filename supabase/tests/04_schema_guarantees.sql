-- Structural promises that are easy to break by accident in a later migration.

-- Every tenant-owned table must have row-level security switched on. A table
-- added later without it would leak across companies, so the test lists tables
-- rather than checking the ones we remembered.
do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ')
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception 'FAIL  tables without row-level security: %', unprotected;
  end if;
  raise notice 'ok    every public table has row-level security enabled';
end;
$$;

-- The security predicates must stay SECURITY DEFINER and STABLE: without the
-- first they recurse through the policies that call them, without the second
-- they are re-evaluated per row.
do $$
declare
  bad text;
begin
  select string_agg(p.proname, ', ')
  into bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
    and p.proname in ('current_company_id', 'is_master_admin', 'has_role')
    and (not p.prosecdef or p.provolatile <> 's');

  if bad is not null then
    raise exception 'FAIL  predicates not security definer and stable: %', bad;
  end if;
  raise notice 'ok    security predicates are security definer and stable';
end;
$$;

-- A new company gets its settings row automatically, so the admin screen finds
-- a form to fill rather than an error.
do $$
declare
  new_company uuid;
  settings_rows int;
begin
  insert into public.companies (name) values ('Trigger Test Ltd') returning id into new_company;
  select count(*) into settings_rows from public.company_settings where company_id = new_company;
  if settings_rows <> 1 then
    raise exception 'FAIL  a new company did not get a settings row (got %)', settings_rows;
  end if;
  raise notice 'ok    a new company gets its settings row automatically';
  delete from public.companies where id = new_company;
end;
$$;

-- updated_at moves on its own, whatever the caller claims.
do $$
declare
  target uuid := '00000000-0000-0000-0000-0000000000c2';
  before_at timestamptz;
  after_at timestamptz;
begin
  select updated_at into before_at from public.companies where id = target;
  update public.companies
     set name = name, updated_at = '2000-01-01'::timestamptz
   where id = target;
  select updated_at into after_at from public.companies where id = target;

  if after_at <= before_at then
    raise exception 'FAIL  updated_at was not maintained (% then %)', before_at, after_at;
  end if;
  raise notice 'ok    updated_at is maintained by the database, not the caller';
end;
$$;
