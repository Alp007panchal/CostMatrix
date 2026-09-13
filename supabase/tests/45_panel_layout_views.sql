-- The panel layout, stage two (migration 0121, roadmap 3.8 §4 and §5). What the
-- front view cannot show: depth, the back of the board, the door, and a section
-- with two faces.
--
-- The two arrangements in the plan-view mockup are the worked example, because
-- they are the ones that change a figure:
--
--   800 mm section, no busbar compartment, 150 mm vertical busbar
--     cable alley BESIDE  → 450 mm of plate, 600 mm of depth is enough
--     cable alley BEHIND  → 650 mm of plate, but 800 mm of depth and rear access
--
-- and a double-front section, where the covers fill face A and then carry on
-- behind instead of opening a second section.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select test.feature(:'alpha'::uuid, 'panel_layout', true);

-- Its own kits, cleaned up at the end, so the file can be read on its own and
-- moved without breaking the file after it.
select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.assemblies (id, company_id, code, name, mounting_design, module_height_mm, footprint_w_mm)
values ('00000000-0000-0000-0000-0000000039a2', null, 'LAY2-M400', 'STAGE TWO MCCB 400', 'mccb_plates', 250, null),
       ('00000000-0000-0000-0000-0000000039a3', null, 'LAY2-M250', 'STAGE TWO MCCB 250', 'mccb_plates', 200, null);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
select id, :'part_id'::uuid, 1, true from public.assemblies
 where id in ('00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-0000000039a3');

-- ===========================================================================
-- The shallowest depth that will do
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq(app.layout_depth_for('{600,800,1000}', 800), 800,
  'the shallowest depth on the construction''s list that holds what is needed');
select test.eq(app.layout_depth_for('{600,800,1000}', null), 600,
  'and its shallowest when nothing in particular is needed');
select test.eq(app.layout_depth_for('{600,800}', 1200), 800,
  'asked for more than the construction offers it gives the deepest it has, never a made-up figure');
rollback;

-- ===========================================================================
-- Where the cable alley goes, and what it costs
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((app.section_capacity('mccb_plates', 800, 0, 'S4', 'beside', 800) ->> 'plate_width_mm')::numeric,
  450::numeric, 'alley beside: 450 mm of plate on an 800 mm section, the mockup''s own figure');
select test.eq((app.section_capacity('mccb_plates', 800, 0, 'S4', 'behind', 800) ->> 'plate_width_mm')::numeric,
  650::numeric, 'alley behind: 650 mm, because the plate runs the full width left of the busbar');
select test.eq((app.section_capacity('mccb_plates', 800, 200, 'S4', 'behind', 800) ->> 'plate_width_mm')::numeric,
  600::numeric, 'and on a feeder section the 200 mm busbar compartment is all that is taken off');

select test.ok((app.section_capacity('mccb_plates', 800, 0, 'S4', 'behind', 800) ->> 'too_shallow') is null,
  '800 mm of depth is enough for an alley behind the plates');
select test.ok((app.section_capacity('mccb_plates', 800, 0, 'S4', 'behind', 600) ->> 'too_shallow')
  like '%needs 800 mm of depth; this section is 600 mm%',
  'but 600 mm is not, and it says so in millimetres rather than refusing silently');
select test.ok((app.section_capacity('mccb_plates', 800, 0, 'S4', 'beside', 600) ->> 'too_shallow') is null,
  'with the alley beside the plates 600 mm of depth is fine');

select test.eq((app.section_capacity('mccb_plates', 800, 0, 'S4', 'behind', 800) ->> 'depth_needed_mm')::numeric,
  800::numeric, 'and the answer says what depth it needs');
select test.ok((app.section_capacity('mccb_plates', 800, 0, 'S4', 'behind', 800) ->> 'why') like '%cable alley behind%',
  'the sentence names the arrangement it costed');

-- Stage one's figures are untouched: its calls land here with these defaults.
select test.eq((app.section_capacity('mccb_plates', 800, 200, 'S4') ->> 'plate_width_mm')::numeric,
  400::numeric, 'and a call made the way stage one made it gives stage one''s answer');
select test.eq((app.section_capacity('side_by_side_plates', 800, 0, 'S4', 'behind', 800) ->> 'capacity')::numeric,
  36::numeric, 'a side-by-side plate with the alley behind holds 650 mm at 18 mm a module: 36 positions');
rollback;

-- ===========================================================================
-- Which of two verdicts is the worse one
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq(app.layout_worse('fits', 'no_fit'), 'no_fit', 'a section that will not fit beats one that does');
select test.eq(app.layout_worse('unknown', 'tight'), 'unknown', 'not knowing beats a tight fit');
select test.eq(app.layout_worse('tight', 'fits'), 'tight', 'and a tight fit beats a comfortable one');
select test.eq(app.layout_worse(null, 'empty'), 'empty', 'nothing at all is whatever the other one is');
rollback;

-- ===========================================================================
-- A section with two faces
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

-- Face A carries 1,400 mm of cover and face B 300 mm: both inside 1,500, so the
-- section fits. One face over and the section is over, whatever the other does.
select app.layout_fit('[{
  "name": "S1", "width_mm": 800, "depth_mm": 1000, "busbar_compartment_mm": 200,
  "access": "double_front", "cable_alley": "beside", "design": "mccb_plates",
  "faces": [
    {"side": "front", "connection": "front", "design": "mccb_plates",
     "placements": [{"costing_assembly_id": "x", "name": "A", "slot": 0, "height_mm": 1400}]},
    {"side": "rear", "connection": "rear", "design": "mccb_plates",
     "placements": [{"costing_assembly_id": "y", "name": "B", "slot": 0, "height_mm": 300}]}
  ]}]'::jsonb) as both \gset

select test.eq(:'both'::jsonb ->> 'verdict', 'tight',
  'a double-front board whose worse face is tight is a tight board');
select test.eq(jsonb_array_length(:'both'::jsonb -> 'sections' -> 0 -> 'faces'), 2,
  'and the verdict is reported face by face, not once for the section');
select test.eq(:'both'::jsonb -> 'sections' -> 0 -> 'faces' -> 1 ->> 'side', 'rear',
  'the second face is the one at the back');
select test.eq(:'both'::jsonb -> 'sections' -> 0 -> 'faces' -> 1 ->> 'verdict', 'fits',
  'which on its own has room to spare');
select test.eq(:'both'::jsonb -> 'sections' -> 0 ->> 'used', '1400',
  'the section shows the figures of its worst face, so nothing reads better than the truth');

select app.layout_fit('[{
  "name": "S1", "width_mm": 800, "depth_mm": 1000, "busbar_compartment_mm": 200,
  "access": "double_front", "design": "mccb_plates",
  "faces": [
    {"side": "front", "design": "mccb_plates",
     "placements": [{"costing_assembly_id": "x", "name": "A", "slot": 0, "height_mm": 400}]},
    {"side": "rear", "design": "mccb_plates",
     "placements": [{"costing_assembly_id": "y", "name": "B", "slot": 0, "height_mm": 1900}]}
  ]}]'::jsonb) as over \gset

select test.eq(:'over'::jsonb ->> 'verdict', 'no_fit',
  'a board whose back face is overloaded does not fit, however empty the front is');
select test.eq(:'over'::jsonb -> 'sections' -> 0 ->> 'verdict', 'no_fit',
  'and the section says so, not just the board');

-- A section too shallow for the arrangement drawn on it does not fit at all.
select app.layout_fit('[{
  "name": "S1", "width_mm": 800, "depth_mm": 600, "busbar_compartment_mm": 0,
  "cable_alley": "behind", "design": "mccb_plates",
  "faces": [{"side": "front", "design": "mccb_plates",
    "placements": [{"costing_assembly_id": "x", "name": "A", "slot": 0, "height_mm": 200}]}]}]'::jsonb) as shallow \gset

select test.eq(:'shallow'::jsonb ->> 'verdict', 'no_fit',
  'one cover in a section too shallow for its cable alley still does not fit');
select test.ok(:'shallow'::jsonb -> 'sections' -> 0 ->> 'why' like '%needs 800 mm of depth%',
  'and the reason is the depth, in words, not the height');
select test.eq(:'shallow'::jsonb ->> 'max_depth_mm', '600',
  'the board reports the deepest section it has, which is what the enclosure must be');

-- The regression that matters: a stage-one section reads exactly as it did.
select app.layout_fit('[{
  "name": "S1", "width_mm": 800, "busbar_compartment_mm": 200, "access": "single_front",
  "design": "mccb_plates",
  "faces": [{"side": "front", "connection": "front", "design": "mccb_plates",
    "placements": [
      {"costing_assembly_id": "x", "name": "A", "slot": 0, "height_mm": 250},
      {"costing_assembly_id": "y", "name": "B", "slot": 1, "height_mm": 250}]}]}]'::jsonb) as one \gset

select test.eq(:'one'::jsonb -> 'sections' -> 0 ->> 'used', '500',
  'a single-front section adds its covers up as it always did');
select test.eq(:'one'::jsonb -> 'sections' -> 0 ->> 'capacity', '1500',
  'against the same compartment height');
select test.eq(:'one'::jsonb -> 'sections' -> 0 ->> 'verdict', 'fits',
  'and reaches the same verdict');
rollback;

-- ===========================================================================
-- Arranging a double-front board
-- ===========================================================================
-- The same seven covers as stage one's worked example. Single-front they need two
-- sections; double-front they fit one, which is the reason to build one.
begin;
set local role authenticated;

-- The fabricated frame's own widths and depths are the company's to keep, and
-- only a company administrator may write them.
select test.sign_in(:'alice');
insert into public.layout_constructions
  (company_id, code, name, allows_double_front, widths_mm,
   depths_busbar_top_mm, depths_busbar_rear_mm, height_mm, base_heights_mm, forms)
values (:'alpha'::uuid, 'custom_double_front', 'Our double-front frame', true,
        '{600,800,1000}', '{600,800,1000}', '{800,1000,1200}', 2000, '{100}', '{2b}');

select test.sign_in(:'carol');
select id as job from app.create_costing('Layout: stage two') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 3.8 DF', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000039a2'::uuid, 4);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000039a3'::uuid, 3);

select app.arrange_panel(:'panel'::uuid, 'S4') as flat \gset
select test.eq(jsonb_array_length(:'flat'::jsonb -> 'sections'), 2,
  'single-front, seven covers need two sections — stage one''s answer, unchanged');

select app.arrange_panel(:'panel'::uuid, 'custom_double_front', 'double_front') as df \gset
select test.eq(jsonb_array_length(:'df'::jsonb -> 'sections'), 1,
  'double-front, the same seven fit one section: face A takes six, face B the seventh');
select test.eq(jsonb_array_length(:'df'::jsonb -> 'sections' -> 0 -> 'faces'), 2,
  'and that section is drawn with two faces');
select test.eq(jsonb_array_length(:'df'::jsonb -> 'sections' -> 0 -> 'faces' -> 0 -> 'placements'), 6,
  'six covers on the front face');
select test.eq(jsonb_array_length(:'df'::jsonb -> 'sections' -> 0 -> 'faces' -> 1 -> 'placements'), 1,
  'and one behind');
select test.eq(:'df'::jsonb -> 'sections' -> 0 -> 'faces' -> 1 -> 'placements' -> 0 ->> 'face', 'rear',
  'which knows which face it is on, so a drop can be put back where it came from');
select test.ok((select bool_or(e ->> 'why' like '%face A of%was full%')
                from jsonb_array_elements(:'df'::jsonb -> 'explain') as x(e)),
  'and the arrangement says in words why it went behind rather than into a new section');

-- The board's own dimensions come back with it, from the construction's lists.
select test.eq(:'df'::jsonb ->> 'depth_mm', '800',
  'a double-front board takes the rear-busbar depth list: 800 mm, the shallowest it offers');
select test.eq(:'df'::jsonb ->> 'height_mm', '2000', 'the frame is 2,000 mm tall');
select test.eq(:'df'::jsonb ->> 'base_mm', '100', 'on a 100 mm base');
select test.eq(:'df'::jsonb ->> 'access', 'double_front', 'and it says which way it was arranged');

-- Both faces fit, so the board fits.
select app.layout_fit(:'df'::jsonb -> 'sections', 'custom_double_front') as dffit \gset
select test.eq(:'dffit'::jsonb ->> 'verdict', 'tight',
  'face A at 1,400 of 1,500 mm makes the board tight, and the board says tight');

-- Asking for the alley behind deepens the board rather than drawing it too shallow.
select app.arrange_panel(:'panel'::uuid, 'S4', 'single_front', 'behind') as behind \gset
select test.eq(:'behind'::jsonb ->> 'depth_mm', '800',
  'with the cable alley behind the plates the board is drawn 800 mm deep');
select test.eq(:'behind'::jsonb -> 'sections' -> 0 ->> 'cable_alley', 'behind',
  'and every section carries the arrangement it was drawn with');
select app.layout_fit(:'behind'::jsonb -> 'sections', 'S4') as behindfit \gset
select test.ok((:'behindfit'::jsonb -> 'sections' -> 0 ->> 'too_shallow') is null,
  'so nothing on it is too shallow for its own cables');

select test.eq(:'flat'::jsonb -> 'sections' -> 0 ->> 'depth_mm', '400',
  'beside the plates, the shallowest S4 depth will do');
rollback;

-- ===========================================================================
-- What it refuses, in words
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Layout: refusals') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL REFUSE', 1, 'PC') returning id as panel \gset

select test.refuses(
  format('select app.arrange_panel(%L::uuid, ''S4'', ''double_front'')', :'panel'),
  'S4 is single-front: asking for two faces on it is refused with the reason',
  'single-front construction');
select test.refuses(
  format('select app.arrange_panel(%L::uuid, ''S4'', ''sideways'')', :'panel'),
  'and a section is one of two things, not anything a caller invents',
  'single_front or double_front');
select test.refuses(
  format('select app.arrange_panel(%L::uuid, ''S4'', ''single_front'', ''underneath'')', :'panel'),
  'as is where the cable alley goes',
  'beside the plates or behind them');
rollback;

-- ===========================================================================
-- What is on the door, and what the board weighs
-- ===========================================================================
-- Both read F12 data already on the component: a part is door-mounted because its
-- `mounting_type` says so, and weighs what its `weight_kg` says. Nothing is
-- inferred from a name.
begin;
set local role authenticated;

select test.sign_in(:'alice');
insert into public.components (id, company_id, category_code, code, name,
       pricing_mode, purchase_price, mounting_type, width_mm, height_mm, weight_kg)
values ('00000000-0000-0000-0000-0000000039c1', :'alpha'::uuid, 'accessories_hardware',
        'LAY2-MFM', 'Multifunction meter 96 x 96', 'fixed', 9000, 'door', 96, 96, 0.45),
       ('00000000-0000-0000-0000-0000000039c2', :'alpha'::uuid, 'accessories_hardware',
        'LAY2-LAMP', 'Pilot lamp 22 mm', 'fixed', 400, 'door', 22, 22, 0.05),
       ('00000000-0000-0000-0000-0000000039c3', :'alpha'::uuid, 'accessories_hardware',
        'LAY2-RAIL', 'DIN rail, 1 m', 'fixed', 600, 'plate', 1000, 35, null);

insert into public.assemblies (id, company_id, code, name, mounting_design, module_height_mm)
values ('00000000-0000-0000-0000-0000000039a4', :'alpha'::uuid, 'LAY2-METERS',
        'STAGE TWO METERING KIT', 'side_by_side_plates', null);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-0000000039a4', '00000000-0000-0000-0000-0000000039c1', 1, true),
       ('00000000-0000-0000-0000-0000000039a4', '00000000-0000-0000-0000-0000000039c2', 3, false),
       ('00000000-0000-0000-0000-0000000039a4', '00000000-0000-0000-0000-0000000039c3', 2, false);

select test.sign_in(:'carol');
select id as job from app.create_costing('Layout: the door') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL DOOR', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000039a4'::uuid, 1);

select test.eq((select count(*)::int from public.v_panel_door_devices where panel_id = :'panel'::uuid), 2,
  'the door carries the two parts whose mounting type says door — the meter and the lamp');
select test.eq((select sum(quantity)::int from public.v_panel_door_devices where panel_id = :'panel'::uuid), 4,
  'four of them in all: one meter and three lamps');
select test.ok((select bool_and(width_mm is not null and height_mm is not null)
                from public.v_panel_door_devices where panel_id = :'panel'::uuid),
  'each with the size the door view draws it at');
select test.eq((select count(*)::int from public.v_panel_door_devices
                 where panel_id = :'panel'::uuid and code = 'LAY2-RAIL'), 0,
  'and the DIN rail, which is mounted on a plate, is not on the door');
select test.ok((select bool_and(kit_name = 'STAGE TWO METERING KIT')
                from public.v_panel_door_devices where panel_id = :'panel'::uuid),
  'every one of them says which kit it came from, so it can be put back');

-- The weight is an estimate and says how much of it is missing.
select test.eq((select round(weight_kg, 2) from public.v_panel_layout_weight where panel_id = :'panel'::uuid),
  0.60::numeric, 'the board weighs what its parts weigh: 0.45 + 3 x 0.05');
select test.eq((select without_weight::int from public.v_panel_layout_weight where panel_id = :'panel'::uuid), 1,
  'and it counts the one line with no weight on record rather than pretending it is nothing');

-- Another company sees none of it.
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_panel_door_devices where panel_id = :'panel'::uuid), 0,
  'another company sees nothing on Alpha''s door');
select test.eq((select count(*)::int from public.v_panel_layout_weight where panel_id = :'panel'::uuid), 0,
  'nor what Alpha''s board weighs');
rollback;

-- ===========================================================================
-- Put back what this file made
-- ===========================================================================
delete from public.assembly_components where assembly_id in
  ('00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-0000000039a3');
delete from public.assemblies where id in
  ('00000000-0000-0000-0000-0000000039a2', '00000000-0000-0000-0000-0000000039a3');
select test.feature(:'alpha'::uuid, 'panel_layout', false);
