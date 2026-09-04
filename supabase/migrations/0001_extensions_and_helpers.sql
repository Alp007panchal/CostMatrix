-- 0001  Foundations: the app schema and the triggers every table uses.
--
-- Nothing here is specific to one feature, and nothing here reads a table.
-- The security predicates (who is signed in, which company, which roles) live
-- in 0002, because Postgres validates the body of a SQL function when it is
-- created and those functions read tables 0002 creates.

create schema if not exists app;

comment on schema app is
  'Internal helpers: security predicates, number issuing, shared triggers. Not exposed through the API.';

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger: keeps updated_at honest regardless of what the caller sends.';

create or replace function app.set_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function app.set_created_by() is
  'BEFORE INSERT trigger: stamps the signed-in user when the caller did not.';

-- Applies both triggers to a table, so later migrations do not repeat the
-- boilerplate for every table they add.
create or replace function app.add_audit_triggers(target regclass)
returns void
language plpgsql
as $$
declare
  prefix text := replace(replace(target::text, 'public.', ''), '.', '_');
begin
  execute format(
    'create trigger %I before update on %s for each row execute function app.set_updated_at()',
    prefix || '_set_updated_at', target
  );
  execute format(
    'create trigger %I before insert on %s for each row execute function app.set_created_by()',
    prefix || '_set_created_by', target
  );
end;
$$;

comment on function app.add_audit_triggers(regclass) is
  'Adds the updated_at and created_by triggers to a table.';
