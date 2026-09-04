-- The first thing anyone runs on a new project. If this breaks, nobody can get
-- into the app at all, so it is tested like any other code.

begin;

-- A fresh project has no in-house company. The fixture made one, so hide it for
-- the length of this transaction and let the script do what it would really do.
update public.companies set kind = 'external' where kind = 'in_house';

-- Stand in for step 1 of the instructions: the account created by hand in the
-- Supabase dashboard.
insert into auth.users (email) values ('you@yourcompany.com');

\i :bootstrap

do $$
declare
  person record;
  role_count int;
begin
  select p.*, c.name as company_name, c.kind, c.discount_pct
  into person
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.email = 'you@yourcompany.com';

  if person is null then
    raise exception 'FAIL  bootstrap did not create a profile';
  end if;
  if not person.is_master_admin then
    raise exception 'FAIL  bootstrap did not grant master admin';
  end if;
  if person.kind <> 'in_house' then
    raise exception 'FAIL  bootstrap attached the master admin to a % company', person.kind;
  end if;
  if person.discount_pct <> 0 then
    raise exception 'FAIL  the in-house company should have no discount, got %', person.discount_pct;
  end if;

  select count(*) into role_count from public.user_roles where user_id = person.id;
  if role_count <> 3 then
    raise exception 'FAIL  expected all three roles, got %', role_count;
  end if;

  raise notice 'ok    bootstrap creates the company, the master admin and all three roles';
end;
$$;

-- Running it twice must be harmless: people re-run instructions.
\i :bootstrap

do $$
declare
  companies int;
  roles int;
begin
  select count(*) into companies from public.companies where kind = 'in_house';
  select count(*) into roles from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
   where p.email = 'you@yourcompany.com';

  if companies <> 1 then
    raise exception 'FAIL  running bootstrap twice made % in-house companies', companies;
  end if;
  if roles <> 3 then
    raise exception 'FAIL  running bootstrap twice made % roles', roles;
  end if;
  raise notice 'ok    bootstrap is safe to run twice';
end;
$$;

rollback;
