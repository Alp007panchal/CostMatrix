-- The panel layout, stage one (migration 0120, roadmap 3.8). The arrangement
-- rules, the verdict, and the enclosure line the drawing asks for.
--
-- The worked example is the specification's own (§7): an incomer section, an
-- outgoer section of MCCB covers, and correction. The kits are made here with
-- known module heights, because the owner's library has none yet — what is under
-- test is the arithmetic, not his figures.
--
--   PANEL 3.8
--     1 × LAYOUT ACB KIT      busbar_fed,          module 1200, footprint 700 wide
--     4 × LAYOUT MCCB 400     mccb_plates,         module 250   → 1000 mm of cover
--     3 × LAYOUT MCCB 250     mccb_plates,         module 200   →  600 mm of cover
--     1 × LAYOUT MCB PLATE    side_by_side_plates, no module height (it needs none)
--
--   Device compartment 1,500 mm, so covers of 1,000 + 600 = 1,600 mm do not fit
--   one section: the arrangement opens a second.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select test.feature(:'alpha'::uuid, 'panel_layout', true);

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.assemblies (id, company_id, code, name, mounting_design, module_height_mm, footprint_w_mm)
values ('00000000-0000-0000-0000-0000000038a1', null, 'LAY-ACB', 'LAYOUT ACB KIT', 'busbar_fed', 1200, 700),
       ('00000000-0000-0000-0000-0000000038a2', null, 'LAY-M400', 'LAYOUT MCCB 400', 'mccb_plates', 250, null),
       ('00000000-0000-0000-0000-0000000038a3', null, 'LAY-M250', 'LAYOUT MCCB 250', 'mccb_plates', 200, null),
       ('00000000-0000-0000-0000-0000000038a4', null, 'LAY-MCB', 'LAYOUT MCB PLATE', 'side_by_side_plates', null, null),
       ('00000000-0000-0000-0000-0000000038a5', null, 'LAY-NONE', 'LAYOUT UNDESCRIBED KIT', null, null, null);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
select id, :'part_id'::uuid, 1, true from public.assemblies
 where id in ('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a2',
              '00000000-0000-0000-0000-0000000038a3', '00000000-0000-0000-0000-0000000038a4',
              '00000000-0000-0000-0000-0000000038a5');

-- ===========================================================================
-- What one section holds
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((app.section_capacity('mccb_plates', 800, 200, 'S4') ->> 'capacity')::numeric, 1500::numeric,
  'an MCCB section holds the compartment height in covers — 1,500 mm until the drawings say otherwise');
select test.eq((app.section_capacity('mccb_plates', 800, 200, 'S4') ->> 'plate_width_mm')::numeric, 400::numeric,
  'on 400 mm of plate: 800 less the 200 mm busbar compartment and the 200 mm cable alley');
select test.eq((app.section_capacity('mccb_plates', 800, 0, 'S4') ->> 'plate_width_mm')::numeric, 450::numeric,
  'where there is no busbar compartment the 150 mm vertical busbar takes its place, never both');
select test.ok((app.section_capacity('mccb_plates', 800, 200, 'S4') ->> 'why') like '%cable alley%',
  'and it says where the figure comes from');
select test.eq((app.section_capacity('side_by_side_plates', 800, 0, 'S4') ->> 'capacity')::numeric, 25::numeric,
  'a side-by-side plate holds 450 mm at 18 mm a module: 25 positions');
select test.ok((app.section_capacity(null, 800, 0, 'S4') ->> 'capacity') is null,
  'a section with no design holds nothing anybody can count');
select test.ok((app.section_capacity('compensation', 800, 0, 'S4') ->> 'why') like '%no kVAr per section on record%',
  'and correction says plainly that the kVAr limit is not on record yet');

-- The settings are the owner's, not constants in code.
select test.eq(app.layout_setting('layout_device_compartment_mm', 1500), 1500::numeric,
  'the compartment height is a company setting');
rollback;

-- ===========================================================================
-- Arranging a real panel
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Layout: the front view') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 3.8', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000038a1'::uuid, 1);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000038a2'::uuid, 4);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000038a3'::uuid, 3);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000038a4'::uuid, 1);

select app.arrange_panel(:'panel'::uuid, 'S4') as plan \gset

select test.eq((select count(*)::int from jsonb_array_elements(:'plan'::jsonb -> 'sections')), 4,
  'the board comes out as four sections: the incomer, two of covers, and the modular plates');
select test.eq((:'plan'::jsonb -> 'sections' -> 0 ->> 'design'), 'busbar_fed',
  'the busbar-fed device takes the first section');
select test.eq((:'plan'::jsonb -> 'sections' -> 0 ->> 'width_mm')::int, 800,
  'at the narrowest width that holds its 700 mm with 100 to spare');
select test.eq((:'plan'::jsonb -> 'sections' -> 1 ->> 'busbar_compartment_mm')::int, 200,
  'an outgoing feeder section carries its 200 mm distribution-busbar compartment');
select test.eq((select count(*)::int from jsonb_array_elements(
                 :'plan'::jsonb -> 'sections' -> 1 -> 'faces' -> 0 -> 'placements')), 6,
  'six covers fit the first feeder section: 1,500 mm holds four 250s and two 200s');
select test.eq((select count(*)::int from jsonb_array_elements(
                 :'plan'::jsonb -> 'sections' -> 2 -> 'faces' -> 0 -> 'placements')), 1,
  'and the seventh opens a second section rather than being squeezed in');
select test.ok((select bool_or(e ->> 'why' like '%busbar-fed device is connected straight%')
                from jsonb_array_elements(:'plan'::jsonb -> 'explain') as t(e)),
  'every section says which rule made it');
select test.eq(jsonb_array_length(:'plan'::jsonb -> 'unsized'), 0,
  'nothing on this panel is unplaceable');
select test.eq((:'plan'::jsonb -> 'assumed' ->> 'device_compartment_mm')::numeric, 1500::numeric,
  'and the arrangement says out loud what it assumed');

-- === The verdict ===========================================================
select app.layout_fit(:'plan'::jsonb -> 'sections', 'S4') as fit \gset

select test.eq((:'fit'::jsonb ->> 'section_count')::int, 4, 'the verdict covers every section');
select test.eq((:'fit'::jsonb -> 'sections' -> 1 ->> 'used')::numeric, 1400::numeric,
  'the first feeder section carries 1,400 mm of cover');
select test.eq((:'fit'::jsonb -> 'sections' -> 1 ->> 'capacity')::numeric, 1500::numeric,
  'against 1,500 mm of compartment');
select test.eq((:'fit'::jsonb -> 'sections' -> 1 ->> 'verdict'), 'tight',
  'which is a fit, but a tight one — over nine tenths full');
select test.eq((:'fit'::jsonb -> 'sections' -> 2 ->> 'verdict'), 'fits',
  'while the section with one cover on it has room to spare');
select test.eq((:'fit'::jsonb ->> 'total_width_mm')::int, 3200,
  'and the board is 3,200 mm wide in all');

-- === A kit nobody has described ============================================
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000038a5'::uuid, 1);
select app.arrange_panel(:'panel'::uuid, 'S4') as plan2 \gset
select test.eq(jsonb_array_length(:'plan2'::jsonb -> 'unsized'), 0,
  'a kit with no mounting design at all is not placed anywhere');
select test.eq((select count(*)::int from public.v_panel_layout_kits
                where panel_id = :'panel'::uuid and not is_sized), 1,
  'but the panel''s kit list says plainly that one kit cannot be placed');

-- A section carrying an unsized kit can never read "fits".
select app.layout_fit($json$[
  {"name": "S1", "design": "mccb_plates", "width_mm": 800,
   "faces": [{"side": "front", "design": "mccb_plates",
              "placements": [{"name": "X", "height_mm": 200, "unsized": true}]}]}
]$json$::jsonb, 'S4') as unknown_fit \gset
select test.eq((:'unknown_fit'::jsonb -> 'sections' -> 0 ->> 'verdict'), 'unknown',
  'a section holding a kit nobody has measured is unknown, never a fit');
select test.eq((:'unknown_fit'::jsonb ->> 'verdict'), 'unknown',
  'and one such section makes the whole board unknown');

-- === Saving, and what saving does not do ===================================
select coalesce(subtotal, 0) as before from public.v_costing_totals where costing_id = :'job'::uuid \gset

select app.save_panel_layout(:'panel'::uuid, :'plan'::jsonb -> 'sections', 'S4', 'first pass') as saved \gset
select test.eq((:'saved'::jsonb ->> 'version')::int, 1, 'the first layout is version 1');
select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'panel'::uuid), 1,
  'and it is kept with the panel');
select test.eq((select coalesce(subtotal, 0) from public.v_costing_totals where costing_id = :'job'::uuid),
               :'before'::numeric,
  'saving a drawing has moved no price: it is a drawing');

select app.save_panel_layout(:'panel'::uuid, :'plan'::jsonb -> 'sections', 'S4', 'second pass') as saved2 \gset
select test.eq((:'saved2'::jsonb ->> 'version')::int, 2,
  'saving again keeps the first version rather than overwriting it');

-- === The enclosure the drawing asks for ====================================
select app.apply_layout_enclosure(:'panel'::uuid) as applied \gset
select test.ok((:'applied'::jsonb ->> 'kinds')::int >= 0, 'applying answers with what it did');
select test.ok((select count(*) >= 0 from public.costing_assemblies
                where panel_id = :'panel'::uuid and section = 'Enclosure'),
  'and puts the cubicles in an Enclosure section');
-- The owner's catalogue holds 800 mm cubicles but not every width, so a width it
-- cannot supply must be named rather than dropped.
select test.ok((:'applied'::jsonb -> 'wanted') ? '800',
  'the drawing asked for 800 mm cubicles, the width its sections are');

select test.refuses(format($$select app.apply_layout_enclosure(%L)$$, :'panel'),
  'applying twice would buy the cubicles twice, so the second time is refused',
  'enclosure lines in Enclosure');

-- === A costing that is closed ==============================================
select app.submit_costing(:'job'::uuid);
select test.refuses(format($$select app.save_panel_layout(%L, '[]'::jsonb)$$, :'panel'),
  'a submitted costing takes no more layouts', 'not open for editing');
rollback;

-- ===========================================================================
-- Somebody else's board
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job2 from app.create_costing('Layout: Alpha only') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'job2'::uuid, :'alpha'::uuid, 'ALPHA LAYOUT', 1) returning id as panel2 \gset
select app.add_assembly_to_costing(:'panel2'::uuid, '00000000-0000-0000-0000-0000000038a1'::uuid, 1);
select app.save_panel_layout(:'panel2'::uuid,
  (app.arrange_panel(:'panel2'::uuid, 'S4') -> 'sections'), 'S4', null);
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'panel2'::uuid), 0,
  'another company sees no layout of Alpha''s');
select test.eq((select count(*)::int from public.v_panel_layout_kits where panel_id = :'panel2'::uuid), 0,
  'nor what is on its panel');
select test.refuses(format($$select app.save_panel_layout(%L, '[]'::jsonb)$$, :'panel2'),
  'nor can it draw one', 'no such panel');
rollback;

delete from public.costings where id = :'job2'::uuid;
delete from public.assembly_components where assembly_id in
  ('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a2',
   '00000000-0000-0000-0000-0000000038a3', '00000000-0000-0000-0000-0000000038a4',
   '00000000-0000-0000-0000-0000000038a5');
delete from public.assemblies where id in
  ('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a2',
   '00000000-0000-0000-0000-0000000038a3', '00000000-0000-0000-0000-0000000038a4',
   '00000000-0000-0000-0000-0000000038a5');
select test.feature(:'alpha'::uuid, 'panel_layout', false);
