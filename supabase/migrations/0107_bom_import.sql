-- 0107  Importing somebody else's parts list (roadmap 2.3, advanced track)
--
-- A consultant sends a schedule, EPLAN exports a BOM, a customer attaches their
-- own list: rows of part numbers and quantities, in somebody else's format. This
-- reads such a file into the same review the price list uses (F9's import_jobs
-- and import_rows), matches each row to a part, and — where the matched device is
-- the main device of a kit — proposes the kit instead of the bare part, because a
-- kit is what this company costs with.
--
-- Nothing reaches a costing until a person applies it, and what is applied lands
-- on a new panel with `origin = import` and `origin_ref` = the job, so a year
-- later it is clear which lines were typed and which came out of a file.
--
-- No table changes. Every function is SECURITY INVOKER: the caller must already
-- be able to see the parts and edit the costing, and row-level security says so.

-- ===========================================================================
-- 0. Who may run a parts list
-- ===========================================================================
-- The import policies of 0102 were written for library imports, which are an
-- administrator's job. A parts list is not: it is how a costing engineer starts
-- a costing from somebody else's schedule, and the lines it creates are ordinary
-- costing lines the same person could have added by hand. So the two policies
-- gain one clause each — a `bom` job of this company, for somebody who may edit
-- costings — and nothing else about them changes. Adding a part to the library
-- is still an administrator's job, refused in `apply_bom_import` with a sentence
-- naming who can do it.

drop policy if exists import_jobs_write on public.import_jobs;
create policy import_jobs_write on public.import_jobs for all
  using ((company_id is null and app.is_master_admin())
      or (company_id = app.current_company_id() and app.has_role('company_admin'))
      or (type = 'bom' and company_id = app.current_company_id() and app.can_edit_costings()))
  with check ((company_id is null and app.is_master_admin())
      or (company_id = app.current_company_id() and app.has_role('company_admin'))
      or (type = 'bom' and company_id = app.current_company_id() and app.can_edit_costings()));

drop policy if exists import_rows_write on public.import_rows;
create policy import_rows_write on public.import_rows for all
  using (exists (select 1 from public.import_jobs j where j.id = job_id
                   and ((j.company_id is null and app.is_master_admin())
                     or (j.company_id = app.current_company_id() and app.has_role('company_admin'))
                     or (j.type = 'bom' and j.company_id = app.current_company_id() and app.can_edit_costings()))))
  with check (exists (select 1 from public.import_jobs j where j.id = job_id
                   and ((j.company_id is null and app.is_master_admin())
                     or (j.company_id = app.current_company_id() and app.has_role('company_admin'))
                     or (j.type = 'bom' and j.company_id = app.current_company_id() and app.can_edit_costings()))));

-- ===========================================================================
-- 1. Finding a part somebody else named
-- ===========================================================================
-- The same four attempts as a price list (0105), but over everything the caller
-- can see — the master catalogue and their company's own parts — because a BOM
-- names devices, not a supplier's list of one library.
create or replace function app.match_catalogue_row(key text, maker text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  k text := btrim(coalesce(key, ''));
  nk text := app.normalise_part_key(key);
  m text := nullif(btrim(coalesce(maker, '')), '');
  hit uuid;
  n integer;
  method text;
begin
  if k = '' then return jsonb_build_object('method', null, 'matches', 0); end if;

  for method in select unnest(array['code', 'part_number', 'manufacturer_part_number', 'part_number_loose']) loop
    select count(*), (array_agg(c.id))[1] into n, hit
    from public.components c
    where c.is_active
      and case method
            when 'code'                     then upper(c.code) = upper(k)
            when 'part_number'              then upper(coalesce(c.part_number, '')) = upper(k)
            when 'manufacturer_part_number' then m is not null
                                                 and upper(coalesce(c.manufacturer, '')) = upper(m)
                                                 and app.normalise_part_key(c.part_number) = nk
            else app.normalise_part_key(c.part_number) = nk
                 or app.normalise_part_key(c.code) = nk
          end;
    if n = 1 then
      return jsonb_build_object('component_id', hit, 'method', method, 'matches', 1);
    elsif n > 1 then
      return jsonb_build_object('method', method, 'matches', n);
    end if;
  end loop;

  return jsonb_build_object('method', null, 'matches', 0);
end;
$$;

-- Which kits have this component as their main device? One is the interesting
-- answer: the BOM named a device, and this company sells it as that kit.
create or replace function app.kits_with_main_device(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'kit_id', k.id, 'code', k.code, 'name', k.name,
           'group', k.group_name, 'line_count', k.line_count,
           'has_unpriced_part', k.has_unpriced_part) order by k.name), '[]'::jsonb)
  from public.v_kits k
  join public.assembly_components ac on ac.assembly_id = k.id and ac.is_main_device
  where ac.component_id = target and k.is_active
$$;

-- ===========================================================================
-- 2. The preview: one job, one row per line, nothing on the costing
-- ===========================================================================
-- rows: [{"row": 2, "key": "3VJ1216-3DB32", "maker": "SIEMENS",
--         "description": "160A TP MCCB", "qty": "3", "unit": "pcs"}]
create or replace function app.start_bom_import(
  target_costing uuid,
  file_name text,
  rows jsonb,
  mapping jsonb default '{}'::jsonb,
  document uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job uuid;
  c public.costings;
  r record;
  match jsonb;
  comp public.components;
  kits jsonb;
  qty numeric;
  row_status text;
  row_message text;
  proposal jsonb;
  counts jsonb;
begin
  select * into c from public.costings where id = target_costing;
  if c.id is null then raise exception 'no such costing, or it is not visible to you'; end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;
  if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'the file has no rows to read';
  end if;

  insert into public.import_jobs
    (company_id, user_id, type, document_id, file_name, status, column_mapping, summary, rows_total, created_by)
  values (c.company_id, auth.uid(), 'bom', document, file_name, 'preview',
          coalesce(mapping, '{}'::jsonb), jsonb_build_object('costing_id', target_costing),
          jsonb_array_length(rows), auth.uid())
  returning id into job;

  for r in
    select coalesce((e.elem ->> 'row')::integer, e.row_no::integer) as line,
           btrim(coalesce(e.elem ->> 'key', ''))                     as key,
           nullif(btrim(coalesce(e.elem ->> 'maker', '')), '')       as maker,
           nullif(btrim(coalesce(e.elem ->> 'description', '')), '') as description,
           e.elem ->> 'qty'                                          as qty,
           nullif(btrim(coalesce(e.elem ->> 'unit', '')), '')        as unit
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    comp := null; kits := '[]'::jsonb; proposal := null;
    row_status := null; row_message := null;
    -- A blank quantity is one, which is what a schedule without a column means.
    qty := coalesce(app.parse_numeric(r.qty), case when coalesce(btrim(r.qty), '') = '' then 1 end);

    match := app.match_catalogue_row(r.key, r.maker);
    if (match ->> 'component_id') is not null then
      select * into comp from public.components where id = (match ->> 'component_id')::uuid;
      kits := app.kits_with_main_device(comp.id);
    end if;

    if r.key = '' then
      row_status := 'rejected'; row_message := 'no part number in this row';
    elsif qty is null then
      row_status := 'rejected'; row_message := format('"%s" is not a quantity', coalesce(r.qty, ''));
    elsif qty <= 0 then
      row_status := 'rejected'; row_message := 'a quantity must be greater than zero';
    elsif (match ->> 'matches')::integer > 1 then
      row_status := 'warning';
      row_message := format('%s parts answer to "%s" — choose which one', match ->> 'matches', r.key);
    elsif comp.id is null then
      row_status := 'warning';
      row_message := format('"%s" is not in the catalogue — choose a part yourself, or add it as a placeholder for somebody to price', r.key);
    elsif jsonb_array_length(kits) = 1 then
      row_status := 'new';
      proposal := jsonb_build_object('kind', 'kit', 'ref_id', kits -> 0 ->> 'kit_id', 'name', kits -> 0 ->> 'name');
      row_message := format('this device is the main device of the kit "%s", which is what a costing uses', kits -> 0 ->> 'name');
    elsif jsonb_array_length(kits) > 1 then
      row_status := 'new';
      proposal := jsonb_build_object('kind', 'component', 'ref_id', comp.id, 'name', comp.name);
      row_message := format('%s kits use this device — pick one, or keep the part on its own', jsonb_array_length(kits));
    else
      row_status := 'new';
      proposal := jsonb_build_object('kind', 'component', 'ref_id', comp.id, 'name', comp.name);
      if comp.is_placeholder then
        row_message := 'matched, but this part has no price yet: it cannot be costed until somebody prices it';
      end if;
    end if;

    insert into public.import_rows (job_id, row_number, raw, matched_entity_id, match_method, status, message)
    values (job, r.line,
            jsonb_strip_nulls(jsonb_build_object(
              'key', r.key, 'maker', r.maker, 'description', r.description,
              'qty', qty, 'unit', r.unit,
              'component_id', comp.id, 'component_code', comp.code, 'component_name', comp.name,
              'is_placeholder', comp.is_placeholder,
              'kits', case when jsonb_array_length(kits) > 0 then kits end,
              'proposal', proposal)),
            comp.id, match ->> 'method', row_status, row_message);
  end loop;

  select jsonb_object_agg(ir.status, ir.n) into counts
  from (select status, count(*) as n from public.import_rows where job_id = job group by status) ir;
  update public.import_jobs
     set summary = summary || coalesce(counts, '{}'::jsonb)
   where id = job;

  return job;
end;
$$;

comment on function app.start_bom_import(uuid, text, jsonb, jsonb, uuid) is
  'Reads somebody else''s parts list into one import job for review: each row
   matched to a part, and to the kit that part is the main device of where there
   is one. Writes nothing to the costing.';

-- ===========================================================================
-- 3. Adding a line with its provenance
-- ===========================================================================
-- The same shape as 0104's apply_proposal_line, with the origin as an argument:
-- a line that came out of a file says `import`, not `manual`.
create or replace function app.add_line_with_origin(
  target_panel uuid, line_kind text, ref uuid, qty numeric, line_section text,
  line_origin text, line_origin_ref uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_line uuid;
  holder uuid;
  already uuid;
begin
  if line_kind = 'kit' then
    new_line := app.add_assembly_to_costing(target_panel, ref, qty, line_section);
    update public.costing_assemblies set origin = line_origin, origin_ref = line_origin_ref where id = new_line;
    update public.costing_items set origin = line_origin, origin_ref = line_origin_ref where costing_assembly_id = new_line;
    return jsonb_build_object('kind', 'kit', 'costing_assembly_id', new_line, 'ref_id', ref, 'qty', qty);

  elsif line_kind = 'component' then
    -- The engine adds to the quantity of a component already in that section
    -- rather than making a second line; a line somebody put there by hand keeps
    -- its own provenance, and the result says "merged" instead of claiming it.
    select i.id into already
    from public.costing_items i
    join public.costing_assemblies ca on ca.id = i.costing_assembly_id
    where ca.panel_id = target_panel and i.source_component_id = ref and not i.is_manual
      and ca.section is not distinct from line_section
    limit 1;

    new_line := app.add_component_to_costing(target_panel, ref, qty, line_section);
    select i.costing_assembly_id into holder from public.costing_items i where i.id = new_line;
    if already is distinct from new_line then
      update public.costing_items set origin = line_origin, origin_ref = line_origin_ref where id = new_line;
    end if;
    return jsonb_build_object('kind', 'component', 'costing_item_id', new_line, 'costing_assembly_id', holder,
                              'ref_id', ref, 'qty', qty, 'merged', already is not distinct from new_line);
  else
    raise exception 'a line is a kit or a component, not %', coalesce(line_kind, 'nothing');
  end if;
end;
$$;

-- ===========================================================================
-- 4. Apply: what a person chose, onto a panel of its own
-- ===========================================================================
-- decisions:
--   {"panel_name": "From the consultant's schedule",
--    "lines": [{"row_id": "<uuid>", "kind": "kit" | "component" | "placeholder" | "skip",
--               "ref_id": "<uuid, for kit and component>", "qty": 3, "section": "Outgoers",
--               "name": "...", "category": "switchgear"}]}      (name/category: placeholders)
create or replace function app.apply_bom_import(job uuid, decisions jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  j public.import_jobs;
  target_costing uuid;
  new_panel uuid;
  d jsonb;
  r public.import_rows;
  kind text;
  ref uuid;
  qty numeric;
  applied jsonb := '[]'::jsonb;
  outcome jsonb;
  made integer := 0;
  skipped integer := 0;
  placeholders integer := 0;
  remaining integer;
  counts jsonb;
begin
  select * into j from public.import_jobs where id = job;
  if j.id is null then raise exception 'no such import, or it is not visible to you'; end if;
  if j.type <> 'bom' then raise exception 'this is a % import, not a parts list', j.type; end if;
  if j.status <> 'preview' then raise exception 'this import is already %', j.status; end if;
  if not app.can_edit_costings() then raise exception 'you may not change costings'; end if;

  target_costing := (j.summary ->> 'costing_id')::uuid;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;
  if jsonb_typeof(decisions -> 'lines') is distinct from 'array'
     or jsonb_array_length(decisions -> 'lines') = 0 then
    raise exception 'nothing was chosen: pick at least one row to bring in';
  end if;

  -- The panel is made when the first line actually needs one: a run that only
  -- adds parts to the library leaves no empty panel behind.
  for d in select * from jsonb_array_elements(decisions -> 'lines') loop
    select * into r from public.import_rows where id = (d ->> 'row_id')::uuid and job_id = job;
    if r.id is null then raise exception 'a chosen row is not part of this import'; end if;
    kind := d ->> 'kind';
    qty := coalesce(nullif(d ->> 'qty', '')::numeric, (r.raw ->> 'qty')::numeric, 1);

    if kind = 'skip' then
      update public.import_rows set status = 'skipped', message = 'left out by the person importing' where id = r.id;
      skipped := skipped + 1;
      continue;
    end if;

    if kind = 'placeholder' then
      -- A part nobody has yet. Only an administrator may add to the library, so
      -- say that plainly rather than letting the policy refuse it in its own words.
      if not app.has_role('company_admin') then
        raise exception 'adding a new part to the library is a company administrator''s job; ask one to add "%", or leave the row out for now',
          coalesce(r.raw ->> 'key', 'it');
      end if;
      if exists (select 1 from public.components
                 where company_id = j.company_id and upper(code) = upper(coalesce(nullif(d ->> 'name', ''), r.raw ->> 'key'))) then
        raise exception 'the company library already has a part with the code "%"',
          coalesce(nullif(d ->> 'name', ''), r.raw ->> 'key');
      end if;
      insert into public.components
        (company_id, category_code, code, name, description, unit, manufacturer, part_number,
         pricing_mode, purchase_price, purchase_currency, is_placeholder)
      values (j.company_id,
              coalesce(nullif(d ->> 'category', ''), 'accessories_hardware'),
              coalesce(nullif(d ->> 'name', ''), r.raw ->> 'key'),
              coalesce(nullif(r.raw ->> 'description', ''), r.raw ->> 'key'),
              format('Added from %s', coalesce(j.file_name, 'an imported parts list')),
              coalesce(nullif(r.raw ->> 'unit', ''), 'pcs'),
              nullif(r.raw ->> 'maker', ''), r.raw ->> 'key',
              'fixed', null, 'KES', true)
      returning id into ref;
      placeholders := placeholders + 1;
      -- And there it stops. A part with no price cannot be costed — the engine
      -- refuses it, and should — so the row is done and the line waits until
      -- somebody prices the part on the Components screen.
      update public.import_rows
         set status = 'accepted', matched_entity_id = ref,
             message = 'added to the library as a placeholder; price it, then add it to the costing'
       where id = r.id;
      continue;
    end if;

    ref := nullif(d ->> 'ref_id', '')::uuid;
    if ref is null then raise exception 'a chosen row names no kit or part'; end if;

    if new_panel is null then
      insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
      values (target_costing, j.company_id,
              coalesce(nullif(decisions ->> 'panel_name', ''),
                       nullif(j.file_name, ''), 'Imported parts'),
              1, 'PC', (select count(*) from public.costing_panels where costing_id = target_costing))
      returning id into new_panel;
    end if;

    outcome := app.add_line_with_origin(new_panel, kind, ref, qty, nullif(d ->> 'section', ''), 'import', job);
    applied := applied || (outcome || jsonb_build_object('row_id', r.id, 'row_number', r.row_number));
    update public.import_rows
       set status = 'accepted',
           matched_entity_id = ref,
           message = format('brought in as a %s, quantity %s', outcome ->> 'kind', qty)
     where id = r.id;
    made := made + 1;
  end loop;

  if made = 0 and placeholders = 0 then
    raise exception 'nothing was brought in: every chosen row was left out';
  end if;

  select count(*) into remaining from public.import_rows where job_id = job and status in ('new', 'warning');
  select jsonb_object_agg(ir.status, ir.n) into counts
  from (select status, count(*) as n from public.import_rows where job_id = job group by status) ir;
  update public.import_jobs
     set summary = jsonb_strip_nulls(jsonb_build_object('costing_id', target_costing, 'panel_id', new_panel))
                   || coalesce(counts, '{}'::jsonb),
         status = case when remaining = 0 then 'applied' else 'preview' end,
         finished_at = case when remaining = 0 then now() else null end
   where id = job;

  perform app.write_activity('costing', target_costing, 'bom.imported', null,
    jsonb_build_object('job_id', job, 'panel_id', new_panel, 'file_name', j.file_name,
                       'lines', made, 'placeholders', placeholders, 'skipped', skipped),
    format('Brought in %s line(s) from %s', made, coalesce(j.file_name, 'a parts list')), 'user');

  return jsonb_build_object('costing_id', target_costing, 'panel_id', new_panel,
                            'lines', made, 'placeholders', placeholders, 'skipped', skipped,
                            'remaining', remaining,
                            'status', case when remaining = 0 then 'applied' else 'preview' end,
                            'applied', applied);
end;
$$;

comment on function app.apply_bom_import(uuid, jsonb) is
  'Brings the rows a person chose onto a new panel of the costing, through the
   ordinary engine functions, with origin = import and origin_ref = the job.
   A row can become a kit, a catalogue part, a new placeholder, or nothing.';

-- ===========================================================================
-- 5. Public wrappers and grants
-- ===========================================================================
create or replace function public.start_bom_import(
  target_costing uuid, file_name text, rows jsonb, mapping jsonb default '{}'::jsonb, document uuid default null)
returns uuid language plpgsql security invoker
as $$ begin return app.start_bom_import(target_costing, file_name, rows, mapping, document); end $$;

create or replace function public.apply_bom_import(job uuid, decisions jsonb)
returns jsonb language plpgsql security invoker
as $$ begin return app.apply_bom_import(job, decisions); end $$;

create or replace function public.match_catalogue_row(key text, maker text default null) returns jsonb
  language sql stable security invoker as $$ select app.match_catalogue_row(key, maker) $$;

create or replace function public.kits_with_main_device(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.kits_with_main_device(target) $$;

grant execute on function
  app.match_catalogue_row(text, text), public.match_catalogue_row(text, text),
  app.kits_with_main_device(uuid), public.kits_with_main_device(uuid),
  app.add_line_with_origin(uuid, text, uuid, numeric, text, text, uuid),
  app.start_bom_import(uuid, text, jsonb, jsonb, uuid), public.start_bom_import(uuid, text, jsonb, jsonb, uuid),
  app.apply_bom_import(uuid, jsonb), public.apply_bom_import(uuid, jsonb)
to authenticated;
