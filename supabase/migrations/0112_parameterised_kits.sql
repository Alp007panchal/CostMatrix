-- 0112  Kits that work out their own quantities (roadmap 3.3).
--
-- The foundations put `assembly_components.qty_expression` and the
-- `kit_parameters` table in 0100 and wrote plainly that nothing read them yet.
-- This is the engine reading them. It is what the APFC configurator (3.2) and
-- the guided board configurator (3.1) stand on, and on its own it turns busbar
-- metres from a number typed into 296 kits into one figure asked for once.
--
-- **Nothing about a kit that has no parameters changes.** Every line in the
-- library today has a fixed quantity and no expression, and the rule is the one
-- 0100 wrote down: no expression means use the quantity. The whole existing
-- suite passing unaltered — NPP-192 included — is the proof.
--
-- The expression is a formula somebody types into the library, so it is treated
-- as what it is: text from a person, evaluated behind a whitelist that admits
-- numbers, the four operators, brackets and five named functions, and nothing
-- else. The parameters are substituted first, so a name that survives into the
-- checked string is a name nobody defined, and the refusal says which.

-- ---------------------------------------------------------------------------
-- 1. Working out one quantity
-- ---------------------------------------------------------------------------

create or replace function app.eval_qty_expression(expression text, params jsonb default '{}'::jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  working text := btrim(coalesce(expression, ''));
  checked text;
  key text;
  value text;
  leftover text;
  result numeric;
begin
  if working = '' then raise exception 'the quantity formula is empty'; end if;

  -- Parameters first, longest name first so `steps` cannot eat `steps_spare`.
  for key, value in
    select k, v from jsonb_each_text(coalesce(params, '{}'::jsonb)) as t(k, v)
    order by length(k) desc
  loop
    if value is null or btrim(value) = '' then
      raise exception 'no value given for %', key;
    end if;
    if value !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception '% is not a number (%)', key, value;
    end if;
    working := regexp_replace(working, '\m' || key || '\M', '(' || value || ')', 'g');
  end loop;

  -- What is allowed to remain: digits, a decimal point, the four operators,
  -- brackets, commas and the five functions. Anything else is a name nobody
  -- defined or an attempt at something else entirely, and is named back.
  checked := regexp_replace(working, '\m(ceil|floor|round|greatest|least)\M', '', 'gi');
  leftover := (select (regexp_match(checked, '[A-Za-z_][A-Za-z0-9_]*'))[1]);
  if leftover is not null then
    raise exception 'the formula uses %, which is not one of this kit''s parameters', leftover;
  end if;
  if checked !~ '^[0-9\s.,+\-*/()]*$' then
    raise exception 'the formula has a character that is not allowed in it';
  end if;

  begin
    execute format('select (%s)::numeric', working) into result;
  exception when others then
    raise exception 'the quantity formula did not work out: %', replace(sqlerrm, E'\n', ' ');
  end;

  if result is null then raise exception 'the quantity formula came to nothing'; end if;
  if result <> result then raise exception 'the quantity formula came to not-a-number'; end if;
  if result < 0 then raise exception 'a quantity cannot be negative (the formula gave %)', result; end if;
  return round(result, 3);
end;
$$;

comment on function app.eval_qty_expression(text, jsonb) is
  'Works out one line quantity from a kit''s formula and the parameters somebody
   answered. The parameters are substituted first; what remains must be numbers,
   operators, brackets and ceil/floor/round/greatest/least, so an undefined name
   is refused by name rather than evaluated.';

-- ---------------------------------------------------------------------------
-- 2. What the engineer answered, frozen on the line
-- ---------------------------------------------------------------------------

alter table public.costing_assemblies
  add column if not exists parameters jsonb not null default '{}'::jsonb;

comment on column public.costing_assemblies.parameters is
  'The kit parameters this line was worked out from, frozen like every other
   figure on a costing. Empty for the kits that take none, which is all of them
   in the library today.';

-- Fills in the defaults, refuses a name the kit does not have and a figure
-- outside the range the kit allows. Returns what the line should record.
create or replace function app.kit_parameter_values(source_assembly uuid, given jsonb default null)
returns jsonb
language plpgsql
stable
as $$
declare
  wanted record;
  supplied jsonb := coalesce(given, '{}'::jsonb);
  answered jsonb := '{}'::jsonb;
  stray text;
  raw text;
  number numeric;
begin
  for stray in select k from jsonb_object_keys(supplied) as t(k) loop
    if not exists (select 1 from public.kit_parameters
                   where assembly_id = source_assembly and name = stray) then
      raise exception 'this kit has no parameter called %', stray;
    end if;
  end loop;

  for wanted in
    select * from public.kit_parameters where assembly_id = source_assembly order by sort_order, name
  loop
    raw := coalesce(supplied ->> wanted.name, wanted.default_value);
    if raw is null or btrim(raw) = '' then
      raise exception '% is needed before this kit can be added', wanted.name;
    end if;

    if wanted.value_type = 'number' then
      if raw !~ '^-?[0-9]+(\.[0-9]+)?$' then
        raise exception '% must be a number, not %', wanted.name, raw;
      end if;
      number := raw::numeric;
      if wanted.min_value is not null and number < wanted.min_value then
        raise exception '% must be at least %', wanted.name, wanted.min_value;
      end if;
      if wanted.max_value is not null and number > wanted.max_value then
        raise exception '% must be at most %', wanted.name, wanted.max_value;
      end if;
    end if;

    answered := answered || jsonb_build_object(wanted.name, raw);
  end loop;

  return answered;
end;
$$;

comment on function app.kit_parameter_values(uuid, jsonb) is
  'The parameters a kit will be added with: what was answered, over the kit''s
   own defaults, checked against its ranges. Refuses a name the kit does not
   have, so a typo cannot silently do nothing.';

-- ---------------------------------------------------------------------------
-- 3. The engine reads the formulas
-- ---------------------------------------------------------------------------
-- Derived from the 0101 text by insertion: the parameters are resolved once,
-- recorded on the line, and each component's quantity is its formula worked out
-- against them — or, where there is no formula, the quantity it always had.

drop function if exists app.add_assembly_to_costing(uuid, uuid, numeric, text);

create function app.add_assembly_to_costing(
  target_panel_id uuid,
  source_assembly uuid,
  qty numeric default 1,
  section text default null,
  params jsonb default null)
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
  answered jsonb;
  line_qty numeric;
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

  -- Defaults filled in and ranges checked before anything is written.
  answered := app.kit_parameter_values(source_assembly, params);

  insert into public.costing_assemblies
    (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
     code, name, quantity, parameters, created_by, sort_order, origin)
  values (target_costing, target_panel_id, target_company, 'kit', app.clean_section(section),
          a.id, a.version, a.code, a.name, qty, answered, auth.uid(),
          coalesce((select max(sort_order) + 1 from public.costing_assemblies
                    where panel_id = target_panel_id), 0),
          'kit')
  returning id into new_line;

  for ac in
    select component_id, quantity, qty_expression, sort_order from public.assembly_components
    where assembly_id = source_assembly order by sort_order
  loop
    -- 0100's rule, now kept: no formula means the quantity as it stands.
    line_qty := case
      when ac.qty_expression is null or btrim(ac.qty_expression) = '' then ac.quantity
      else app.eval_qty_expression(ac.qty_expression, answered)
    end;
    if line_qty > 0 then
      perform app.freeze_component(target_costing, new_line, target_company, ac.component_id,
                                   line_qty, ac.sort_order, 'kit');
    end if;
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

comment on function app.add_assembly_to_costing(uuid, uuid, numeric, text, jsonb) is
  'Copies a library kit into a panel at today''s prices and this costing''s frozen
   rates, into the named section, recording the kit version and the parameters it
   was worked out from. A line whose formula comes to zero is not written: a bank
   of four steps has four, not four and an empty fifth.';

-- ---------------------------------------------------------------------------
-- 4. A revision and a copy repeat the same answers
-- ---------------------------------------------------------------------------
-- Both list their columns by hand, which is how the frozen prices were lost once
-- (0011) and the sections nearly were (0014). Recreated here from the 0109 and
-- 0101 text with `parameters` inserted, nothing else touched.

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
    tax_pct, enclosure_uplift_pct, created_by, price_snapshot_at, chosen_option_label)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid(), price_snapshot_at, chosen_option_label
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
       technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
       sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
           sort_order, auth.uid()
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
       code, name, quantity, parameters, sort_order, created_by, origin, origin_ref)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.section, ca.source_assembly_id,
           ca.source_version, ca.code, ca.name, ca.quantity, ca.parameters, ca.sort_order, auth.uid(),
           ca.origin, ca.origin_ref
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
     landed_factor, uplift_pct, is_manual, sort_order, created_by, origin, origin_ref)
  select new_costing.id, cas.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.unit_price, i.purchase_price, i.purchase_currency, i.landed_factor, i.uplift_pct,
         i.is_manual, i.sort_order, auth.uid(), i.origin, i.origin_ref
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
     technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
     sort_order, created_by)
  values
    (target_costing, dst.company_id,
     coalesce(nullif(btrim(coalesce(new_name, '')), ''), src.name),
     src.tag, src.option_label, src.uom, src.quantity,
     src.technical_description, src.enclosure_dimensions, src.productivity_factor,
     src.parameters, src.is_option,
     coalesce((select max(sort_order) + 1 from public.costing_panels where costing_id = target_costing), 0),
     auth.uid())
  returning id into new_panel;

  for ca in
    select * from public.costing_assemblies where panel_id = source_panel order by sort_order
  loop
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, parameters, sort_order, created_by, origin, origin_ref)
    values (target_costing, new_panel, dst.company_id, ca.kind, ca.section, ca.source_assembly_id,
            ca.source_version, ca.code, ca.name, ca.quantity, ca.parameters, ca.sort_order, auth.uid(),
            ca.origin, ca.origin_ref)
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
                                     it.source_component_id, it.quantity, it.sort_order,
                                     it.origin, it.origin_ref);
        repriced := repriced + 1;
      else
        insert into public.costing_items
          (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
           category_code, unit, manufacturer, part_number, quantity, pricing_mode,
           purchase_price, purchase_currency, landed_factor,
           master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
           uplift_pct, unit_price, is_manual, sort_order, created_by, origin, origin_ref)
        values
          (target_costing, new_line, dst.company_id, it.source_component_id, it.code, it.name,
           it.category_code, it.unit, it.manufacturer, it.part_number, it.quantity, it.pricing_mode,
           it.purchase_price, it.purchase_currency, it.landed_factor,
           it.master_price_kes, it.discount_pct, it.exchange_rate, it.weight_per_unit, it.material_rate,
           it.uplift_pct, it.unit_price, it.is_manual, it.sort_order, auth.uid(),
           it.origin, it.origin_ref);

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

-- ---------------------------------------------------------------------------
-- 5. Wrappers and grants
-- ---------------------------------------------------------------------------

drop function if exists public.add_assembly_to_costing(uuid, uuid, numeric, text);

create function public.add_assembly_to_costing(
  target_panel_id uuid, source_assembly uuid, qty numeric default 1,
  section text default null, params jsonb default null)
returns uuid language sql
as $$ select app.add_assembly_to_costing(target_panel_id, source_assembly, qty, section, params) $$;

create or replace function public.kit_parameter_values(source_assembly uuid, given jsonb default null)
returns jsonb language sql stable
as $$ select app.kit_parameter_values(source_assembly, given) $$;

grant execute on function app.eval_qty_expression(text, jsonb)                         to authenticated;
grant execute on function app.kit_parameter_values(uuid, jsonb)                        to authenticated;
grant execute on function public.kit_parameter_values(uuid, jsonb)                     to authenticated;
grant execute on function app.add_assembly_to_costing(uuid, uuid, numeric, text, jsonb) to authenticated;
grant execute on function public.add_assembly_to_costing(uuid, uuid, numeric, text, jsonb) to authenticated;
revoke execute on all functions in schema public from anon;
