-- 0014  Sections inside a panel.
--
-- A panel is not a flat list. The costing sheets have always been written in
-- sections — incomer, AVR bypass, ATS, second incomer, outgoers, accessories,
-- APFC bank — and the technical offer is read the same way. Until now a panel
-- held kits and one "components and enclosure" holder, in the order they
-- happened to be added, so a board with two incomers and twelve outgoers read
-- as one long list with no subtotals.
--
-- Sections are free text with a seeded list to choose from: the seven names
-- below are offered everywhere a section is chosen, and anything else typed is
-- kept as it is. That is the owner's decision — a fixed list would be wrong the
-- first time a panel has something the list does not name.
--
-- The loose-parts holder was one per panel, enforced by a unique index. It is
-- now one per section, so accessories can sit in the accessories section and a
-- cubicle in the enclosure's, instead of everything falling into one line.

-- ---------------------------------------------------------------------------
-- 1. The names offered
-- ---------------------------------------------------------------------------

create table public.panel_sections (
  name       text primary key check (length(btrim(name)) > 0),
  sort_order integer not null default 0
);

comment on table public.panel_sections is
  'The section names offered when a kit or a loose line is added to a panel.
   Master-only reference data, like the component categories. A section on a
   costing line is free text: this list is a convenience, not a constraint, so
   a panel can hold a section nobody thought of.';

insert into public.panel_sections (name, sort_order) values
  ('Incomer',      1),
  ('AVR bypass',   2),
  ('ATS',          3),
  ('2nd incomer',  4),
  ('Outgoers',     5),
  ('Accessories',  6),
  ('APFC bank',    7);

alter table public.panel_sections enable row level security;

create policy panel_sections_read on public.panel_sections
  for select to authenticated using (true);
create policy panel_sections_write on public.panel_sections
  for all to authenticated using (app.is_master_admin()) with check (app.is_master_admin());

grant select on public.panel_sections to authenticated;
grant insert, update, delete on public.panel_sections to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The section of a line
-- ---------------------------------------------------------------------------

alter table public.costing_assemblies
  add column section text check (section is null or length(btrim(section)) > 0);

comment on column public.costing_assemblies.section is
  'Which part of the panel this line belongs to, e.g. Incomer or Outgoers.
   Free text; public.panel_sections holds the names offered. Null means the
   line has not been placed in a section and sorts last.';

-- One loose-parts holder per section, where there was one per panel.
drop index public.costing_assemblies_one_free_per_panel;
create unique index costing_assemblies_one_free_per_section
  on public.costing_assemblies (panel_id, coalesce(section, '')) where kind = 'free';

-- Blank, spaces and null all mean "no section".
create or replace function app.clean_section(section text)
returns text
language sql
immutable
as $$ select nullif(btrim(coalesce(section, '')), '') $$;

-- ---------------------------------------------------------------------------
-- 3. The four ways something reaches a panel now take a section
-- ---------------------------------------------------------------------------
-- Each keeps its old shape with one argument added at the end, defaulting to
-- null, so nothing already written breaks. The old signatures are dropped
-- rather than left beside the new ones: two functions of the same name where
-- one has a default would be ambiguous to call.

drop function if exists app.free_line(uuid);

create function app.free_line(target_panel_id uuid, section text default null)
returns uuid
language plpgsql
as $$
declare
  target_costing uuid;
  target_company uuid;
  want text := app.clean_section(section);
  holder uuid;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;
  if target_costing is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select ca.id into holder from public.costing_assemblies ca
  where ca.panel_id = target_panel_id and ca.kind = 'free'
    and coalesce(ca.section, '') = coalesce(want, '');
  if holder is null then
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, code, name, quantity, created_by, sort_order)
    values (target_costing, target_panel_id, target_company, 'free', want, 'FREE',
            case when want is null then 'Components and enclosure'
                 else 'Loose components' end,
            1, auth.uid(),
            coalesce((select max(sort_order) + 1 from public.costing_assemblies
                      where panel_id = target_panel_id), 0))
    returning id into holder;
  end if;
  return holder;
end;
$$;

drop function if exists app.add_assembly_to_costing(uuid, uuid, numeric);

create function app.add_assembly_to_costing(
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
    (costing_id, panel_id, company_id, kind, section, source_assembly_id, code, name, quantity,
     created_by, sort_order)
  values (target_costing, target_panel_id, target_company, 'kit', app.clean_section(section),
          a.id, a.code, a.name, qty, auth.uid(),
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
   frozen rates, into the named section of the panel.';

drop function if exists app.add_component_to_costing(uuid, uuid, numeric);

-- A catalogue component on its own, into the loose-parts holder of that
-- section. Adding the same component to the same section adds to its quantity.
create function app.add_component_to_costing(
  target_panel_id uuid, component uuid, qty numeric default 1, section text default null)
returns uuid
language plpgsql
as $$
declare
  holder uuid := app.free_line(target_panel_id, section);
  target_costing uuid;
  target_company uuid;
  existing uuid;
begin
  if qty is null or qty <= 0 then raise exception 'quantity must be greater than zero'; end if;
  select costing_id, company_id into target_costing, target_company
  from public.costing_assemblies where id = holder;

  select id into existing from public.costing_items
  where costing_assembly_id = holder and source_component_id = component and not is_manual;
  if existing is not null then
    update public.costing_items set quantity = quantity + qty where id = existing;
    return existing;
  end if;

  return app.freeze_component(target_costing, holder, target_company, component, qty,
    coalesce((select max(sort_order) + 1 from public.costing_items where costing_assembly_id = holder), 0));
end;
$$;

drop function if exists app.add_manual_item(uuid, text, text, numeric, numeric, text, text, text);

-- A line typed in with its own price, in the costing's currency: a part no
-- catalogue holds yet, or the enclosure as one figure.
create function app.add_manual_item(
  target_panel_id uuid, item_name text, category text, unit_price numeric, qty numeric default 1,
  unit text default 'pcs', make text default null, part_no text default null,
  section text default null)
returns uuid
language plpgsql
as $$
declare
  holder uuid := app.free_line(target_panel_id, section);
  target_costing uuid;
  target_company uuid;
  n integer;
  new_item uuid;
begin
  if btrim(coalesce(item_name, '')) = '' then raise exception 'the line needs a name'; end if;
  if unit_price is null or unit_price < 0 then raise exception 'the price must be zero or more'; end if;
  if qty is null or qty <= 0 then raise exception 'quantity must be greater than zero'; end if;
  if not exists (select 1 from public.component_categories where code = category) then
    raise exception 'unknown category %', category;
  end if;
  select costing_id, company_id into target_costing, target_company
  from public.costing_assemblies where id = holder;
  select count(*) + 1 into n from public.costing_items where costing_id = target_costing and is_manual;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     unit_price, is_manual, sort_order, created_by)
  values
    (target_costing, holder, target_company, null, 'MANUAL-' || lpad(n::text, 3, '0'), btrim(item_name),
     category, coalesce(nullif(btrim(unit), ''), 'pcs'), nullif(btrim(coalesce(make, '')), ''),
     nullif(btrim(coalesce(part_no, '')), ''), qty, 'fixed',
     round(unit_price, 2), true,
     coalesce((select max(sort_order) + 1 from public.costing_items where costing_assembly_id = holder), 0),
     auth.uid())
  returning id into new_item;
  return new_item;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. A revision keeps its sections
-- ---------------------------------------------------------------------------
-- The copy lists its columns one by one, so a new column is silently dropped
-- unless it is added here. That has bitten this function once already (0011).

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
       technical_description, enclosure_dimensions, sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, sort_order, auth.uid()
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
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, code, name, quantity,
       sort_order, created_by)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.section, ca.source_assembly_id,
           ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid()
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
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     purchase_price, purchase_currency, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, is_manual, sort_order, created_by)
  select new_costing.id, cav.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.purchase_price, i.purchase_currency, i.landed_factor,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.uplift_pct, i.unit_price, i.is_manual, i.sort_order, auth.uid()
  from public.costing_items i
  join copied_assemblies cav on cav.old_id = i.costing_assembly_id
  where i.costing_id = target;

  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
     source, hourly_rate, created_by)
  select new_costing.id, cav.new_id, l.company_id, l.process_type, l.hours, l.source_hours,
         l.source, l.hourly_rate, auth.uid()
  from public.costing_labour l
  join copied_assemblies cav on cav.old_id = l.costing_assembly_id
  where l.costing_id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (new_costing.id, new_costing.company_id, auth.uid(), 'revision created',
          jsonb_build_object('revision_no', new_costing.revision_no,
                             'from_costing_id', target));

  return new_costing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Wrappers and grants
-- ---------------------------------------------------------------------------

drop function if exists public.add_assembly_to_costing(uuid, uuid, numeric);
drop function if exists public.add_component_to_costing(uuid, uuid, numeric);
drop function if exists public.add_manual_item(uuid, text, text, numeric, numeric, text, text, text);

create function public.add_assembly_to_costing(
  target_panel_id uuid, source_assembly uuid, qty numeric default 1, section text default null)
returns uuid language sql
as $$ select app.add_assembly_to_costing(target_panel_id, source_assembly, qty, section) $$;

create function public.add_component_to_costing(
  target_panel_id uuid, component uuid, qty numeric default 1, section text default null)
returns uuid language sql
as $$ select app.add_component_to_costing(target_panel_id, component, qty, section) $$;

create function public.add_manual_item(
  target_panel_id uuid, item_name text, category text, unit_price numeric, qty numeric default 1,
  unit text default 'pcs', make text default null, part_no text default null,
  section text default null)
returns uuid language sql
as $$ select app.add_manual_item(target_panel_id, item_name, category, unit_price, qty, unit,
                                 make, part_no, section) $$;

grant execute on function app.add_assembly_to_costing(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.add_assembly_to_costing(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.add_component_to_costing(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.add_manual_item(uuid, text, text, numeric, numeric, text, text, text, text)
  to authenticated;
revoke execute on all functions in schema public from anon;
