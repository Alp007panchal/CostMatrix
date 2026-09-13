-- What the panel layout will need (migration 0119, roadmap 3.8). Fields and
-- lists only: there is no canvas, and nothing here prices anything.
--
-- Runs after 14, so the kits are the owner's own 296.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- ===========================================================================
-- The three fields on a kit
-- ===========================================================================
select name as kit_name from public.assemblies
 where company_id is null and name like '%ACB-KIT' order by name limit 1 \gset
select id as kit_id from public.assemblies where name = :'kit_name' \gset

select test.ok((select mounting_design is null and module_height_mm is null
                  and positions_per_plate is null
                from public.assemblies where id = :'kit_id'::uuid),
  'every kit starts with no mounting design: the template is the owner''s to fill in');

update public.assemblies
   set mounting_design = 'mccb_plates', module_height_mm = 300, positions_per_plate = 4
 where id = :'kit_id'::uuid;
select test.eq((select module_height_mm from public.assemblies where id = :'kit_id'::uuid), 300,
  'a module height on the 50 mm grid is kept');

select test.refuses(
  format($$update public.assemblies set module_height_mm = 175 where id = %L$$, :'kit_id'),
  'a module height off the 50 mm grid is refused: the S4 covers come in 50 mm steps',
  'assemblies_module_height_grid');
select test.refuses(
  format($$update public.assemblies set positions_per_plate = 0 where id = %L$$, :'kit_id'),
  'a plate that holds nothing is not a plate',
  'assemblies_positions_per_plate_positive');
select test.refuses(
  format($$update public.assemblies set mounting_design = 'wall_bracket' where id = %L$$, :'kit_id'),
  'a mounting design the layout has no rule for is refused by name',
  'invalid input value for enum');

select test.eq((select mounting_design::text from public.v_kits where id = :'kit_id'::uuid), 'mccb_plates',
  'the kit list carries the design, so a picker can group by it');
select test.eq((select positions_per_plate from public.v_kits where id = :'kit_id'::uuid), 4,
  'and how many go across a plate');

update public.assemblies
   set mounting_design = null, module_height_mm = null, positions_per_plate = null
 where id = :'kit_id'::uuid;

-- ===========================================================================
-- The constructions and their lists
-- ===========================================================================
select test.eq((select count(*)::int from public.layout_constructions where company_id is null), 4,
  'four constructions are named: S4, S8, the meter board and our own double-front frame');

select test.eq((select widths_mm from public.layout_constructions where code = 'S4' and company_id is null),
               '{400,600,800,1000,1200}'::integer[],
  'S4 carries the cubicle widths of the Application Manual');
select test.eq((select depths_busbar_top_mm from public.layout_constructions where code = 'S4' and company_id is null),
               '{400,600,800}'::integer[],
  'the depths for a main busbar top or bottom');
select test.eq((select depths_busbar_rear_mm from public.layout_constructions where code = 'S4' and company_id is null),
               '{800,1000,1200}'::integer[],
  'and the deeper ones a rear busbar needs');
select test.eq((select height_mm from public.layout_constructions where code = 'S4' and company_id is null), 2000,
  'the supporting structure is 2,000 mm');
select test.eq((select module_height_step_mm from public.layout_constructions where code = 'S4' and company_id is null), 50,
  'module heights go in 50 mm steps');
select test.ok((select 150 = any(module_heights_mm) and 800 = any(module_heights_mm)
                from public.layout_constructions where code = 'S4' and company_id is null),
  'the cover heights run from 150 to 800 mm');
select test.ok((select allows_double_front from public.layout_constructions
                where code = 'custom_double_front' and company_id is null),
  'our own frame is the one that carries two faces');
select test.ok((select not allows_double_front from public.layout_constructions
                where code = 'S4' and company_id is null),
  'S4 itself is single-front, as the manual says');
select test.eq((select cardinality(widths_mm) from public.layout_constructions
                where code = 'custom_double_front' and company_id is null), 0,
  'and its widths are empty, waiting for the owner rather than invented here');

-- === Who may change a list =================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');   -- a costing engineer
select test.eq((select count(*)::int from public.layout_constructions where code = 'S4'), 1,
  'everybody can read the constructions: a layout has to know the widths');
select test.refuses(
  $$insert into public.layout_constructions (company_id, code, name) values (null, 'S9', 'Mine now')$$,
  'but a costing engineer cannot add to the master list', 'policy');
-- An update is not refused, it simply reaches no row: the policy filters it away
-- before it can match. What matters is that the list is untouched afterwards.
update public.layout_constructions set widths_mm = '{999}' where code = 'S4' and company_id is null;
select test.eq((select widths_mm from public.layout_constructions where code = 'S4' and company_id is null),
               '{400,600,800,1000,1200}'::integer[],
  'and an update she is not allowed to make changes nothing at all');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');   -- Alpha's company administrator
insert into public.layout_constructions (company_id, code, name, widths_mm, allows_double_front)
values (:'alpha'::uuid, 'custom_double_front', 'Our KPLC meter frame', '{600,800}', true);
select test.eq((select count(*)::int from public.layout_constructions where company_id = :'alpha'::uuid), 1,
  'a company administrator may keep its own frame beside the master list');
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');     -- Beta
select test.eq((select count(*)::int from public.layout_constructions where company_id = :'alpha'::uuid), 0,
  'another company sees nothing of it');
select test.eq((select count(*)::int from public.layout_constructions where company_id is null), 4,
  'though both companies read the same master list');
rollback;

delete from public.layout_constructions where company_id = :'alpha'::uuid;

-- ===========================================================================
-- A section has faces, and the column says so
-- ===========================================================================
select test.ok(exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'panel_layouts'
                          and column_name = 'sections'),
  'a layout holds sections');
select test.ok(not exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'panel_layouts'
                              and column_name = 'cubicles'),
  'and no longer cubicles: a double-front board is one section with two faces');
select test.ok(exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'panel_layouts'
                          and column_name = 'construction_code'),
  'and says which construction it was drawn in');

-- ===========================================================================
-- Filling the library from the template
-- ===========================================================================
-- data/seed/kit-layout-template.csv as the Import screen hands it over.
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_kit_layout(jsonb_build_array(
  jsonb_build_object('kitName', :'kit_name', 'mountingDesign', 'busbar_fed',
                     'moduleHeightMm', '600', 'footprintWMm', '620'),
  jsonb_build_object('kitName', :'kit_name', 'mountingDesign', 'trolley'),
  jsonb_build_object('kitName', :'kit_name', 'moduleHeightMm', '175'),
  jsonb_build_object('kitName', :'kit_name', 'positionsPerPlate', '0'),
  jsonb_build_object('kitName', 'NO SUCH KIT', 'mountingDesign', 'mccb_plates'),
  jsonb_build_object('kitName', '', 'mountingDesign', 'mccb_plates'),
  jsonb_build_object('kitName', :'kit_name')), null, false) as preview \gset
rollback;

select test.eq((:'preview'::jsonb ->> 'changed')::int, 1,
  'the preview counts the one row that says something');
select test.eq((:'preview'::jsonb ->> 'blank')::int, 1,
  'a row with nothing filled in is not done yet, not an error');
select test.eq(jsonb_array_length(:'preview'::jsonb -> 'rejected'), 5,
  'and it refuses the unknown design, the off-grid height, the empty plate, the kit nobody has and the nameless row');
select test.ok((:'preview'::jsonb -> 'rejected' -> 0 ->> 'reason') like '%is not one of busbar_fed%',
  'naming what the designs are, rather than saying "invalid"');
select test.ok((:'preview'::jsonb -> 'rejected' -> 1 ->> 'reason') like '%50 mm steps%',
  'and why 175 mm is not a module height');
select test.eq((:'preview'::jsonb ->> 'applied')::boolean, false, 'a preview writes nothing');
select test.ok((select mounting_design is null from public.assemblies where id = :'kit_id'::uuid),
  'which is true: the kit is still unplaced');

begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_kit_layout(jsonb_build_array(
  jsonb_build_object('kitName', :'kit_name', 'mountingDesign', 'busbar_fed',
                     'moduleHeightMm', '600', 'positionsPerPlate', '1', 'footprintWMm', '620')),
  null, true) as applied \gset
commit;

select test.eq((:'applied'::jsonb ->> 'changed')::int, 1, 'applying writes the row');
select test.eq((select mounting_design::text from public.assemblies where id = :'kit_id'::uuid), 'busbar_fed',
  'the kit now knows which design it belongs to');
select test.eq((select module_height_mm from public.assemblies where id = :'kit_id'::uuid), 600,
  'and the height it takes on the stack');
select test.eq((select footprint_w_mm from public.assemblies where id = :'kit_id'::uuid), 620::numeric,
  'the same file fills the F12 footprint, so there is one file per kit, not two');

-- A second pass that names nothing leaves what is there: the file is filled in
-- over weeks, and a blank cell must never wipe an answer already given.
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_kit_layout(jsonb_build_array(
  jsonb_build_object('kitName', :'kit_name', 'positionsPerPlate', '2')), null, true) as second \gset
commit;
select test.eq((select module_height_mm from public.assemblies where id = :'kit_id'::uuid), 600,
  'a blank cell leaves the height alone');
select test.eq((select positions_per_plate from public.assemblies where id = :'kit_id'::uuid), 2,
  'while the cell that was filled in is taken');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.import_kit_layout(jsonb_build_array(jsonb_build_object('kitName', %L, 'mountingDesign', 'mccb_plates')), null, true)$$, :'kit_name'),
  'a costing engineer cannot rewrite the master library from a file',
  'only the master admin may import');
rollback;

-- Put the kit back as the seed left it, so later files see what they expect.
update public.assemblies
   set mounting_design = null, module_height_mm = null, positions_per_plate = null,
       footprint_w_mm = null
 where id = :'kit_id'::uuid;
