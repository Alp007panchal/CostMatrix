-- 0009: kit groups with labour hours, main device, rating. Reference document
-- §5, decision 11.
--
-- The assemblies table is the kit table (the UI says "kit"). A kit belongs to a
-- kit group; the group carries the labour hours per process type, and a kit's
-- own assembly_labour row overrides one process type at a time. A kit has one
-- main device among its lines, and a rating and poles parsed from its name, so
-- the technical offer can be generated from it later.

-- ---------------------------------------------------------------------------
-- 1. Kit groups and their hours
-- ---------------------------------------------------------------------------

create table public.kit_groups (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,  -- NULL = master
  name        text not null check (length(btrim(name)) > 0),
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

comment on table public.kit_groups is
  'A family of kits (ACB, MCCB, ATS, APFC BANK…) that share labour hours per
   process type. Master groups are shared; a company may add its own.';

create unique index kit_groups_name_unique
  on public.kit_groups (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(name));

create table public.kit_group_labour (
  id           uuid primary key default gen_random_uuid(),
  kit_group_id uuid not null references public.kit_groups(id) on delete cascade,
  process_type text not null references public.process_types(code),
  hours        numeric(8,2) not null check (hours >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (kit_group_id, process_type)
);

comment on table public.kit_group_labour is
  'Hours per process type for every kit in the group, unless the kit has its
   own assembly_labour row for that process type.';

select app.add_audit_triggers('public.kit_groups');
select app.add_audit_triggers('public.kit_group_labour');

-- ---------------------------------------------------------------------------
-- 2. Kits: group, rating, poles; one main device per kit
-- ---------------------------------------------------------------------------

alter table public.assemblies
  add column kit_group_id uuid references public.kit_groups(id) on delete set null,
  add column rating       numeric(10,2) check (rating > 0),
  add column rating_unit  text check (rating_unit in ('A', 'KVAR')),
  add column poles        smallint check (poles between 1 and 4);

comment on column public.assemblies.kit_group_id is
  'The kit group whose labour hours apply unless overridden on the kit.';
comment on column public.assemblies.rating is
  'Rating of the main device (630 A, 50 KVAR); what a costing picks a kit by.';

create index assemblies_group_idx on public.assemblies (kit_group_id);

-- A master kit may only sit in a master group; a private kit in a master group
-- or its own. Same shape as app.check_assembly_component_ownership.
create or replace function app.check_assembly_group_ownership()
returns trigger
language plpgsql
as $$
declare
  group_company uuid;
begin
  if new.kit_group_id is null then
    return new;
  end if;
  select company_id into group_company from public.kit_groups where id = new.kit_group_id;
  if new.company_id is null and group_company is not null then
    raise exception 'a master kit may only belong to a master kit group';
  end if;
  if new.company_id is not null and group_company is not null and group_company <> new.company_id then
    raise exception 'a kit may not belong to another company''s kit group';
  end if;
  return new;
end;
$$;

create trigger assemblies_check_group_ownership
  before insert or update of kit_group_id, company_id on public.assemblies
  for each row execute function app.check_assembly_group_ownership();

alter table public.assembly_components add column is_main_device boolean not null default false;

comment on column public.assembly_components.is_main_device is
  'The breaker, contactor or switch the kit is built around. Exactly one per kit
   once the kit is complete; the database allows at most one.';

create unique index assembly_components_one_main_device
  on public.assembly_components (assembly_id) where is_main_device;

-- ---------------------------------------------------------------------------
-- 3. Hours: costing line → company override → kit → kit group → zero
-- ---------------------------------------------------------------------------

create or replace view public.v_assembly_hours
with (security_invoker = true)
as
select
  a.id                                        as assembly_id,
  pt.code                                     as process_type,
  pt.name                                     as process_name,
  pt.sort_order,
  coalesce(cah.hours, al.hours, kgl.hours, 0) as effective_hours,
  al.hours                                    as master_hours,
  cah.hours                                   as company_hours,
  case
    when cah.hours is not null then 'company_override'
    when al.hours is not null and a.company_id is not null then 'private'
    when al.hours is not null then 'master'
    when kgl.hours is not null then 'kit_group'
    when a.company_id is not null then 'private'
    else 'master'
  end                                         as source,
  kgl.hours                                   as group_hours
from public.assemblies a
cross join public.process_types pt
left join public.assembly_labour al
       on al.assembly_id = a.id and al.process_type = pt.code
left join public.kit_group_labour kgl
       on kgl.kit_group_id = a.kit_group_id and kgl.process_type = pt.code
left join public.company_assembly_hours cah
       on cah.assembly_id = a.id
      and cah.process_type = pt.code
      and cah.company_id = app.current_company_id();

comment on view public.v_assembly_hours is
  'Hours per kit per process type for the signed-in company: its own override,
   else the kit''s own hours, else the kit group''s, else zero. master_hours is
   the kit''s own row; group_hours the group''s, so both are visible.';

-- ---------------------------------------------------------------------------
-- 4. Row-level security and grants, the library shape
-- ---------------------------------------------------------------------------

alter table public.kit_groups       enable row level security;
alter table public.kit_group_labour enable row level security;

create policy kit_groups_read on public.kit_groups
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy kit_groups_write_master on public.kit_groups
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy kit_groups_write_own on public.kit_groups
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy kit_group_labour_read on public.kit_group_labour
  for select to authenticated
  using (exists (select 1 from public.kit_groups g
                 where g.id = kit_group_id
                   and (g.company_id is null or g.company_id = app.current_company_id()
                        or app.is_master_admin())));
create policy kit_group_labour_write on public.kit_group_labour
  for all to authenticated
  using (exists (select 1 from public.kit_groups g
                 where g.id = kit_group_id
                   and ((g.company_id is null and app.is_master_admin())
                     or (g.company_id = app.current_company_id() and app.has_role('company_admin')))))
  with check (exists (select 1 from public.kit_groups g
                 where g.id = kit_group_id
                   and ((g.company_id is null and app.is_master_admin())
                     or (g.company_id = app.current_company_id() and app.has_role('company_admin')))));

grant select, insert, update, delete on public.kit_groups, public.kit_group_labour to authenticated;
