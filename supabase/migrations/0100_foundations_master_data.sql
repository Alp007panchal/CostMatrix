-- 0100  Foundations F1–F3: room in the master data for where the product is going
--
-- The first advanced-track migration, numbered from 0100 so it can never collide
-- with a basic-track number on `main` (D-170).
--
-- F1 components: commercial and engineering room — supplier, structured
--    attributes, obsolescence and replacement, datasheet, lead time, price
--    provenance.
-- F2 kits: versioned, parameterisable, with customer wording; and the version a
--    costing copied recorded on the costing line.
-- F3 labour: a productivity factor per panel, actual hours, and rate history.
--
-- Nothing here changes a price. Every column is new and either nullable or
-- defaulted to what the engine already assumed, and the one change that touches
-- the pricing views — the productivity factor — multiplies by 1.0 until somebody
-- sets it. `supabase/tests/15_acceptance_npp192.sql` is unchanged and must stay
-- green, which is the proof.
--
-- Two things deliberately NOT done here, recorded as decisions:
--  * `status` on components and kits is a GENERATED column derived from the
--    booleans that are load-bearing today, so it cannot drift and cannot be
--    written by mistake (D-175). A later migration makes it authoritative.
--  * There is no costing-wide productivity factor, only a per-panel one
--    (D-186). One factor in one place beats two that multiply together.

-- ===========================================================================
-- F1. Components: commercial and engineering room
-- ===========================================================================

alter table public.components
  -- Brand is what the quotation prints and lives in `manufacturer` already;
  -- the supplier is who invoices, and may be a local distributor. Purchasing
  -- and price-list updates key on it.
  add column if not exists supplier text,
  -- Typed by category: mounting, operation, trip unit, IP, dimensions, kVAr,
  -- cable size, bar section. Structured extras without a migration each.
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  -- The part that replaces this one when it goes obsolete.
  add column if not exists replaced_by uuid references public.components(id) on delete set null,
  add column if not exists datasheet_url text,
  add column if not exists lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  -- Price provenance: when this price started and where it came from (a supplier
  -- list name and date, or who typed it). Drives "price older than N days".
  add column if not exists price_valid_from date,
  add column if not exists price_source text;

-- A part cannot replace itself.
alter table public.components drop constraint if exists components_replaced_by_not_self;
alter table public.components
  add constraint components_replaced_by_not_self check (replaced_by is null or replaced_by <> id);

-- Obsolescence as one word instead of two booleans to read. Generated, not
-- stored-and-maintained: `is_placeholder` is load-bearing today — the
-- `components_pricing_fields` constraint allows a null price only for a
-- placeholder, and `app.freeze_component` refuses an unpriced non-placeholder —
-- so the booleans stay authoritative in phase 1 and this column can only ever
-- agree with them. Writing it raises an error, which is the point: a silent
-- revert would be worse.
alter table public.components drop column if exists status;
alter table public.components
  add column status text generated always as (
    case when is_placeholder then 'placeholder'
         when not is_active  then 'obsolete'
         else 'active' end
  ) stored;

create index if not exists components_status_idx on public.components (status);
create index if not exists components_supplier_idx on public.components (supplier) where supplier is not null;

comment on column public.components.status is
  'active / obsolete / placeholder, derived from is_active and is_placeholder.
   Read-only in phase 1: those booleans are authoritative (D-175).';
comment on column public.components.attributes is
  'Structured extras typed by category. Feeds filtering, compatibility checks
   and the configurator later; empty today.';
comment on column public.components.supplier is
  'Who invoices. Distinct from `manufacturer`, which is the brand the quotation prints.';

-- Where a price came from, beside when it changed. The table already exists and
-- is filled by a trigger; this is the one column it was missing.
alter table public.component_price_history
  add column if not exists source text;

comment on column public.component_price_history.source is
  'Supplier list name and date, or who entered it. Null for changes made before 0100.';

-- ===========================================================================
-- F2. Kits: versioned, parameterisable, with customer wording
-- ===========================================================================
-- "kits" in the roadmap are `assemblies` here, and "kit lines" are
-- `assembly_components`.

alter table public.assemblies
  add column if not exists version integer not null default 1 check (version >= 1),
  -- Annexure IV wording, separate from the internal kit name.
  add column if not exists customer_wording text,
  -- "requires enclosure depth >= 800", "only with frame 2 ACB". Not populated
  -- in phase 1; the configurator and the AI review read it later.
  add column if not exists compatibility_rules jsonb not null default '{}'::jsonb,
  -- Free labels such as incomer, outgoer, apfc, metering, so the configurator
  -- and the assistant can find candidate kits without parsing the kit name.
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.assemblies drop column if exists status;
alter table public.assemblies
  add column status text generated always as (
    case when is_active then 'active' else 'retired' end
  ) stored;

comment on column public.assemblies.status is
  'active / retired, derived from is_active. The roadmap''s third state, draft,
   arrives when this column becomes authoritative rather than derived (D-175).';
comment on column public.assemblies.version is
  'Bumped by hand when a kit''s composition changes. A costing records the
   version it copied; it never follows later changes.';

create index if not exists assemblies_tags_idx on public.assemblies using gin (tags);

alter table public.assembly_components
  -- Reference §1.3: APFC quantities are formulas of the capacitor steps.
  -- Null in phase 1, and the engine rule is: if the expression is null use qty.
  add column if not exists qty_expression text,
  add column if not exists customer_wording text;

comment on column public.assembly_components.qty_expression is
  'A formula over the kit''s parameters, evaluated by the configurator in a later
   phase. Null means use `quantity`, which is every row today.';

-- The inputs a parameterised kit accepts. Empty in phase 1.
create table if not exists public.kit_parameters (
  id           uuid primary key default gen_random_uuid(),
  assembly_id  uuid not null references public.assemblies(id) on delete cascade,
  name         text not null,
  value_type   text not null default 'number' check (value_type in ('number', 'text', 'boolean')),
  unit         text,
  default_value text,
  min_value    numeric(14,4),
  max_value    numeric(14,4),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (assembly_id, name),
  -- Named, so the message says what is wrong rather than "kit_parameters_check".
  constraint kit_parameters_min_not_above_max
    check (min_value is null or max_value is null or min_value <= max_value)
);

select app.add_audit_triggers('public.kit_parameters');

comment on table public.kit_parameters is
  'What a parameterised kit asks for: busbar_metres, steps, feeder_count.
   Empty in phase 1; phase 3''s configurator fills it.';

-- ===========================================================================
-- F2. The version a costing copied
-- ===========================================================================
-- The composition freeze itself already exists: add_assembly_to_costing
-- snapshots the kit's code and name and copies every line into costing_items
-- with its price frozen, and source_assembly_id is `on delete set null`
-- provenance only. Editing or deleting a master kit cannot reach an existing
-- costing (D-177). What was missing is which version was copied.

alter table public.costing_assemblies
  add column if not exists source_version integer;

comment on column public.costing_assemblies.source_version is
  'The kit version this line was copied from. Null for lines copied before 0100,
   and for free-line holders, which come from no kit.';

-- ===========================================================================
-- F3. Labour: a productivity factor, actual hours, rate history
-- ===========================================================================

alter table public.costing_panels
  add column if not exists productivity_factor numeric(6,3) not null default 1.0
    check (productivity_factor > 0);

comment on column public.costing_panels.productivity_factor is
  'Accubid-style adjustment for complexity, site conditions or a rush job,
   without editing the labour standards. 1.0 changes nothing, which is every
   panel until somebody sets it.';

-- Actual shop-floor hours, typed in now and fed from Opsmatrix timesheets
-- later. Empty in phase 1; it is what the estimate-versus-actual report reads.
create table if not exists public.labour_actuals (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  costing_id   uuid not null,
  panel_id     uuid not null,
  process_type text not null references public.process_types(code),
  hours        numeric(8,2) not null check (hours >= 0),
  source       text not null default 'manual' check (source in ('manual', 'timesheet')),
  note         text,
  recorded_at  timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  -- The same composite keys the costing tables use, so actual hours can never
  -- be filed against another company's panel.
  foreign key (costing_id, company_id) references public.costings(id, company_id) on delete cascade,
  foreign key (panel_id, costing_id) references public.costing_panels(id, costing_id) on delete cascade
);

create index if not exists labour_actuals_panel_idx on public.labour_actuals (panel_id);
select app.add_audit_triggers('public.labour_actuals');

comment on table public.labour_actuals is
  'Hours actually worked, against the panel and process type they were worked on.
   Never read by the pricing engine: a costing keeps the hours it froze.';

-- Labour rates were the only rate table with no history. components,
-- material_rates and currency_factors all keep a current value plus a
-- trigger-filled history table, and effective dating exists nowhere in this
-- schema, so this matches the pattern rather than the roadmap's wording (D-176).
create table if not exists public.labour_rate_history (
  id              uuid primary key default gen_random_uuid(),
  labour_rate_id  uuid not null references public.labour_rates(id) on delete cascade,
  old_hourly_rate numeric(14,2),
  new_hourly_rate numeric(14,2) not null,
  changed_by      uuid,
  changed_at      timestamptz not null default now()
);

create index if not exists labour_rate_history_rate_idx on public.labour_rate_history (labour_rate_id);

create or replace function app.log_labour_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' or new.hourly_rate is distinct from old.hourly_rate then
    insert into public.labour_rate_history
      (labour_rate_id, old_hourly_rate, new_hourly_rate, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.hourly_rate end,
            new.hourly_rate, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists labour_rates_history on public.labour_rates;
create trigger labour_rates_history
  after insert or update on public.labour_rates
  for each row execute function app.log_labour_rate_change();

comment on table public.labour_rate_history is
  'Every change to an hourly rate. A costing freezes the rate it used, so this is
   for reporting, never for pricing.';

-- ===========================================================================
-- Row-level security for the three new tables
-- ===========================================================================

alter table public.kit_parameters      enable row level security;
alter table public.labour_actuals      enable row level security;
alter table public.labour_rate_history enable row level security;

-- Parent-derived, like assembly_components: whoever may see the kit may see its
-- parameters, and whoever may write the kit may write them.
drop policy if exists kit_parameters_read on public.kit_parameters;
create policy kit_parameters_read on public.kit_parameters for select
  using (exists (
    select 1 from public.assemblies a
    where a.id = assembly_id
      and (a.company_id is null or a.company_id = app.current_company_id() or app.is_master_admin())
  ));

drop policy if exists kit_parameters_write_master on public.kit_parameters;
create policy kit_parameters_write_master on public.kit_parameters for all
  using (exists (select 1 from public.assemblies a
                 where a.id = assembly_id and a.company_id is null and app.is_master_admin()))
  with check (exists (select 1 from public.assemblies a
                      where a.id = assembly_id and a.company_id is null and app.is_master_admin()));

drop policy if exists kit_parameters_write_own on public.kit_parameters;
create policy kit_parameters_write_own on public.kit_parameters for all
  using (exists (select 1 from public.assemblies a
                 where a.id = assembly_id and a.company_id = app.current_company_id()
                   and app.has_role('company_admin')))
  with check (exists (select 1 from public.assemblies a
                      where a.id = assembly_id and a.company_id = app.current_company_id()
                        and app.has_role('company_admin')));

-- Tenant-owned, like the costing tables it hangs off.
drop policy if exists labour_actuals_read on public.labour_actuals;
create policy labour_actuals_read on public.labour_actuals for select
  using (company_id = app.current_company_id() or app.is_master_admin());

drop policy if exists labour_actuals_write on public.labour_actuals;
create policy labour_actuals_write on public.labour_actuals for all
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

-- Read-only, like the other three history tables: rows arrive by trigger.
drop policy if exists labour_rate_history_read on public.labour_rate_history;
create policy labour_rate_history_read on public.labour_rate_history for select
  using (exists (
    select 1 from public.labour_rates r
    where r.id = labour_rate_id
      and (r.company_id is null or r.company_id = app.current_company_id() or app.is_master_admin())
  ));

-- ===========================================================================
-- The engine: record the kit version, and apply the productivity factor
-- ===========================================================================

-- Same signature as 0014's, so no wrapper changes: the only difference is that
-- the new line records which version of the kit it copied.
create or replace function app.add_assembly_to_costing(
  target_panel_id uuid,
  source_assembly uuid,
  qty numeric default 1,
  section text default null)
returns uuid
language plpgsql
as $$
declare
  target_costing uuid;
  target_company uuid;
  new_line uuid;
  a public.assemblies;
  ac record;
  unpriced text;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;
  if target_costing is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select * into a from public.assemblies where id = source_assembly;
  if a is null then raise exception 'no such kit'; end if;

  -- Name every unpriced part at once rather than the first one found.
  select string_agg(p.code, ', ' order by p.code) into unpriced
  from public.assembly_components x
  join public.v_component_prices p on p.id = x.component_id
  where x.assembly_id = source_assembly and p.unit_price is null;
  if unpriced is not null then
    raise exception '% has no price yet — set the purchase price before costing this kit', unpriced;
  end if;

  insert into public.costing_assemblies
    (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
     code, name, quantity, created_by, sort_order)
  values (target_costing, target_panel_id, target_company, 'kit', app.clean_section(section),
          a.id, a.version, a.code, a.name, qty, auth.uid(),
          coalesce((select max(sort_order) + 1 from public.costing_assemblies
                    where panel_id = target_panel_id), 0))
  returning id into new_line;

  for ac in
    select component_id, quantity, sort_order from public.assembly_components
    where assembly_id = source_assembly order by sort_order
  loop
    perform app.freeze_component(target_costing, new_line, target_company, ac.component_id,
                                 ac.quantity, ac.sort_order);
  end loop;

  -- Labour, at the hours this company plans and the rates this costing froze.
  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
     source, hourly_rate, created_by)
  select target_costing, new_line, target_company, h.process_type, h.effective_hours,
         h.effective_hours, h.source, coalesce(r.hourly_rate, 0), auth.uid()
  from public.v_assembly_hours h
  left join public.costing_labour_rates r
         on r.costing_id = target_costing and r.process_type = h.process_type
  where h.assembly_id = source_assembly
    and h.effective_hours > 0;

  return new_line;
end;
$$;

comment on function app.add_assembly_to_costing(uuid, uuid, numeric, text) is
  'Copies a library kit into a panel at today''s prices and this costing''s
   frozen rates, into the named section, recording the kit version copied.';

-- The one view the productivity factor touches. Labour cost and hours are the
-- adjusted figures, so every view above this one — panel prices, totals, the
-- price schedule — picks the factor up without changing. The standard figures
-- are kept beside them so the adjustment can always be explained, which is the
-- same rule the frozen price columns follow.
create or replace view public.v_costing_panel_costs
with (security_invoker = true)
as
select
  p.id                 as panel_id,
  p.costing_id,
  p.company_id,
  p.name,
  p.tag,
  p.option_label,
  p.uom,
  p.quantity,
  p.sort_order,
  -- The existing three columns keep their names, types and position: `create or
  -- replace view` can only append, and every view above this one selects by name.
  coalesce(sum(t.material_total), 0) as material_cost,
  coalesce(sum(t.labour_total), 0) * p.productivity_factor as labour_cost,
  coalesce(sum(t.hours_total), 0)  * p.productivity_factor as hours,
  -- Appended: the factor applied, and what the labour standards gave before it.
  p.productivity_factor,
  coalesce(sum(t.labour_total), 0) as labour_cost_standard,
  coalesce(sum(t.hours_total), 0)  as hours_standard
from public.costing_panels p
left join public.v_costing_assembly_totals t on t.panel_id = p.id
group by p.id, p.costing_id, p.company_id, p.name, p.tag, p.option_label,
         p.uom, p.quantity, p.sort_order, p.productivity_factor;

comment on view public.v_costing_panel_costs is
  'What one of this panel costs to build, before any margin. labour_cost and
   hours carry the panel''s productivity factor; *_standard are the figures the
   labour standards gave, so the difference can be explained.';

-- ===========================================================================
-- Copying: every new frozen column must be named in all three column lists
-- ===========================================================================
-- Migration 0011 had to fix exactly this: create_costing_revision listed its
-- columns by hand and silently dropped the ones 0008 added, so a revision lost
-- its frozen workings. The three functions below are rewritten rather than
-- patched so the lists are visible in one place.

create or replace function app.create_costing_revision(target uuid)
returns public.costings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_costing public.costings;
  new_costing public.costings;
begin
  select * into old_costing from public.costings
   where id = target and company_id = app.current_company_id();

  if old_costing is null then raise exception 'no such costing'; end if;
  if old_costing.status <> 'approved' then
    raise exception 'only an approved costing needs a revision; this one can still be edited';
  end if;
  if not old_costing.is_current then
    raise exception 'revise the current revision, not an older one';
  end if;
  if not app.can_edit_costings() then raise exception 'you may not revise costings'; end if;

  update public.costings set is_current = false where id = target;

  insert into public.costings (
    company_id, enquiry_id, costing_no, revision_no, family_id, previous_revision_id, is_current,
    title, notes, status, currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
    tax_pct, enclosure_uplift_pct, created_by)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid()
  from public.costings where id = target
  returning * into new_costing;

  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, company_id, process_type, hourly_rate
  from public.costing_labour_rates where costing_id = target;

  create temporary table copied_panels (old_id uuid, new_id uuid) on commit drop;
  create temporary table copied_assemblies (old_id uuid, new_id uuid) on commit drop;

  with inserted as (
    insert into public.costing_panels
      (costing_id, company_id, name, tag, option_label, uom, quantity,
       technical_description, enclosure_dimensions, productivity_factor, sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, productivity_factor, sort_order, auth.uid()
    from public.costing_panels where costing_id = target
    returning id, sort_order, name
  )
  insert into copied_panels (old_id, new_id)
  select o.id, i.id
  from inserted i
  join public.costing_panels o
    on o.costing_id = target and o.sort_order = i.sort_order and o.name = i.name;

  with inserted as (
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, sort_order, created_by)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.section, ca.source_assembly_id,
           ca.source_version, ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid()
    from public.costing_assemblies ca
    join copied_panels cp on cp.old_id = ca.panel_id
    where ca.costing_id = target
    returning id, panel_id, sort_order, code
  )
  insert into copied_assemblies (old_id, new_id)
  select o.id, i.id
  from inserted i
  join copied_panels cp on cp.new_id = i.panel_id
  join public.costing_assemblies o
    on o.costing_id = target and o.panel_id = cp.old_id
   and o.sort_order = i.sort_order and o.code = i.code;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name, category_code,
     unit, manufacturer, part_number, quantity, pricing_mode, master_price_kes, discount_pct,
     exchange_rate, weight_per_unit, material_rate, unit_price, purchase_price, purchase_currency,
     landed_factor, uplift_pct, is_manual, sort_order, created_by)
  select new_costing.id, cas.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.unit_price, i.purchase_price, i.purchase_currency, i.landed_factor, i.uplift_pct,
         i.is_manual, i.sort_order, auth.uid()
  from public.costing_items i
  join copied_assemblies cas on cas.old_id = i.costing_assembly_id
  where i.costing_id = target;

  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours, source,
     hourly_rate, created_by)
  select new_costing.id, cas.new_id, cl.company_id, cl.process_type, cl.hours, cl.source_hours,
         cl.source, cl.hourly_rate, auth.uid()
  from public.costing_labour cl
  join copied_assemblies cas on cas.old_id = cl.costing_assembly_id
  where cl.costing_id = target;

  perform app.write_history(new_costing.id, 'revised',
    jsonb_build_object('from_revision', old_costing.revision_no, 'to_revision', new_costing.revision_no));

  return new_costing;
end;
$$;

comment on function app.create_costing_revision(uuid) is
  'Deep copy of an approved costing as the next revision. Every frozen column is
   named in the lists above: a column added later and forgotten here is dropped
   silently, which is the bug 0011 fixed.';

-- copy_panel carries the two new frozen columns too: the panel's productivity
-- factor, and the kit version each line came from. Derived from 0015's text with
-- two insertions rather than retyped, so the re-pricing behaviour it is trusted
-- for is unchanged — catalogue lines re-frozen at today's rates, typed lines kept,
-- anything unpriceable reported (D-164).

create or replace function app.copy_panel(
  source_panel uuid, target_costing uuid, new_name text default null)
returns jsonb
language plpgsql
as $$
declare
  src public.costing_panels;
  dst public.costings;
  new_panel uuid;
  new_line uuid;
  ca record;
  it record;
  p public.v_component_prices;
  repriced integer := 0;
  kept jsonb := '[]'::jsonb;
begin
  select * into src from public.costing_panels where id = source_panel;
  if src.id is null then raise exception 'no such panel'; end if;
  select * into dst from public.costings where id = target_costing;
  if dst.id is null then raise exception 'no such costing'; end if;
  if dst.company_id <> src.company_id then
    raise exception 'a panel can only be copied inside the company that owns it';
  end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'the costing being copied into is not open for editing';
  end if;

  insert into public.costing_panels
    (costing_id, company_id, name, tag, option_label, uom, quantity,
     technical_description, enclosure_dimensions, productivity_factor, sort_order, created_by)
  values
    (target_costing, dst.company_id,
     coalesce(nullif(btrim(coalesce(new_name, '')), ''), src.name),
     src.tag, src.option_label, src.uom, src.quantity,
     src.technical_description, src.enclosure_dimensions, src.productivity_factor,
     coalesce((select max(sort_order) + 1 from public.costing_panels where costing_id = target_costing), 0),
     auth.uid())
  returning id into new_panel;

  for ca in
    select * from public.costing_assemblies where panel_id = source_panel order by sort_order
  loop
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, sort_order, created_by)
    values (target_costing, new_panel, dst.company_id, ca.kind, ca.section, ca.source_assembly_id,
            ca.source_version, ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid())
    returning id into new_line;

    for it in
      select * from public.costing_items where costing_assembly_id = ca.id order by sort_order
    loop
      p := null;
      if it.source_component_id is not null then
        select * into p from public.v_component_prices where id = it.source_component_id;
      end if;

      if p.id is not null and p.unit_price is not null then
        perform app.freeze_component(target_costing, new_line, dst.company_id,
                                     it.source_component_id, it.quantity, it.sort_order);
        repriced := repriced + 1;
      else
        insert into public.costing_items
          (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
           category_code, unit, manufacturer, part_number, quantity, pricing_mode,
           purchase_price, purchase_currency, landed_factor,
           master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
           uplift_pct, unit_price, is_manual, sort_order, created_by)
        values
          (target_costing, new_line, dst.company_id, it.source_component_id, it.code, it.name,
           it.category_code, it.unit, it.manufacturer, it.part_number, it.quantity, it.pricing_mode,
           it.purchase_price, it.purchase_currency, it.landed_factor,
           it.master_price_kes, it.discount_pct, it.exchange_rate, it.weight_per_unit, it.material_rate,
           it.uplift_pct, it.unit_price, it.is_manual, it.sort_order, auth.uid());

        -- A typed line is not a problem: nothing but the person who typed it
        -- ever knew its price. A catalogue part that cannot be re-priced is.
        if not it.is_manual then
          kept := kept || jsonb_build_object(
            'code', it.code, 'name', it.name, 'unit_price', it.unit_price,
            'reason', case when p.id is null then 'no longer in the catalogue'
                           else 'has no price today' end);
        end if;
      end if;
    end loop;

    insert into public.costing_labour
      (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
       source, hourly_rate, created_by)
    select target_costing, new_line, dst.company_id, l.process_type, l.hours, l.source_hours,
           l.source, coalesce(r.hourly_rate, l.hourly_rate), auth.uid()
    from public.costing_labour l
    left join public.costing_labour_rates r
           on r.costing_id = target_costing and r.process_type = l.process_type
    where l.costing_assembly_id = ca.id;
  end loop;

  return jsonb_build_object('panel_id', new_panel, 'repriced', repriced, 'kept', kept);
end;
$$;

-- ===========================================================================
-- Grants
-- ===========================================================================
-- Row-level security decides which rows; these decide whether the table can be
-- addressed at all. Both are needed, and a policy without a grant reads as
-- "permission denied for table", which looks like a bug in the policy.

grant select, insert, update, delete on public.kit_parameters to authenticated;
grant select, insert, update, delete on public.labour_actuals to authenticated;
-- Read-only, like the other three history tables: rows arrive by trigger.
grant select on public.labour_rate_history to authenticated;

-- ===========================================================================
-- The component screen needs to read the new fields back
-- ===========================================================================
-- v_component_prices is what every screen and the costing engine read. The new
-- columns are appended to it — `create or replace view` can only append, and
-- everything above selects by name — so the component form can show and edit
-- them without a second query. Derived from 0008's text with one insertion
-- rather than retyped, so the pricing arithmetic in it is provably unchanged.

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
  comp.purchase_price     as raw_price,
  case
    -- Priced by weight: kilograms times whatever this company pays per kilogram.
    when comp.pricing_mode = 'weight_rate'
      then round(comp.weight_per_unit * mr.rate, 2)
    -- A company's own component: landed into KES, then into its currency. No discount.
    when comp.company_id is not null
      then round(comp.purchase_price * cf.landed_factor / nullif(co.exchange_rate, 0), 2)
    -- Master component: landed into KES, discounted, then into the company currency.
    else round(comp.purchase_price * cf.landed_factor
               * (1 - co.discount_pct / 100) / nullif(co.exchange_rate, 0), 2)
  end                     as unit_price,
  co.currency_code,
  co.currency_label,
  case when comp.company_id is null then 'master' else 'company' end as source,
  comp.purchase_currency,
  cf.landed_factor,
  case when comp.pricing_mode = 'fixed'
       then round(comp.purchase_price * cf.landed_factor, 2) end as landed_price_kes,
  comp.rating,
  comp.poles,
  comp.is_enclosure_cubicle,
  -- Appended by 0100 so the component screen can show and edit the new optional
  -- fields without a second query. `status` is the generated one: derived from
  -- is_active and is_placeholder, and read-only.
  comp.supplier,
  comp.attributes,
  comp.replaced_by,
  comp.datasheet_url,
  comp.lead_time_days,
  comp.price_valid_from,
  comp.price_source,
  comp.status,
  comp.is_placeholder
from public.components comp
join public.component_categories cat on cat.code = comp.category_code
join public.companies co on co.id = app.current_company_id()
left join public.v_material_rates mr on mr.code = comp.material_rate_code
left join lateral (
  -- The company's own factor row for this currency if it has one, else the master's.
  select f.landed_factor
  from public.currency_factors f
  where f.currency_code = comp.purchase_currency
    and (f.company_id = co.id or f.company_id is null)
  order by f.company_id nulls last
  limit 1
) cf on true;
