-- 0132  A revision carries the panel drawing.
--
-- `create_costing_revision` copies the costing, its rates, its panels, its kit
-- lines, its items and its labour — but never `panel_layouts`. A revision's
-- panels are new rows and a drawing hangs off a panel, so revising a costing
-- left every panel undrawn, and `pdf/ga.ts` gives a panel with no saved layout
-- no sheet: Annexure V disappeared from the revised quotation without a word.
--
-- WHY THIS IS NOT A ROW COPY. `panel_layouts.sections` is jsonb, and every
-- placement inside it carries a `costing_assembly_id`. The revision's kit lines
-- are NEW rows, so cloning the jsonb hands the new panel a drawing that points
-- at kit lines which do not exist on it. That drawing LOOKS right — the PDF
-- would render it — while the editor reads "0 of N placed" against every kit
-- and door-mounted devices match no section. So the ids are re-pointed through
-- `copied_assemblies`, the mapping the function already builds.
--
-- WHY IT IS BEHIND A SWITCH. A revision usually means the board has changed, so
-- a drawing carried forward can be a wrong drawing on a quotation, which is
-- worse than a missing one. `layout_follows_revision` is off by default; off is
-- the behaviour that shipped, exactly — the layout is not copied at all, rather
-- than copied and hidden.

-- ===========================================================================
-- 1. The switch
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('layout_follows_revision', 'A revision keeps the panel drawing',
   'When a costing is revised, each panel''s saved layout comes across to the new revision, with the devices re-pointed at the revision''s own kit lines, so the general-arrangement sheet stays on the quotation. Off, a revision starts undrawn and you draw it again — which is the safer default when the board has changed. It moves no price.',
   false, 'feature.layout_follows_revision', 200)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;

-- ===========================================================================
-- 2. Re-pointing the placements
-- ===========================================================================
-- Kept as a function of its own so the rule can be read, tested and reasoned
-- about without the four hundred lines of the revision around it.
--
-- A placement whose assembly has no mapping is DROPPED rather than carried. It
-- cannot happen while the revision copies every line, but a line dropped by some
-- later change would otherwise leave a device drawn over a kit that is not on
-- the costing — the same "looks right, is wrong" failure this whole migration
-- exists to avoid.

create or replace function app.remap_placements(placements jsonb, mapping jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(
    jsonb_set(p, '{costing_assembly_id}',
              to_jsonb(mapping ->> (p ->> 'costing_assembly_id')))
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(placements, '[]'::jsonb)) as p
  -- Dropped, not carried: a placement the mapping cannot re-point.
  where mapping ? (p ->> 'costing_assembly_id');
$$;

comment on function app.remap_placements(jsonb, jsonb) is
  'The placements of one face, re-pointed at the revision''s kit lines. Anything
   the mapping does not cover is dropped.';

create or replace function app.remap_layout_sections(sections jsonb, mapping jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(
    case
      when section ? 'faces' then jsonb_set(section, '{faces}', (
        select coalesce(jsonb_agg(
          case
            when face ? 'placements'
            then jsonb_set(face, '{placements}', app.remap_placements(face -> 'placements', mapping))
            else face
          end), '[]'::jsonb)
        from jsonb_array_elements(section -> 'faces') as face
      ))
      else section
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(sections, '[]'::jsonb)) as section;
$$;

comment on function app.remap_layout_sections(jsonb, jsonb) is
  'A saved layout''s sections with every placement''s costing_assembly_id replaced
   by the id the revision gave that kit line. `mapping` is {old_id: new_id}. A
   placement whose id is not in the mapping is dropped, never carried.';

-- ===========================================================================
-- 3. The revision itself
-- ===========================================================================
-- Recreated whole, as every earlier change to it has been. The only difference
-- from 0122 is the block marked 0132, just before the history line.

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

  -- The panel drawings, when the company has asked for them (0132).
  --
  -- Latest version of each old panel's layout, landing as version 1 on the new
  -- panel, with every placement re-pointed at the revision's own kit lines. Off,
  -- nothing is copied at all: a revision starts undrawn, exactly as before.
  if app.feature_on('layout_follows_revision', new_costing.company_id) then
    insert into public.panel_layouts
      (company_id, panel_id, version, sections, note, construction_code, created_by)
    select pl.company_id, cp.new_id, 1,
           app.remap_layout_sections(pl.sections, m.mapping),
           pl.note, pl.construction_code, auth.uid()
    from copied_panels cp
    join lateral (
      select * from public.panel_layouts l
       where l.panel_id = cp.old_id
       order by l.version desc
       limit 1
    ) pl on true
    cross join lateral (
      select coalesce(jsonb_object_agg(old_id::text, new_id::text), '{}'::jsonb) as mapping
      from copied_assemblies
    ) m;
  end if;

  perform app.write_history(new_costing.id, 'revised',
    jsonb_build_object('from_revision', old_costing.revision_no, 'to_revision', new_costing.revision_no));

  return new_costing;
end;
$$;

comment on function app.create_costing_revision(uuid) is
  'A revision of an approved costing: the same job, next revision number, back to
   draft, with every frozen figure copied — including, from 0122, the EPLAN project
   and drawing numbers, because a revision is the same board on the same drawings,
   and from 0132 each panel''s saved layout, re-pointed at the revision''s own kit
   lines, when `layout_follows_revision` is on for the company.';
