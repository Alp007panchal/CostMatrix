-- The seed importer (migration 0010) loads the real data/seed files: every
-- component, every kit with exactly one main device, the blank hours template.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

create table pg_temp.seed_components (part_number text, name text, category text, bom_category text,
  brand text, unit text, purchase_price text, purchase_currency text, kg_per_metre text,
  is_enclosure_cubicle text, is_placeholder text, source_file text, flags text);
\copy pg_temp.seed_components from 'data/seed/components.csv' with (format csv, header true)

create table pg_temp.seed_kits (kit_group text, kit_name text, rating text, rating_unit text, poles text,
  line_no text, part_number text, line_category text, quantity text, is_main_device text,
  source_file text, flags text);
\copy pg_temp.seed_kits from 'data/seed/kits.csv' with (format csv, header true)

create table pg_temp.seed_hours (kit_group text, process_type text, hours text, note text);
\copy pg_temp.seed_hours from 'data/seed/kit-group-labour-template.csv' with (format csv, header true)

-- The tests run as the authenticated role; let it read the staging tables.
grant select on pg_temp.seed_components, pg_temp.seed_kits, pg_temp.seed_hours to authenticated;

select count(*) as n_components from pg_temp.seed_components \gset
select count(*) as n_lines from pg_temp.seed_kits \gset
select count(distinct upper(kit_name)) as n_kits from pg_temp.seed_kits \gset
select count(distinct kit_group) as n_groups from pg_temp.seed_kits \gset
select count(*) as before_components from public.components where company_id is null \gset

-- === Preview writes nothing ================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_components((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_components s), null, false, 'components.csv') as preview \gset
select test.eq((:'preview'::jsonb ->> 'new')::int, :n_components, 'the preview counts every seed component as new');
select test.eq(jsonb_array_length(:'preview'::jsonb -> 'rejected'), 0, 'and rejects none');
select test.eq((select count(*) from public.components where company_id is null)::int, :before_components,
  'a preview writes nothing');
rollback;

-- === Apply: components ======================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.import_components((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_components s), null, true, 'components.csv') as r1 \gset
select test.eq((:'r1'::jsonb ->> 'new')::int, :n_components, 'apply imports every seed component');
-- Seven rows are marked placeholder in the seed; one more catalogue part
-- (CSMBS3ISO63X) has no price, and a part without a price is a placeholder.
select test.eq((select count(*) from public.components where company_id is null and is_placeholder)::int, 8,
  'every part without a price is flagged as a placeholder');
select test.eq((select count(*) from public.components where is_placeholder and purchase_price is not null)::int, 0,
  'and none of them carries a price');
select test.eq((select count(*) from public.components where pricing_mode = 'weight_rate' and company_id is null
                and material_rate_code = 'copper_busbar' and import_batch_id is not null)::int, 10,
  'the ten busbar sizes are priced by weight at the copper rate');
select test.eq((select unit_price from public.v_component_prices where code = '3WJ1108-2AE02-1AD0'), 171562.00,
  'an 857.81 EUR ACB lands at 171,562 KES (× 200), as the workbook has it');
select test.eq((select unit_price from public.v_component_prices where code = '30X10MM'), 8064.00,
  'a 30 x 10 busbar is 2.688 kg × 3,000');
select test.eq((select purchase_price from public.components where code = 'NH00-16A'), 0.6305,
  'a four-decimal EUR price is kept as it is (0.6305 × 200 = 126.10, the workbook figure)');
select test.eq((select rows_new from public.import_batches where target = 'components' order by created_at desc limit 1),
  :n_components, 'the upload is recorded with its counts');

-- Second time round: nothing to do.
select app.import_components((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_components s), null, true, 'components.csv') as r2 \gset
select test.eq((:'r2'::jsonb ->> 'unchanged')::int, :n_components, 'importing the same file again changes nothing');
select test.eq((:'r2'::jsonb ->> 'changed')::int, 0, 'not one row');

-- === Apply: kits ===========================================================
select app.import_kits((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_kits s), null, true, 'kits.csv') as k1 \gset
select test.eq((:'k1'::jsonb ->> 'new')::int, :n_kits, 'every kit imports');
select test.eq((:'k1'::jsonb ->> 'groups_new')::int, :n_groups, 'and every kit group');
select test.eq(jsonb_array_length(:'k1'::jsonb -> 'rejected'), 0, 'none rejected');
-- Thirteen lines in the exports repeat a part already in the kit (a cable or
-- busbar line mislabelled with the neighbouring kit's name; see
-- data/seed/README.md "stray-line"). The kits import with the quantities added
-- and a warning each, so the owner sees them; the fix belongs in the raw file.
select test.eq(jsonb_array_length(:'k1'::jsonb -> 'warnings'), 13, 'the thirteen doubled lines are reported as warnings');
select test.eq((select count(*) from public.assembly_components ac join public.assemblies a on a.id = ac.assembly_id
                where a.company_id is null and a.kit_group_id is not null)::int, :n_lines - 14,
  'every other kit line is in (one part is listed three times, so 14 lines merged into 13)');
select test.eq((select count(*) from (
                  select a.id from public.assemblies a
                  join public.assembly_components ac on ac.assembly_id = a.id and ac.is_main_device
                  where a.kit_group_id is not null
                  group by a.id having count(*) = 1) one)::int, :n_kits,
  'every kit has exactly one main device');
select test.eq((select rating from public.assemblies where code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT')), 250.00,
  'the rating is parsed from the seed');
select test.eq((select g.name from public.kit_groups g join public.assemblies a on a.kit_group_id = g.id
                where a.code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT')), 'MCCB',
  'and the kit sits in its group');

select app.import_kits((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_kits s), null, true, 'kits.csv') as k2 \gset
select test.eq((:'k2'::jsonb ->> 'unchanged')::int, :n_kits, 'importing the kits again changes nothing');

-- === Apply: the blank hours template =======================================
select app.import_kit_group_hours((select jsonb_agg(to_jsonb(s)) from pg_temp.seed_hours s), null, true) as h1 \gset
select test.eq((:'h1'::jsonb ->> 'skipped_blank')::int, (select count(*) from pg_temp.seed_hours)::int,
  'the unfilled template imports nothing and says so');
select app.import_kit_group_hours('[{"kit_group":"MCCB","process_type":"assembly","hours":"2"},
                                    {"kit_group":"MCCB","process_type":"wiring","hours":"1.5"},
                                    {"kit_group":"NOPE","process_type":"wiring","hours":"1"}]'::jsonb, null, true) as h2 \gset
select test.eq((:'h2'::jsonb ->> 'new')::int, 2, 'filled rows import');
select test.eq(:'h2'::jsonb -> 'rejected' -> 0 ->> 'reason', 'no such kit group; import the kits first',
  'an unknown group is named');

-- === A placeholder stops a costing ==========================================
select app.import_kits('[{"kit_group":"TEST","kit_name":"PLACEHOLDER KIT","rating":"125","rating_unit":"A","poles":"3",
                          "line_no":"1","part_number":"CSESL125FMU125A3P","quantity":"1","is_main_device":"yes"}]'::jsonb,
                       null, true, 'x.csv') as k3 \gset
select test.eq((:'k3'::jsonb ->> 'new')::int, 1, 'a kit built on a placeholder part imports');
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
select app.import_kits('[{"kit_group":"T","kit_name":"TWO MAINS","line_no":"1","part_number":"3WJ1108-2AE02-1AD0","quantity":"1","is_main_device":"yes"},
                         {"kit_group":"T","kit_name":"TWO MAINS","line_no":"2","part_number":"3WJ1110-2AE02-1AD0","quantity":"1","is_main_device":"yes"},
                         {"kit_group":"T","kit_name":"NO MAIN","line_no":"1","part_number":"30X10MM","quantity":"6.5","is_main_device":"no"},
                         {"kit_group":"T","kit_name":"GHOST PART","line_no":"1","part_number":"NOT-A-PART","quantity":"1","is_main_device":"yes"},
                         {"kit_group":"T","kit_name":"GOOD ONE","line_no":"1","part_number":"3WJ1108-2AE02-1AD0","quantity":"1","is_main_device":"yes"}]'::jsonb,
                       null, false, 'x.csv') as k4 \gset
select test.eq(jsonb_array_length(:'k4'::jsonb -> 'rejected'), 3, 'three bad kits are rejected, the good one is not');
select test.eq((:'k4'::jsonb ->> 'new')::int, 1, 'the good kit would import');
select test.ok((:'k4'::jsonb -> 'rejected')::text like '%2 lines marked as main device%', 'two main devices are named as the reason');
select test.ok((:'k4'::jsonb -> 'rejected')::text like '%no main device%', 'so is a missing one');
select test.ok((:'k4'::jsonb -> 'rejected')::text like '%NOT-A-PART%', 'and an unknown part is named');

select app.import_components('[{"part_number":"X1","name":"Thing","bom_category":"widgets","purchase_price":"1","purchase_currency":"EUR"},
                               {"part_number":"X2","name":"Thing","bom_category":"switchgear","purchase_price":"1","purchase_currency":"GBP"},
                               {"part_number":"","name":"Nameless","bom_category":"switchgear","purchase_price":"1"}]'::jsonb,
                             null, false, 'x.csv') as c4 \gset
select test.eq(jsonb_array_length(:'c4'::jsonb -> 'rejected'), 3, 'unknown category, unknown currency and blank part number are rejected');
rollback;

-- === Who may import ========================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  $$select app.import_components('[{"part_number":"Y1","name":"Mine","bom_category":"switchgear","purchase_price":"1"}]'::jsonb, null, true, 'x.csv')$$,
  'a company admin cannot import into the master library', 'only the master admin');
select app.import_components('[{"part_number":"Y1","name":"Mine","bom_category":"switchgear","purchase_price":"1"}]'::jsonb,
                             :'alpha'::uuid, true, 'x.csv') as a1 \gset
select test.eq((:'a1'::jsonb ->> 'new')::int, 1, 'but may import into their own');
select test.eq((select company_id from public.components where code = 'Y1'), :'alpha'::uuid, 'and the row is theirs');
rollback;

-- Leave the seed in place: later test files and the acceptance test build on it.
