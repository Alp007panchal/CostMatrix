-- 0122  EPLAN project metadata on the costing (roadmap 4.3).
--
-- The drawing office works in EPLAN; the costing is here. Three small things let
-- the two refer to the same job without either pretending to be the other:
--
--   · the **project name** and the **drawing numbers** on the costing, so every
--     export can carry them and a person can find the drawing from the quotation;
--   · a paste-in **import** of an EPLAN project export, proposed before it is
--     applied, like every other import in this app;
--   · the **device tags** the exports use, which are already numbered by the
--     panel layout (0120/0121) — so Q1 on the GA drawing, Q1 in the technical
--     offer and Q1 in the EPLAN parts list are the same device by construction.
--
-- **Nothing here changes a price.** Two text columns and a note in the history.
-- NPP-192 is untouched.
--
-- The one thing that had to be got right: `create_costing_revision` lists the
-- columns it copies **by hand**, and that list has silently dropped frozen data
-- twice before (0011, 0014). Both new columns are added to it, and the test
-- asserts a revision carries them. A **copy** deliberately does not carry them: a
-- copy is a different job and will have its own drawings.

-- ===========================================================================
-- 1. The two fields
-- ===========================================================================

alter table public.costings
  add column if not exists eplan_project text,
  add column if not exists drawing_numbers text;

comment on column public.costings.eplan_project is
  'The EPLAN project this board is drawn in, as the drawing office names it.
   Free text: it is their reference, not ours to validate (roadmap 4.3).';
comment on column public.costings.drawing_numbers is
  'The drawing numbers for this job, one per line or comma-separated as the
   engineer keeps them. Printed on the exports so a quotation can be traced to a
   drawing.';

-- ===========================================================================
-- 2. Setting them
-- ===========================================================================
-- Only on a costing still open for editing, and every change is in the history,
-- because a drawing number on an approved quotation is a fact about the job.

create or replace function app.set_eplan_metadata(
  target uuid, project text, drawings text)
returns public.costings
language plpgsql
as $$
declare
  before_project text;
  before_drawings text;
  updated public.costings;
begin
  select c.eplan_project, c.drawing_numbers into before_project, before_drawings
  from public.costings c
  where c.id = target and c.company_id = app.current_company_id();
  if not found then raise exception 'no such costing'; end if;

  if not app.costing_is_editable(target) then
    raise exception 'this costing is not open for editing';
  end if;

  update public.costings c
     set eplan_project  = nullif(btrim(coalesce(project, '')), ''),
         drawing_numbers = nullif(btrim(coalesce(drawings, '')), ''),
         updated_at = now()
   where c.id = target
  returning * into updated;

  -- Only worth a history line when something actually moved.
  if coalesce(before_project, '') is distinct from coalesce(updated.eplan_project, '')
     or coalesce(before_drawings, '') is distinct from coalesce(updated.drawing_numbers, '') then
    perform app.write_history(target, 'eplan_metadata', jsonb_build_object(
      'from', jsonb_build_object('project', before_project, 'drawings', before_drawings),
      'to', jsonb_build_object('project', updated.eplan_project, 'drawings', updated.drawing_numbers)));
  end if;

  return updated;
end;
$$;

comment on function app.set_eplan_metadata(uuid, text, text) is
  'The EPLAN project and drawing numbers for a costing. Draft only, recorded in
   the history, and it moves no price (roadmap 4.3).';

-- ===========================================================================
-- 3. Reading them out of an EPLAN export
-- ===========================================================================
-- EPLAN projects export as key/value pairs, and which keys a house uses varies.
-- So this reads the *shapes* rather than one schema: anything that looks like
-- `key: value` or `key=value` or a two-column CSV row, then matches the key
-- against the names EPLAN actually uses for each field. What it cannot match it
-- reports rather than swallowing, and it proposes before it writes.

create or replace function app.import_eplan_metadata(
  target uuid, pasted text, apply boolean default false)
returns jsonb
language plpgsql
as $$
declare
  line text;
  key text;
  value text;
  found_project text := null;
  found_drawings text[] := '{}';
  unmatched jsonb := '[]'::jsonb;
  saw integer := 0;
begin
  if not exists (select 1 from public.costings c
                  where c.id = target and c.company_id = app.current_company_id()) then
    raise exception 'no such costing';
  end if;

  for line in select btrim(l) from regexp_split_to_table(coalesce(pasted, ''), E'\r?\n') as l loop
    if line = '' then continue; end if;
    saw := saw + 1;

    -- key: value · key=value · key,value · key;value · key<tab>value
    key := btrim(lower((regexp_match(line, '^([^:=,;\t]+)\s*[:=,;\t]\s*(.*)$'))[1]));
    value := btrim((regexp_match(line, '^([^:=,;\t]+)\s*[:=,;\t]\s*(.*)$'))[2]);
    -- A trailing comma or quote is a CSV artefact, not part of the value.
    value := btrim(btrim(coalesce(value, ''), ','), '"');

    if key is null or value = '' then
      unmatched := unmatched || jsonb_build_array(jsonb_build_object(
        'line', line, 'why', 'no key and value could be read from this line'));
      continue;
    end if;

    if key in ('project', 'project name', 'projectname', 'eplan project', 'eplan_project',
               'projekt', 'project description', 'pro_projectname') then
      found_project := coalesce(found_project, value);
    elsif key in ('drawing', 'drawing no', 'drawing no.', 'drawing number', 'drawing numbers',
                  'dwg', 'dwg no', 'sheet', 'sheet name', 'page', 'page name', 'pagename',
                  'drawing_no', 'zeichnungsnummer') then
      found_drawings := found_drawings || value;
    else
      unmatched := unmatched || jsonb_build_array(jsonb_build_object(
        'line', line, 'why', format('"%s" is not a field this reads', key)));
    end if;
  end loop;

  if apply then
    if not app.costing_is_editable(target) then
      raise exception 'this costing is not open for editing';
    end if;
    perform app.set_eplan_metadata(
      target,
      coalesce(found_project, (select eplan_project from public.costings where id = target)),
      case when cardinality(found_drawings) > 0
           then array_to_string(found_drawings, E'\n')
           else (select drawing_numbers from public.costings where id = target) end);
  end if;

  return jsonb_build_object(
    'costing_id', target,
    'applied', apply,
    'lines_read', saw,
    'project', found_project,
    'drawings', found_drawings,
    -- Named, never swallowed: a line this does not understand is shown back.
    'unmatched', unmatched,
    'why', case
      when saw = 0 then 'nothing was pasted'
      when found_project is null and cardinality(found_drawings) = 0
        then 'none of these lines carried a project name or a drawing number'
      else format('read %s project name(s) and %s drawing number(s)',
                  case when found_project is null then 0 else 1 end,
                  cardinality(found_drawings)) end);
end;
$$;

comment on function app.import_eplan_metadata(uuid, text, boolean) is
  'Reads an EPLAN project export pasted in as text — key/value or two-column —
   and proposes the project name and drawing numbers it found. Writes only when
   asked, and reports every line it could not read (roadmap 4.3).';

-- ===========================================================================
-- 4. The parts list the drawing office can import
-- ===========================================================================
-- One row per frozen costing line, carrying what a parts-management import wants:
-- the manufacturer's part number, the make, the description, how many, and — where
-- the panel has been laid out — the **device tag** the drawing gives it.
--
-- It reads the frozen lines, not the library, so an old costing exports what was
-- actually quoted rather than what the catalogue says today.

create or replace view public.v_eplan_parts
with (security_invoker = true)
as
with tagged as (
  -- The tags the layout numbered, in the order the GA sheet draws them: every
  -- placement of every face of every section, front faces first (0121).
  select
    pl.panel_id,
    (p.placement ->> 'costing_assembly_id')::uuid as costing_assembly_id,
    'Q' || row_number() over (
      partition by pl.panel_id
      order by s.ord, f.ord, p.ord) as device_tag
  from public.panel_layouts pl
  join lateral (
    select ord, value from jsonb_array_elements(pl.sections) with ordinality as t(value, ord)
  ) s on true
  join lateral (
    select ord, value from jsonb_array_elements(coalesce(s.value -> 'faces', '[]'::jsonb))
      with ordinality as t(value, ord)
  ) f on true
  join lateral (
    select ord, value as placement
    from jsonb_array_elements(coalesce(f.value -> 'placements', '[]'::jsonb))
      with ordinality as t(value, ord)
  ) p on true
  where pl.version = (
    select max(v.version) from public.panel_layouts v where v.panel_id = pl.panel_id)
)
select
  ci.costing_id,
  ci.company_id,
  ca.panel_id,
  cp.name                as panel,
  cp.quantity            as panel_quantity,
  ca.section,
  ca.name                as kit,
  t.device_tag,
  ci.part_number,
  ci.manufacturer,
  ci.name                as description,
  ci.code,
  ci.category_code,
  ci.quantity,
  ci.unit,
  c.mounting_type,
  c.width_mm,
  c.height_mm,
  c.depth_mm,
  c.weight_kg
from public.costing_items ci
join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
join public.costing_panels cp on cp.id = ca.panel_id
left join public.components c on c.id = ci.source_component_id
left join tagged t on t.panel_id = ca.panel_id and t.costing_assembly_id = ca.id;

comment on view public.v_eplan_parts is
  'One row per frozen costing line for a parts-management import: part number,
   make, description, quantity, the physical size where the library has it, and
   the device tag the panel layout gave the kit it belongs to — so the drawing,
   the technical offer and this list name the same device (roadmap 4.3).';

grant select on public.v_eplan_parts to authenticated;

-- ===========================================================================
-- 5. A revision carries the drawing numbers; a copy does not
-- ===========================================================================
-- `create_costing_revision` is re-derived from 0112 with the two new columns
-- appended — the hand-written list that has dropped frozen data twice. Everything
-- else below this line is 0112's text, unchanged.
--
-- A **copy** goes through `create_costing`, which starts a new job with nothing of
-- the source's. That is right here: a copy is a different board and will carry its
-- own drawings, so it starts with none rather than inheriting someone else's.

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
    tax_pct, enclosure_uplift_pct, created_by, price_snapshot_at, chosen_option_label,
    eplan_project, drawing_numbers)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid(), price_snapshot_at, chosen_option_label,
         eplan_project, drawing_numbers
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

comment on function app.create_costing_revision(uuid) is
  'A revision of an approved costing: the same job, next revision number, back to
   draft, with every frozen figure copied — including, from 0122, the EPLAN project
   and drawing numbers, because a revision is the same board on the same drawings.';

-- ===========================================================================
-- 6. A switch of its own, and the wrappers
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('eplan_exports', 'EPLAN and Word exports',
   'Carry the EPLAN project name and drawing numbers on the costing, export the technical offer as an editable Word document, and export the parts list for the drawing office to import — with the same device tags the panel layout draws. It changes no price.',
   false, 'feature.eplan_exports', 180)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;

create or replace function public.set_eplan_metadata(target uuid, project text, drawings text)
returns public.costings language sql as $$
  select app.set_eplan_metadata(target, project, drawings)
$$;

create or replace function public.import_eplan_metadata(
  target uuid, pasted text, apply boolean default false)
returns jsonb language sql as $$
  select app.import_eplan_metadata(target, pasted, apply)
$$;

grant execute on function app.set_eplan_metadata(uuid, text, text)            to authenticated;
grant execute on function public.set_eplan_metadata(uuid, text, text)         to authenticated;
grant execute on function app.import_eplan_metadata(uuid, text, boolean)      to authenticated;
grant execute on function public.import_eplan_metadata(uuid, text, boolean)   to authenticated;
revoke execute on all functions in schema public from anon;
