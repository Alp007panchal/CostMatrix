-- Sections inside a panel (migration 0014). Runs after 14, which leaves the
-- owner's seed in the database, so the parts and kits here are real ones.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- === The names offered ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select count(*)::int from public.panel_sections), 7,
  'the seven section names are seeded');
select test.eq((select string_agg(name, ', ' order by sort_order) from public.panel_sections),
               'Incomer, AVR bypass, ATS, 2nd incomer, Outgoers, Accessories, APFC bank',
  'in the order the owner wrote them');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');   -- company admin of Alpha, not the master admin
select test.refuses(
  $$insert into public.panel_sections (name, sort_order) values ('Mine', 9)$$,
  'only the master admin adds a section name', 'policy');
rollback;

-- === Building a panel in sections ===========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Sections') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC')
returning id as panel_id \gset

select id as acb from public.components
 where company_id is null and upper(code) = '3WJ1116-2AE42-4DD0-Z F40+R55+T40' \gset
select id as mccb from public.components
 where company_id is null and upper(code) = '3VJ1463-5DB32-0AA0' \gset

select app.add_component_to_costing(:'panel_id'::uuid, :'acb'::uuid, 1, 'Incomer');
select app.add_component_to_costing(:'panel_id'::uuid, :'mccb'::uuid, 3, 'Outgoers');
select app.add_component_to_costing(:'panel_id'::uuid, :'mccb'::uuid, 2, '  Outgoers  ');
select app.add_component_to_costing(:'panel_id'::uuid, :'mccb'::uuid, 1, 'Incomer');
select app.add_manual_item(:'panel_id'::uuid, 'DOOR FURNITURE', 'accessories_hardware', 2500.00, 4,
                           'pcs', null, null, 'Accessories');
select app.add_component_to_costing(:'panel_id'::uuid, :'acb'::uuid, 1);   -- no section at all

select test.eq((select count(*)::int from public.costing_assemblies where panel_id = :'panel_id'::uuid), 4,
  'one loose-parts line per section, and one for the lines with no section');
select test.eq((select string_agg(coalesce(section, '(none)'), ', ' order by sort_order)
                from public.costing_assemblies where panel_id = :'panel_id'::uuid),
               'Incomer, Outgoers, Accessories, (none)',
  'each holder carries its section, in the order the sections were used');

select test.eq((select i.quantity from public.costing_items i
                join public.costing_assemblies a on a.id = i.costing_assembly_id
                where a.panel_id = :'panel_id'::uuid and a.section = 'Outgoers'
                  and i.source_component_id = :'mccb'::uuid),
               5.000,
  'the same part twice in one section adds up (3 + 2), and the spaces around a section name are ignored');
select test.eq((select i.quantity from public.costing_items i
                join public.costing_assemblies a on a.id = i.costing_assembly_id
                where a.panel_id = :'panel_id'::uuid and a.section = 'Incomer'
                  and i.source_component_id = :'mccb'::uuid),
               1.000,
  'but the same part in another section is its own line');
select test.eq((select a.name from public.costing_assemblies a
                where a.panel_id = :'panel_id'::uuid and a.section is null),
               'Components and enclosure',
  'the unsectioned holder keeps the name it always had');

-- A kit goes into a section too.
select id as kit from public.v_kits
 where company_id is null and not has_unpriced_part and line_count > 1
 order by name limit 1 \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, :'kit'::uuid, 2, 'Incomer') as kit_line \gset
select test.eq((select section from public.costing_assemblies where id = :'kit_line'::uuid), 'Incomer',
  'a kit carries the section it was added to');
select test.eq((select kind from public.costing_assemblies where id = :'kit_line'::uuid), 'kit',
  'and is still a kit, beside the loose parts of the same section');
select test.ok((select material_cost > 0 from public.v_costing_panel_costs where panel_id = :'panel_id'::uuid),
  'the panel costs what its sections cost');

-- The database still refuses a second loose-parts holder in one section.
select test.refuses(
  format($$insert into public.costing_assemblies
             (costing_id, panel_id, company_id, kind, section, code, name, quantity)
           values (%L, %L, %L, 'free', 'Incomer', 'FREE', 'Second one', 1)$$,
         :'costing_id', :'panel_id', :'alpha'),
  'a section has one loose-parts line, not two', 'costing_assemblies_one_free_per_section');

-- === A revision keeps the sections ==========================================
select app.submit_costing(:'costing_id'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'costing_id'::uuid);
select id as rev_id from app.create_costing_revision(:'costing_id'::uuid) \gset

select test.eq((select string_agg(coalesce(section, '(none)') || ':' || code, ', ' order by sort_order, code)
                from public.costing_assemblies where costing_id = :'rev_id'::uuid),
               (select string_agg(coalesce(section, '(none)') || ':' || code, ', ' order by sort_order, code)
                from public.costing_assemblies where costing_id = :'costing_id'::uuid),
  'the revision copies every line with its section');
rollback;

-- === Another company sees none of it ========================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.costing_assemblies where costing_id = :'costing_id'::uuid), 0,
  'Beta sees none of Alpha''s sections');
select test.eq((select count(*)::int from public.panel_sections), 7,
  'but everybody reads the names on offer');
rollback;

delete from public.costings where family_id = (select family_id from public.costings where id = :'costing_id'::uuid);
