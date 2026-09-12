-- Test fixture: three companies and four people, plus a couple of assertion
-- helpers. Runs as the database owner, so row-level security does not apply
-- here; the tests that follow run as ordinary signed-in users.

create schema if not exists test;
grant usage on schema test to authenticated, anon;

create or replace function test.ok(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAIL  %', description;
  end if;
  raise notice 'ok    %', description;
end;
$$;

create or replace function test.eq(actual anyelement, expected anyelement, description text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL  % (expected %, got %)', description, expected, actual;
  end if;
  raise notice 'ok    %', description;
end;
$$;

-- Runs a statement that must be refused. Passing needs both a failure and the
-- right reason for it: without expected_error, a typo in the statement would
-- look like a security control working.
create or replace function test.refuses(statement text, description text, expected_error text default null)
returns void language plpgsql as $$
declare
  message text;
begin
  begin
    execute statement;
  exception when others then
    message := replace(sqlerrm, E'\n', ' ');
    if expected_error is not null and position(lower(expected_error) in lower(message)) = 0 then
      raise exception 'FAIL  % — refused, but for the wrong reason: %', description, message;
    end if;
    raise notice 'ok    % (%)', description, message;
    return;
  end;
  raise exception 'FAIL  % — the statement was allowed', description;
end;
$$;

grant execute on all functions in schema test to authenticated, anon;

-- Signs the session in as a given person, the way the API does per request.
create or replace function test.sign_in(who uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
end;
$$;

grant execute on function test.sign_in(uuid) to authenticated, anon;

-- --- the cast -------------------------------------------------------------
-- Fixed ids so the tests can refer to people by name.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'master@nationwide.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'alice@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'bob@beta.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'carol@alpha.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'dan@alpha.test');

insert into public.companies (id, name, kind, currency_code, discount_pct) values
  ('00000000-0000-0000-0000-0000000000c1', 'Nationwide Power Systems', 'in_house', 'KES', 0),
  ('00000000-0000-0000-0000-0000000000c2', 'Alpha Contractors',        'external', 'KES', 10),
  ('00000000-0000-0000-0000-0000000000c3', 'Beta Consultants',         'external', 'USD', 5);

insert into public.profiles (id, company_id, full_name, email, is_master_admin, is_active) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Master Admin',  'master@nationwide.test', true,  true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 'Alice Alpha',   'alice@alpha.test',       false, true),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c3', 'Bob Beta',      'bob@beta.test',          false, true),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c2', 'Carol Costing', 'carol@alpha.test',       false, true),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000c2', 'Dan Departed',  'dan@alpha.test',         false, false);

-- Switch an advanced feature on or off for a company (0117). Called from a test
-- as the database owner, outside any signed-in block: the trigger that reserves
-- a feature switch for the master administrator lets a migration or a fixture
-- through, and this is a fixture. A test that exercises a gated feature switches
-- it on at the top of the file and off again at the end, the way 28 leaves the
-- measurements it made.
create or replace function test.feature(company uuid, feature_code text, is_on boolean default true)
returns void language plpgsql as $$
declare k text;
begin
  select f.option_key into k from public.features f where f.code = feature_code;
  if k is null then raise exception 'no such feature: %', feature_code; end if;
  insert into public.company_options (company_id, key, value, value_type)
  values (company, k, to_jsonb(is_on), 'boolean')
  on conflict (company_id, key) do update set value = to_jsonb(is_on);
end;
$$;

insert into public.user_roles (user_id, company_id, role) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 'company_admin'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 'approver'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c3', 'company_admin'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c2', 'costing_engineer'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000c2', 'company_admin');
