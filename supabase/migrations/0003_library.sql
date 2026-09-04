-- 0003  The library: what a panel is made of.
--
-- Components (things you buy), assemblies (standard building blocks with their
-- own material and labour), and the rates that price them.
--
-- Master rows have company_id NULL and belong to the master admin. A company
-- may add its own private rows, and may override the master labour hours for a
-- master assembly, but can never edit a master row.

-- ---------------------------------------------------------------------------
-- 1. Reference data
-- ---------------------------------------------------------------------------

create table public.component_categories (
  code       text primary key,
  name       text not null,
  sort_order integer not null default 0
);

comment on table public.component_categories is
  'Master-only. Fixed in release 1, because the BOM exports are built per category.';

insert into public.component_categories (code, name, sort_order) values
  ('switchgear',           'Switchgear',                    1),
  ('busbar',               'Busbar and cable',              2),
  ('accessories_hardware', 'Accessories and hardware',      3),
  ('enclosure_parts',      'Fabricated enclosure parts',    4);

create table public.process_types (
  code       text primary key,
  name       text not null,
  sort_order integer not null default 0
);

comment on table public.process_types is
  'The three kinds of labour. Fixed: each has its own hourly rate, and an
   assembly may use one, two or all three.';

insert into public.process_types (code, name, sort_order) values
  ('assembly', 'Panel and component assembly',      1),
  ('wiring',   'Wiring of electrical components',   2),
  ('busbar',   'Busbar fabrication and assembly',   3);

-- ---------------------------------------------------------------------------
-- 2. Rates
-- ---------------------------------------------------------------------------

create table public.labour_rates (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,  -- NULL = master default, in KES
  process_type text not null references public.process_types(code),
  hourly_rate  numeric(14,2) not null check (hourly_rate >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid
);

comment on table public.labour_rates is
  'One rate per process type per company. The master rows are a suggestion for
   a new company, in KES; each company sets its own in its own currency.';

create unique index labour_rates_unique
  on public.labour_rates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), process_type);

create table public.material_rates (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id) on delete cascade,  -- NULL = master default, in KES
  code         text not null,
  name         text not null,
  unit         text not null default 'kg',
  rate         numeric(14,2) not null check (rate >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid
);

comment on table public.material_rates is
  'Prices charged by weight rather than per piece. Copper busbar is the only
   one in release 1: a bar costs its kilograms times the rate per kilogram.';

create unique index material_rates_unique
  on public.material_rates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

insert into public.material_rates (company_id, code, name, unit, rate)
values (null, 'copper_busbar', 'Copper busbar', 'kg', 3000);

create table public.material_rate_history (
  id               uuid primary key default gen_random_uuid(),
  material_rate_id uuid not null references public.material_rates(id) on delete cascade,
  old_rate         numeric(14,2),
  new_rate         numeric(14,2) not null,
  changed_by       uuid,
  changed_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Components
-- ---------------------------------------------------------------------------

create type public.pricing_mode as enum ('fixed', 'weight_rate');

create table public.components (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid references public.companies(id) on delete cascade,  -- NULL = master
  category_code    text not null references public.component_categories(code),

  code             text not null check (length(btrim(code)) > 0),
  name             text not null check (length(btrim(name)) > 0),
  description      text,
  unit             text not null default 'pcs',
  manufacturer     text,                    -- the "Make" column of the costing sheets
  part_number      text,                    -- the "Reference" column

  pricing_mode     public.pricing_mode not null default 'fixed',

  -- fixed pricing
  unit_price       numeric(14,2) check (unit_price >= 0),
  currency_code    char(3) not null default 'KES',

  -- weight_rate pricing: kilograms per unit, priced at a material rate
  weight_per_unit  numeric(12,3) check (weight_per_unit >= 0),
  material_rate_code text,

  is_active        boolean not null default true,
  import_batch_id  uuid,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,

  -- Each pricing mode needs its own fields and not the other's, so a row can
  -- never be half-configured.
  constraint components_pricing_fields check (
    case pricing_mode
      when 'fixed'       then unit_price is not null and weight_per_unit is null and material_rate_code is null
      when 'weight_rate' then weight_per_unit is not null and material_rate_code is not null and unit_price is null
    end
  )
);

comment on table public.components is
  'One purchasable item. Master rows are priced in KES by the master admin;
   a company''s private rows are priced in that company''s own currency.';
comment on column public.components.material_rate_code is
  'Which material rate prices this component, e.g. copper_busbar. The rate
   itself is looked up per company, so each company can hold its own copper price.';

create unique index components_code_unique
  on public.components (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(code));

create index components_category_idx on public.components (category_code);
create index components_company_idx on public.components (company_id);

create table public.component_price_history (
  id              uuid primary key default gen_random_uuid(),
  component_id    uuid not null references public.components(id) on delete cascade,
  old_price       numeric(14,2),
  new_price       numeric(14,2) not null,
  changed_by      uuid,
  changed_at      timestamptz not null default now(),
  import_batch_id uuid
);

comment on table public.component_price_history is
  'Every price change, whether typed on a screen or uploaded in a spreadsheet.';

-- ---------------------------------------------------------------------------
-- 4. Assemblies
-- ---------------------------------------------------------------------------

create table public.assemblies (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,  -- NULL = master
  code        text not null check (length(btrim(code)) > 0),
  name        text not null check (length(btrim(name)) > 0),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

comment on table public.assemblies is
  'A standard building block of a panel — enclosure cubicle, mounting plate and
   switchgear, busbar set, wiring, accessories. Called a "kit" in conversation.
   One level: assemblies do not contain other assemblies.';

create unique index assemblies_code_unique
  on public.assemblies (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(code));

create table public.assembly_components (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references public.assemblies(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete restrict,
  quantity     numeric(12,3) not null check (quantity > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (assembly_id, component_id)
);

create index assembly_components_assembly_idx on public.assembly_components (assembly_id);

create table public.assembly_labour (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references public.assemblies(id) on delete cascade,
  process_type text not null references public.process_types(code),
  hours        numeric(8,2) not null check (hours >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (assembly_id, process_type)
);

comment on table public.assembly_labour is
  'Fixed hours per process type. This is the whole point of the app: labour is
   hours times a rate, never a percentage of the material cost.';

create table public.company_assembly_hours (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  assembly_id  uuid not null references public.assemblies(id) on delete cascade,
  process_type text not null references public.process_types(code),
  hours        numeric(8,2) not null check (hours >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (company_id, assembly_id, process_type)
);

comment on table public.company_assembly_hours is
  'A company''s own hours for a master assembly. Present means "use mine
   instead"; the master figure stays visible beside it.';

-- ---------------------------------------------------------------------------
-- 5. Spreadsheet uploads
-- ---------------------------------------------------------------------------

create table public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references public.companies(id) on delete cascade,  -- NULL = a master library upload
  user_id        uuid,
  target         text not null check (target in ('components', 'assemblies')),
  file_name      text,
  rows_new       integer not null default 0,
  rows_changed   integer not null default 0,
  rows_unchanged integer not null default 0,
  rows_rejected  integer not null default 0,
  details        jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid
);

comment on table public.import_batches is
  'One row per spreadsheet upload, with the rejected rows and why. Rows created
   or changed by an upload point back here, so a bad file can be traced.';

-- ---------------------------------------------------------------------------
-- 6. Guards and history triggers
-- ---------------------------------------------------------------------------

-- A master assembly may only use master components. A private one may use
-- master components or its own. Without this a company could not open its own
-- costing after another company's component vanished.
create or replace function app.check_assembly_component_ownership()
returns trigger
language plpgsql
as $$
declare
  assembly_company uuid;
  component_company uuid;
begin
  select company_id into assembly_company from public.assemblies where id = new.assembly_id;
  select company_id into component_company from public.components where id = new.component_id;

  if assembly_company is null and component_company is not null then
    raise exception 'a master assembly may only use master components';
  end if;

  if assembly_company is not null
     and component_company is not null
     and component_company <> assembly_company then
    raise exception 'an assembly may not use another company''s components';
  end if;

  return new;
end;
$$;

create trigger assembly_components_check_ownership
  before insert or update on public.assembly_components
  for each row execute function app.check_assembly_component_ownership();

-- SECURITY DEFINER because nobody holds an insert grant on the history table:
-- history is written by the system as a side effect of a change, never by a
-- person, so it cannot be forged or tidied up afterwards.
create or replace function app.record_component_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.unit_price is distinct from old.unit_price and new.unit_price is not null then
    insert into public.component_price_history (component_id, old_price, new_price, changed_by, import_batch_id)
    values (new.id, old.unit_price, new.unit_price, coalesce(auth.uid(), new.created_by), new.import_batch_id);
  end if;
  return new;
end;
$$;

create trigger components_record_price_change
  after update on public.components
  for each row execute function app.record_component_price_change();

-- SECURITY DEFINER for the same reason as the component price history above.
create or replace function app.record_material_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.rate is distinct from old.rate then
    insert into public.material_rate_history (material_rate_id, old_rate, new_rate, changed_by)
    values (new.id, old.rate, new.rate, auth.uid());
  end if;
  return new;
end;
$$;

create trigger material_rates_record_change
  after update on public.material_rates
  for each row execute function app.record_material_rate_change();

select app.add_audit_triggers('public.labour_rates');
select app.add_audit_triggers('public.material_rates');
select app.add_audit_triggers('public.components');
select app.add_audit_triggers('public.assemblies');
select app.add_audit_triggers('public.assembly_components');
select app.add_audit_triggers('public.assembly_labour');
select app.add_audit_triggers('public.company_assembly_hours');
select app.add_audit_triggers('public.import_batches');

-- ---------------------------------------------------------------------------
-- 7. Effective prices and hours
--
-- What a given company actually pays and plans, after its discount, its
-- exchange rate and its own overrides. The costing screens read these, never
-- the raw tables, so the arithmetic lives in one place.
-- ---------------------------------------------------------------------------

create or replace view public.v_material_rates
with (security_invoker = true)
as
select
  coalesce(own.code, master.code)                                    as code,
  coalesce(own.name, master.name)                                    as name,
  coalesce(own.unit, master.unit)                                    as unit,
  -- The company's own rate if it has set one, else the master rate converted
  -- out of KES into the company's currency.
  coalesce(own.rate, master.rate / nullif(c.exchange_rate, 0))       as rate,
  case when own.id is null then 'master' else 'company' end          as source,
  master.rate                                                        as master_rate_kes
from public.companies c
join public.material_rates master on master.company_id is null
left join public.material_rates own
       on own.company_id = c.id and own.code = master.code
where c.id = app.current_company_id();

comment on view public.v_material_rates is
  'Material rates for the signed-in user''s company, its own where set and the
   master default converted otherwise.';

create or replace view public.v_component_prices
with (security_invoker = true)
as
select
  comp.id,
  comp.company_id,
  comp.category_code,
  cat.name                as category_name,
  comp.code,
  comp.name,
  comp.description,
  comp.unit,
  comp.manufacturer,
  comp.part_number,
  comp.pricing_mode,
  comp.weight_per_unit,
  comp.material_rate_code,
  comp.is_active,
  comp.unit_price         as raw_price,
  case
    -- A company's own component is already priced in its own currency, and
    -- gets no discount: the discount is on the master list, not on its own.
    when comp.company_id is not null and comp.pricing_mode = 'fixed'
      then comp.unit_price
    -- Master fixed price: discount applied, then converted out of KES.
    when comp.pricing_mode = 'fixed'
      then round(comp.unit_price * (1 - co.discount_pct / 100) / nullif(co.exchange_rate, 0), 2)
    -- Priced by weight: kilograms times whatever this company pays per kilogram.
    else round(comp.weight_per_unit * mr.rate, 2)
  end                     as unit_price,
  co.currency_code,
  co.currency_label,
  case when comp.company_id is null then 'master' else 'company' end as source
from public.components comp
join public.component_categories cat on cat.code = comp.category_code
join public.companies co on co.id = app.current_company_id()
left join public.v_material_rates mr on mr.code = comp.material_rate_code;

comment on view public.v_component_prices is
  'Every component the signed-in company may use, priced as it would pay.
   The undiscounted master price stays in raw_price, which only the master
   admin has any use for.';

create or replace view public.v_assembly_hours
with (security_invoker = true)
as
select
  a.id                                        as assembly_id,
  pt.code                                     as process_type,
  pt.name                                     as process_name,
  pt.sort_order,
  coalesce(cah.hours, al.hours, 0)            as effective_hours,
  al.hours                                    as master_hours,
  cah.hours                                   as company_hours,
  case
    when cah.hours is not null then 'company_override'
    when a.company_id is not null then 'private'
    else 'master'
  end                                         as source
from public.assemblies a
cross join public.process_types pt
left join public.assembly_labour al
       on al.assembly_id = a.id and al.process_type = pt.code
left join public.company_assembly_hours cah
       on cah.assembly_id = a.id
      and cah.process_type = pt.code
      and cah.company_id = app.current_company_id();

comment on view public.v_assembly_hours is
  'Hours per assembly per process type for the signed-in company: its own
   override where it has one, the assembly''s own hours otherwise, with both
   shown so a deviation from the master figure is visible.';

-- ---------------------------------------------------------------------------
-- 8. Row-level security
--
-- Library tables follow one shape:
--   read    master rows, plus your own company's rows
--   write   master rows only if you are the master admin
--           your own rows only if you are a company admin
-- ---------------------------------------------------------------------------

alter table public.component_categories   enable row level security;
alter table public.process_types          enable row level security;
alter table public.labour_rates           enable row level security;
alter table public.material_rates         enable row level security;
alter table public.material_rate_history  enable row level security;
alter table public.components             enable row level security;
alter table public.component_price_history enable row level security;
alter table public.assemblies             enable row level security;
alter table public.assembly_components    enable row level security;
alter table public.assembly_labour        enable row level security;
alter table public.company_assembly_hours enable row level security;
alter table public.import_batches         enable row level security;

-- Reference data: everyone reads, only the master admin writes.
create policy component_categories_read on public.component_categories
  for select to authenticated using (true);
create policy component_categories_write on public.component_categories
  for all to authenticated using (app.is_master_admin()) with check (app.is_master_admin());

create policy process_types_read on public.process_types
  for select to authenticated using (true);
create policy process_types_write on public.process_types
  for all to authenticated using (app.is_master_admin()) with check (app.is_master_admin());

-- The shared shape, table by table.
create policy labour_rates_read on public.labour_rates
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy labour_rates_write_master on public.labour_rates
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy labour_rates_write_own on public.labour_rates
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy material_rates_read on public.material_rates
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy material_rates_write_master on public.material_rates
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy material_rates_write_own on public.material_rates
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy material_rate_history_read on public.material_rate_history
  for select to authenticated
  using (exists (select 1 from public.material_rates r
                 where r.id = material_rate_id
                   and (r.company_id is null or r.company_id = app.current_company_id()
                        or app.is_master_admin())));

create policy components_read on public.components
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy components_write_master on public.components
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy components_write_own on public.components
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy component_price_history_read on public.component_price_history
  for select to authenticated
  using (exists (select 1 from public.components c
                 where c.id = component_id
                   and (c.company_id is null or c.company_id = app.current_company_id()
                        or app.is_master_admin())));

create policy assemblies_read on public.assemblies
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy assemblies_write_master on public.assemblies
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy assemblies_write_own on public.assemblies
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

-- The children of an assembly inherit its owner's rules.
create policy assembly_components_read on public.assembly_components
  for select to authenticated
  using (exists (select 1 from public.assemblies a
                 where a.id = assembly_id
                   and (a.company_id is null or a.company_id = app.current_company_id()
                        or app.is_master_admin())));
create policy assembly_components_write on public.assembly_components
  for all to authenticated
  using (exists (select 1 from public.assemblies a where a.id = assembly_id and
                 ((a.company_id is null and app.is_master_admin())
                  or (a.company_id = app.current_company_id() and app.has_role('company_admin')))))
  with check (exists (select 1 from public.assemblies a where a.id = assembly_id and
                 ((a.company_id is null and app.is_master_admin())
                  or (a.company_id = app.current_company_id() and app.has_role('company_admin')))));

create policy assembly_labour_read on public.assembly_labour
  for select to authenticated
  using (exists (select 1 from public.assemblies a
                 where a.id = assembly_id
                   and (a.company_id is null or a.company_id = app.current_company_id()
                        or app.is_master_admin())));
create policy assembly_labour_write on public.assembly_labour
  for all to authenticated
  using (exists (select 1 from public.assemblies a where a.id = assembly_id and
                 ((a.company_id is null and app.is_master_admin())
                  or (a.company_id = app.current_company_id() and app.has_role('company_admin')))))
  with check (exists (select 1 from public.assemblies a where a.id = assembly_id and
                 ((a.company_id is null and app.is_master_admin())
                  or (a.company_id = app.current_company_id() and app.has_role('company_admin')))));

-- An override belongs to the company that made it, whatever it points at.
create policy company_assembly_hours_read on public.company_assembly_hours
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy company_assembly_hours_write on public.company_assembly_hours
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy import_batches_read on public.import_batches
  for select to authenticated
  using (company_id = app.current_company_id()
         or (company_id is null and app.is_master_admin())
         or app.is_master_admin());
create policy import_batches_write on public.import_batches
  for insert to authenticated
  with check ((company_id is null and app.is_master_admin())
              or (company_id = app.current_company_id() and app.has_role('company_admin')));

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------

grant select on public.component_categories, public.process_types to authenticated;
grant insert, update, delete on public.component_categories, public.process_types to authenticated;

grant select, insert, update, delete on
  public.labour_rates, public.material_rates, public.components,
  public.assemblies, public.assembly_components, public.assembly_labour,
  public.company_assembly_hours
to authenticated;

grant select on public.component_price_history, public.material_rate_history to authenticated;
grant select, insert on public.import_batches to authenticated;

grant select on public.v_material_rates, public.v_component_prices, public.v_assembly_hours
to authenticated;
