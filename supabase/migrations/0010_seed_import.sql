-- 0010: the seed importer. Reference document §6; build order session 2.
--
-- Three functions take the rows of the owner's seed CSVs (as JSON), validate
-- them, compare them with what the library already holds and — only when
-- apply is true — write them, all inside one transaction. Called with apply =
-- false they return the same report without writing: that is the preview the
-- screen shows. One set of rules for the screen and for the test suite, which
-- loads the real data/seed files this way. Files and columns are the owner's
-- (data/seed/README.md): components.csv in the supplier template with
-- category-map.csv for the BOM category; kits.csv with kit-labour-template.csv
-- for the labour group, main device and per-kit hours; the wide
-- kit-group-labour-template.csv for group hours.

-- ---------------------------------------------------------------------------
-- 1. Placeholder parts: allowed without a price, flagged, never costed silently
-- ---------------------------------------------------------------------------

alter table public.components add column is_placeholder boolean not null default false;
comment on column public.components.is_placeholder is
  'A part the kits use but the catalogue does not price yet. Allowed without a
   purchase price; a kit holding one cannot be costed until it is priced.';

alter table public.components drop constraint components_pricing_fields;
alter table public.components add constraint components_pricing_fields check (
  case pricing_mode
    when 'fixed'       then (purchase_price is not null or is_placeholder)
                            and weight_per_unit is null and material_rate_code is null
    when 'weight_rate' then weight_per_unit is not null and material_rate_code is not null
                            and purchase_price is null
  end
);

alter table public.import_batches drop constraint import_batches_target_check;
alter table public.import_batches add constraint import_batches_target_check
  check (target in ('components', 'assemblies', 'kits', 'kit_group_hours'));

-- A kit with an unpriced line stops at the door of the costing.
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
  unpriced text;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;

  if target_costing is null then
    raise exception 'no such panel';
  end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select * into a from public.assemblies where id = source_assembly;
  if a is null then
    raise exception 'no such assembly';
  end if;

  select string_agg(p.code, ', ' order by p.code) into unpriced
  from public.assembly_components ac
  join public.v_component_prices p on p.id = ac.component_id
  where ac.assembly_id = source_assembly and p.unit_price is null;
  if unpriced is not null then
    raise exception '% has no price yet — set the purchase price before costing this kit', unpriced;
  end if;

  insert into public.costing_assemblies
    (costing_id, panel_id, company_id, source_assembly_id, code, name, quantity, created_by,
     sort_order)
  values (target_costing, target_panel_id, target_company, a.id, a.code, a.name, qty, auth.uid(),
          coalesce((select max(sort_order) + 1 from public.costing_assemblies
                    where panel_id = target_panel_id), 0))
  returning id into new_line;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     purchase_price, purchase_currency, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, sort_order, created_by)
  select
    target_costing, new_line, target_company, p.id, p.code, p.name,
    p.category_code, p.unit, p.manufacturer, p.part_number, ac.quantity, p.pricing_mode,
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
    ac.sort_order, auth.uid()
  from public.assembly_components ac
  join public.v_component_prices p on p.id = ac.component_id
  join public.costings c on c.id = target_costing
  where ac.assembly_id = source_assembly;

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

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

-- Who may import where: the master admin into the master library, a company
-- admin into their own company's library.
create or replace function app.assert_may_import(to_company uuid)
returns void
language plpgsql
as $$
begin
  if to_company is null then
    if not app.is_master_admin() then
      raise exception 'only the master admin may import into the master library';
    end if;
  elsif to_company <> app.current_company_id() or not app.has_role('company_admin') then
    raise exception 'you may only import into your own company''s library, as its admin';
  end if;
end;
$$;

-- "42", " 6.5 ", "" and "abc" → 42, 6.5, null, null. Spreadsheets hand over text.
create or replace function app.parse_numeric(value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then return null; end if;
  return replace(btrim(value), ',', '')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function app.parse_flag(value text)
returns boolean
language sql
immutable
as $$ select lower(btrim(coalesce(value, ''))) in ('yes', 'y', 'true', '1') $$;

-- The code a kit gets from its name: letters and digits, hyphens between.
create or replace function app.kit_code(kit_name text)
returns text
language sql
immutable
as $$ select btrim(regexp_replace(upper(kit_name), '[^A-Z0-9]+', '-', 'g'), '-') $$;

-- The four BOM categories as the owner's files name them, or as codes.
create or replace function app.bom_code(label text)
returns text
language sql
immutable
as $$
  select case upper(btrim(coalesce(label, '')))
    when 'SWITCHGEAR' then 'switchgear'
    when 'BUSBAR' then 'busbar'
    when 'ACCESSORIES & HARDWARE' then 'accessories_hardware'
    when 'ACCESSORIES_HARDWARE' then 'accessories_hardware'
    when 'FABRICATED ENCLOSURE PARTS' then 'enclosure_parts'
    when 'ENCLOSURE_PARTS' then 'enclosure_parts'
    else null end
$$;

-- ---------------------------------------------------------------------------
-- 3. Components — data/seed/components.csv with category-map.csv
-- ---------------------------------------------------------------------------

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
           e.row_no + 1 as line   -- +1: the header is line 1 of the file
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    part := btrim(coalesce(r.part_number, ''));
    raw_cat := upper(btrim(coalesce(r.category, '')));
    price := app.parse_numeric(r.price);
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
           description, import_batch_id)
        values
          (to_company, cat, part, btrim(r.description), unit,
           nullif(btrim(coalesce(r.brand, '')), ''), part, mode,
           price, currency, kg, case when mode = 'weight_rate' then 'copper_busbar' end,
           cubicle, placeholder,
           nullif(btrim(coalesce(r.rating, '')), ''), nullif(btrim(coalesce(r.poles, '')), ''),
           nullif(btrim(coalesce(r.breaking_capacity, '')), ''), nullif(btrim(coalesce(r.frame_size, '')), ''),
           nullif(btrim(coalesce(r.notes, '')), ''), batch);
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
            import_batch_id = batch
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

comment on function app.import_components(jsonb, jsonb, uuid, boolean, text) is
  'Imports data/seed/components.csv (supplier template columns) with
   category-map.csv for the BOM category. apply = false previews; apply = true
   writes, all or nothing. Busbar rows become kg per metre × the copper rate.
   Never deletes.';

-- ---------------------------------------------------------------------------
-- 4. Kits — data/seed/kits.csv with kit-labour-template.csv
-- ---------------------------------------------------------------------------

create or replace function app.import_kits(
  rows jsonb, kit_template jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  k record; cur public.assemblies; grp uuid; kit_id uuid;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_groups int := 0; n_overrides int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]'; warnings jsonb := '[]'; diffs jsonb; batch uuid;
  reason text; want text; have text; main_line int;
begin
  perform app.assert_may_import(to_company);

  if to_regclass('pg_temp.kit_tpl') is not null then drop table pg_temp.kit_tpl; end if;
  create temp table kit_tpl on commit drop as
  select app.kit_code(coalesce(e.elem ->> 'kitName', ''))     as code,
         nullif(btrim(coalesce(e.elem ->> 'labourGroup', '')), '') as labour_group,
         upper(nullif(btrim(coalesce(e.elem ->> 'mainPart', '')), '')) as main_part,
         app.parse_numeric(e.elem ->> 'hoursPanelAssembly')    as h_assembly,
         app.parse_numeric(e.elem ->> 'hoursWiring')           as h_wiring,
         app.parse_numeric(e.elem ->> 'hoursBusbarFabrication') as h_busbar
  from jsonb_array_elements(coalesce(kit_template, '[]'::jsonb)) as e(elem);

  if to_regclass('pg_temp.kit_rows') is not null then drop table pg_temp.kit_rows; end if;
  create temp table kit_rows on commit drop as
  select
    x.row_no + 1                                        as line,
    btrim(coalesce(x.kit_group, ''))                    as section,
    btrim(coalesce(x.kit_name, ''))                     as kit_name,
    app.kit_code(coalesce(x.kit_name, ''))              as code,
    upper(btrim(coalesce(x.category, '')))              as category,
    x.row_no::int                                       as line_no,
    btrim(coalesce(x.part_number, ''))                  as part_number,
    app.parse_numeric(x.quantity)                       as quantity,
    (select c.id from public.components c
      where upper(c.code) = upper(btrim(coalesce(x.part_number, '')))
        and (c.company_id is null or c.company_id = to_company)
      order by c.company_id nulls last limit 1)         as component_id
  from (
    select e.row_no, e.elem ->> 'kitGroup' as kit_group, e.elem ->> 'kitName' as kit_name,
           e.elem ->> 'linkedCategory' as category, e.elem ->> 'partNumber' as part_number,
           e.elem ->> 'quantity' as quantity
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  ) x;

  -- A part repeated inside one kit is merged, quantities added, and reported.
  if to_regclass('pg_temp.kit_lines') is not null then drop table pg_temp.kit_lines; end if;
  create temp table kit_lines on commit drop as
  select code, component_id, part_number, sum(quantity) as quantity, min(line_no) as line_no,
         count(*) as copies
  from kit_rows group by code, component_id, part_number;
  for k in select r.kit_name, l.part_number, l.copies, l.quantity from kit_lines l
           join (select code, min(kit_name) as kit_name from kit_rows group by code) r on r.code = l.code
           where l.copies > 1 loop
    warnings := warnings || jsonb_build_object('key', k.kit_name, 'reason',
      format('%s is listed %s times in this kit; quantities added (%s)', k.part_number, k.copies, k.quantity));
  end loop;

  -- The kit's group: its labour group from the template, else the export's section.
  if to_regclass('pg_temp.kit_heads') is not null then drop table pg_temp.kit_heads; end if;
  create temp table kit_heads on commit drop as
  select r.code, min(r.kit_name) as kit_name, min(r.line) as line,
         coalesce(max(t.labour_group), nullif(min(r.section), '')) as group_name,
         max(t.main_part) as main_part,
         max(t.h_assembly) as h_assembly, max(t.h_wiring) as h_wiring, max(t.h_busbar) as h_busbar
  from kit_rows r left join kit_tpl t on t.code = r.code
  group by r.code;

  -- Groups first, so kits can point at them.
  for k in select distinct group_name from kit_heads where group_name is not null loop
    if not exists (select 1 from public.kit_groups g
                   where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
                     and upper(g.name) = upper(k.group_name)) then
      n_groups := n_groups + 1;
      if apply then insert into public.kit_groups (company_id, name) values (to_company, k.group_name); end if;
    end if;
  end loop;

  for k in
    select h.*,
           (select count(*) from kit_lines l where l.code = h.code) as lines,
           (select count(*) from kit_lines l where l.code = h.code and l.component_id is null) as unknown,
           (select string_agg(l.part_number, ', ' order by l.line_no) from kit_lines l where l.code = h.code and l.component_id is null) as unknown_parts,
           (select count(*) from kit_lines l where l.code = h.code and (l.quantity is null or l.quantity <= 0)) as bad_qty,
           (select count(distinct kit_name) from kit_rows r where r.code = h.code) as names,
           -- The main device: the template's part, else the first line that is not busbar, cable or controls.
           coalesce(
             (select min(l.line_no) from kit_lines l where l.code = h.code and upper(l.part_number) = h.main_part),
             case when h.main_part is null then
               (select min(l.line_no) from kit_lines l join kit_rows r on r.code = l.code and r.line_no = l.line_no
                where l.code = h.code and r.category not in ('BUSBAR', 'CABLE', 'CONTROLS', '')) end,
             case when h.main_part is null then (select min(l.line_no) from kit_lines l where l.code = h.code) end
           ) as main_line_no
    from kit_heads h
    order by h.line
  loop
    reason := case
      when k.code = '' then 'kitName is blank'
      when k.main_line_no is null then format('main device %s from kit-labour-template.csv is not among the kit''s lines', k.main_part)
      when k.unknown > 0 then format('part not in the library: %s', k.unknown_parts)
      when k.bad_qty > 0 then 'a quantity is missing or not positive'
      when k.names > 1 then 'two spellings of the name give the same kit code; make them one'
      when k.group_name is null then 'no kit group: give the kit a labourGroup in kit-labour-template.csv or a kitGroup'
    end;
    if reason is not null then
      rejected := rejected || jsonb_build_object('row', k.line, 'key', k.kit_name, 'reason', reason);
      continue;
    end if;
    main_line := k.main_line_no;

    select g.id into grp from public.kit_groups g
    where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(g.name) = upper(k.group_name);

    select * into cur from public.assemblies a
    where coalesce(a.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(a.code) = k.code;

    select string_agg(format('%s×%s%s', component_id, quantity::numeric(12,3), case when line_no = main_line then '*' end), ';' order by component_id) into want
    from kit_lines where code = k.code;

    if cur.id is null then
      n_new := n_new + 1;
      if apply then
        if batch is null then
          insert into public.import_batches (company_id, user_id, target, file_name)
          values (to_company, auth.uid(), 'kits', file_name) returning id into batch;
        end if;
        insert into public.assemblies (company_id, code, name, kit_group_id, rating, rating_unit, poles)
        select to_company, k.code, k.kit_name, grp, r.rating, r.unit, r.poles
        from app.parse_kit_name(k.kit_name) r
        returning id into kit_id;
        insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device, sort_order)
        select kit_id, component_id, quantity, line_no = main_line, line_no from kit_lines where code = k.code;
      end if;
    else
      kit_id := cur.id;
      diffs := '[]';
      if cur.name is distinct from k.kit_name then diffs := diffs || jsonb_build_object('field', 'name', 'from', cur.name, 'to', k.kit_name); end if;
      if cur.kit_group_id is distinct from grp and (grp is not null or apply) then
        diffs := diffs || jsonb_build_object('field', 'group', 'from', (select name from public.kit_groups where id = cur.kit_group_id), 'to', k.group_name);
      end if;
      select string_agg(format('%s×%s%s', component_id, quantity::numeric(12,3), case when is_main_device then '*' end), ';' order by component_id) into have
      from public.assembly_components where assembly_id = cur.id;
      if want is distinct from have then diffs := diffs || jsonb_build_object('field', 'lines', 'from', format('%s lines', (select count(*) from public.assembly_components where assembly_id = cur.id)), 'to', format('%s lines', k.lines)); end if;

      if jsonb_array_length(diffs) = 0 then
        n_same := n_same + 1;
      else
        n_changed := n_changed + 1;
        if jsonb_array_length(changes) < 200 then
          changes := changes || jsonb_build_object('key', k.kit_name, 'changes', diffs);
        end if;
        if apply then
          if batch is null then
            insert into public.import_batches (company_id, user_id, target, file_name)
            values (to_company, auth.uid(), 'kits', file_name) returning id into batch;
          end if;
          update public.assemblies a set name = k.kit_name, kit_group_id = coalesce(grp, a.kit_group_id),
            rating = r.rating, rating_unit = r.unit, poles = r.poles
          from app.parse_kit_name(k.kit_name) r
          where a.id = cur.id;
          if want is distinct from have then
            delete from public.assembly_components where assembly_id = cur.id;
            insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device, sort_order)
            select cur.id, component_id, quantity, line_no = main_line, line_no from kit_lines where code = k.code;
          end if;
        end if;
      end if;
    end if;

    -- Per-kit hours from the template are overrides of the group's figures.
    if apply and (k.h_assembly is not null or k.h_wiring is not null or k.h_busbar is not null) then
      insert into public.assembly_labour (assembly_id, process_type, hours)
      select kit_id, p.code, p.h from (values ('assembly', k.h_assembly), ('wiring', k.h_wiring), ('busbar', k.h_busbar)) as p(code, h)
      where p.h is not null
      on conflict (assembly_id, process_type) do update set hours = excluded.hours;
      n_overrides := n_overrides + 1;
    end if;
  end loop;

  if apply and batch is not null then
    update public.import_batches set rows_new = n_new, rows_changed = n_changed,
      rows_unchanged = n_same, rows_rejected = jsonb_array_length(rejected),
      details = jsonb_build_object('rejected', rejected, 'groups_new', n_groups, 'warnings', warnings)
    where id = batch;
  end if;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'groups_new', n_groups, 'overrides', n_overrides, 'rejected', rejected, 'warnings', warnings,
    'changes', changes, 'applied', apply, 'batch_id', batch);
end;
$$;

comment on function app.import_kits(jsonb, jsonb, uuid, boolean, text) is
  'Imports data/seed/kits.csv with kit-labour-template.csv (labour group, main
   device, per-kit hours). A kit needs its main device among its lines and
   every part in the library, or it is rejected whole. Re-importing a changed
   kit replaces its lines and keeps its hours. Never deletes a kit.';

-- Rating, its unit and the poles, parsed from a kit name ("630A TP …", "50KVAR …").
create or replace function app.parse_kit_name(kit_name text)
returns table (rating numeric, unit text, poles smallint)
language sql
immutable
as $$
  select (regexp_match(kit_name, '(\d+(?:\.\d+)?)\s*(KVAR|A)\y', 'i'))[1]::numeric,
         upper((regexp_match(kit_name, '(\d+(?:\.\d+)?)\s*(KVAR|A)\y', 'i'))[2]),
         case upper((regexp_match(kit_name, '\m(SP|DP|TP|FP|[1-4]P)\M', 'i'))[1])
           when 'SP' then 1 when '1P' then 1 when 'DP' then 2 when '2P' then 2
           when 'TP' then 3 when '3P' then 3 when 'FP' then 4 when '4P' then 4 end::smallint
$$;

-- ---------------------------------------------------------------------------
-- 5. Kit group hours — data/seed/kit-group-labour-template.csv (wide)
-- ---------------------------------------------------------------------------

create or replace function app.import_kit_group_hours(rows jsonb, to_company uuid, apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  r record; c record; grp uuid; hrs numeric; cur numeric;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_blank int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]';
begin
  perform app.assert_may_import(to_company);

  for r in
    select e.elem ->> 'labourGroup' as group_name,
           e.elem ->> 'hoursPanelAssembly' as h_assembly, e.elem ->> 'hoursWiring' as h_wiring,
           e.elem ->> 'hoursBusbarFabrication' as h_busbar, e.row_no + 1 as line
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    select g.id into grp from public.kit_groups g
    where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(g.name) = upper(btrim(coalesce(r.group_name, '')));
    if grp is null then
      if btrim(coalesce(r.h_assembly, '')) = '' and btrim(coalesce(r.h_wiring, '')) = '' and btrim(coalesce(r.h_busbar, '')) = '' then
        n_blank := n_blank + 3; continue;
      end if;
      rejected := rejected || jsonb_build_object('row', r.line, 'key', r.group_name, 'reason', 'no such kit group; import the kits first');
      continue;
    end if;
    for c in select * from (values ('assembly', r.h_assembly), ('wiring', r.h_wiring), ('busbar', r.h_busbar)) as v(process_type, text_hours) loop
      if btrim(coalesce(c.text_hours, '')) = '' then n_blank := n_blank + 1; continue; end if;
      hrs := app.parse_numeric(c.text_hours);
      if hrs is null or hrs < 0 then
        rejected := rejected || jsonb_build_object('row', r.line, 'key', r.group_name, 'reason', format('%s hours is not a number', c.process_type));
        continue;
      end if;
      select hours into cur from public.kit_group_labour where kit_group_id = grp and process_type = c.process_type;
      if cur is null then n_new := n_new + 1;
      elsif cur = hrs then n_same := n_same + 1; continue;
      else
        n_changed := n_changed + 1;
        changes := changes || jsonb_build_object('key', r.group_name, 'changes',
          jsonb_build_array(jsonb_build_object('field', c.process_type, 'from', cur, 'to', hrs)));
      end if;
      if apply then
        insert into public.kit_group_labour (kit_group_id, process_type, hours)
        values (grp, c.process_type, hrs)
        on conflict (kit_group_id, process_type) do update set hours = excluded.hours;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'skipped_blank', n_blank, 'rejected', rejected, 'changes', changes, 'applied', apply, 'batch_id', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Public wrappers, the 0005 pattern
-- ---------------------------------------------------------------------------

create or replace function public.import_components(rows jsonb, category_map jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb language sql
as $$ select app.import_components(rows, category_map, to_company, apply, file_name) $$;

create or replace function public.import_kits(rows jsonb, kit_template jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb language sql
as $$ select app.import_kits(rows, kit_template, to_company, apply, file_name) $$;

create or replace function public.import_kit_group_hours(rows jsonb, to_company uuid, apply boolean)
returns jsonb language sql
as $$ select app.import_kit_group_hours(rows, to_company, apply) $$;

grant execute on function public.import_components(jsonb, jsonb, uuid, boolean, text)  to authenticated;
grant execute on function public.import_kits(jsonb, jsonb, uuid, boolean, text)        to authenticated;
grant execute on function public.import_kit_group_hours(jsonb, uuid, boolean)          to authenticated;
revoke execute on all functions in schema public from anon;
