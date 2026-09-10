-- 0015  Copy a costing, or one panel of it.
--
-- Most jobs are a version of a job already quoted. Until now the only copy in
-- the app was a revision, which stays inside one job: same number, same family,
-- the older revision superseded. A new enquiry for a similar board meant
-- building it again by hand.
--
-- A copy is a new job: its own number, its own family, revision 0, nothing
-- superseded, and the costing it came from untouched and unlinked.
--
-- **A copy re-prices at today's rates.** Every catalogue line is frozen again
-- through app.freeze_component, so it takes today's purchase price, today's
-- landed factor, today's copper rate and the company settings the new costing
-- has just frozen. Quoting a new customer at last year's copper price is
-- exactly the mistake this app exists to prevent. Typed lines keep the price
-- somebody typed, because nothing else knows what they cost. A line whose part
-- has since left the catalogue, or lost its price, is copied at the old price
-- and named in the report the function returns, so the engineer is given a
-- list rather than a silent wrong number.
--
-- Hours are the engineer's design, not a price, so they are copied as they
-- were; the rates they are multiplied by are the new costing's.

-- ---------------------------------------------------------------------------
-- 1. Writing history from an ordinary function
-- ---------------------------------------------------------------------------
-- costing_history is written by the status functions and read by everyone; a
-- signed-in user has no insert of their own, which is what makes it a log
-- rather than a notepad. This is the one way in, and it still checks that the
-- costing belongs to the caller's company.

create or replace function app.write_history(target uuid, action text, details jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.costings;
begin
  select * into c from public.costings
   where id = target and company_id = app.current_company_id();
  if c.id is null then raise exception 'no such costing'; end if;
  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (c.id, c.company_id, auth.uid(), action, details);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. One panel, copied and re-priced
-- ---------------------------------------------------------------------------
-- Not security definer: it prices through v_component_prices, which resolves
-- for the signed-in company, and every insert goes through the ordinary
-- policies, so a copy can only land in a draft the caller may edit.

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
     technical_description, enclosure_dimensions, sort_order, created_by)
  values
    (target_costing, dst.company_id,
     coalesce(nullif(btrim(coalesce(new_name, '')), ''), src.name),
     src.tag, src.option_label, src.uom, src.quantity,
     src.technical_description, src.enclosure_dimensions,
     coalesce((select max(sort_order) + 1 from public.costing_panels where costing_id = target_costing), 0),
     auth.uid())
  returning id into new_panel;

  for ca in
    select * from public.costing_assemblies where panel_id = source_panel order by sort_order
  loop
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, code, name, quantity,
       sort_order, created_by)
    values (target_costing, new_panel, dst.company_id, ca.kind, ca.section, ca.source_assembly_id,
            ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid())
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

comment on function app.copy_panel(uuid, uuid, text) is
  'Copies one panel into an editable draft of the same company, re-pricing every
   catalogue line at today''s rates. Returns {panel_id, repriced, kept}: kept
   lists the catalogue lines copied at their old price and why.';

-- ---------------------------------------------------------------------------
-- 3. A whole costing, copied as a new job
-- ---------------------------------------------------------------------------

create or replace function app.copy_costing(
  source uuid, new_title text default null, enquiry uuid default null)
returns jsonb
language plpgsql
as $$
declare
  src public.costings;
  fresh public.costings;
  pan record;
  report jsonb;
  repriced integer := 0;
  kept jsonb := '[]'::jsonb;
begin
  select * into src from public.costings
   where id = source and company_id = app.current_company_id();
  if src.id is null then raise exception 'no such costing'; end if;

  -- create_costing freezes today's company settings, issues the next number and
  -- writes the "created" line of the history. A copy is a new job, so it starts
  -- there rather than inheriting anything of the source's.
  fresh := app.create_costing(
    coalesce(nullif(btrim(coalesce(new_title, '')), ''), src.title || ' (copy)'),
    src.notes, enquiry);

  for pan in select id from public.costing_panels where costing_id = source order by sort_order
  loop
    report := app.copy_panel(pan.id, fresh.id, null);
    repriced := repriced + (report->>'repriced')::integer;
    kept := kept || (report->'kept');
  end loop;

  perform app.write_history(fresh.id, 'copied', jsonb_build_object(
    'from_costing_id', src.id, 'from_costing_no', src.costing_no,
    'from_revision_no', src.revision_no,
    'lines_repriced', repriced, 'lines_kept_at_the_old_price', jsonb_array_length(kept)));

  return jsonb_build_object(
    'costing_id', fresh.id, 'costing_no', fresh.costing_no, 'title', fresh.title,
    'from_costing_no', src.costing_no, 'repriced', repriced, 'kept', kept);
end;
$$;

comment on function app.copy_costing(uuid, text, uuid) is
  'Copies a costing as a new job: its own number and family, revision 0, today''s
   company settings and today''s prices; the source is untouched. Returns
   {costing_id, costing_no, title, from_costing_no, repriced, kept}.';

-- ---------------------------------------------------------------------------
-- 4. Wrappers and grants
-- ---------------------------------------------------------------------------

create or replace function public.copy_costing(
  source uuid, new_title text default null, enquiry uuid default null)
returns jsonb language sql
as $$ select app.copy_costing(source, new_title, enquiry) $$;

create or replace function public.copy_panel(
  source_panel uuid, target_costing uuid, new_name text default null)
returns jsonb language sql
as $$ select app.copy_panel(source_panel, target_costing, new_name) $$;

grant execute on function public.copy_costing(uuid, text, uuid) to authenticated;
grant execute on function public.copy_panel(uuid, uuid, text) to authenticated;
revoke execute on all functions in schema public from anon;
