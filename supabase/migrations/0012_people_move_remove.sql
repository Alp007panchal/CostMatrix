-- 0012  Correcting a person who was added by mistake.
--
-- People are deactivated, never deleted, because their name sits on the
-- costings they built, the quotations they released and the history log. That
-- is right for somebody who has worked here, and wrong for an invitation typed
-- into the wrong company five minutes ago. So: a person with no records at all
-- may be moved to another company, or removed altogether (removal is the
-- remove-user function, which needs the secret key; this file gives it the
-- footprint count it checks first).

-- ---------------------------------------------------------------------------
-- 1. How much of this person is in the database?
-- ---------------------------------------------------------------------------

-- Every column in public that names a person. Written once here rather than a
-- list of tables, so a table added later with created_by is counted without
-- another migration.
create or replace function app.person_columns()
returns table (table_name text, column_name text)
language sql
stable
as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and c.data_type = 'uuid'
    and c.column_name in (
      'created_by', 'submitted_by', 'approved_by', 'returned_by', 'released_by',
      'changed_by', 'user_id', 'assigned_to', 'owner_user_id')
    -- profiles and user_roles are the person themselves, not their work.
    and c.table_name not in ('profiles', 'user_roles')
$$;

comment on function app.person_columns is
  'Every public column that names a person, so person_footprint need not list tables.';

create or replace function app.person_footprint(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  target public.profiles;
  col record;
  found integer;
  total integer := 0;
begin
  select * into target from public.profiles where id = uid;
  if target.id is null then
    raise exception 'no such person';
  end if;

  if not (app.is_master_admin()
          or (app.has_role('company_admin') and target.company_id = app.current_company_id())) then
    raise exception 'only an administrator may look up what somebody has done';
  end if;

  for col in select * from app.person_columns() loop
    execute format('select count(*) from public.%I where %I = $1', col.table_name, col.column_name)
      into found using uid;
    total := total + found;
  end loop;

  return total;
end;
$$;

comment on function app.person_footprint is
  'How many rows anywhere name this person. Zero means the invitation can still be undone.';

-- The same count for everybody the caller may see, so the People screen can
-- decide per row without one call each.
create or replace function app.person_footprints()
returns table (user_id uuid, records integer)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  person record;
  col record;
  found integer;
  total integer;
begin
  for person in
    select p.id from public.profiles p
    where app.is_master_admin()
       or (app.has_role('company_admin') and p.company_id = app.current_company_id())
  loop
    total := 0;
    for col in select * from app.person_columns() loop
      execute format('select count(*) from public.%I where %I = $1', col.table_name, col.column_name)
        into found using person.id;
      total := total + found;
    end loop;
    user_id := person.id;
    records := total;
    return next;
  end loop;
end;
$$;

comment on function app.person_footprints is
  'One row per person the caller administers, with how many records name them.';

-- ---------------------------------------------------------------------------
-- 2. Move somebody who has done nothing yet
-- ---------------------------------------------------------------------------

create or replace function app.move_person(uid uuid, to_company uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target public.profiles;
  destination public.companies;
  held public.user_role[];
begin
  if not app.is_master_admin() then
    raise exception 'only the master admin may move a person between companies';
  end if;

  select * into target from public.profiles where id = uid;
  if target.id is null then raise exception 'no such person'; end if;
  if target.is_master_admin then raise exception 'the master admin belongs to every company'; end if;

  select * into destination from public.companies where id = to_company;
  if destination.id is null then raise exception 'no such company'; end if;
  if not destination.is_active then raise exception '% is not active', destination.name; end if;
  if target.company_id = to_company then return; end if;

  if app.person_footprint(uid) > 0 then
    raise exception '% has records already; deactivate instead of moving', target.full_name;
  end if;

  -- The roles table keys on (user_id, company_id) against the profile, so the
  -- rows cannot follow the profile: they are rewritten for the new company.
  select array_agg(role) into held from public.user_roles where user_id = uid;
  delete from public.user_roles where user_id = uid;
  update public.profiles set company_id = to_company where id = uid;

  if held is not null then
    insert into public.user_roles (user_id, company_id, role)
    select uid, to_company, unnest(held);
  end if;
end;
$$;

comment on function app.move_person is
  'Master admin only, and only for a person with no records: profile and roles move to another company.';

-- ---------------------------------------------------------------------------
-- 3. Public wrappers (0005 pattern) and grants
-- ---------------------------------------------------------------------------

create or replace function public.person_footprint(uid uuid)
returns integer
language sql
as $$ select app.person_footprint(uid) $$;

create or replace function public.person_footprints()
returns table (user_id uuid, records integer)
language sql
as $$ select * from app.person_footprints() $$;

create or replace function public.move_person(uid uuid, to_company uuid)
returns void
language sql
as $$ select app.move_person(uid, to_company) $$;

grant execute on function public.person_footprint(uuid)   to authenticated;
grant execute on function public.person_footprints()      to authenticated;
grant execute on function public.move_person(uuid, uuid)  to authenticated;
