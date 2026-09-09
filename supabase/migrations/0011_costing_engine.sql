-- 0011: the costing engine, session 3. A panel is costed from kits (chosen by
-- group and rating, times a quantity), free components straight from the
-- catalogue (an enclosure cubicle among them, uplifted), and typed lines for
-- parts no catalogue holds. Also fixes create_costing_revision, which had
-- been copying costing lines with the pre-0008 column list and so dropped
-- the frozen purchase price, factor and uplift on every revision.

-- ---------------------------------------------------------------------------
-- 1. One free holder per panel
-- ---------------------------------------------------------------------------

alter table public.costing_assemblies
  add column kind text not null default 'kit' check (kind in ('kit', 'free'));
comment on column public.costing_assemblies.kind is
  'kit: a copy of a library kit. free: the panel''s one holder for components
   added on their own and for typed lines; quantity always 1, no labour.';

create unique index costing_assemblies_one_free_per_panel
  on public.costing_assemblies (panel_id) where kind = 'free';

alter table public.costing_items add column is_manual boolean not null default false;
comment on column public.costing_items.is_manual is
  'Typed in with a price, no catalogue source. Lives in this costing only.';

create or replace function app.protect_free_holder()
returns trigger
language plpgsql
as $$
begin
  if old.kind = 'free' and (new.kind <> 'free' or new.quantity <> 1) then
    raise exception 'the components-and-enclosure line of a panel always has quantity 1';
  end if;
  return new;
end;
$$;

create trigger costing_assemblies_protect_free
  before update on public.costing_assemblies
  for each row execute function app.protect_free_holder();

-- The panel's free holder, created the first time something is added to it.
create or replace function app.free_line(target_panel_id uuid)
returns uuid
language plpgsql
as $$
declare
  target_costing uuid;
  target_company uuid;
  holder uuid;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;
  if target_costing is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select id into holder from public.costing_assemblies
  where panel_id = target_panel_id and kind = 'free';
  if holder is null then
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, code, name, quantity, created_by, sort_order)
    values (target_costing, target_panel_id, target_company, 'free', 'FREE',
            'Components and enclosure', 1, auth.uid(),
            coalesce((select max(sort_order) + 1 from public.costing_assemblies
                      where panel_id = target_panel_id), 0))
    returning id into holder;
  end if;
  return holder;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. One place that prices a component into a costing
-- ---------------------------------------------------------------------------

-- Freezes one catalogue component into a holder at this company's price today,
-- with every working kept, and the cubicle uplift applied. Refuses a part with
-- no price. Returns the new line.
create or replace function app.freeze_component(
  target_costing uuid, holder uuid, target_company uuid, component uuid, qty numeric, sort integer)
returns uuid
language plpgsql
as $$
declare
  p public.v_component_prices;
  c public.costings;
  new_item uuid;
begin
  select * into p from public.v_component_prices where id = component;
  if p.id is null then raise exception 'no such component'; end if;
  if p.unit_price is null then
    raise exception '% has no price yet — set the purchase price before costing it', p.code;
  end if;
  select * into c from public.costings where id = target_costing;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     purchase_price, purchase_currency, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, sort_order, created_by)
  values
    (target_costing, holder, target_company, p.id, p.code, p.name,
     p.category_code, p.unit, p.manufacturer, p.part_number, qty, p.pricing_mode,
     case when p.pricing_mode = 'fixed' then p.raw_price end,
     case when p.pricing_mode = 'fixed' then p.purchase_currency end,
     case when p.pricing_mode = 'fixed' then p.landed_factor end,
     case when p.company_id is null and p.pricing_mode = 'fixed' then p.landed_price_kes end,
     case when p.company_id is null and p.pricing_mode = 'fixed' then c.discount_pct end,
     case when p.pricing_mode = 'fixed' then c.exchange_rate end,
     p.weight_per_unit,
     case when p.pricing_mode = 'weight_rate'
          then round(p.unit_price / nullif(p.weight_per_unit, 0), 2) end,
     case when p.is_enclosure_cubicle then c.enclosure_uplift_pct end,
     case when p.is_enclosure_cubicle
          then round(p.unit_price * (1 + c.enclosure_uplift_pct / 100), 2)
          else p.unit_price end,
     sort, auth.uid())
  returning id into new_item;
  return new_item;
end;
$$;

create or replace function app.add_assembly_to_costing(
  target_panel_id uuid,
  source_assembly uuid,
  qty numeric default 1)
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
    (costing_id, panel_id, company_id, kind, source_assembly_id, code, name, quantity, created_by,
     sort_order)
  values (target_costing, target_panel_id, target_company, 'kit', a.id, a.code, a.name, qty, auth.uid(),
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

-- A catalogue component on its own, into the panel's free holder. Adding the
-- same component again adds to its quantity.
create or replace function app.add_component_to_costing(
  target_panel_id uuid, component uuid, qty numeric default 1)
returns uuid
language plpgsql
as $$
declare
  holder uuid := app.free_line(target_panel_id);
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

-- A line typed in with its own price, in the costing's currency: a part no
-- catalogue holds yet, or the enclosure as one figure.
create or replace function app.add_manual_item(
  target_panel_id uuid, item_name text, category text, unit_price numeric, qty numeric default 1,
  unit text default 'pcs', make text default null, part_no text default null)
returns uuid
language plpgsql
as $$
declare
  holder uuid := app.free_line(target_panel_id);
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
-- 3. Revisions copy every frozen column
-- ---------------------------------------------------------------------------

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
      (costing_id, panel_id, company_id, kind, source_assembly_id, code, name, quantity, sort_order, created_by)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.source_assembly_id, ca.code, ca.name,
           ca.quantity, ca.sort_order, auth.uid()
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
-- 4. Kits as the picker sees them
-- ---------------------------------------------------------------------------

create or replace view public.v_kits
with (security_invoker = true)
as
select
  a.id, a.company_id, a.code, a.name, a.description, a.is_active,
  a.kit_group_id, g.name as group_name, a.rating, a.rating_unit, a.poles,
  md.code as main_device_code, md.name as main_device_name,
  exists (select 1 from public.assembly_components x
          join public.v_component_prices p on p.id = x.component_id
          where x.assembly_id = a.id and p.unit_price is null) as has_unpriced_part,
  (select count(*) from public.assembly_components x where x.assembly_id = a.id) as line_count
from public.assemblies a
left join public.kit_groups g on g.id = a.kit_group_id
left join lateral (
  select c.code, c.name from public.assembly_components x
  join public.components c on c.id = x.component_id
  where x.assembly_id = a.id and x.is_main_device limit 1
) md on true;

comment on view public.v_kits is
  'Kits with their group, rating, main device and whether any line is still
   unpriced for the signed-in company. What the costing picker lists.';

-- ---------------------------------------------------------------------------
-- 5. Wrappers and grants
-- ---------------------------------------------------------------------------

create or replace function public.add_component_to_costing(target_panel_id uuid, component uuid, qty numeric default 1)
returns uuid language sql
as $$ select app.add_component_to_costing(target_panel_id, component, qty) $$;

create or replace function public.add_manual_item(
  target_panel_id uuid, item_name text, category text, unit_price numeric, qty numeric default 1,
  unit text default 'pcs', make text default null, part_no text default null)
returns uuid language sql
as $$ select app.add_manual_item(target_panel_id, item_name, category, unit_price, qty, unit, make, part_no) $$;

grant execute on function public.add_component_to_costing(uuid, uuid, numeric) to authenticated;
grant execute on function public.add_manual_item(uuid, text, text, numeric, numeric, text, text, text) to authenticated;
grant select on public.v_kits to authenticated;
revoke execute on all functions in schema public from anon;
