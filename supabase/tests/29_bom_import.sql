-- Importing somebody else's parts list (migration 0107, roadmap 2.3). Runs after
-- 14, so the matching is tried against the owner's real 735 parts and 296 kits.
--
-- The two things worth proving: a device that is a kit's main device comes back
-- as the kit, because that is what this company costs with; and nothing reaches
-- the costing until a person chooses, at which point every line says it came
-- from a file.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- A real kit with a real main device, and a catalogue part that is nobody's main
-- device, so the two branches of the matching are both exercised.
select k.id as kit_id, k.name as kit_name, ac.component_id as device_id
  from public.v_kits k
  join public.assembly_components ac on ac.assembly_id = k.id and ac.is_main_device
 where k.has_unpriced_part = false
   and (select count(*) from public.assembly_components x
         where x.is_main_device and x.component_id = ac.component_id) = 1
 order by k.code limit 1 \gset
select code as device_code, part_number as device_ref, manufacturer as device_make
  from public.components where id = :'device_id'::uuid \gset

select id as loose_id, code as loose_code from public.components c
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not exists (select 1 from public.assembly_components x where x.is_main_device and x.component_id = c.id)
 order by code limit 1 \gset

-- === A draft costing to import into ========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('BOM: the consultant''s schedule') \gset
commit;

-- === The preview ============================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.start_bom_import(:'costing_id'::uuid, 'consultant-schedule.csv',
  jsonb_build_array(
    -- 1. a device that is a kit's main device: the kit is what a costing uses
    jsonb_build_object('row', 2, 'key', :'device_code', 'qty', '3', 'description', 'Outgoing feeder'),
    -- 2. a catalogue part that is nobody's main device: it comes in as itself
    jsonb_build_object('row', 3, 'key', :'loose_code', 'qty', '2'),
    -- 3. a part number nobody has
    jsonb_build_object('row', 4, 'key', 'CONSULTANT-SPECIAL-1', 'qty', '1', 'description', 'Synchro check relay'),
    -- 4. no quantity column at all: a schedule that lists one of each
    jsonb_build_object('row', 5, 'key', :'loose_code'),
    -- 5. a quantity that is not a number
    jsonb_build_object('row', 6, 'key', :'loose_code', 'qty', 'as required'),
    -- 6. no part number
    jsonb_build_object('row', 7, 'key', '', 'qty', '1', 'description', 'Sundries'),
    -- 7. a quantity of zero
    jsonb_build_object('row', 8, 'key', :'loose_code', 'qty', '0')),
  jsonb_build_object('key', 'Cat. No', 'qty', 'Qty')) as job \gset
commit;

select test.eq((select type from public.import_jobs where id = :'job'::uuid), 'bom',
  'the upload is an import job of its own kind');
select test.eq((select status from public.import_jobs where id = :'job'::uuid), 'preview',
  'waiting for a person');
select test.eq((select summary ->> 'costing_id' from public.import_jobs where id = :'job'::uuid), :'costing_id',
  'and it remembers which costing it is for');
select test.eq((select count(*)::int from public.import_rows where job_id = :'job'::uuid), 7,
  'with one row per line of the file');

select test.eq((select raw -> 'proposal' ->> 'kind' from public.import_rows where job_id = :'job'::uuid and row_number = 2), 'kit',
  'a device that is a kit''s main device is proposed as that kit');
select test.eq((select raw -> 'proposal' ->> 'ref_id' from public.import_rows where job_id = :'job'::uuid and row_number = 2), :'kit_id',
  'naming the kit itself');
select test.ok((select message like '%main device of the kit%' from public.import_rows where job_id = :'job'::uuid and row_number = 2),
  'and saying why, in words');
select test.eq((select (raw ->> 'qty')::numeric from public.import_rows where job_id = :'job'::uuid and row_number = 2), 3::numeric,
  'with the quantity the file asked for');

select test.eq((select raw -> 'proposal' ->> 'kind' from public.import_rows where job_id = :'job'::uuid and row_number = 3), 'component',
  'a part that is nobody''s main device comes in as itself');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 4), 'warning',
  'a part number the catalogue does not have needs a person');
select test.ok((select message like '%not in the catalogue%placeholder%' from public.import_rows where job_id = :'job'::uuid and row_number = 4),
  'and is offered as a placeholder rather than guessed at');
select test.eq((select (raw ->> 'qty')::numeric from public.import_rows where job_id = :'job'::uuid and row_number = 5), 1::numeric,
  'a schedule with no quantity column means one of each');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 6), 'rejected',
  '"as required" is not a quantity');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 7), 'rejected',
  'nor is a row with no part number usable');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 8), 'rejected',
  'nor a quantity of zero');

-- Nothing has reached the costing.
select test.eq((select count(*)::int from public.costing_panels where costing_id = :'costing_id'::uuid), 0,
  'after a preview the costing still has no panel: nothing was written to it');

-- === Another company cannot see or apply it =================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.import_rows where job_id = :'job'::uuid), 0,
  'a company admin elsewhere sees none of Alpha''s parts list');
select test.refuses(
  format($$select app.apply_bom_import(%L, '{"lines": [{"row_id": "00000000-0000-0000-0000-000000000001", "kind": "skip"}]}'::jsonb)$$, :'job'),
  'and cannot apply it', 'no such import');
rollback;

-- === Apply: the kit, the part, one row left out =============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as row_kit   from public.import_rows where job_id = :'job'::uuid and row_number = 2 \gset
select id as row_part  from public.import_rows where job_id = :'job'::uuid and row_number = 3 \gset
select id as row_none  from public.import_rows where job_id = :'job'::uuid and row_number = 4 \gset
select app.apply_bom_import(:'job'::uuid, jsonb_build_object(
  'panel_name', 'From the consultant''s schedule',
  'lines', jsonb_build_array(
    jsonb_build_object('row_id', :'row_kit',  'kind', 'kit',       'ref_id', :'kit_id',  'qty', 3, 'section', 'Outgoers'),
    jsonb_build_object('row_id', :'row_part', 'kind', 'component', 'ref_id', :'loose_id', 'qty', 2, 'section', 'Accessories'),
    jsonb_build_object('row_id', :'row_none', 'kind', 'skip')))) as result \gset
commit;

select test.eq((:'result'::jsonb ->> 'lines')::int, 2, 'two lines were brought in');
select test.eq((:'result'::jsonb ->> 'skipped')::int, 1, 'and one was left out');
select test.eq((select name from public.costing_panels where id = (:'result'::jsonb ->> 'panel_id')::uuid),
               'From the consultant''s schedule',
  'they land on a panel of their own, named by the person');
select test.eq((select count(*)::int from public.costing_assemblies
                where panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and kind = 'kit'), 1,
  'the kit is on it');
select test.eq((select quantity from public.costing_assemblies
                where panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and kind = 'kit'), 3::numeric,
  'three of them, as the schedule said');
select test.eq((select origin from public.costing_assemblies
                where panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and kind = 'kit'), 'import',
  'and it says it came from a file');
select test.eq((select origin_ref from public.costing_assemblies
                where panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and kind = 'kit'), :'job'::uuid,
  'naming which file');
select test.eq((select count(*)::int from public.costing_items i
                join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and i.origin <> 'import'), 0,
  'every part under it says the same');
select test.ok((select unit_price > 0 from public.costing_items i
                join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.panel_id = (:'result'::jsonb ->> 'panel_id')::uuid and i.source_component_id = :'loose_id'::uuid),
  'the imported part is priced by the engine, exactly as a hand-added one is');
select test.eq((select status from public.import_rows where id = :'row_kit'::uuid), 'accepted',
  'the rows that came in are marked accepted');
select test.eq((select status from public.import_rows where id = :'row_none'::uuid), 'skipped',
  'and the one left out is marked left out');
select test.eq((select status from public.import_jobs where id = :'job'::uuid), 'preview',
  'the job stays open while a row still needs a person');
select test.eq((select count(*)::int from public.activity_log
                where entity_id = :'costing_id'::uuid and action = 'bom.imported'), 1,
  'and the costing''s history records the import');

-- === A placeholder for what nobody has ======================================
-- An engineer may not add to the library; an administrator may.
begin;
set local role authenticated;
select test.sign_in(:'carol');   -- costing engineer
select app.start_bom_import(:'costing_id'::uuid, 'second-pass.csv',
  jsonb_build_array(jsonb_build_object('row', 2, 'key', 'CONSULTANT-SPECIAL-1', 'qty', '2',
                                       'description', 'Synchro check relay', 'maker', 'ACME'))) as job2 \gset
select id as row_new from public.import_rows where job_id = :'job2'::uuid and row_number = 2 \gset
select test.refuses(
  format($$select app.apply_bom_import(%L, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('row_id', %L, 'kind', 'placeholder'))))$$,
         :'job2', :'row_new'),
  'a costing engineer cannot invent a catalogue part, and is told who can',
  'company administrator''s job');
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');   -- company admin
select app.apply_bom_import(:'job2'::uuid, jsonb_build_object(
  'panel_name', 'Second pass',
  'lines', jsonb_build_array(jsonb_build_object('row_id', :'row_new', 'kind', 'placeholder',
                                                'category', 'switchgear')))) as result2 \gset
commit;

select test.eq((:'result2'::jsonb ->> 'placeholders')::int, 1, 'an administrator can add the part');
select test.eq((:'result2'::jsonb ->> 'lines')::int, 0,
  'but no costing line is made: a part with no price cannot be costed, and the engine says so');
select test.ok((:'result2'::jsonb ->> 'panel_id') is null,
  'so no empty panel is left behind either');
select test.ok((select message like '%price it, then add it to the costing%'
                from public.import_rows where id = :'row_new'::uuid),
  'and the row says what has to happen next');
select test.eq((select is_placeholder from public.components where code = 'CONSULTANT-SPECIAL-1'), true,
  'it arrives as a placeholder, with no price');
select test.eq((select company_id from public.components where code = 'CONSULTANT-SPECIAL-1'), :'alpha'::uuid,
  'in that company''s own library, not the shared one');
select test.eq((select part_number from public.components where code = 'CONSULTANT-SPECIAL-1'), 'CONSULTANT-SPECIAL-1',
  'keeping the reference the file used');
select test.ok((select description like 'Added from second-pass.csv%' from public.components where code = 'CONSULTANT-SPECIAL-1'),
  'and saying where it came from');
select test.eq((select status from public.import_jobs where id = :'job2'::uuid), 'applied',
  'that job is finished, because no row still needs a person');
select test.eq((select count(*)::int from public.costing_items
                where source_component_id = (select id from public.components where code = 'CONSULTANT-SPECIAL-1')), 0,
  'and nothing unpriced reached the costing');

-- The same part again, once it has a price: now it can be costed.
begin;
set local role authenticated;
select test.sign_in(:'alice');
update public.components set purchase_price = 35000, is_placeholder = false
 where code = 'CONSULTANT-SPECIAL-1' and company_id = :'alpha'::uuid;
select id as special_id from public.components where code = 'CONSULTANT-SPECIAL-1' \gset
select app.start_bom_import(:'costing_id'::uuid, 'third-pass.csv',
  jsonb_build_array(jsonb_build_object('row', 2, 'key', 'CONSULTANT-SPECIAL-1', 'qty', '2'))) as job3 \gset
select id as row_priced from public.import_rows where job_id = :'job3'::uuid and row_number = 2 \gset
select app.apply_bom_import(:'job3'::uuid, jsonb_build_object(
  'lines', jsonb_build_array(jsonb_build_object('row_id', :'row_priced', 'kind', 'component',
                                                'ref_id', :'special_id')))) as result3 \gset
commit;

select test.eq((select raw -> 'proposal' ->> 'kind' from public.import_rows where id = :'row_priced'::uuid), 'component',
  'the part the last pass created is found by the next file that names it');
select test.eq((:'result3'::jsonb ->> 'lines')::int, 1, 'and now it can be brought onto the costing');
select test.eq((select origin from public.costing_items where source_component_id = :'special_id'::uuid), 'import',
  'saying it came from a file');
select test.ok((select unit_price > 0 from public.costing_items where source_component_id = :'special_id'::uuid),
  'at the price it was given');

-- === What the importer refuses ==============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.apply_bom_import(%L, '{"lines": []}'::jsonb)$$, :'job2'),
  'a job that is already applied cannot be applied again', 'already applied');
select test.refuses(
  format($$select app.start_bom_import(%L, 'x.csv', '[]'::jsonb)$$, :'costing_id'),
  'an empty file is refused with a sentence, not a crash', 'no rows to read');
rollback;

-- An approved costing is closed to imports, as it is to every other change.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as approved_id from app.create_costing('BOM: approved and closed') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'approved_id'::uuid, :'alpha'::uuid, 'Panel', 1, 'PC');
select app.submit_costing(:'approved_id'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'approved_id'::uuid);
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.start_bom_import(%L, 'late.csv', jsonb_build_array(jsonb_build_object('key', %L, 'qty', '1')))$$,
         :'approved_id', :'loose_code'),
  'and an approved costing takes no imports', 'not open for editing');
rollback;

-- Leave things as found.
delete from public.costings where id = :'costing_id'::uuid;
delete from public.components where code = 'CONSULTANT-SPECIAL-1';
delete from public.import_jobs where id in (:'job'::uuid, :'job2'::uuid, :'job3'::uuid);
