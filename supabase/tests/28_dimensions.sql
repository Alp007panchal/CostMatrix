-- F12, physical dimensions (migration 0106): groundwork for the panel layout
-- canvas of phase 3.8. Runs after 14 (the owner's seed) and 15 (Alpha on no
-- margins), so the parts measured here are real ones.
--
-- The point of the whole migration is that it changes nothing until somebody
-- measures something: every new column is nullable, the fit check says "unknown"
-- rather than guessing, and no price moves. The last block asserts exactly that.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === Nothing is measured yet, and that is a legal state =====================
select test.eq((select count(*)::int from public.components where width_mm is not null), 0,
  'the catalogue arrives unmeasured: every width is null, which is allowed');
select test.eq((select count(*)::int from public.panel_layouts), 0,
  'and there are no layouts: the canvas is phase 3.8');
select test.eq((select value from public.company_options
                 where company_id = :'alpha'::uuid and key = 'layout_safety_factor'), '1.3'::jsonb,
  'every company starts with a 1.3 safety factor on the area a board needs');

-- === What the columns refuse =================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select id as dev_id, code as dev_code from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_enclosure_cubicle
 order by code limit 1 \gset
select test.refuses(
  format($$update public.components set width_mm = 0 where id = %L$$, :'dev_id'),
  'a width of zero is not a measurement', 'components_width_mm_check');
select test.refuses(
  format($$update public.components set mounting_type = 'glued' where id = %L$$, :'dev_id'),
  'and a device mounts on one of the six known things', 'components_mounting_known');
select test.refuses(
  format($$update public.components set enclosure_layout = '{"usable_w_mm": 700}'::jsonb where id = %L$$, :'dev_id'),
  'a usable internal area belongs to a cubicle, not to an ACB', 'components_layout_is_enclosure');
rollback;

-- === A measured device, its clearances, and the kit built on it ==============
-- The kit's footprint is the main device plus the room to leave around it, until
-- the kit says otherwise.
begin;
set local role authenticated;
select test.sign_in(:'master');
select id as kit_id, code as kit_code, main_device_code from public.v_kits
 where has_unpriced_part = false and main_device_code is not null
 order by code limit 1 \gset
select component_id as main_id from public.assembly_components
 where assembly_id = :'kit_id'::uuid and is_main_device limit 1 \gset

select test.eq((select (app.kit_footprint(:'kit_id'::uuid) ->> 'known')::boolean), false,
  'an unmeasured kit says so rather than guessing at a size');

update public.components
   set width_mm = 400, height_mm = 600, depth_mm = 300, mounting_type = 'withdrawable',
       weight_kg = 52.5,
       clearances = '{"top": 50, "bottom": 50, "left": 25, "right": 25}'::jsonb
 where id = :'main_id'::uuid;
select app.component_footprint(:'main_id'::uuid) as device_fp \gset
select app.kit_footprint(:'kit_id'::uuid) as kit_fp \gset
commit;

select test.eq((:'device_fp'::jsonb ->> 'w_mm')::numeric, 450::numeric,
  'a device 400 wide with 25 each side takes 450 mm of plate');
select test.eq((:'device_fp'::jsonb ->> 'h_mm')::numeric, 700::numeric,
  'and 600 high with 50 top and bottom takes 700');
select test.eq((:'device_fp'::jsonb ->> 'area_mm2')::numeric, 315000::numeric,
  'which is the area the layout has to find for it');
select test.eq(:'kit_fp'::jsonb ->> 'source', 'main_device',
  'the kit takes its footprint from its main device');
select test.eq((:'kit_fp'::jsonb ->> 'area_mm2')::numeric, 315000::numeric,
  'including the clearances');

-- A kit whose accessories sit beside the device says its own size instead.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.assemblies set footprint_w_mm = 600, footprint_h_mm = 800, footprint_d_mm = 350
 where id = :'kit_id'::uuid;
select app.kit_footprint(:'kit_id'::uuid) as override_fp \gset
commit;
select test.eq(:'override_fp'::jsonb ->> 'source', 'kit',
  'a kit with a footprint of its own uses it');
select test.eq((:'override_fp'::jsonb ->> 'area_mm2')::numeric, 480000::numeric,
  'and the override wins over the main device');

-- === Does it fit? ============================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('F12: does it fit') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC')
returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, :'kit_id'::uuid, 2, 'Incomer');
select app.panel_fit(:'panel_id'::uuid) as fit_no_cubicle \gset
commit;

select test.eq(:'fit_no_cubicle'::jsonb ->> 'verdict', 'unknown',
  'a panel with no cubicles on it cannot be judged, and says so');
select test.eq((:'fit_no_cubicle'::jsonb ->> 'kits_measured')::int, 1,
  'though it does say how many of its kits are measured');
select test.eq((:'fit_no_cubicle'::jsonb ->> 'kit_area_mm2')::numeric, 960000::numeric,
  'and what they come to: 480,000 each, two of them');

-- A cubicle with a known usable area, bought twice.
begin;
set local role authenticated;
select test.sign_in(:'master');
select id as cubicle_id, code as cubicle_code from public.v_component_prices
 where is_enclosure_cubicle and unit_price is not null order by code limit 1 \gset
update public.components
   set width_mm = 800, height_mm = 2100, depth_mm = 800,
       enclosure_layout = jsonb_build_object('usable_w_mm', 700, 'usable_h_mm', 1800,
                                             'usable_d_mm', 600, 'form', '3B',
                                             'busbar_chamber', jsonb_build_object('w_mm', 800, 'h_mm', 300))
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'carol');
select app.add_component_to_costing(:'panel_id'::uuid, :'cubicle_id'::uuid, 2, 'Enclosure');
select app.panel_fit(:'panel_id'::uuid) as fit_roomy \gset
commit;

select test.eq((:'fit_roomy'::jsonb ->> 'usable_area_mm2')::numeric, 2520000::numeric,
  'two cubicles of 700 × 1800 offer 2,520,000 mm² of plate');
select test.eq((:'fit_roomy'::jsonb ->> 'required_area_mm2')::numeric, 1248000::numeric,
  'the kits need 960,000 × the 1.3 safety factor');
select test.eq(:'fit_roomy'::jsonb ->> 'verdict', 'fits',
  'which fits with room to spare');
select test.eq((:'fit_roomy'::jsonb ->> 'used_pct')::numeric, 49.5::numeric,
  'and the screen can say how full the board is');
select test.eq((:'fit_roomy'::jsonb -> 'cubicles' -> 0 ->> 'known')::boolean, true,
  'with the cubicle counted as measured');

-- Eight of that kit in the same two cubicles do not fit.
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costing_assemblies set quantity = 8
 where panel_id = :'panel_id'::uuid and kind = 'kit';
select app.panel_fit(:'panel_id'::uuid) as fit_full \gset
commit;
select test.eq(:'fit_full'::jsonb ->> 'verdict', 'no_fit',
  'eight of them in the same two cubicles do not fit');
select test.ok((:'fit_full'::jsonb ->> 'used_pct')::numeric > 100,
  'and the figure says by how much');

-- A second, unmeasured kit: the answer names it instead of pretending.
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costing_assemblies set quantity = 2 where panel_id = :'panel_id'::uuid and kind = 'kit';
select id as other_kit from public.v_kits
 where has_unpriced_part = false and id <> :'kit_id'::uuid order by code limit 1 \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, :'other_kit'::uuid, 1, 'Outgoers');
select app.panel_fit(:'panel_id'::uuid) as fit_partial \gset
commit;
select test.eq((:'fit_partial'::jsonb ->> 'kits_unmeasured')::int, 1,
  'a kit nobody has measured is counted as unmeasured');
select test.ok((:'fit_partial'::jsonb -> 'unmeasured' -> 0 ->> 'name') is not null,
  'and named, so somebody knows what to measure next');
select test.eq(:'fit_partial'::jsonb ->> 'verdict', 'fits',
  'the verdict still comes from what is known, which is honest about being partial');

-- The safety factor is the company's to change.
begin;
set local role authenticated;
select test.sign_in(:'alice');
update public.company_options set value = '2.6'::jsonb
 where company_id = :'alpha'::uuid and key = 'layout_safety_factor';
select test.sign_in(:'carol');
select app.panel_fit(:'panel_id'::uuid) as fit_tight \gset
select test.sign_in(:'alice');
update public.company_options set value = '3.5'::jsonb
 where company_id = :'alpha'::uuid and key = 'layout_safety_factor';
select test.sign_in(:'carol');
select app.panel_fit(:'panel_id'::uuid) as fit_strict \gset
rollback;
select test.eq((:'fit_tight'::jsonb ->> 'safety_factor')::numeric, 2.6::numeric,
  'a company that wants more room says so in its settings');
select test.eq(:'fit_tight'::jsonb ->> 'verdict', 'tight',
  'at 2.6 the same board is full but possible, which is worth saying rather than hiding');
select test.eq(:'fit_strict'::jsonb ->> 'verdict', 'no_fit',
  'and at 3.5 it does not fit at all');

-- === A layout row, and who may see it =======================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.panel_layouts (company_id, panel_id, version, cubicles, note)
values (:'alpha'::uuid, :'panel_id'::uuid, 1,
        jsonb_build_array(jsonb_build_object(
          'name', 'Cubicle 1', 'component_id', :'cubicle_id', 'w_mm', 800, 'h_mm', 2100, 'd_mm', 800,
          'placements', jsonb_build_array(jsonb_build_object(
            'costing_assembly_id', (select id from public.costing_assemblies where panel_id = :'panel_id'::uuid and kind = 'kit' limit 1),
            'x_mm', 40, 'y_mm', 120, 'w_mm', 600, 'h_mm', 800, 'rotation', 0)))),
        'first pass')
returning id as layout_id \gset
commit;

select test.eq((select jsonb_array_length(cubicles) from public.panel_layouts where id = :'layout_id'::uuid), 1,
  'a layout keeps its cubicles and the placements inside them');
select test.eq((select cubicles -> 0 -> 'placements' -> 0 ->> 'x_mm' from public.panel_layouts where id = :'layout_id'::uuid), '40',
  'in millimetres from the top left');

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.panel_layouts), 0,
  'another company sees no layout of Alpha''s');
select test.refuses(
  format($$insert into public.panel_layouts (company_id, panel_id, cubicles) values (%L, %L, '[]'::jsonb)$$,
         :'beta', :'panel_id'),
  'and cannot lay out its panel', 'policy');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.panel_layouts (company_id, panel_id, version, cubicles) values (%L, %L, 1, '[]'::jsonb)$$,
         :'alpha', :'panel_id'),
  'one version of a panel''s layout is one row', 'panel_layouts_panel_id_version_key');
rollback;

-- === The dimensions template ================================================
-- data/seed/dimensions-template.csv, as the Import screen hands it over: part
-- numbers already filled in, measurements for a person to complete.
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_dimensions(jsonb_build_array(
  jsonb_build_object('partNumber', :'dev_code', 'widthMm', '210', 'heightMm', '300',
                     'depthMm', '120', 'mountingType', 'plate', 'weightKg', '4.2',
                     'clearanceTopMm', '30', 'clearanceBottomMm', '30'),
  jsonb_build_object('partNumber', :'cubicle_code', 'usableWMm', '650', 'usableHMm', '1750',
                     'formOfSeparation', '4B'),
  jsonb_build_object('partNumber', :'dev_code', 'widthMm', '', 'mountingType', 'welded'),
  jsonb_build_object('partNumber', 'NO-SUCH-PART', 'widthMm', '100'),
  jsonb_build_object('partNumber', '', 'widthMm', '100'),
  jsonb_build_object('partNumber', :'kit_code')), null, false) as preview \gset
rollback;

select test.eq((:'preview'::jsonb ->> 'changed')::int, 2,
  'the preview counts the two rows that carry a measurement');
select test.eq(jsonb_array_length(:'preview'::jsonb -> 'rejected'), 4,
  'and refuses the unknown mounting, the unknown part, the blank row and the kit code');
select test.eq((:'preview'::jsonb ->> 'applied')::boolean, false,
  'a preview writes nothing');
select test.ok((select width_mm is null from public.components where code = :'dev_code'),
  'which is true: the part is still unmeasured');

begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_dimensions(jsonb_build_array(
  jsonb_build_object('partNumber', :'dev_code', 'widthMm', '210', 'heightMm', '300',
                     'depthMm', '120', 'mountingType', 'plate', 'weightKg', '4.2',
                     'clearanceTopMm', '30', 'clearanceBottomMm', '30'),
  jsonb_build_object('partNumber', :'cubicle_code', 'usableWMm', '650', 'formOfSeparation', '4B')),
  null, true) as applied \gset
commit;

select test.eq((:'applied'::jsonb ->> 'changed')::int, 2, 'applying writes both rows');
select test.eq((select width_mm from public.components where code = :'dev_code'), 210::numeric,
  'the part is measured');
select test.eq((select mounting_type from public.components where code = :'dev_code'), 'plate',
  'with what it mounts on');
select test.eq((select clearances ->> 'top' from public.components where code = :'dev_code'), '30',
  'and the room to leave above it');
select test.eq((select enclosure_layout ->> 'usable_w_mm' from public.components where id = :'cubicle_id'::uuid), '650',
  'the cubicle keeps its new usable width');
select test.eq((select enclosure_layout ->> 'usable_h_mm' from public.components where id = :'cubicle_id'::uuid), '1800',
  'and the height the earlier edit gave it, because a blank cell changes nothing');
select test.eq((select enclosure_layout ->> 'form' from public.components where id = :'cubicle_id'::uuid), '4B',
  'with the form of separation the file named');

begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  format($$select app.import_dimensions(jsonb_build_array(jsonb_build_object('partNumber', %L, 'widthMm', '1')), null, true)$$, :'dev_code'),
  'a company admin cannot measure the master catalogue',
  'only the master admin may import into the master library');
rollback;

-- A blank row is somebody who has not got to that part yet, not an error.
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_dimensions(jsonb_build_array(
  jsonb_build_object('partNumber', :'cubicle_code')), null, false) as blanks \gset
rollback;
select test.eq((:'blanks'::jsonb ->> 'skipped_blank')::int, 1,
  'an unfilled row is counted as not done yet, not rejected');

-- === Nothing priced changed ==================================================
select test.eq((select count(*)::int from public.component_price_history
                where changed_at > now() - interval '1 minute'), 0,
  'measuring parts wrote no price history');
select test.ok((select purchase_price > 0 from public.components where id = :'dev_id'::uuid),
  'and the prices are as they were');

-- Leave things as found: later tests read this seed.
update public.components set width_mm = null, height_mm = null, depth_mm = null,
       mounting_type = null, weight_kg = null, clearances = '{}'::jsonb, enclosure_layout = '{}'::jsonb
 where width_mm is not null or clearances <> '{}'::jsonb or enclosure_layout <> '{}'::jsonb;
update public.assemblies set footprint_w_mm = null, footprint_h_mm = null, footprint_d_mm = null
 where id = :'kit_id'::uuid;
delete from public.costings where id = :'costing_id'::uuid;
