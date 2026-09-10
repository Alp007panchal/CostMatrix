-- The seed importer (migration 0010) loads the owner's real data/seed files:
-- every component, every kit with its main device, the labour templates.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- The owner's five files, loaded into staging tables and presented as the jsonb the
-- importers want. Shared with the staging seed run from CI, so there is one copy.
\i supabase/seed-csv-load.sql

select count(*) as n_components from pg_temp.seed_components \gset
select count(*) as n_lines from pg_temp.seed_kits \gset
select count(distinct upper(kitName)) as n_kits from pg_temp.seed_kits \gset
select count(distinct labourGroup) as n_groups from pg_temp.seed_kit_tpl \gset
select count(*) as before_components from public.components where company_id is null \gset

-- === Preview writes nothing ================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_components((select j from pg_temp.j_components), (select j from pg_temp.j_catmap), null, false, 'components.csv') as preview \gset
select test.eq((:'preview'::jsonb ->> 'new')::int, :n_components, 'the preview counts every seed component as new');
select test.eq(jsonb_array_length(:'preview'::jsonb -> 'rejected'), 0, 'and rejects none');
select test.eq((select count(*) from public.components where company_id is null)::int, :before_components,
  'a preview writes nothing');
rollback;

-- === Apply: components ======================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_components((select j from pg_temp.j_components), (select j from pg_temp.j_catmap), null, true, 'components.csv') as r1 \gset
select test.eq((:'r1'::jsonb ->> 'new')::int, :n_components, 'apply imports every seed component (735)');
select test.eq((select count(*) from public.components where company_id is null and is_placeholder)::int, 8,
  'eight parts have no price: the seven placeholders and CSMBS3ISO63X');
select test.eq((select count(*) from public.components where is_placeholder and purchase_price is not null)::int, 0,
  'and none of them carries a price');
select test.eq((:'r1'::jsonb ->> 'busbar_kg_derived')::int, 10, 'the ten busbar sizes are priced by weight');
select test.eq((select weight_per_unit from public.components where code = '30X10MM'), 2.800,
  '30 x 10 mm is 42 EUR ÷ 15 = 2.8 kg per metre');
select test.eq((select unit_price from public.v_component_prices where code = '30X10MM'), 8400.00,
  'so it prices at 2.8 × 15 EUR × 200 = 8,400 KES per metre, as the workbook did');
select test.eq((select unit_price from public.v_component_prices where code = '3WJ1108-2AE02-1AD0'), 171562.00,
  'an 857.81 EUR ACB lands at 171,562 KES (× 200), as the workbook has it');
select test.eq((select category_code from public.components where code = 'NH00-16A'), 'accessories_hardware',
  'a "BOM category:" note on a row overrides the category map (fuse links are hardware)');
select test.eq((select category_code from public.components where code = '95SQMM'), 'accessories_hardware',
  'cable is accessories & hardware in the owner''s map');
select test.eq((select unit from public.components where code = '95SQMM'), 'm', 'and sold by the metre');
select test.eq((select rating from public.components where code = '3VJ1463-5DB32-0AA0'), '630A',
  'the parsed rating comes along');
select test.eq((select is_enclosure_cubicle from public.components where code = '800(W)X800(D)X2100(H)-2B'), true,
  'enclosures are cubicles');
select test.eq((select rows_new from public.import_batches where target = 'components' order by created_at desc limit 1),
  :n_components, 'the upload is recorded with its counts');

select app.import_components((select j from pg_temp.j_components), (select j from pg_temp.j_catmap), null, true, 'components.csv') as r2 \gset
select test.eq((:'r2'::jsonb ->> 'unchanged')::int, :n_components, 'importing the same file again changes nothing');
select test.eq((:'r2'::jsonb ->> 'changed')::int, 0, 'not one row');

-- === Apply: kits ===========================================================
select app.import_kits((select j from pg_temp.j_kits), (select j from pg_temp.j_kit_tpl), null, true, 'kits.csv') as k1 \gset
select test.eq((:'k1'::jsonb ->> 'new')::int, :n_kits, 'every kit imports (296)');
select test.eq((:'k1'::jsonb ->> 'groups_new')::int, :n_groups, 'and every labour group becomes a kit group (17)');
select test.eq(jsonb_array_length(:'k1'::jsonb -> 'rejected'), 0, 'none rejected');
select test.eq(jsonb_array_length(:'k1'::jsonb -> 'warnings'), 0, 'and nothing to warn about: the owner''s clean-up did it');
select test.eq((select count(*) from public.assembly_components ac join public.assemblies a on a.id = ac.assembly_id
                where a.company_id is null and a.kit_group_id is not null)::int, :n_lines,
  'every kit line is in (720)');
select test.eq((select count(*) from (
                  select a.id from public.assemblies a
                  join public.assembly_components ac on ac.assembly_id = a.id and ac.is_main_device
                  where a.kit_group_id is not null
                  group by a.id having count(*) = 1) one)::int, :n_kits,
  'every kit has exactly one main device');
select test.eq((select rating from public.assemblies where code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT')), 250.00,
  'the rating is parsed from the kit name');
select test.eq((select g.name from public.kit_groups g join public.assemblies a on a.kit_group_id = g.id
                where a.code = app.kit_code('800A 3P FIXED MANUAL ACB-KIT')), 'ACB frame 1',
  'an 800 A ACB kit sits in labour group "ACB frame 1", not in the export''s ACB section');
select test.eq((select c.code from public.assembly_components ac join public.components c on c.id = ac.component_id
                join public.assemblies a on a.id = ac.assembly_id
                where a.code = app.kit_code('1250A 4P EDO WITH MIRCROPRO4.1 RELAY WM2 ACB-C&S ATS KIT') and ac.is_main_device),
               'WX12N4PEDOA (S)', 'the C&S 1250 A ATS kit is built on the C&S ACB (decision 13)');

select app.import_kits((select j from pg_temp.j_kits), (select j from pg_temp.j_kit_tpl), null, true, 'kits.csv') as k2 \gset
select test.eq((:'k2'::jsonb ->> 'unchanged')::int, :n_kits, 'importing the kits again changes nothing');

-- === Apply: the templates ===================================================
select app.import_kit_group_hours((select j from pg_temp.j_hours), null, true) as h1 \gset
select test.eq((:'h1'::jsonb ->> 'skipped_blank')::int, 3 * (select count(*) from pg_temp.seed_hours)::int,
  'the unfilled group template imports nothing and says so (51 blank cells)');
select test.eq(jsonb_array_length(:'h1'::jsonb -> 'rejected'), 0, 'every labour group in it exists');
select app.import_kit_group_hours('[{"labourGroup":"MCCB","hoursPanelAssembly":"2","hoursWiring":"1.5","hoursBusbarFabrication":""},
                                    {"labourGroup":"NOPE","hoursPanelAssembly":"1","hoursWiring":"","hoursBusbarFabrication":""}]'::jsonb, null, true) as h2 \gset
select test.eq((:'h2'::jsonb ->> 'new')::int, 2, 'filled cells import');
select test.eq((:'h2'::jsonb ->> 'skipped_blank')::int, 1, 'blank cells are skipped');
select test.eq(:'h2'::jsonb -> 'rejected' -> 0 ->> 'reason', 'no such kit group; import the kits first',
  'an unknown group is named');
select test.eq((select effective_hours from public.v_assembly_hours h join public.assemblies a on a.id = h.assembly_id
                where a.code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT') and h.process_type = 'assembly'), 2.00,
  'and a kit in that group now has hours');

-- A per-kit override through the kit template.
select app.import_kits((select j from pg_temp.j_kits),
  '[{"kitName":"250A,TP,MCCB, Adjustable, 25KA-KIT","labourGroup":"MCCB","mainPart":"3VJ1225-3DB32-0AA0","hoursPanelAssembly":"3","hoursWiring":"","hoursBusbarFabrication":""}]'::jsonb,
  null, true, 'kits.csv') as k3 \gset
select test.eq((:'k3'::jsonb ->> 'overrides')::int, 1, 'a filled kit template row becomes an override');
select test.eq((select effective_hours from public.v_assembly_hours h join public.assemblies a on a.id = h.assembly_id
                where a.code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT') and h.process_type = 'assembly'), 3.00,
  'and beats the group for that kit');

-- === A placeholder stops a costing ==========================================
select app.import_kits('[{"kitGroup":"TEST","kitName":"PLACEHOLDER KIT","partNumber":"CSESL125FMU125A3P","quantity":"1"}]'::jsonb,
                       '[{"kitName":"PLACEHOLDER KIT","labourGroup":"TEST","mainPart":"CSESL125FMU125A3P"}]'::jsonb, null, true, 'x.csv') as k4 \gset
select test.eq((:'k4'::jsonb ->> 'new')::int, 1, 'a kit built on a placeholder part imports');
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Placeholder job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Board', 1, 'PC') returning id as panel_id \gset
select test.refuses(
  format('select app.add_assembly_to_costing(%L, (select id from public.assemblies where code = %L), 1)',
         :'panel_id', app.kit_code('PLACEHOLDER KIT')),
  'but cannot be costed until the part is priced', 'has no price yet');
rollback;

-- === Rejections ============================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_kits('[{"kitGroup":"T","kitName":"WRONG MAIN","partNumber":"3WJ1108-2AE02-1AD0","quantity":"1"},
                         {"kitGroup":"T","kitName":"GHOST PART","partNumber":"NOT-A-PART","quantity":"1"},
                         {"kitGroup":"T","kitName":"GOOD ONE","partNumber":"3WJ1108-2AE02-1AD0","quantity":"1"},
                         {"kitGroup":"T","kitName":"GOOD ONE","partNumber":"30X10MM","quantity":"6.5"}]'::jsonb,
                       '[{"kitName":"WRONG MAIN","labourGroup":"T","mainPart":"NOT-IN-KIT"}]'::jsonb, null, false, 'x.csv') as k5 \gset
select test.eq(jsonb_array_length(:'k5'::jsonb -> 'rejected'), 2, 'two bad kits are rejected, the good one is not');
select test.eq((:'k5'::jsonb ->> 'new')::int, 1, 'the good kit would import');
select test.ok((:'k5'::jsonb -> 'rejected')::text like '%NOT-IN-KIT%is not among%', 'a main device that is not a line is named');
select test.ok((:'k5'::jsonb -> 'rejected')::text like '%NOT-A-PART%', 'and an unknown part is named');

select app.import_components('[{"partNumber":"X1","description":"Thing","category":"WIDGETS","priceEur":"1","purchaseCurrency":"EUR"},
                               {"partNumber":"X2","description":"Thing","category":"MCB","priceEur":"1","purchaseCurrency":"GBP"},
                               {"partNumber":"","description":"Nameless","category":"MCB","priceEur":"1","purchaseCurrency":"EUR"}]'::jsonb,
                             (select j from pg_temp.j_catmap), null, false, 'x.csv') as c4 \gset
select test.eq(jsonb_array_length(:'c4'::jsonb -> 'rejected'), 3, 'unknown category, unknown currency and blank part number are rejected');
rollback;

-- === Who may import ========================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  $$select app.import_components('[{"partNumber":"Y1","description":"Mine","category":"MCB","priceEur":"1","purchaseCurrency":"KES"}]'::jsonb,
                                 '[{"category":"MCB","bomCategory":"SWITCHGEAR"}]'::jsonb, null, true, 'x.csv')$$,
  'a company admin cannot import into the master library', 'only the master admin');
select app.import_components('[{"partNumber":"Y1","description":"Mine","category":"MCB","priceEur":"1","purchaseCurrency":"KES"}]'::jsonb,
                             '[{"category":"MCB","bomCategory":"SWITCHGEAR"}]'::jsonb, :'alpha'::uuid, true, 'x.csv') as a1 \gset
select test.eq((:'a1'::jsonb ->> 'new')::int, 1, 'but may import into their own');
select test.eq((select company_id from public.components where code = 'Y1'), :'alpha'::uuid, 'and the row is theirs');
rollback;

-- Leave the seed in place: the acceptance test builds on it.
