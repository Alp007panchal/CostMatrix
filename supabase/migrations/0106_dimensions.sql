-- 0106  F12: how big things are (roadmap F12, groundwork for phase 3.8)
--
-- The panel layout canvas of 3.8 — cubicle front views at true scale, kits
-- dragged onto mounting zones, a fit verdict that proposes the cubicle count —
-- cannot be built until the library knows how big a device is and how much room
-- it needs around it. That is all this migration adds: nullable measurements,
-- one empty table for the layouts themselves, and one read-only function that
-- compares the area a panel's kits need with the area its cubicles offer.
--
-- Nothing here changes a price, an hour or a total. The new columns are nullable
-- everywhere and nothing reads them except the fit hint, which says "not known
-- yet" until somebody fills them in. NPP-192 is untouched.

-- ===========================================================================
-- 1. Components: size, what it mounts on, the room it needs, what it weighs
-- ===========================================================================
alter table public.components
  add column if not exists width_mm  numeric(10,1) check (width_mm  is null or width_mm  > 0),
  add column if not exists height_mm numeric(10,1) check (height_mm is null or height_mm > 0),
  add column if not exists depth_mm  numeric(10,1) check (depth_mm  is null or depth_mm  > 0),
  add column if not exists mounting_type text,
  -- {"top": 50, "bottom": 50, "left": 25, "right": 25} in millimetres. The space
  -- the maker says to leave around the device; part of the area it really takes.
  add column if not exists clearances jsonb not null default '{}'::jsonb,
  add column if not exists weight_kg numeric(10,3) check (weight_kg is null or weight_kg >= 0),
  -- Only meaningful on an enclosure cubicle: the usable mounting area inside it,
  -- the chambers that are not available for devices, and the form of separation.
  -- {"usable_w_mm": 700, "usable_h_mm": 1800, "usable_d_mm": 600,
  --  "busbar_chamber": {"w_mm": 800, "h_mm": 300},
  --  "cable_chamber":  {"w_mm": 250, "h_mm": 2100}, "form": "3B"}
  add column if not exists enclosure_layout jsonb not null default '{}'::jsonb;

alter table public.components drop constraint if exists components_mounting_known;
alter table public.components
  add constraint components_mounting_known check (
    mounting_type is null
    or mounting_type in ('din_rail', 'plate', 'withdrawable', 'door', 'busbar_chamber', 'other'));

-- An enclosure layout belongs to an enclosure cubicle and nothing else, so a
-- usable area cannot quietly be recorded against an ACB.
alter table public.components drop constraint if exists components_layout_is_enclosure;
alter table public.components
  add constraint components_layout_is_enclosure check (
    enclosure_layout = '{}'::jsonb or is_enclosure_cubicle);

comment on column public.components.width_mm is
  'Outside width in millimetres. Null until somebody measures it; every screen
   and the fit check treat null as "not known yet", never as zero.';
comment on column public.components.mounting_type is
  'What it mounts on: din_rail, plate, withdrawable (its own cassette), door,
   busbar_chamber, other. The layout canvas of 3.8 uses it to choose the zone.';
comment on column public.components.clearances is
  'Millimetres to leave clear around the device, as the maker states them:
   {"top": 50, "bottom": 50, "left": 25, "right": 25}. Added to the footprint.';
comment on column public.components.enclosure_layout is
  'An enclosure cubicle only: usable internal mounting area, busbar and cable
   chamber sizes, and the form of separation it is built to.';

-- ===========================================================================
-- 2. Kits: a footprint of their own where the main device is not the whole story
-- ===========================================================================
-- Null means "work it out from the main device and its clearances", which is
-- right for most kits. A kit whose accessories sit beside the device overrides it.
alter table public.assemblies
  add column if not exists footprint_w_mm numeric(10,1) check (footprint_w_mm is null or footprint_w_mm > 0),
  add column if not exists footprint_h_mm numeric(10,1) check (footprint_h_mm is null or footprint_h_mm > 0),
  add column if not exists footprint_d_mm numeric(10,1) check (footprint_d_mm is null or footprint_d_mm > 0);

comment on column public.assemblies.footprint_w_mm is
  'The width this kit occupies on a mounting plate, when it is not simply the
   main device plus its clearances. Null = derive it from the main device.';

-- ===========================================================================
-- 3. The layouts themselves (3.8). Empty: there is no canvas yet.
-- ===========================================================================
create table if not exists public.panel_layouts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  panel_id    uuid not null references public.costing_panels(id) on delete cascade,
  version     integer not null default 1 check (version >= 1),
  -- [{"name": "Cubicle 1", "component_id": "<uuid>", "w_mm": 800, "h_mm": 2100,
  --   "d_mm": 800, "sort_order": 0,
  --   "placements": [{"costing_assembly_id": "<uuid>", "x_mm": 40, "y_mm": 120,
  --                   "w_mm": 320, "h_mm": 400, "rotation": 0}]}]
  cubicles    jsonb not null default '[]'::jsonb,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (panel_id, version)
);

create index if not exists panel_layouts_panel_idx on public.panel_layouts (panel_id, version desc);
select app.add_audit_triggers('public.panel_layouts');

comment on table public.panel_layouts is
  'One arrangement of one panel line item: its cubicles and where each kit sits
   inside them, in millimetres from the top left. Versioned, so an earlier
   arrangement can be looked at. Written by the layout canvas of phase 3.8;
   nothing writes it yet, and nothing in the costing depends on it.';

alter table public.panel_layouts enable row level security;
drop policy if exists panel_layouts_read on public.panel_layouts;
create policy panel_layouts_read on public.panel_layouts for select
  using (company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists panel_layouts_write on public.panel_layouts;
create policy panel_layouts_write on public.panel_layouts for all
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());
grant select, insert, update, delete on public.panel_layouts to authenticated;

-- ===========================================================================
-- 4. The component screen sees the new fields (view re-derived by insertion)
-- ===========================================================================
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
  comp.is_placeholder,
  -- Appended by 0106 (F12): the physical size of the part, what it mounts on,
  -- the space it needs around it, what it weighs, and — for an enclosure
  -- cubicle — the usable area inside it.
  comp.width_mm,
  comp.height_mm,
  comp.depth_mm,
  comp.mounting_type,
  comp.clearances,
  comp.weight_kg,
  comp.enclosure_layout
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

-- ===========================================================================
-- 5. Footprints, and whether a panel's kits fit its cubicles
-- ===========================================================================
-- Area, not geometry: the real arrangement is the canvas's job in 3.8. What this
-- answers is the question a costing engineer asks while quoting — "have I bought
-- enough cubicle?" — and it answers "not known yet" unless both sides are known.

create or replace function app.clearance_mm(clearances jsonb, side text)
returns numeric
language sql
immutable
as $$
  select coalesce((clearances ->> side)::numeric, 0)
$$;

-- The space a component really takes: its own size plus the room to leave around
-- it. Null width or height means unknown, and unknown is never guessed.
create or replace function app.component_footprint(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when c.id is null then jsonb_build_object('known', false)
    when c.width_mm is null or c.height_mm is null then
      jsonb_build_object('known', false, 'component_id', c.id, 'code', c.code)
    else jsonb_build_object(
      'known', true, 'component_id', c.id, 'code', c.code,
      'w_mm', c.width_mm + app.clearance_mm(c.clearances, 'left') + app.clearance_mm(c.clearances, 'right'),
      'h_mm', c.height_mm + app.clearance_mm(c.clearances, 'top') + app.clearance_mm(c.clearances, 'bottom'),
      'd_mm', c.depth_mm,
      'area_mm2', (c.width_mm + app.clearance_mm(c.clearances, 'left') + app.clearance_mm(c.clearances, 'right'))
                * (c.height_mm + app.clearance_mm(c.clearances, 'top') + app.clearance_mm(c.clearances, 'bottom')))
  end
  from public.components c where c.id = target
$$;

-- A kit's footprint: its own override, else its main device with clearances.
create or replace function app.kit_footprint(target uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  a public.assemblies;
  device uuid;
  fp jsonb;
begin
  select * into a from public.assemblies where id = target;
  if a.id is null then return jsonb_build_object('known', false); end if;

  if a.footprint_w_mm is not null and a.footprint_h_mm is not null then
    return jsonb_build_object(
      'known', true, 'source', 'kit', 'kit_id', a.id, 'name', a.name,
      'w_mm', a.footprint_w_mm, 'h_mm', a.footprint_h_mm, 'd_mm', a.footprint_d_mm,
      'area_mm2', a.footprint_w_mm * a.footprint_h_mm);
  end if;

  select ac.component_id into device
  from public.assembly_components ac
  where ac.assembly_id = a.id and ac.is_main_device
  limit 1;
  if device is null then
    return jsonb_build_object('known', false, 'kit_id', a.id, 'name', a.name, 'reason', 'no main device');
  end if;

  fp := app.component_footprint(device);
  if (fp ->> 'known')::boolean then
    return fp || jsonb_build_object('source', 'main_device', 'kit_id', a.id, 'name', a.name);
  end if;
  return jsonb_build_object('known', false, 'kit_id', a.id, 'name', a.name,
                            'reason', format('%s has no size yet', coalesce(fp ->> 'code', 'the main device')));
end;
$$;

-- Does what is on this panel fit the cubicles bought for it?
create or replace function app.panel_fit(target uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  p public.costing_panels;
  factor numeric;
  kit_area numeric := 0;
  usable_area numeric := 0;
  known_kits integer := 0;
  unknown jsonb := '[]'::jsonb;
  cubicles jsonb := '[]'::jsonb;
  line record;
  fp jsonb;
  required numeric;
  verdict text;
begin
  select * into p from public.costing_panels where id = target;
  if p.id is null then return jsonb_build_object('verdict', 'unknown', 'reason', 'no such panel'); end if;

  factor := coalesce((app.company_option('layout_safety_factor', '1.3'::jsonb))::text::numeric, 1.3);

  -- What is on the panel, per board: a panel of quantity 2 is two of the same
  -- board, so quantities inside it are what matters, not the panel's own.
  for line in
    select ca.id, ca.name, ca.quantity, ca.source_assembly_id
    from public.costing_assemblies ca
    where ca.panel_id = target and ca.kind = 'kit' and ca.source_assembly_id is not null
  loop
    fp := app.kit_footprint(line.source_assembly_id);
    if (fp ->> 'known')::boolean then
      kit_area := kit_area + (fp ->> 'area_mm2')::numeric * line.quantity;
      known_kits := known_kits + 1;
    else
      unknown := unknown || jsonb_build_object('name', line.name, 'reason', coalesce(fp ->> 'reason', 'no size yet'));
    end if;
  end loop;

  -- The cubicles bought for it, with the usable area each one offers.
  for line in
    select i.quantity, c.code, c.name, c.enclosure_layout
    from public.costing_items i
    join public.costing_assemblies ca on ca.id = i.costing_assembly_id
    join public.components c on c.id = i.source_component_id
    where ca.panel_id = target and c.is_enclosure_cubicle
  loop
    if (line.enclosure_layout ->> 'usable_w_mm') is not null
       and (line.enclosure_layout ->> 'usable_h_mm') is not null then
      usable_area := usable_area
        + (line.enclosure_layout ->> 'usable_w_mm')::numeric
        * (line.enclosure_layout ->> 'usable_h_mm')::numeric * line.quantity;
      cubicles := cubicles || jsonb_build_object('code', line.code, 'quantity', line.quantity, 'known', true);
    else
      cubicles := cubicles || jsonb_build_object('code', line.code, 'quantity', line.quantity, 'known', false);
    end if;
  end loop;

  required := round(kit_area * factor, 0);
  verdict := case
    when known_kits = 0 or usable_area = 0 then 'unknown'
    when required <= usable_area * 0.9 then 'fits'
    when required <= usable_area then 'tight'
    else 'no_fit' end;

  return jsonb_build_object(
    'verdict', verdict,
    'safety_factor', factor,
    'kits_measured', known_kits,
    'kits_unmeasured', jsonb_array_length(unknown),
    'unmeasured', unknown,
    'cubicles', cubicles,
    'kit_area_mm2', round(kit_area, 0),
    'required_area_mm2', required,
    'usable_area_mm2', round(usable_area, 0),
    'used_pct', case when usable_area > 0 then round(required / usable_area * 100, 1) end);
end;
$$;

comment on function app.panel_fit(uuid) is
  'Area a panel''s kits need (footprints × the company''s safety factor) against
   the usable area of the cubicles on it. Advisory and read-only: it changes no
   price, and says "unknown" until both sides have been measured.';

-- ===========================================================================
-- 6. The safety factor is a company setting (F10), seeded for everybody
-- ===========================================================================
create or replace function app.seed_company_options(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_options (company_id, key, value, value_type)
  values
    (target_company, 'ai_enabled',                'false'::jsonb, 'boolean'),
    (target_company, 'ai_monthly_token_budget',   '2000000'::jsonb, 'number'),
    (target_company, 'ai_price_age_warning_days', '90'::jsonb, 'number'),
    (target_company, 'ai_min_margin_pct',
       coalesce((select to_jsonb(least(material_margin_pct, labour_margin_pct))
                   from public.companies where id = target_company), '0'::jsonb), 'number'),
    -- F12: how much more room a board needs than the bare sum of its kits,
    -- for wiring, clearances and getting a spanner in. 1.3 until somebody
    -- measures a real board and says otherwise.
    (target_company, 'layout_safety_factor',      '1.3'::jsonb, 'number')
  on conflict (company_id, key) do nothing;
end;
$$;

select app.seed_company_options(id) from public.companies;

-- ===========================================================================
-- 7. The seed importer reads the new columns when a file carries them
-- ===========================================================================
create or replace function app.import_components(
  rows jsonb, category_map jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  copper numeric;
  r record;
  cur public.components;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_kg int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]'; seen text[] := '{}';
  part text; price numeric; kg numeric; currency text; mode public.pricing_mode;
  placeholder boolean; cubicle boolean; cat text; raw_cat text; unit text; diffs jsonb; batch uuid;
  w numeric; h numeric; d numeric; mount text; wkg numeric;
  m text[];
begin
  perform app.assert_may_import(to_company);

  -- Busbar rows are priced by weight: kg per metre = catalogue price ÷ the
  -- master copper rate (15 EUR/kg), which is how the catalogue was built.
  select rate into copper from public.material_rates
  where company_id is null and code = 'copper_busbar';
  if copper is null or copper <= 0 then raise exception 'no master copper rate'; end if;

  if to_regclass('pg_temp.cat_map') is not null then drop table pg_temp.cat_map; end if;
  create temp table cat_map on commit drop as
  select upper(btrim(e.elem ->> 'category')) as category, app.bom_code(e.elem ->> 'bomCategory') as bom
  from jsonb_array_elements(coalesce(category_map, '[]'::jsonb)) as e(elem);

  for r in
    select e.elem ->> 'partNumber' as part_number, e.elem ->> 'description' as description,
           e.elem ->> 'category' as category, e.elem ->> 'priceEur' as price,
           e.elem ->> 'purchaseCurrency' as currency, e.elem ->> 'brand' as brand,
           e.elem ->> 'rating' as rating, e.elem ->> 'poles' as poles,
           e.elem ->> 'breakingCapacity' as breaking_capacity, e.elem ->> 'frameSize' as frame_size,
           e.elem ->> 'notes' as notes,
           -- F12, all optional: a file without them changes nothing.
           e.elem ->> 'widthMm' as width_mm, e.elem ->> 'heightMm' as height_mm,
           e.elem ->> 'depthMm' as depth_mm, e.elem ->> 'mountingType' as mounting_type,
           e.elem ->> 'weightKg' as weight_kg,
           e.row_no + 1 as line   -- +1: the header is line 1 of the file
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    part := btrim(coalesce(r.part_number, ''));
    raw_cat := upper(btrim(coalesce(r.category, '')));
    price := app.parse_numeric(r.price);
    w := app.parse_numeric(r.width_mm); h := app.parse_numeric(r.height_mm);
    d := app.parse_numeric(r.depth_mm); wkg := app.parse_numeric(r.weight_kg);
    mount := nullif(lower(btrim(coalesce(r.mounting_type, ''))), '');
    if mount is not null and mount not in ('din_rail', 'plate', 'withdrawable', 'door', 'busbar_chamber', 'other') then
      mount := 'other';
    end if;
    currency := upper(nullif(btrim(coalesce(r.currency, '')), ''));
    placeholder := price is null or price <= 0;
    cubicle := raw_cat = 'ENCLOSURE';
    -- BOM category: the map, unless the row's notes say otherwise ("BOM category: accessories & hardware").
    cat := (select bom from cat_map where category = raw_cat);
    m := regexp_match(coalesce(r.notes, ''), 'BOM category:\s*([A-Za-z &]+?)(?:\s*\(|$)', 'i');
    if m is not null and app.bom_code(m[1]) is not null then cat := app.bom_code(m[1]); end if;

    if part = '' or btrim(coalesce(r.description, '')) = '' then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'partNumber or description is blank');
      continue;
    elsif upper(part) = any (seen) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'partNumber appears twice in the file');
      continue;
    elsif cat is null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', format('category "%s" is not in category-map.csv', raw_cat));
      continue;
    elsif price is not null and price < 0 then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'priceEur is negative');
      continue;
    elsif not placeholder and currency is null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'purchaseCurrency is blank');
      continue;
    elsif not placeholder and not exists (select 1 from public.currency_factors where company_id is null and currency_code = currency) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', format('no landed factor for currency %s', currency));
      continue;
    end if;
    seen := seen || upper(part);

    unit := case when raw_cat in ('BUSBAR', 'CABLE') then 'm' else 'pcs' end;
    if raw_cat = 'BUSBAR' and not placeholder then
      mode := 'weight_rate'; kg := round(price / copper, 3); price := null; currency := 'KES'; n_kg := n_kg + 1;
    else
      mode := 'fixed'; kg := null;
      if placeholder then price := null; currency := coalesce(currency, 'KES'); end if;
    end if;

    select * into cur from public.components
    where coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(components.code) = upper(part);

    if cur.id is null then
      n_new := n_new + 1;
      if apply then
        if batch is null then
          insert into public.import_batches (company_id, user_id, target, file_name)
          values (to_company, auth.uid(), 'components', file_name) returning id into batch;
        end if;
        insert into public.components
          (company_id, category_code, code, name, unit, manufacturer, part_number, pricing_mode,
           purchase_price, purchase_currency, weight_per_unit, material_rate_code,
           is_enclosure_cubicle, is_placeholder, rating, poles, breaking_capacity, frame_size,
           description, import_batch_id,
           width_mm, height_mm, depth_mm, mounting_type, weight_kg)
        values
          (to_company, cat, part, btrim(r.description), unit,
           nullif(btrim(coalesce(r.brand, '')), ''), part, mode,
           price, currency, kg, case when mode = 'weight_rate' then 'copper_busbar' end,
           cubicle, placeholder,
           nullif(btrim(coalesce(r.rating, '')), ''), nullif(btrim(coalesce(r.poles, '')), ''),
           nullif(btrim(coalesce(r.breaking_capacity, '')), ''), nullif(btrim(coalesce(r.frame_size, '')), ''),
           nullif(btrim(coalesce(r.notes, '')), ''), batch,
           w, h, d, mount, wkg);
      end if;
    else
      diffs := '[]';
      if cur.name is distinct from btrim(r.description) then diffs := diffs || jsonb_build_object('field', 'name', 'from', cur.name, 'to', btrim(r.description)); end if;
      if cur.category_code is distinct from cat then diffs := diffs || jsonb_build_object('field', 'category', 'from', cur.category_code, 'to', cat); end if;
      if cur.manufacturer is distinct from nullif(btrim(coalesce(r.brand, '')), '') then diffs := diffs || jsonb_build_object('field', 'make', 'from', cur.manufacturer, 'to', btrim(r.brand)); end if;
      if cur.pricing_mode is distinct from mode then diffs := diffs || jsonb_build_object('field', 'pricing', 'from', cur.pricing_mode, 'to', mode); end if;
      if cur.purchase_price is distinct from price then diffs := diffs || jsonb_build_object('field', 'price', 'from', cur.purchase_price, 'to', price); end if;
      if cur.purchase_currency is distinct from currency then diffs := diffs || jsonb_build_object('field', 'currency', 'from', cur.purchase_currency, 'to', currency); end if;
      if cur.weight_per_unit is distinct from kg then diffs := diffs || jsonb_build_object('field', 'kg per metre', 'from', cur.weight_per_unit, 'to', kg); end if;
      if cur.is_enclosure_cubicle is distinct from cubicle then diffs := diffs || jsonb_build_object('field', 'cubicle', 'from', cur.is_enclosure_cubicle, 'to', cubicle); end if;
      if cur.is_placeholder is distinct from placeholder then diffs := diffs || jsonb_build_object('field', 'placeholder', 'from', cur.is_placeholder, 'to', placeholder); end if;
      if cur.rating is distinct from nullif(btrim(coalesce(r.rating, '')), '') then diffs := diffs || jsonb_build_object('field', 'rating', 'from', cur.rating, 'to', r.rating); end if;
      if cur.poles is distinct from nullif(btrim(coalesce(r.poles, '')), '') then diffs := diffs || jsonb_build_object('field', 'poles', 'from', cur.poles, 'to', r.poles); end if;
      -- F12: a dimension counts as a change only when the file carries one, so
      -- re-importing a file without those columns is still "unchanged".
      if w is not null and cur.width_mm is distinct from w then diffs := diffs || jsonb_build_object('field', 'width mm', 'from', cur.width_mm, 'to', w); end if;
      if h is not null and cur.height_mm is distinct from h then diffs := diffs || jsonb_build_object('field', 'height mm', 'from', cur.height_mm, 'to', h); end if;
      if d is not null and cur.depth_mm is distinct from d then diffs := diffs || jsonb_build_object('field', 'depth mm', 'from', cur.depth_mm, 'to', d); end if;
      if mount is not null and cur.mounting_type is distinct from mount then diffs := diffs || jsonb_build_object('field', 'mounting', 'from', cur.mounting_type, 'to', mount); end if;
      if wkg is not null and cur.weight_kg is distinct from wkg then diffs := diffs || jsonb_build_object('field', 'weight kg', 'from', cur.weight_kg, 'to', wkg); end if;
      if jsonb_array_length(diffs) = 0 then
        n_same := n_same + 1;
      else
        n_changed := n_changed + 1;
        if jsonb_array_length(changes) < 200 then
          changes := changes || jsonb_build_object('key', part, 'changes', diffs);
        end if;
        if apply then
          if batch is null then
            insert into public.import_batches (company_id, user_id, target, file_name)
            values (to_company, auth.uid(), 'components', file_name) returning id into batch;
          end if;
          update public.components set
            name = btrim(r.description), category_code = cat,
            manufacturer = nullif(btrim(coalesce(r.brand, '')), ''),
            pricing_mode = mode, purchase_price = price, purchase_currency = currency,
            weight_per_unit = kg, material_rate_code = case when mode = 'weight_rate' then 'copper_busbar' end,
            is_enclosure_cubicle = cubicle, is_placeholder = placeholder,
            rating = nullif(btrim(coalesce(r.rating, '')), ''), poles = nullif(btrim(coalesce(r.poles, '')), ''),
            breaking_capacity = nullif(btrim(coalesce(r.breaking_capacity, '')), ''),
            frame_size = nullif(btrim(coalesce(r.frame_size, '')), ''),
            import_batch_id = batch,
            width_mm = coalesce(w, width_mm), height_mm = coalesce(h, height_mm),
            depth_mm = coalesce(d, depth_mm), mounting_type = coalesce(mount, mounting_type),
            weight_kg = coalesce(wkg, weight_kg)
          where id = cur.id;
        end if;
      end if;
    end if;
  end loop;

  if apply and batch is not null then
    update public.import_batches set rows_new = n_new, rows_changed = n_changed,
      rows_unchanged = n_same, rows_rejected = jsonb_array_length(rejected),
      details = jsonb_build_object('rejected', rejected, 'busbar_kg_derived', n_kg)
    where id = batch;
  end if;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'busbar_kg_derived', n_kg, 'rejected', rejected, 'changes', changes, 'applied', apply, 'batch_id', batch);
end;
$$;

-- A file of dimensions on its own (data/seed/dimensions-template.csv): part
-- numbers already filled in, the measurements for somebody to complete. It
-- touches nothing but the F12 columns — never a price, never a category — so the
-- template cannot undo the catalogue by being incomplete.
create or replace function app.import_dimensions(rows jsonb, to_company uuid, apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  r record;
  cur public.components;
  n_changed int := 0; n_same int := 0; n_blank int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]';
  part text; w numeric; h numeric; d numeric; wkg numeric; mount text;
  clear jsonb; layout jsonb; diffs jsonb;
begin
  perform app.assert_may_import(to_company);

  for r in
    select e.elem ->> 'partNumber' as part_number,
           e.elem ->> 'widthMm' as width_mm, e.elem ->> 'heightMm' as height_mm,
           e.elem ->> 'depthMm' as depth_mm, e.elem ->> 'mountingType' as mounting_type,
           e.elem ->> 'weightKg' as weight_kg,
           e.elem ->> 'clearanceTopMm' as c_top, e.elem ->> 'clearanceBottomMm' as c_bottom,
           e.elem ->> 'clearanceLeftMm' as c_left, e.elem ->> 'clearanceRightMm' as c_right,
           e.elem ->> 'usableWMm' as usable_w, e.elem ->> 'usableHMm' as usable_h,
           e.elem ->> 'usableDMm' as usable_d,
           e.elem ->> 'busbarChamberWMm' as bb_w, e.elem ->> 'busbarChamberHMm' as bb_h,
           e.elem ->> 'cableChamberWMm' as cc_w, e.elem ->> 'cableChamberHMm' as cc_h,
           e.elem ->> 'formOfSeparation' as form,
           e.row_no + 1 as line
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    part := btrim(coalesce(r.part_number, ''));
    w := app.parse_numeric(r.width_mm); h := app.parse_numeric(r.height_mm);
    d := app.parse_numeric(r.depth_mm); wkg := app.parse_numeric(r.weight_kg);
    mount := nullif(lower(btrim(coalesce(r.mounting_type, ''))), '');

    if part = '' then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', '', 'reason', 'partNumber is blank');
      continue;
    end if;
    if mount is not null and mount not in ('din_rail', 'plate', 'withdrawable', 'door', 'busbar_chamber', 'other') then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part,
        'reason', format('mountingType "%s" is not one of din_rail, plate, withdrawable, door, busbar_chamber, other', mount));
      continue;
    end if;

    select * into cur from public.components
    where coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(components.code) = upper(part);
    if cur.id is null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'no part with that code in this library');
      continue;
    end if;

    -- Only the sides the file names; the rest keep whatever they had.
    clear := cur.clearances;
    if app.parse_numeric(r.c_top)    is not null then clear := clear || jsonb_build_object('top', app.parse_numeric(r.c_top)); end if;
    if app.parse_numeric(r.c_bottom) is not null then clear := clear || jsonb_build_object('bottom', app.parse_numeric(r.c_bottom)); end if;
    if app.parse_numeric(r.c_left)   is not null then clear := clear || jsonb_build_object('left', app.parse_numeric(r.c_left)); end if;
    if app.parse_numeric(r.c_right)  is not null then clear := clear || jsonb_build_object('right', app.parse_numeric(r.c_right)); end if;

    layout := cur.enclosure_layout;
    if cur.is_enclosure_cubicle then
      if app.parse_numeric(r.usable_w) is not null then layout := layout || jsonb_build_object('usable_w_mm', app.parse_numeric(r.usable_w)); end if;
      if app.parse_numeric(r.usable_h) is not null then layout := layout || jsonb_build_object('usable_h_mm', app.parse_numeric(r.usable_h)); end if;
      if app.parse_numeric(r.usable_d) is not null then layout := layout || jsonb_build_object('usable_d_mm', app.parse_numeric(r.usable_d)); end if;
      if app.parse_numeric(r.bb_w) is not null or app.parse_numeric(r.bb_h) is not null then
        layout := layout || jsonb_build_object('busbar_chamber', jsonb_strip_nulls(jsonb_build_object(
          'w_mm', app.parse_numeric(r.bb_w), 'h_mm', app.parse_numeric(r.bb_h))));
      end if;
      if app.parse_numeric(r.cc_w) is not null or app.parse_numeric(r.cc_h) is not null then
        layout := layout || jsonb_build_object('cable_chamber', jsonb_strip_nulls(jsonb_build_object(
          'w_mm', app.parse_numeric(r.cc_w), 'h_mm', app.parse_numeric(r.cc_h))));
      end if;
      if nullif(btrim(coalesce(r.form, '')), '') is not null then
        layout := layout || jsonb_build_object('form', btrim(r.form));
      end if;
    elsif app.parse_numeric(r.usable_w) is not null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part,
        'reason', 'a usable area belongs to an enclosure cubicle; this part is not one');
      continue;
    end if;

    diffs := '[]';
    if w is not null and cur.width_mm is distinct from w then diffs := diffs || jsonb_build_object('field', 'width mm', 'from', cur.width_mm, 'to', w); end if;
    if h is not null and cur.height_mm is distinct from h then diffs := diffs || jsonb_build_object('field', 'height mm', 'from', cur.height_mm, 'to', h); end if;
    if d is not null and cur.depth_mm is distinct from d then diffs := diffs || jsonb_build_object('field', 'depth mm', 'from', cur.depth_mm, 'to', d); end if;
    if mount is not null and cur.mounting_type is distinct from mount then diffs := diffs || jsonb_build_object('field', 'mounting', 'from', cur.mounting_type, 'to', mount); end if;
    if wkg is not null and cur.weight_kg is distinct from wkg then diffs := diffs || jsonb_build_object('field', 'weight kg', 'from', cur.weight_kg, 'to', wkg); end if;
    if clear is distinct from cur.clearances then diffs := diffs || jsonb_build_object('field', 'clearances', 'from', cur.clearances, 'to', clear); end if;
    if layout is distinct from cur.enclosure_layout then diffs := diffs || jsonb_build_object('field', 'enclosure layout', 'from', cur.enclosure_layout, 'to', layout); end if;

    if jsonb_array_length(diffs) = 0 then
      if w is null and h is null and d is null and wkg is null and mount is null then
        n_blank := n_blank + 1;   -- a row nobody has filled in yet
      else
        n_same := n_same + 1;
      end if;
    else
      n_changed := n_changed + 1;
      if jsonb_array_length(changes) < 200 then
        changes := changes || jsonb_build_object('key', part, 'changes', diffs);
      end if;
      if apply then
        update public.components set
          width_mm = coalesce(w, width_mm), height_mm = coalesce(h, height_mm),
          depth_mm = coalesce(d, depth_mm), mounting_type = coalesce(mount, mounting_type),
          weight_kg = coalesce(wkg, weight_kg), clearances = clear, enclosure_layout = layout
        where id = cur.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('new', 0, 'changed', n_changed, 'unchanged', n_same,
    'skipped_blank', n_blank, 'rejected', rejected, 'changes', changes,
    'applied', apply, 'batch_id', null);
end;
$$;

comment on function app.import_dimensions(jsonb, uuid, boolean) is
  'Reads data/seed/dimensions-template.csv: part number plus measurements.
   Touches only the F12 columns, never a price or a category, and a blank row is
   counted as "not filled in yet" rather than rejected.';

-- ===========================================================================
-- 8. Wrappers and grants
-- ===========================================================================
create or replace function public.import_dimensions(rows jsonb, to_company uuid, apply boolean)
returns jsonb language plpgsql security invoker
as $$ begin return app.import_dimensions(rows, to_company, apply); end $$;

create or replace function public.panel_fit(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.panel_fit(target) $$;
create or replace function public.kit_footprint(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.kit_footprint(target) $$;
create or replace function public.component_footprint(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.component_footprint(target) $$;

grant execute on function
  app.clearance_mm(jsonb, text),
  app.component_footprint(uuid), public.component_footprint(uuid),
  app.kit_footprint(uuid), public.kit_footprint(uuid),
  app.panel_fit(uuid), public.panel_fit(uuid),
  app.import_dimensions(jsonb, uuid, boolean), public.import_dimensions(jsonb, uuid, boolean)
to authenticated;
