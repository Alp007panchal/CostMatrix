-- 0010: the seed importer. Reference document §6; build order session 2.
--
-- Three functions take the rows of a CSV (as JSON), validate them, compare
-- them with what the library already holds and — only when apply is true —
-- write them, all inside one transaction. Called with apply = false they
-- return the same report without writing: that is the preview the screen
-- shows. One set of rules for the screen and for the test suite, which loads
-- the real data/seed files this way.

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

-- Catalogue prices carry up to four decimals (0.6305 EUR for a fuse link, which
-- is the workbook's 126.10 KES). Two decimals rounded them and every re-import
-- saw a change. The view depends on the column, so it is rebuilt around it.
drop view public.v_component_prices;
alter table public.components alter column purchase_price type numeric(14,4);
alter table public.costing_items alter column purchase_price type numeric(14,4);
alter table public.component_price_history
  alter column old_price type numeric(14,4),
  alter column new_price type numeric(14,4);

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
      then round(comp.purchase_price * cf.exchange_rate * cf.landed_factor
                 / nullif(co.exchange_rate, 0), 2)
    -- Master component: landed into KES, discounted, then into the company currency.
    else round(comp.purchase_price * cf.exchange_rate * cf.landed_factor
               * (1 - co.discount_pct / 100) / nullif(co.exchange_rate, 0), 2)
  end                     as unit_price,
  co.currency_code,
  co.currency_label,
  case when comp.company_id is null then 'master' else 'company' end as source,
  comp.purchase_currency,
  cf.exchange_rate        as factor_exchange_rate,
  cf.landed_factor,
  case when comp.pricing_mode = 'fixed'
       then round(comp.purchase_price * cf.exchange_rate * cf.landed_factor, 2) end as landed_price_kes,
  comp.is_enclosure_cubicle
from public.components comp
join public.component_categories cat on cat.code = comp.category_code
join public.companies co on co.id = app.current_company_id()
left join public.v_material_rates mr on mr.code = comp.material_rate_code
left join lateral (
  -- The company's own factor row for this currency if it has one, else the master's.
  select f.exchange_rate, f.landed_factor
  from public.currency_factors f
  where f.currency_code = comp.purchase_currency
    and (f.company_id = co.id or f.company_id is null)
  order by f.company_id nulls last
  limit 1
) cf on true;

comment on view public.v_component_prices is
  'Every component the signed-in company may use, priced as it would pay:
   purchase price × exchange rate × landed factor gives landed_price_kes; the
   company discount (master rows only) and the company currency follow.
   raw_price is the purchase price in purchase_currency, up to four decimals.';
grant select on public.v_component_prices to authenticated;

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
     purchase_price, purchase_currency, factor_exchange_rate, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, sort_order, created_by)
  select
    target_costing, new_line, target_company, p.id, p.code, p.name,
    p.category_code, p.unit, p.manufacturer, p.part_number, ac.quantity, p.pricing_mode,
    case when p.pricing_mode = 'fixed' then p.raw_price end,
    case when p.pricing_mode = 'fixed' then p.purchase_currency end,
    case when p.pricing_mode = 'fixed' then p.factor_exchange_rate end,
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

-- ---------------------------------------------------------------------------
-- 3. Components
-- ---------------------------------------------------------------------------

create or replace function app.import_components(
  rows jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  r record;
  cur public.components;
  n_new int := 0; n_changed int := 0; n_same int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]'; seen text[] := '{}';
  part text; price numeric; kg numeric; currency text; mode public.pricing_mode;
  placeholder boolean; cubicle boolean; cat text; description text; diffs jsonb; batch uuid;
begin
  perform app.assert_may_import(to_company);

  for r in
    select e.elem ->> 'part_number' as part_number, e.elem ->> 'name' as name,
           e.elem ->> 'bom_category' as bom_category, e.elem ->> 'brand' as brand,
           e.elem ->> 'unit' as unit, e.elem ->> 'purchase_price' as purchase_price,
           e.elem ->> 'purchase_currency' as purchase_currency, e.elem ->> 'kg_per_metre' as kg_per_metre,
           e.elem ->> 'is_enclosure_cubicle' as is_enclosure_cubicle, e.elem ->> 'is_placeholder' as is_placeholder,
           e.elem ->> 'flags' as flags,
           e.row_no + 1 as line   -- +1: the header is line 1 of the file
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    part := btrim(coalesce(r.part_number, ''));
    cat := lower(btrim(coalesce(r.bom_category, '')));
    price := app.parse_numeric(r.purchase_price);
    kg := app.parse_numeric(r.kg_per_metre);
    currency := upper(nullif(btrim(coalesce(r.purchase_currency, '')), ''));
    placeholder := app.parse_flag(r.is_placeholder) or (price is null and kg is null);
    cubicle := app.parse_flag(r.is_enclosure_cubicle);

    if part = '' or btrim(coalesce(r.name, '')) = '' then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'part number or name is blank');
      continue;
    elsif upper(part) = any (seen) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'part number appears twice in the file');
      continue;
    elsif not exists (select 1 from public.component_categories where code = cat) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', format('unknown category "%s"', cat));
      continue;
    elsif kg is not null and kg <= 0 or price is not null and price < 0 then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', 'price or kg per metre is not a positive number');
      continue;
    end if;
    seen := seen || upper(part);

    if kg is not null then
      mode := 'weight_rate'; price := null; currency := 'KES'; placeholder := false;
    else
      mode := 'fixed'; kg := null;
      currency := coalesce(currency, 'KES');
      if not exists (select 1 from public.currency_factors where company_id is null and currency_code = currency) then
        rejected := rejected || jsonb_build_object('row', r.line, 'key', part, 'reason', format('no exchange rate for currency %s', currency));
        seen := array_remove(seen, upper(part));
        continue;
      end if;
    end if;
    description := nullif(btrim(coalesce(r.flags, '')), '');

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
           is_enclosure_cubicle, is_placeholder, description, import_batch_id)
        values
          (to_company, cat, part, btrim(r.name), coalesce(nullif(btrim(r.unit), ''), 'pcs'),
           nullif(btrim(coalesce(r.brand, '')), ''), part, mode,
           price, currency, kg, case when mode = 'weight_rate' then 'copper_busbar' end,
           cubicle, placeholder, description, batch);
      end if;
    else
      diffs := '[]';
      if cur.name is distinct from btrim(r.name) then diffs := diffs || jsonb_build_object('field', 'name', 'from', cur.name, 'to', btrim(r.name)); end if;
      if cur.category_code is distinct from cat then diffs := diffs || jsonb_build_object('field', 'category', 'from', cur.category_code, 'to', cat); end if;
      if cur.manufacturer is distinct from nullif(btrim(coalesce(r.brand, '')), '') then diffs := diffs || jsonb_build_object('field', 'make', 'from', cur.manufacturer, 'to', btrim(r.brand)); end if;
      if cur.pricing_mode is distinct from mode then diffs := diffs || jsonb_build_object('field', 'pricing', 'from', cur.pricing_mode, 'to', mode); end if;
      if cur.purchase_price is distinct from price then diffs := diffs || jsonb_build_object('field', 'price', 'from', cur.purchase_price, 'to', price); end if;
      if cur.purchase_currency is distinct from currency then diffs := diffs || jsonb_build_object('field', 'currency', 'from', cur.purchase_currency, 'to', currency); end if;
      if cur.weight_per_unit is distinct from kg then diffs := diffs || jsonb_build_object('field', 'kg per metre', 'from', cur.weight_per_unit, 'to', kg); end if;
      if cur.is_enclosure_cubicle is distinct from cubicle then diffs := diffs || jsonb_build_object('field', 'cubicle', 'from', cur.is_enclosure_cubicle, 'to', cubicle); end if;
      if cur.is_placeholder is distinct from placeholder then diffs := diffs || jsonb_build_object('field', 'placeholder', 'from', cur.is_placeholder, 'to', placeholder); end if;
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
            name = btrim(r.name), category_code = cat,
            manufacturer = nullif(btrim(coalesce(r.brand, '')), ''),
            pricing_mode = mode, purchase_price = price, purchase_currency = currency,
            weight_per_unit = kg, material_rate_code = case when mode = 'weight_rate' then 'copper_busbar' end,
            is_enclosure_cubicle = cubicle, is_placeholder = placeholder,
            import_batch_id = batch
          where id = cur.id;
        end if;
      end if;
    end if;
  end loop;

  if apply and batch is not null then
    update public.import_batches set rows_new = n_new, rows_changed = n_changed,
      rows_unchanged = n_same, rows_rejected = jsonb_array_length(rejected),
      details = jsonb_build_object('rejected', rejected)
    where id = batch;
  end if;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'rejected', rejected, 'changes', changes, 'applied', apply, 'batch_id', batch);
end;
$$;

comment on function app.import_components(jsonb, uuid, boolean, text) is
  'Imports the rows of data/seed/components.csv. apply = false previews; apply =
   true writes, all or nothing. Never deletes.';

-- ---------------------------------------------------------------------------
-- 4. Kits, their groups and their lines
-- ---------------------------------------------------------------------------

create or replace function app.import_kits(
  rows jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  k record; cur public.assemblies; grp uuid; kit_id uuid;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_groups int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]'; warnings jsonb := '[]'; diffs jsonb; batch uuid;
  reason text; want text; have text;
begin
  perform app.assert_may_import(to_company);

  if to_regclass('pg_temp.kit_rows') is not null then drop table pg_temp.kit_rows; end if;
  if to_regclass('pg_temp.kit_lines') is not null then drop table pg_temp.kit_lines; end if;
  create temp table kit_rows on commit drop as
  select
    x.row_no + 1                                        as line,
    btrim(coalesce(x.kit_group, ''))                    as group_name,
    btrim(coalesce(x.kit_name, ''))                     as kit_name,
    app.kit_code(coalesce(x.kit_name, ''))              as code,
    app.parse_numeric(x.rating)                         as rating,
    upper(nullif(btrim(coalesce(x.rating_unit, '')), '')) as rating_unit,
    app.parse_numeric(x.poles)::int                     as poles,
    coalesce(app.parse_numeric(x.line_no)::int, x.row_no::int) as line_no,
    btrim(coalesce(x.part_number, ''))                  as part_number,
    app.parse_numeric(x.quantity)                       as quantity,
    app.parse_flag(x.is_main_device)                    as is_main,
    -- The owner's own part first, else the master's.
    (select c.id from public.components c
      where upper(c.code) = upper(btrim(coalesce(x.part_number, '')))
        and (c.company_id is null or c.company_id = to_company)
      order by c.company_id nulls last limit 1)         as component_id
  from (
    select e.row_no, e.elem ->> 'kit_group' as kit_group, e.elem ->> 'kit_name' as kit_name,
           e.elem ->> 'rating' as rating, e.elem ->> 'rating_unit' as rating_unit,
           e.elem ->> 'poles' as poles, e.elem ->> 'line_no' as line_no,
           e.elem ->> 'part_number' as part_number, e.elem ->> 'quantity' as quantity,
           e.elem ->> 'is_main_device' as is_main_device
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  ) x;

  -- The exports sometimes carry the same part twice in one kit (a line labelled
  -- with the wrong kit name). The kit still imports with the quantities added,
  -- and the report says so, because the fix belongs in the source file.
  create temp table kit_lines on commit drop as
  select code, component_id, sum(quantity) as quantity, bool_or(is_main) as is_main,
         min(line_no) as line_no, count(*) as copies, min(part_number) as part_number,
         min(kit_name) as kit_name, min(line) as line
  from kit_rows
  where component_id is not null
  group by code, component_id;

  for k in select * from kit_lines where copies > 1 order by line loop
    warnings := warnings || jsonb_build_object('row', k.line, 'key', k.kit_name,
      'reason', format('%s appears %s times in this kit; the quantities were added (%s)', k.part_number, k.copies, k.quantity));
  end loop;

  -- Groups first, so kits can point at them.
  for k in select distinct group_name from kit_rows where group_name <> '' loop
    if not exists (select 1 from public.kit_groups g
                   where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
                     and upper(g.name) = upper(k.group_name)) then
      n_groups := n_groups + 1;
      if apply then
        insert into public.kit_groups (company_id, name) values (to_company, k.group_name);
      end if;
    end if;
  end loop;

  for k in
    select code, min(kit_name) as kit_name, min(group_name) as group_name, min(line) as line,
           min(rating) as rating, min(rating_unit) as rating_unit, min(poles) as poles,
           count(*) as lines, count(*) filter (where is_main) as mains,
           count(*) filter (where component_id is null) as unknown,
           string_agg(part_number, ', ' order by line_no) filter (where component_id is null) as unknown_parts,
           count(*) filter (where quantity is null or quantity <= 0) as bad_qty,
           count(distinct kit_name) as names,
           bool_or(rating_unit not in ('A', 'KVAR')) as bad_unit,
           bool_or(poles not between 1 and 4) as bad_poles
    from kit_rows
    group by code
    order by min(line)
  loop
    reason := case
      when k.code = '' then 'kit name is blank'
      when k.mains = 0 then 'no main device: mark one line yes in is_main_device'
      when k.mains > 1 then format('%s lines marked as main device; a kit has one', k.mains)
      when k.unknown > 0 then format('part not in the library: %s', k.unknown_parts)
      when k.bad_qty > 0 then 'a quantity is missing or not positive'
      when k.bad_unit then 'rating unit must be A or KVAR'
      when k.bad_poles then 'poles must be 1 to 4'
      when k.names > 1 then 'two spellings of the name give the same kit code; make them one'
    end;
    if reason is not null then
      rejected := rejected || jsonb_build_object('row', k.line, 'key', k.kit_name, 'reason', reason);
      continue;
    end if;

    select g.id into grp from public.kit_groups g
    where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(g.name) = upper(k.group_name);
    -- In a preview the group may not exist yet; that is not a difference worth reporting.

    select * into cur from public.assemblies a
    where coalesce(a.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(a.code) = k.code;

    if cur.id is null then
      n_new := n_new + 1;
      if apply then
        if batch is null then
          insert into public.import_batches (company_id, user_id, target, file_name)
          values (to_company, auth.uid(), 'kits', file_name) returning id into batch;
        end if;
        insert into public.assemblies (company_id, code, name, kit_group_id, rating, rating_unit, poles)
        values (to_company, k.code, k.kit_name, grp, k.rating, k.rating_unit, k.poles)
        returning id into kit_id;
        insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device, sort_order)
        select kit_id, component_id, quantity, is_main, line_no from kit_lines where code = k.code;
      end if;
    else
      diffs := '[]';
      if cur.name is distinct from k.kit_name then diffs := diffs || jsonb_build_object('field', 'name', 'from', cur.name, 'to', k.kit_name); end if;
      if k.group_name <> '' and cur.kit_group_id is distinct from grp and (grp is not null or apply) then
        diffs := diffs || jsonb_build_object('field', 'group', 'from', (select name from public.kit_groups where id = cur.kit_group_id), 'to', k.group_name);
      end if;
      if cur.rating is distinct from k.rating then diffs := diffs || jsonb_build_object('field', 'rating', 'from', cur.rating, 'to', k.rating); end if;
      if cur.rating_unit is distinct from k.rating_unit then diffs := diffs || jsonb_build_object('field', 'rating unit', 'from', cur.rating_unit, 'to', k.rating_unit); end if;
      if cur.poles is distinct from k.poles then diffs := diffs || jsonb_build_object('field', 'poles', 'from', cur.poles, 'to', k.poles); end if;
      -- Lines: compare as sorted text so order does not count and quantities do.
      -- Quantities are compared at the table's own scale (12,3), so 6.5 and 6.500 agree.
      select string_agg(format('%s×%s%s', component_id, quantity::numeric(12,3), case when is_main then '*' end), ';' order by component_id) into want
      from kit_lines where code = k.code;
      select string_agg(format('%s×%s%s', component_id, quantity::numeric(12,3), case when is_main_device then '*' end), ';' order by component_id) into have
      from public.assembly_components where assembly_id = cur.id;
      if want is distinct from have then diffs := diffs || jsonb_build_object('field', 'lines', 'from', format('%s lines', (select count(*) from public.assembly_components where assembly_id = cur.id)), 'to', format('%s lines', (select count(*) from kit_lines where code = k.code))); end if;

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
          update public.assemblies set name = k.kit_name, kit_group_id = coalesce(grp, kit_group_id),
            rating = k.rating, rating_unit = k.rating_unit, poles = k.poles
          where id = cur.id;
          if want is distinct from have then
            delete from public.assembly_components where assembly_id = cur.id;
            insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device, sort_order)
            select cur.id, component_id, quantity, is_main, line_no from kit_lines where code = k.code;
          end if;
        end if;
      end if;
    end if;
  end loop;

  if apply and batch is not null then
    update public.import_batches set rows_new = n_new, rows_changed = n_changed,
      rows_unchanged = n_same, rows_rejected = jsonb_array_length(rejected),
      details = jsonb_build_object('rejected', rejected, 'groups_new', n_groups)
    where id = batch;
  end if;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'groups_new', n_groups, 'rejected', rejected, 'warnings', warnings, 'changes', changes,
    'applied', apply, 'batch_id', batch);
end;
$$;

comment on function app.import_kits(jsonb, uuid, boolean, text) is
  'Imports the lines of data/seed/kits.csv: kit groups, kits and their lines.
   A kit needs exactly one main device and every part in the library, or the
   whole kit is rejected; a part listed twice is merged and reported as a
   warning. Re-importing a changed kit replaces its lines and leaves its hours
   alone. Never deletes a kit.';

-- ---------------------------------------------------------------------------
-- 5. Kit group hours
-- ---------------------------------------------------------------------------

create or replace function app.import_kit_group_hours(rows jsonb, to_company uuid, apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  r record; grp uuid; hrs numeric; cur numeric;
  n_new int := 0; n_changed int := 0; n_same int := 0; n_blank int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]';
begin
  perform app.assert_may_import(to_company);

  for r in
    select e.elem ->> 'kit_group' as kit_group, e.elem ->> 'process_type' as process_type,
           e.elem ->> 'hours' as hours, e.row_no + 1 as line
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    if btrim(coalesce(r.hours, '')) = '' then n_blank := n_blank + 1; continue; end if;
    hrs := app.parse_numeric(r.hours);
    select g.id into grp from public.kit_groups g
    where coalesce(g.company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(g.name) = upper(btrim(coalesce(r.kit_group, '')));
    if grp is null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', r.kit_group, 'reason', 'no such kit group; import the kits first');
      continue;
    elsif not exists (select 1 from public.process_types where code = lower(btrim(coalesce(r.process_type, '')))) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', r.kit_group, 'reason', format('unknown process type "%s"', r.process_type));
      continue;
    elsif hrs is null or hrs < 0 then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', r.kit_group, 'reason', 'hours is not a number');
      continue;
    end if;

    select hours into cur from public.kit_group_labour
    where kit_group_id = grp and process_type = lower(btrim(r.process_type));
    if cur is null then n_new := n_new + 1;
    elsif cur = hrs then n_same := n_same + 1; continue;
    else
      n_changed := n_changed + 1;
      changes := changes || jsonb_build_object('key', r.kit_group, 'changes',
        jsonb_build_array(jsonb_build_object('field', r.process_type, 'from', cur, 'to', hrs)));
    end if;
    if apply then
      insert into public.kit_group_labour (kit_group_id, process_type, hours)
      values (grp, lower(btrim(r.process_type)), hrs)
      on conflict (kit_group_id, process_type) do update set hours = excluded.hours;
    end if;
  end loop;

  return jsonb_build_object('new', n_new, 'changed', n_changed, 'unchanged', n_same,
    'skipped_blank', n_blank, 'rejected', rejected, 'changes', changes, 'applied', apply, 'batch_id', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Public wrappers, the 0005 pattern
-- ---------------------------------------------------------------------------

create or replace function public.import_components(rows jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb language sql
as $$ select app.import_components(rows, to_company, apply, file_name) $$;

create or replace function public.import_kits(rows jsonb, to_company uuid, apply boolean, file_name text default null)
returns jsonb language sql
as $$ select app.import_kits(rows, to_company, apply, file_name) $$;

create or replace function public.import_kit_group_hours(rows jsonb, to_company uuid, apply boolean)
returns jsonb language sql
as $$ select app.import_kit_group_hours(rows, to_company, apply) $$;

grant execute on function public.import_components(jsonb, uuid, boolean, text)     to authenticated;
grant execute on function public.import_kits(jsonb, uuid, boolean, text)           to authenticated;
grant execute on function public.import_kit_group_hours(jsonb, uuid, boolean)      to authenticated;
revoke execute on all functions in schema public from anon;
