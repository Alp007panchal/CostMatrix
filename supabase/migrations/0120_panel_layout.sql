-- 0120  The panel layout, stage one (roadmap 3.8, `docs/reference/panel-layout-spec.md`).
--
-- Stage one is the front view: the sections a board needs, the kits arranged on
-- them by the rules of their mounting design, a verdict per section, and the
-- enclosure line the layout says the costing should carry. The rear and 3D
-- views, the door, and the GA sketch are stage two, once a person has seen this
-- one on screen.
--
-- What is here is the part that has to be right rather than pretty: the
-- arithmetic. It lives in the database, so the figure the canvas draws is the
-- figure the costing would be given, and so it can be tested without a browser.
--
-- **Nothing here changes a price by itself.** Arranging and saving write no
-- costing line; only `apply_layout_enclosure` does, and only when a person asks,
-- through the ordinary component function. NPP-192 is untouched.
--
-- Two honest limits, both said out loud on the screen as well as here:
--   · the usable height of a device compartment is **assumed 1,500 mm** until
--     the S4 dimension drawings are read (sivacon-s4-construction.md §5); it is
--     a company setting, so correcting it is a number, not a deploy;
--   · a kit with no mounting design or no module height is placed as **unsized**
--     and its section reads *unknown* — never *fits* (spec §6).

-- ===========================================================================
-- 1. The numbers the rules need, as settings rather than constants
-- ===========================================================================

insert into public.company_options (company_id, key, value, value_type)
select c.id, k.key, k.value, 'number'
from public.companies c
cross join (values
  -- Spec §4 and the mockups: 2,000 mm structure less the busbar chamber and the
  -- cable space. To be confirmed from the dimension drawings.
  ('layout_device_compartment_mm', '1500'::jsonb),
  ('layout_vertical_busbar_mm',    '150'::jsonb),
  ('layout_cable_alley_mm',        '200'::jsonb),
  -- A DIN module is 18 mm; a device beside another wants a little air.
  ('layout_mcb_module_mm',         '18'::jsonb),
  ('layout_device_clearance_mm',   '10'::jsonb)
) as k(key, value)
on conflict (company_id, key) do nothing;

create or replace function app.layout_setting(option_key text, fallback numeric)
returns numeric
language sql
stable
as $$
  select coalesce((app.company_option(option_key, to_jsonb(fallback)) #>> '{}')::numeric, fallback)
$$;

comment on function app.layout_setting(text, numeric) is
  'One of the layout''s measurements for the signed-in company, with the figure
   the app ships as the fallback. Everything the arrangement rules use is here
   rather than in code, because every one of them is the owner''s to correct.';

-- ===========================================================================
-- 2. What is on the panel, as the layout sees it
-- ===========================================================================
-- One row per kit line, carrying what 0119 put on the kit. A line whose kit says
-- nothing is still listed — it has to be shown as unsized rather than dropped.

create or replace view public.v_panel_layout_kits
with (security_invoker = true)
as
select
  ca.id            as costing_assembly_id,
  ca.panel_id,
  ca.costing_id,
  ca.company_id,
  ca.name,
  ca.section       as costing_section,
  ca.quantity,
  a.id             as assembly_id,
  a.mounting_design,
  a.module_height_mm,
  a.positions_per_plate,
  a.footprint_w_mm,
  a.footprint_h_mm,
  a.rating,
  a.rating_unit,
  -- Everything the rules need before this line can be placed.
  (a.mounting_design is not null
   and (a.mounting_design = 'side_by_side_plates' or a.module_height_mm is not null)) as is_sized
from public.costing_assemblies ca
join public.assemblies a on a.id = ca.source_assembly_id
where ca.kind = 'kit';

comment on view public.v_panel_layout_kits is
  'The kits on a panel with what the layout needs to place each one — mounting
   design, module height, positions per plate, footprint — and whether that is
   enough to place it at all (roadmap 3.8).';

grant select on public.v_panel_layout_kits to authenticated;

-- ===========================================================================
-- 3. How much a section of each design holds
-- ===========================================================================
-- One function per question, so the canvas, the verdict and the tests all ask
-- the same one. Capacity is in the unit that design counts in: covers for
-- `mccb_plates`, positions for a side-by-side plate, kVAr for compensation.

create or replace function app.section_capacity(
  design public.mounting_design,
  width_mm integer,
  busbar_compartment_mm integer default 0,
  construction text default 'S4')
returns jsonb
language plpgsql
stable
as $$
declare
  compartment numeric := app.layout_setting('layout_device_compartment_mm', 1500);
  vbb numeric := app.layout_setting('layout_vertical_busbar_mm', 150);
  alley numeric := app.layout_setting('layout_cable_alley_mm', 200);
  module numeric := app.layout_setting('layout_mcb_module_mm', 18);
  kvar numeric;
  plate_w numeric;
begin
  if design is null or width_mm is null or width_mm <= 0 then
    return jsonb_build_object('unit', 'unknown', 'capacity', null,
      'why', 'a section needs a design and a width before it holds anything');
  end if;

  -- What is left of the section once the busbar has its space and the cables
  -- theirs (spec §3). Where the construction gives the distribution busbar a
  -- compartment of its own — 200 mm on an S4 feeder section — that compartment
  -- *is* the vertical busbar, so the two are never counted twice.
  plate_w := greatest(width_mm - greatest(coalesce(busbar_compartment_mm, 0), vbb) - alley, 0);

  if design = 'busbar_fed' then
    -- The device takes the section; two can stack if their heights fit.
    return jsonb_build_object('unit', 'mm of height', 'capacity', compartment,
      'plate_width_mm', width_mm,
      'why', format('a busbar-fed section is %s mm of compartment height', compartment));
  elsif design = 'mccb_plates' then
    return jsonb_build_object('unit', 'mm of height', 'capacity', compartment,
      'plate_width_mm', plate_w,
      'why', format('covers stack down %s mm of compartment, beside a %s mm busbar space and a %s mm cable alley',
                    compartment, greatest(coalesce(busbar_compartment_mm, 0), vbb), alley));
  elsif design in ('side_by_side_plates', 'compensation') then
    if design = 'compensation' then
      select lc.kvar_per_section into kvar
      from public.layout_constructions lc
      where lc.code = construction and (lc.company_id = app.current_company_id() or lc.company_id is null)
      order by lc.company_id nulls last limit 1;
    end if;
    return jsonb_build_object(
      'unit', case when design = 'compensation' then 'kVAr' else 'positions' end,
      -- Positions across one plate, and the plates that stack down the section.
      'positions_per_plate', floor(plate_w / nullif(module, 0)),
      'plate_width_mm', plate_w,
      'capacity', case when design = 'compensation' then kvar else floor(plate_w / nullif(module, 0)) end,
      'compartment_mm', compartment,
      'why', case
        when design = 'compensation' and kvar is null
          then 'this construction has no kVAr per section on record, so a correction section cannot be judged'
        when design = 'compensation'
          then format('%s kVAr per section, from the %s list', kvar, construction)
        else format('%s mm of plate at %s mm a module', plate_w, module) end);
  end if;

  return jsonb_build_object('unit', 'unknown', 'capacity', null,
    'why', format('no capacity rule for %s yet', design));
end;
$$;

comment on function app.section_capacity(public.mounting_design, integer, integer, text) is
  'What one section of a design and width holds, in the unit that design counts
   in, and the sentence explaining the figure. Every number in it is a company
   setting (spec §3).';

-- ===========================================================================
-- 4. Arranging a panel, deterministically and explicably
-- ===========================================================================
-- Writes nothing. The rule that put each kit where it is comes back with it, so
-- an engineer can disagree with a reason rather than with a black box (spec §6).

create or replace function app.arrange_panel(target_panel uuid, construction text default 'S4')
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  con record;
  k record;
  compartment numeric := app.layout_setting('layout_device_compartment_mm', 1500);
  sections jsonb := '[]'::jsonb;
  explain jsonb := '[]'::jsonb;
  unsized jsonb := '[]'::jsonb;
  placements jsonb;
  used numeric;
  section_no integer := 0;
  width integer;
  unit integer;
  label text;
  kvar_used numeric := 0;
  kvar_limit numeric;
begin
  select cp.id, cp.costing_id, cp.company_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;

  select * into con from public.layout_constructions lc
  where lc.code = construction
    and (lc.company_id = app.current_company_id() or lc.company_id is null)
  order by lc.company_id nulls last limit 1;
  if con.code is null then
    raise exception 'this library has no construction called % — the widths and depths are kept on the Constructions list', construction;
  end if;
  if cardinality(con.widths_mm) = 0 then
    raise exception '% has no widths on record yet; fill its list in before a board can be laid out in it', construction;
  end if;

  -- Busbar-fed kits: a section each, at the narrowest width that holds them.
  for k in
    select * from public.v_panel_layout_kits
    where panel_id = target_panel and mounting_design = 'busbar_fed'
    order by rating desc nulls last, name
  loop
    for unit in 1 .. greatest(k.quantity::integer, 1) loop
      section_no := section_no + 1;
      width := app.layout_width_for(con.widths_mm, k.footprint_w_mm);
      placements := jsonb_build_array(jsonb_build_object(
        'costing_assembly_id', k.costing_assembly_id, 'face', 'front',
        'name', k.name, 'slot', 0,
        'height_mm', k.module_height_mm, 'unsized', not k.is_sized));
      sections := sections || jsonb_build_array(jsonb_build_object(
        'name', format('S%s', section_no), 'width_mm', width,
        'busbar_compartment_mm', 0, 'access', 'single_front',
        'design', 'busbar_fed',
        'faces', jsonb_build_array(jsonb_build_object(
          'side', 'front', 'connection', 'front', 'design', 'busbar_fed',
          'placements', placements))));
      explain := explain || jsonb_build_array(jsonb_build_object(
        'section', format('S%s', section_no), 'why',
        format('%s takes a section of its own: a busbar-fed device is connected straight to the horizontal busbar', k.name)));
      if not k.is_sized then
        unsized := unsized || jsonb_build_array(jsonb_build_object(
          'name', k.name, 'why', case when k.mounting_design is null
            then 'no mounting design on the kit' else 'no module height on the kit' end));
      end if;
    end loop;
  end loop;

  -- MCCB covers: stacked down a section until the compartment is full.
  used := 0; placements := '[]'::jsonb; label := null;
  for k in
    select * from public.v_panel_layout_kits
    where panel_id = target_panel and mounting_design = 'mccb_plates'
    order by module_height_mm desc nulls last, rating desc nulls last, name
  loop
    for unit in 1 .. greatest(k.quantity::integer, 1) loop
      if not k.is_sized then
        unsized := unsized || jsonb_build_array(jsonb_build_object(
          'name', k.name, 'why', 'no module height on the kit, so no cover can be counted for it'));
        continue;
      end if;
      if label is null or used + k.module_height_mm > compartment then
        -- Close the section that is full and start another.
        if label is not null then
          sections := sections || jsonb_build_array(app.layout_section(
            label, app.layout_width_for(con.widths_mm, null), 200, 'mccb_plates', placements));
        end if;
        section_no := section_no + 1;
        label := format('S%s', section_no);
        used := 0; placements := '[]'::jsonb;
        explain := explain || jsonb_build_array(jsonb_build_object(
          'section', label, 'why',
          format('an outgoing feeder section: a %s mm distribution-busbar compartment beside a device compartment of covers', 200)));
      end if;
      placements := placements || jsonb_build_array(jsonb_build_object(
        'costing_assembly_id', k.costing_assembly_id, 'face', 'front',
        'name', k.name, 'slot', jsonb_array_length(placements),
        'height_mm', k.module_height_mm, 'y_mm', used, 'unsized', false));
      used := used + k.module_height_mm;
    end loop;
  end loop;
  if label is not null then
    sections := sections || jsonb_build_array(app.layout_section(
      label, app.layout_width_for(con.widths_mm, null), 200, 'mccb_plates', placements));
  end if;

  -- Side-by-side devices, and correction, each into a section of their own kind.
  for k in
    select mounting_design, sum(quantity) as quantity,
           bool_and(is_sized) as sized,
           sum(case when rating_unit = 'KVAR' then coalesce(rating, 0) * quantity else 0 end) as kvar
    from public.v_panel_layout_kits
    where panel_id = target_panel and mounting_design in ('side_by_side_plates', 'compensation', 'meter_board_plate', 'inline_3nj6')
    group by mounting_design
    order by mounting_design
  loop
    section_no := section_no + 1;
    label := format('S%s', section_no);
    width := app.layout_width_for(con.widths_mm, null);
    select jsonb_agg(jsonb_build_object(
             'costing_assembly_id', q.costing_assembly_id, 'face', 'front',
             'name', q.name, 'slot', 0, 'quantity', q.quantity,
             'unsized', not q.is_sized))
      into placements
    from public.v_panel_layout_kits q
    where q.panel_id = target_panel and q.mounting_design = k.mounting_design;

    sections := sections || jsonb_build_array(app.layout_section(
      label, width, 0, k.mounting_design::text, coalesce(placements, '[]'::jsonb)));
    explain := explain || jsonb_build_array(jsonb_build_object(
      'section', label, 'why', case k.mounting_design
        when 'compensation' then format('the correction, %s kVAr of steps, in a section of its own', k.kvar)
        when 'meter_board_plate' then 'the meter board plates, which are a board of their own rather than a cubicle'
        when 'inline_3nj6' then 'the in-line fuse-switch disconnectors, on their 50 mm pitch'
        else 'the modular devices — MCBs, meters, contactors, terminals — on plates across the section' end));
    if k.mounting_design = 'compensation' then kvar_used := k.kvar; end if;
  end loop;

  select (app.section_capacity('compensation', 800, 0, construction) ->> 'capacity')::numeric into kvar_limit;

  return jsonb_build_object(
    'panel_id', target_panel,
    'panel', p.name,
    'construction', con.code,
    'sections', sections,
    'explain', explain,
    -- Named, never hidden: a kit the library has not described yet cannot be
    -- placed, and a section holding one can never read "fits" (spec §6).
    'unsized', unsized,
    'kvar', jsonb_build_object('used', kvar_used, 'limit_per_section', kvar_limit),
    'assumed', jsonb_build_object(
      'device_compartment_mm', compartment,
      'note', 'the usable height of a device compartment is assumed until the S4 dimension drawings are read'));
end;
$$;

comment on function app.arrange_panel(uuid, text) is
  'The sections a panel needs and where each kit sits on them, by the rules of
   each mounting design, with the rule that put it there. Deterministic and
   read-only: the engineer edits the result before anything is saved.';

-- Two helpers the arrangement leans on, kept apart so the rules above read as
-- rules rather than as jsonb plumbing.
create or replace function app.layout_width_for(widths integer[], needs numeric)
returns integer
language sql
immutable
as $$
  select coalesce(
    (select w from unnest(widths) as w where needs is not null and w >= needs + 100 order by w limit 1),
    (select w from unnest(widths) as w where needs is null and w >= 800 order by w limit 1),
    (select max(w) from unnest(widths) as w))
$$;

comment on function app.layout_width_for(integer[], numeric) is
  'The narrowest width of a construction that holds what is going into it, with
   100 mm to spare. A kit that has never been measured gets the 800 mm section
   the owner''s boards usually use, and is flagged as unsized elsewhere.';

create or replace function app.layout_section(
  label text, width integer, busbar_compartment integer, design text, placements jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', label, 'width_mm', width,
    'busbar_compartment_mm', busbar_compartment,
    'access', 'single_front', 'design', design,
    'faces', jsonb_build_array(jsonb_build_object(
      'side', 'front', 'connection', 'front', 'design', design,
      'placements', placements)))
$$;

comment on function app.layout_section(text, integer, integer, text, jsonb) is
  'One section in the shape 0119 documented: a width, a busbar compartment, and
   one face carrying the placements. A double-front section gains its second face
   in stage two.';

-- ===========================================================================
-- 5. Does it fit?
-- ===========================================================================

create or replace function app.layout_fit(sections jsonb, construction text default 'S4')
returns jsonb
language plpgsql
stable
as $$
declare
  section jsonb;
  face jsonb;
  placement jsonb;
  cap jsonb;
  used numeric;
  count_unsized integer;
  verdict text;
  out_sections jsonb := '[]'::jsonb;
  worst text := 'fits';
  total_width integer := 0;
begin
  if sections is null or jsonb_typeof(sections) <> 'array' then
    raise exception 'a layout is a list of sections';
  end if;

  for section in select value from jsonb_array_elements(sections) loop
    cap := app.section_capacity((section ->> 'design')::public.mounting_design,
                                (section ->> 'width_mm')::integer,
                                coalesce((section ->> 'busbar_compartment_mm')::integer, 0),
                                construction);
    used := 0; count_unsized := 0;
    face := section -> 'faces' -> 0;
    for placement in select value from jsonb_array_elements(coalesce(face -> 'placements', '[]'::jsonb)) loop
      if coalesce((placement ->> 'unsized')::boolean, false) then
        count_unsized := count_unsized + 1;
      end if;
      used := used + coalesce((placement ->> 'height_mm')::numeric, 0)
                   * greatest(coalesce((placement ->> 'quantity')::numeric, 1), 1);
    end loop;

    verdict := case
      when count_unsized > 0 or (cap ->> 'capacity') is null then 'unknown'
      when used = 0 then 'empty'
      when used <= (cap ->> 'capacity')::numeric * 0.9 then 'fits'
      when used <= (cap ->> 'capacity')::numeric then 'tight'
      else 'no_fit' end;

    -- The worst verdict on the board is the board's verdict: one section that
    -- does not fit is a board that does not fit.
    if verdict = 'no_fit' or worst = 'no_fit' then worst := 'no_fit';
    elsif verdict = 'unknown' or worst = 'unknown' then worst := 'unknown';
    elsif verdict = 'tight' or worst = 'tight' then worst := 'tight';
    end if;

    total_width := total_width + coalesce((section ->> 'width_mm')::integer, 0);
    out_sections := out_sections || jsonb_build_array(jsonb_build_object(
      'name', section ->> 'name',
      'design', section ->> 'design',
      'width_mm', (section ->> 'width_mm')::integer,
      'used', used,
      'capacity', (cap ->> 'capacity')::numeric,
      'unit', cap ->> 'unit',
      'unsized', count_unsized,
      'verdict', verdict,
      'why', cap ->> 'why'));
  end loop;

  return jsonb_build_object(
    'verdict', case when jsonb_array_length(out_sections) = 0 then 'empty' else worst end,
    'sections', out_sections,
    'section_count', jsonb_array_length(out_sections),
    'total_width_mm', total_width);
end;
$$;

comment on function app.layout_fit(jsonb, text) is
  'Per section: what is on it against what it holds, and a verdict. A section
   carrying a kit nobody has measured reads "unknown" rather than "fits", and one
   such section makes the whole board unknown (spec §6).';

-- ===========================================================================
-- 6. Keeping a layout, and what it says the enclosure should be
-- ===========================================================================

create or replace function app.save_panel_layout(
  target_panel uuid, sections jsonb, construction text default 'S4', note text default null)
returns jsonb
language plpgsql
as $$
declare
  p record;
  next_version integer;
  fit jsonb;
begin
  select cp.id, cp.costing_id, cp.company_id, cp.name into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;

  -- Checked before it is kept, the same way a busbar schedule is.
  fit := app.layout_fit(coalesce(sections, '[]'::jsonb), construction);

  select coalesce(max(version), 0) + 1 into next_version
  from public.panel_layouts where panel_id = target_panel;

  insert into public.panel_layouts
    (company_id, panel_id, version, sections, construction_code, note)
  values (p.company_id, target_panel, next_version, coalesce(sections, '[]'::jsonb), construction, note);

  perform app.write_activity('costing', p.costing_id, 'layout.saved', null,
    jsonb_build_object('panel', p.name, 'version', next_version,
                       'sections', fit -> 'section_count', 'verdict', fit ->> 'verdict'),
    format('layout v%s of %s: %s sections, %s', next_version, p.name,
           fit ->> 'section_count', fit ->> 'verdict'));

  return jsonb_build_object('panel_id', target_panel, 'version', next_version, 'fit', fit);
end;
$$;

comment on function app.save_panel_layout(uuid, jsonb, text, text) is
  'Keeps an arrangement as the next version of this panel''s layout and returns
   its verdict. Writes no costing line and moves no price: a layout is a drawing
   until somebody applies its enclosure.';

-- The layout's own answer to "what cubicles should this costing carry?", and the
-- lines to make it so. Through `add_component_to_costing`, like everything else.
create or replace function app.apply_layout_enclosure(
  target_panel uuid, section text default 'Enclosure', replace_existing boolean default false)
returns jsonb
language plpgsql
as $$
declare
  p record;
  layout record;
  s jsonb;
  wanted jsonb := '{}'::jsonb;
  want_width text;
  comp record;
  holder uuid;
  existing integer;
  removed integer := 0;
  added integer := 0;
  missing jsonb := '[]'::jsonb;
  width integer;
begin
  select cp.id, cp.costing_id, cp.company_id, cp.name into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;

  select * into layout from public.panel_layouts
  where panel_id = target_panel order by version desc limit 1;
  if layout.id is null then raise exception 'this panel has no layout saved yet'; end if;

  -- How many cubicles of each width the drawing asks for.
  for s in select value from jsonb_array_elements(layout.sections) loop
    -- The width is what the cubicle is: on an S4 feeder section the 200 mm
    -- distribution-busbar compartment is inside it, not beside it.
    width := (s ->> 'width_mm')::integer;
    wanted := wanted || jsonb_build_object(width::text,
      coalesce((wanted ->> width::text)::integer, 0) + 1);
  end loop;
  if wanted = '{}'::jsonb then raise exception 'the layout has no sections to buy cubicles for'; end if;

  holder := app.free_line(target_panel, section);
  select count(*) into existing
  from public.costing_items ci
  join public.components c on c.id = ci.source_component_id
  where ci.costing_assembly_id = holder and c.is_enclosure_cubicle and not ci.is_manual;
  if existing > 0 and not replace_existing then
    raise exception 'there are already % enclosure lines in % — apply again with replace to put the layout''s cubicles in their place',
      existing, section;
  end if;
  if existing > 0 then
    delete from public.costing_items ci
    using public.components c
    where c.id = ci.source_component_id and c.is_enclosure_cubicle
      and ci.costing_assembly_id = holder and not ci.is_manual;
    removed := existing;
  end if;

  for want_width in select key from jsonb_object_keys(wanted) as t(key) loop
    -- The catalogue names cubicles by their size, e.g. 800(W)X800(D)X2100(H)-2B.
    select c.id as id, c.code as code into comp
    from public.components c
    where c.is_enclosure_cubicle
      and (c.company_id is null or c.company_id = p.company_id)
      and c.code like want_width || '(W)%'
    order by c.company_id nulls last, c.code
    limit 1;
    if comp.id is null then
      missing := missing || jsonb_build_array(jsonb_build_object(
        'width_mm', want_width::integer, 'quantity', (wanted ->> want_width)::integer,
        'why', format('the catalogue has no %s mm cubicle; add one on the Components screen, or change the section width', want_width)));
      continue;
    end if;
    perform app.add_component_to_costing(target_panel, comp.id, (wanted ->> want_width)::integer, section);
    added := added + 1;
  end loop;

  perform app.write_activity('costing', p.costing_id, 'layout.enclosure_applied', null,
    jsonb_build_object('panel', p.name, 'kinds', added, 'replaced', removed,
                       'missing', jsonb_array_length(missing)),
    format('%s kinds of cubicle on %s from its layout', added, p.name));

  return jsonb_build_object(
    'panel_id', target_panel, 'section', section,
    'kinds', added, 'replaced', removed,
    -- A width the catalogue cannot supply is named rather than quietly dropped.
    'missing', missing,
    'wanted', wanted);
end;
$$;

comment on function app.apply_layout_enclosure(uuid, text, boolean) is
  'Turns the saved layout''s sections into enclosure cubicle lines on the panel,
   through the ordinary component function so each is priced and frozen. Names
   any width the catalogue cannot supply instead of dropping it, and refuses to
   add on top of its own earlier lines unless told to replace them.';

-- ===========================================================================
-- 7. A switch of its own, and the wrappers
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('panel_layout', 'The panel layout',
   'Draw a panel at true scale: the sections it needs, every kit on the plate it belongs to, and whether each section holds what is on it. Stage one is the front view; the rear and 3D views and the GA sketch come later. It changes the enclosure line only when you press Apply.',
   false, 'feature.panel_layout', 170)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;

create or replace function public.arrange_panel(target_panel uuid, construction text default 'S4')
returns jsonb language sql stable as $$ select app.arrange_panel(target_panel, construction) $$;

create or replace function public.layout_fit(sections jsonb, construction text default 'S4')
returns jsonb language sql stable as $$ select app.layout_fit(sections, construction) $$;

create or replace function public.save_panel_layout(
  target_panel uuid, sections jsonb, construction text default 'S4', note text default null)
returns jsonb language sql as $$ select app.save_panel_layout(target_panel, sections, construction, note) $$;

create or replace function public.apply_layout_enclosure(
  target_panel uuid, section text default 'Enclosure', replace_existing boolean default false)
returns jsonb language sql as $$ select app.apply_layout_enclosure(target_panel, section, replace_existing) $$;

grant execute on function app.layout_setting(text, numeric)                          to authenticated;
grant execute on function app.section_capacity(public.mounting_design, integer, integer, text) to authenticated;
grant execute on function app.layout_width_for(integer[], numeric)                   to authenticated;
grant execute on function app.layout_section(text, integer, integer, text, jsonb)    to authenticated;
grant execute on function app.arrange_panel(uuid, text)                              to authenticated;
grant execute on function public.arrange_panel(uuid, text)                           to authenticated;
grant execute on function app.layout_fit(jsonb, text)                                to authenticated;
grant execute on function public.layout_fit(jsonb, text)                             to authenticated;
grant execute on function app.save_panel_layout(uuid, jsonb, text, text)             to authenticated;
grant execute on function public.save_panel_layout(uuid, jsonb, text, text)          to authenticated;
grant execute on function app.apply_layout_enclosure(uuid, text, boolean)            to authenticated;
grant execute on function public.apply_layout_enclosure(uuid, text, boolean)         to authenticated;
revoke execute on all functions in schema public from anon;
