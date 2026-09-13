-- 0121  The panel layout, stage two (roadmap 3.8, `docs/reference/panel-layout-spec.md`
--       §4 and §5, against the high-fidelity mockups).
--
-- Stage one drew the board from the front and said whether each section held what
-- was on it. Stage two is the rest of what an engineer has to see before he
-- believes a drawing, and it is mostly *depth* — the dimension the front view
-- cannot show:
--
--   · **the rear**: which sections connect at the back and what is behind the
--     plates — cable lugs on a rear-connection section, shrouded terminals on a
--     front-connection one — with the sections mirrored, because that is what a
--     person walking round the board sees;
--   · **the plan**: looking down on one section — the vertical busbar on its
--     side, the mounting plate, the cable alley *beside* the plates or *behind*
--     them, and the door's swing;
--   · **the door**: the meters and lamps that are mounted on the door rather
--     than inside, taken from `components.mounting_type = 'door'` (F12);
--   · **3D**: the same sections in isometric, for the customer.
--
-- The one that changes arithmetic is the plan. **A cable alley behind the plates
-- widens the plate** (800 mm section: 450 mm of plate with the alley beside,
-- 650 mm with it behind) and costs depth — the mockup's own two arrangements.
-- So `section_capacity` now asks where the alley is, and says what depth the
-- answer needs. A board drawn with the alley behind and too shallow a section is
-- told so rather than quietly holding more than it can.
--
-- The second change is **double-front**, which the spec calls standard for KPLC
-- meter boards (§2.1): a section with two device compartments back to back. Its
-- verdict is now per face, and the section fits only when both faces do.
--
-- **Nothing here changes a price.** No costing line is written by any function in
-- this migration; `apply_layout_enclosure` is untouched and NPP-192 with it.

-- ===========================================================================
-- 1. Four more measurements, all of them settings
-- ===========================================================================

insert into public.company_options (company_id, key, value, value_type)
select c.id, k.key, k.value, 'number'
from public.companies c
cross join (values
  -- The mockup's plan view: a cable alley behind the plates needs rear access,
  -- and an 800 mm section is the shallowest that gives it.
  ('layout_alley_behind_min_depth_mm', '800'::jsonb),
  ('layout_alley_behind_mm',           '250'::jsonb),
  -- The zone along the back of a section for the horizontal-busbar droppers and
  -- the earth bar, and the swing a front door needs in front of the board.
  ('layout_rear_dropper_mm',           '100'::jsonb),
  ('layout_door_swing_mm',             '100'::jsonb),
  -- Between the two device compartments of a double-front section.
  ('layout_between_faces_mm',          '200'::jsonb)
) as k(key, value)
on conflict (company_id, key) do nothing;

-- ===========================================================================
-- 2. The narrowest depth that holds what a section needs
-- ===========================================================================
-- The width twin of 0120's `layout_width_for`, and deliberately the same shape:
-- the construction's own list, never a figure of ours.

create or replace function app.layout_depth_for(depths integer[], needs numeric)
returns integer
language sql
immutable
as $$
  select coalesce(
    (select d from unnest(depths) as d
      where needs is null or d >= needs order by d limit 1),
    (select max(d) from unnest(depths) as d))
$$;

comment on function app.layout_depth_for(integer[], numeric) is
  'The shallowest depth on the construction''s list that holds what a section
   needs, or its deepest if nothing on the list does — so a board is never drawn
   at a depth the construction does not offer.';

grant execute on function app.layout_depth_for(integer[], numeric) to authenticated;

-- ===========================================================================
-- 3. Capacity, now that depth is in the picture
-- ===========================================================================
-- The old four-argument form is dropped rather than left beside this one: two
-- capacity rules that can disagree is exactly the bug this function exists to
-- prevent. Every old call still resolves here, because the new arguments default
-- to what stage one assumed — the alley beside the plates.

drop function if exists app.section_capacity(public.mounting_design, integer, integer, text);

create or replace function app.section_capacity(
  design public.mounting_design,
  width_mm integer,
  busbar_compartment_mm integer default 0,
  construction text default 'S4',
  cable_alley text default 'beside',
  depth_mm integer default null)
returns jsonb
language plpgsql
stable
as $$
declare
  compartment numeric := app.layout_setting('layout_device_compartment_mm', 1500);
  vbb numeric := app.layout_setting('layout_vertical_busbar_mm', 150);
  alley numeric := app.layout_setting('layout_cable_alley_mm', 200);
  behind numeric := app.layout_setting('layout_alley_behind_mm', 250);
  behind_depth numeric := app.layout_setting('layout_alley_behind_min_depth_mm', 800);
  dropper numeric := app.layout_setting('layout_rear_dropper_mm', 100);
  module numeric := app.layout_setting('layout_mcb_module_mm', 18);
  kvar numeric;
  busbar_space numeric;
  plate_w numeric;
  depth_needed numeric;
  too_shallow text := null;
begin
  if design is null or width_mm is null or width_mm <= 0 then
    return jsonb_build_object('unit', 'unknown', 'capacity', null,
      'why', 'a section needs a design and a width before it holds anything');
  end if;

  -- Where the construction gives the distribution busbar a compartment of its
  -- own — 200 mm on an S4 feeder section — that compartment *is* the vertical
  -- busbar, so the two are never counted twice (0120).
  busbar_space := greatest(coalesce(busbar_compartment_mm, 0), vbb);

  -- The mockup's two arrangements. Beside: the alley takes width from the plate.
  -- Behind: the plate runs the full width left of the busbar and the alley takes
  -- depth instead — which is why it needs rear access and a deeper section.
  if cable_alley = 'behind' then
    plate_w := greatest(width_mm - busbar_space, 0);
    depth_needed := behind_depth;
    if depth_mm is not null and depth_mm < behind_depth then
      too_shallow := format(
        'the cable alley is behind the plates, which needs %s mm of depth; this section is %s mm',
        behind_depth, depth_mm);
    end if;
  else
    plate_w := greatest(width_mm - busbar_space - alley, 0);
    depth_needed := dropper + behind;
  end if;

  if design = 'busbar_fed' then
    -- The device takes the section; two can stack if their heights fit.
    return jsonb_build_object('unit', 'mm of height', 'capacity', compartment,
      'plate_width_mm', width_mm, 'cable_alley', cable_alley,
      'depth_needed_mm', depth_needed, 'too_shallow', too_shallow,
      'why', format('a busbar-fed section is %s mm of compartment height', compartment));
  elsif design = 'mccb_plates' then
    return jsonb_build_object('unit', 'mm of height', 'capacity', compartment,
      'plate_width_mm', plate_w, 'cable_alley', cable_alley,
      'depth_needed_mm', depth_needed, 'too_shallow', too_shallow,
      'why', case when cable_alley = 'behind'
        then format('covers stack down %s mm of compartment on plates %s mm wide, with the cable alley behind them',
                    compartment, plate_w)
        else format('covers stack down %s mm of compartment, beside a %s mm busbar space and a %s mm cable alley',
                    compartment, busbar_space, alley) end);
  elsif design in ('side_by_side_plates', 'compensation') then
    if design = 'compensation' then
      select lc.kvar_per_section into kvar
      from public.layout_constructions lc
      where lc.code = construction and (lc.company_id = app.current_company_id() or lc.company_id is null)
      order by lc.company_id nulls last limit 1;
    end if;
    return jsonb_build_object(
      'unit', case when design = 'compensation' then 'kVAr' else 'positions' end,
      'positions_per_plate', floor(plate_w / nullif(module, 0)),
      'plate_width_mm', plate_w,
      'cable_alley', cable_alley,
      'depth_needed_mm', depth_needed,
      'too_shallow', too_shallow,
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
    'cable_alley', cable_alley, 'depth_needed_mm', depth_needed,
    'why', format('no capacity rule for %s yet', design));
end;
$$;

comment on function app.section_capacity(public.mounting_design, integer, integer, text, text, integer) is
  'What one section of a design and width holds, in the unit that design counts
   in, and the sentence explaining the figure. Stage two added where the cable
   alley is — behind the plates it widens them and costs depth — and the depth the
   answer needs, so a section drawn too shallow says so (spec §3, plan mockup).';

grant execute on function app.section_capacity(public.mounting_design, integer, integer, text, text, integer)
  to authenticated;

-- ===========================================================================
-- 4. A section, with everything the other four views need to draw it
-- ===========================================================================
-- The extra settings arrive as one jsonb rather than as six more arguments, so
-- that adding the next one is not another signature. Every one of them has the
-- value stage one assumed, so a section built without options draws exactly as
-- it drew before.

drop function if exists app.layout_section(text, integer, integer, text, jsonb);

create or replace function app.layout_section(
  label text, width integer, busbar_compartment integer, design text,
  placements jsonb, opts jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'name', label,
    'width_mm', width,
    'depth_mm', coalesce((opts ->> 'depth_mm')::integer, 800),
    'busbar_compartment_mm', busbar_compartment,
    'access', coalesce(opts ->> 'access', 'single_front'),
    'form', coalesce(opts ->> 'form', '2b'),
    'busbar_side', coalesce(opts ->> 'busbar_side', 'left'),
    'cable_alley', coalesce(opts ->> 'cable_alley', 'beside'),
    'design', design,
    'faces', jsonb_build_array(jsonb_build_object(
      'side', 'front',
      'connection', coalesce(opts ->> 'connection', 'front'),
      'design', design,
      'placements', placements))
      -- A double-front section carries a second compartment back to back, with
      -- its own design and its own stack (spec §2.1).
      || case when coalesce(opts ->> 'access', 'single_front') = 'double_front'
         then jsonb_build_array(jsonb_build_object(
           'side', 'rear',
           'connection', coalesce(opts ->> 'rear_connection', 'rear'),
           'design', coalesce(opts ->> 'rear_design', design),
           'placements', coalesce(opts -> 'rear_placements', '[]'::jsonb)))
         else '[]'::jsonb end)
$$;

comment on function app.layout_section(text, integer, integer, text, jsonb, jsonb) is
  'One section in the shape 0119 documented, now carrying its depth, form, busbar
   side and cable-alley arrangement, and a second face when it is double-front.
   Built without options it is the single-front, alley-beside section stage one
   drew.';

grant execute on function app.layout_section(text, integer, integer, text, jsonb, jsonb) to authenticated;

-- ===========================================================================
-- 5. What is on the door, and what the board weighs
-- ===========================================================================
-- Both come from F12 data already on the components: `mounting_type = 'door'`
-- marks a part that is mounted on the door rather than inside, and `weight_kg`
-- is what it weighs. Neither invents anything — a board whose parts carry no
-- weights reports no weight rather than a guess.

create or replace view public.v_panel_door_devices
with (security_invoker = true)
as
select
  ca.panel_id,
  ci.costing_id,
  ci.company_id,
  ci.costing_assembly_id,
  ca.name          as kit_name,
  ci.name          as name,
  ci.code,
  ci.quantity,
  c.width_mm,
  c.height_mm,
  ci.category_code
from public.costing_items ci
join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
join public.components c on c.id = ci.source_component_id
where c.mounting_type = 'door';

comment on view public.v_panel_door_devices is
  'The parts of a panel that are mounted on the door — meters, lamps, selector
   switches — from the F12 `mounting_type` on the component. The door view draws
   these; a part with no mounting type on record is simply not one of them.';

grant select on public.v_panel_door_devices to authenticated;

create or replace view public.v_panel_layout_weight
with (security_invoker = true)
as
select
  ca.panel_id,
  ci.company_id,
  sum(ci.quantity * c.weight_kg)                        as weight_kg,
  count(*) filter (where c.weight_kg is null)           as without_weight,
  count(*)                                              as lines
from public.costing_items ci
join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
left join public.components c on c.id = ci.source_component_id
group by ca.panel_id, ci.company_id;

comment on view public.v_panel_layout_weight is
  'Roughly what a panel weighs, from the F12 weights on its parts, with a count
   of the lines that have no weight on record — so the figure is read as the
   estimate it is (3D mockup, "Weight (est.)").';

grant select on public.v_panel_layout_weight to authenticated;

-- ===========================================================================
-- 6. Does it fit? — now per face
-- ===========================================================================
-- Stage one read the front face of every section. A double-front section has two,
-- each with its own design and its own stack, and the spec is explicit: the
-- section fits only when both faces fit (§2.1). So the verdict is built per face
-- and rolled up — worst face makes the section, worst section makes the board.
--
-- The section keeps the figures stage one put on it (`used`, `capacity`,
-- `verdict`), now taken from its worst face, so a single-front board reads
-- exactly as it read before and the canvas needs no special case.

-- The order of badness, in one place, so the roll-up cannot disagree with itself.
create or replace function app.layout_worse(a text, b text)
returns text
language sql
immutable
as $$
  select case
    when a is null then b
    when b is null then a
    when 'no_fit' in (a, b) then 'no_fit'
    when 'unknown' in (a, b) then 'unknown'
    when 'tight' in (a, b) then 'tight'
    when 'fits' in (a, b) then 'fits'
    else coalesce(a, b) end
$$;

comment on function app.layout_worse(text, text) is
  'The worse of two verdicts: no_fit, then unknown, then tight, then fits, then
   empty. One definition, used for both roll-ups.';

grant execute on function app.layout_worse(text, text) to authenticated;

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
  face_rows jsonb;
  worst_face text;
  section_verdict text;
  shallow text;
  out_sections jsonb := '[]'::jsonb;
  worst text := 'fits';
  total_width integer := 0;
  max_depth integer := 0;
begin
  if sections is null or jsonb_typeof(sections) <> 'array' then
    raise exception 'a layout is a list of sections';
  end if;

  for section in select value from jsonb_array_elements(sections) loop
    face_rows := '[]'::jsonb;
    worst_face := null;
    shallow := null;

    for face in select value from jsonb_array_elements(
                  case when jsonb_typeof(section -> 'faces') = 'array'
                         and jsonb_array_length(section -> 'faces') > 0
                       then section -> 'faces'
                       else jsonb_build_array(jsonb_build_object('side', 'front')) end) loop
      cap := app.section_capacity(
        coalesce(face ->> 'design', section ->> 'design')::public.mounting_design,
        (section ->> 'width_mm')::integer,
        coalesce((section ->> 'busbar_compartment_mm')::integer, 0),
        construction,
        coalesce(section ->> 'cable_alley', 'beside'),
        (section ->> 'depth_mm')::integer);
      shallow := coalesce(shallow, cap ->> 'too_shallow');

      used := 0; count_unsized := 0;
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

      face_rows := face_rows || jsonb_build_array(jsonb_build_object(
        'side', coalesce(face ->> 'side', 'front'),
        'connection', coalesce(face ->> 'connection', 'front'),
        'design', coalesce(face ->> 'design', section ->> 'design'),
        'used', used,
        'capacity', (cap ->> 'capacity')::numeric,
        'unit', cap ->> 'unit',
        'plate_width_mm', (cap ->> 'plate_width_mm')::numeric,
        'unsized', count_unsized,
        'verdict', verdict,
        'why', cap ->> 'why'));

      worst_face := app.layout_worse(worst_face, verdict);
    end loop;

    -- A section too shallow for the arrangement drawn on it does not fit, however
    -- much height is left: the cables have nowhere to go. The faces keep their own
    -- verdicts — it is the *section* the depth condemns, not one of its faces.
    section_verdict := case when shallow is not null then 'no_fit' else worst_face end;

    worst := app.layout_worse(worst, section_verdict);
    total_width := total_width + coalesce((section ->> 'width_mm')::integer, 0);
    max_depth := greatest(max_depth, coalesce((section ->> 'depth_mm')::integer, 0));

    out_sections := out_sections || jsonb_build_array(
      -- The figures stage one showed, taken from the face that does worst.
      (select jsonb_build_object(
         'name', section ->> 'name',
         'design', section ->> 'design',
         'width_mm', (section ->> 'width_mm')::integer,
         'depth_mm', (section ->> 'depth_mm')::integer,
         'access', coalesce(section ->> 'access', 'single_front'),
         'cable_alley', coalesce(section ->> 'cable_alley', 'beside'),
         'used', (w ->> 'used')::numeric,
         'capacity', (w ->> 'capacity')::numeric,
         'unit', w ->> 'unit',
         'unsized', (w ->> 'unsized')::integer,
         'verdict', section_verdict,
         'too_shallow', shallow,
         'why', coalesce(shallow, w ->> 'why'),
         'faces', face_rows)
       from jsonb_array_elements(face_rows) as f(w)
       where f.w ->> 'verdict' = worst_face
       limit 1));
  end loop;

  return jsonb_build_object(
    'verdict', case when jsonb_array_length(out_sections) = 0 then 'empty' else worst end,
    'sections', out_sections,
    'section_count', jsonb_array_length(out_sections),
    'total_width_mm', total_width,
    'max_depth_mm', nullif(max_depth, 0));
end;
$$;

comment on function app.layout_fit(jsonb, text) is
  'Per face: what is on it against what it holds. The section takes its worst
   face''s verdict and the board its worst section''s, so a double-front board
   fits only when both faces do (spec §2.1), and a section too shallow for a
   cable alley behind its plates does not fit at all.';

-- ===========================================================================
-- 7. Arranging, with depth and a second face
-- ===========================================================================
-- Three things stage one did not decide, and now does, each from the
-- construction's own lists rather than from a constant here:
--
--   · **depth** — the shallowest on the list that holds the arrangement drawn;
--   · **the cable alley** — beside the plates unless the caller asks for behind,
--     in which case the section is deepened to suit rather than left too shallow;
--   · **a second face** — on a double-front board the covers and plates fill
--     face A and then continue onto face B of the *same* section instead of
--     opening another, which is the whole point of building one.
--
-- A busbar-fed device still takes a section to itself, single-front, even on a
-- double-front board: it is connected straight up to the horizontal busbar and
-- there is nothing to put behind it. The arrangement says so.

drop function if exists app.arrange_panel(uuid, text);

create or replace function app.arrange_panel(
  target_panel uuid,
  construction text default 'S4',
  access text default 'single_front',
  cable_alley text default 'beside')
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  con record;
  k record;
  compartment numeric := app.layout_setting('layout_device_compartment_mm', 1500);
  behind_depth numeric := app.layout_setting('layout_alley_behind_min_depth_mm', 800);
  sections jsonb := '[]'::jsonb;
  explain jsonb := '[]'::jsonb;
  unsized jsonb := '[]'::jsonb;
  placements jsonb;
  rear_placements jsonb;
  opts jsonb;
  used numeric;
  rear_used numeric;
  section_no integer := 0;
  width integer;
  depth integer;
  unit integer;
  label text;
  doubled boolean;
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

  if access not in ('single_front', 'double_front') then
    raise exception 'a section is either single_front or double_front, not %', access;
  end if;
  if access = 'double_front' and not coalesce(con.allows_double_front, false) then
    raise exception '% is a single-front construction; a double-front board is built on the fabricated frame', con.code;
  end if;
  if cable_alley not in ('beside', 'behind') then
    raise exception 'a cable alley is either beside the plates or behind them, not %', cable_alley;
  end if;
  doubled := access = 'double_front';

  -- The depth the whole board is drawn at: the construction's own list, deepened
  -- when the alley goes behind the plates or when both faces are used.
  depth := app.layout_depth_for(
    case when cardinality(con.depths_busbar_rear_mm) > 0 and doubled
         then con.depths_busbar_rear_mm else con.depths_busbar_top_mm end,
    case when cable_alley = 'behind' then behind_depth else null end);

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
      sections := sections || jsonb_build_array(app.layout_section(
        format('S%s', section_no), width, 0, 'busbar_fed', placements,
        jsonb_build_object('depth_mm', depth, 'cable_alley', cable_alley,
                           'form', coalesce(con.forms[1], '2b'))));
      explain := explain || jsonb_build_array(jsonb_build_object(
        'section', format('S%s', section_no), 'why',
        format('%s takes a section of its own: a busbar-fed device is connected straight to the horizontal busbar%s',
               k.name,
               case when doubled then ', and nothing goes behind it' else '' end)));
      if not k.is_sized then
        unsized := unsized || jsonb_build_array(jsonb_build_object(
          'name', k.name, 'why', case when k.mounting_design is null
            then 'no mounting design on the kit' else 'no module height on the kit' end));
      end if;
    end loop;
  end loop;

  -- MCCB covers: stacked down face A until it is full, then — on a double-front
  -- board — down face B of the same section, and only then into a new one.
  used := 0; rear_used := 0;
  placements := '[]'::jsonb; rear_placements := '[]'::jsonb; label := null;
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

      if label is not null and used + k.module_height_mm <= compartment then
        -- Room on face A.
        placements := placements || jsonb_build_array(jsonb_build_object(
          'costing_assembly_id', k.costing_assembly_id, 'face', 'front',
          'name', k.name, 'slot', jsonb_array_length(placements),
          'height_mm', k.module_height_mm, 'y_mm', used, 'unsized', false));
        used := used + k.module_height_mm;
      elsif label is not null and doubled and rear_used + k.module_height_mm <= compartment then
        -- Face A is full and this is a double-front board: carry on behind.
        rear_placements := rear_placements || jsonb_build_array(jsonb_build_object(
          'costing_assembly_id', k.costing_assembly_id, 'face', 'rear',
          'name', k.name, 'slot', jsonb_array_length(rear_placements),
          'height_mm', k.module_height_mm, 'y_mm', rear_used, 'unsized', false));
        rear_used := rear_used + k.module_height_mm;
        if rear_used = k.module_height_mm then
          explain := explain || jsonb_build_array(jsonb_build_object(
            'section', label, 'why',
            format('face A of %s was full, so the rest of the covers went on face B of the same section rather than into a new one', label)));
        end if;
      else
        -- Close the full section and start another.
        if label is not null then
          sections := sections || jsonb_build_array(app.layout_section(
            label, app.layout_width_for(con.widths_mm, null), 200, 'mccb_plates', placements,
            jsonb_build_object('depth_mm', depth, 'cable_alley', cable_alley,
                               'access', access, 'form', coalesce(con.forms[1], '2b'),
                               'rear_placements', rear_placements)));
        end if;
        section_no := section_no + 1;
        label := format('S%s', section_no);
        used := k.module_height_mm; rear_used := 0;
        rear_placements := '[]'::jsonb;
        placements := jsonb_build_array(jsonb_build_object(
          'costing_assembly_id', k.costing_assembly_id, 'face', 'front',
          'name', k.name, 'slot', 0,
          'height_mm', k.module_height_mm, 'y_mm', 0, 'unsized', false));
        explain := explain || jsonb_build_array(jsonb_build_object(
          'section', label, 'why',
          format('an outgoing feeder section: a %s mm distribution-busbar compartment beside a device compartment of covers, cable alley %s',
                 200, cable_alley)));
      end if;
    end loop;
  end loop;
  if label is not null then
    sections := sections || jsonb_build_array(app.layout_section(
      label, app.layout_width_for(con.widths_mm, null), 200, 'mccb_plates', placements,
      jsonb_build_object('depth_mm', depth, 'cable_alley', cable_alley,
                         'access', access, 'form', coalesce(con.forms[1], '2b'),
                         'rear_placements', rear_placements)));
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

    opts := jsonb_build_object('depth_mm', depth, 'cable_alley', cable_alley,
                               'form', coalesce(con.forms[1], '2b'));
    -- A meter board is the one design the spec builds double-front by default.
    if doubled and k.mounting_design in ('side_by_side_plates', 'meter_board_plate') then
      opts := opts || jsonb_build_object('access', access);
    end if;

    sections := sections || jsonb_build_array(app.layout_section(
      label, width, 0, k.mounting_design::text, coalesce(placements, '[]'::jsonb), opts));
    explain := explain || jsonb_build_array(jsonb_build_object(
      'section', label, 'why', case k.mounting_design
        when 'compensation' then format('the correction, %s kVAr of steps, in a section of its own', k.kvar)
        when 'meter_board_plate' then 'the meter board plates, which are a board of their own rather than a cubicle'
        when 'inline_3nj6' then 'the in-line fuse-switch disconnectors, on their 50 mm pitch'
        else 'the modular devices — MCBs, meters, contactors, terminals — on plates across the section' end));
    if k.mounting_design = 'compensation' then kvar_used := k.kvar; end if;
  end loop;

  select (app.section_capacity('compensation', 800, 0, construction, cable_alley, depth) ->> 'capacity')::numeric
    into kvar_limit;

  return jsonb_build_object(
    'panel_id', target_panel,
    'panel', p.name,
    'construction', con.code,
    'access', access,
    'cable_alley', cable_alley,
    'depth_mm', depth,
    'height_mm', con.height_mm,
    'base_mm', coalesce(con.base_heights_mm[1], 100),
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

comment on function app.arrange_panel(uuid, text, text, text) is
  'The sections a panel needs and where each kit sits on them, by the rules of
   each mounting design, with the rule that put it there. Stage two added the
   depth, the cable-alley arrangement and, on a double-front board, a second face
   that is filled before a new section is opened. Deterministic and read-only.';

grant execute on function app.arrange_panel(uuid, text, text, text) to authenticated;

-- ===========================================================================
-- 8. The wrappers the app calls, and what the switch now promises
-- ===========================================================================

drop function if exists public.arrange_panel(uuid, text);

create or replace function public.arrange_panel(
  target_panel uuid,
  construction text default 'S4',
  access text default 'single_front',
  cable_alley text default 'beside')
returns jsonb language sql stable as $$
  select app.arrange_panel(target_panel, construction, access, cable_alley)
$$;

grant execute on function public.arrange_panel(uuid, text, text, text) to authenticated;

update public.features
set blurb = 'Draw a panel at true scale: the sections it needs, every kit on the plate it belongs to, and whether each section holds what is on it. Front, rear, plan, door and 3D views; double-front boards are judged face by face. It changes the enclosure line only when you press Apply.'
where code = 'panel_layout';

revoke execute on all functions in schema public from anon;
