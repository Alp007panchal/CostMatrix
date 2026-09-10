-- Copying a costing and copying a panel (migration 0015). Runs after 14, which
-- leaves the owner's seed, and after 15, which sets Alpha to no discount, no
-- margins, no uplift — so every figure here is the price itself.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- === A costing worth copying ===============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Board for Triclover') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC')
returning id as panel_id \gset

select id as acb from public.components
 where company_id is null and upper(code) = '3WJ1116-2AE42-4DD0-Z F40+R55+T40' \gset
select id as bar from public.components
 where company_id is null and upper(code) = '30X10MM' \gset

select app.add_component_to_costing(:'panel_id'::uuid, :'acb'::uuid, 1, 'Incomer');
select app.add_component_to_costing(:'panel_id'::uuid, :'bar'::uuid, 10, 'Incomer');
select app.add_manual_item(:'panel_id'::uuid, 'SYNCHRO CHECK RELAYS', 'switchgear', 35000.00, 2,
                           'pcs', null, null, 'Incomer');
commit;

select test.eq((select unit_price from public.costing_items
                where costing_id = :'costing_id'::uuid and code = '30X10MM'),
               8400.00, 'the busbar starts at 2.8 kg/m × 3,000 KES/kg');

-- === Copper doubles, then the costing is copied =============================
-- The rate is moved as the owner, inside a transaction that is rolled back at
-- the end: a master rate is the master admin's, and this is about what a copy
-- does with a price that has moved, not about who may move it.
begin;
update public.material_rates set rate = 30 where company_id is null and code = 'copper_busbar';
set local role authenticated;
select test.sign_in(:'carol');
select app.copy_costing(:'costing_id'::uuid, 'Board for Triclover, second job') as report \gset
select (:'report'::jsonb->>'costing_id') as copy_id \gset

select test.eq((select unit_price from public.costing_items
                where costing_id = :'copy_id'::uuid and code = '30X10MM'),
               16800.00, 'the copy takes today''s copper rate: 2.8 kg/m × 6,000');
select test.eq((select unit_price from public.costing_items
                where costing_id = :'costing_id'::uuid and code = '30X10MM'),
               8400.00, 'and the costing it came from does not move');
select test.eq((select unit_price from public.costing_items
                where costing_id = :'copy_id'::uuid and is_manual),
               35000.00, 'a typed line keeps the price somebody typed');
select test.eq((:'report'::jsonb->>'repriced')::int, 2,
  'both catalogue lines were re-priced');
select test.eq(jsonb_array_length(:'report'::jsonb->'kept'), 0,
  'and nothing had to be kept at its old price');

-- A new job, not a revision of the old one.
select test.eq((select revision_no from public.costings where id = :'copy_id'::uuid), 0,
  'a copy is revision 0');
select test.ok((select family_id <> (select family_id from public.costings where id = :'costing_id'::uuid)
                from public.costings where id = :'copy_id'::uuid),
  'with a family of its own');
select test.ok((select costing_no <> (select costing_no from public.costings where id = :'costing_id'::uuid)
                from public.costings where id = :'copy_id'::uuid),
  'and its own number');
select test.ok((select is_current from public.costings where id = :'costing_id'::uuid),
  'the costing it came from is untouched: still the current one');
select test.eq((select status from public.costings where id = :'copy_id'::uuid), 'draft',
  'the copy opens as a draft');
select test.eq((select section from public.costing_assemblies
                where costing_id = :'copy_id'::uuid limit 1), 'Incomer',
  'the sections come with it');
select test.ok((select count(*) > 0 from public.v_costing_history
                where costing_id = :'copy_id'::uuid and action = 'copied'),
  'the history says it was copied');
select test.eq((select details->>'from_costing_no' from public.costing_history
                where costing_id = :'copy_id'::uuid and action = 'copied'),
               (select costing_no from public.costings where id = :'costing_id'::uuid),
  'and names the costing it came from');
rollback;

-- === A part that cannot be re-priced ========================================
-- Same again: the part loses its price only inside this transaction.
begin;
update public.components set purchase_price = null, is_placeholder = true
 where company_id is null and upper(code) = '3WJ1116-2AE42-4DD0-Z F40+R55+T40';
set local role authenticated;
select test.sign_in(:'carol');
select app.copy_costing(:'costing_id'::uuid, 'Copy with an unpriced part') as report2 \gset
select (:'report2'::jsonb->>'costing_id') as copy2_id \gset

select test.eq(jsonb_array_length(:'report2'::jsonb->'kept'), 1,
  'the one line that could not be re-priced is reported, not silently wrong');
select test.eq((:'report2'::jsonb->'kept'->0->>'code'), '3WJ1116-2AE42-4DD0-Z F40+R55+T40',
  'named by its part number');
select test.eq((:'report2'::jsonb->'kept'->0->>'reason'), 'has no price today',
  'with the reason');
select test.eq((select unit_price from public.costing_items
                where costing_id = :'copy2_id'::uuid
                  and code = '3WJ1116-2AE42-4DD0-Z F40+R55+T40'),
               (select unit_price from public.costing_items
                where costing_id = :'costing_id'::uuid
                  and code = '3WJ1116-2AE42-4DD0-Z F40+R55+T40'),
  'and copied at the price it had, so the engineer sees a figure and a warning');
rollback;

-- === Copying one panel ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.copy_panel(:'panel_id'::uuid, :'costing_id'::uuid, 'MAIN LV BOARD (spare)') as panel_report \gset
select (:'panel_report'::jsonb->>'panel_id') as new_panel \gset

select test.eq((select count(*)::int from public.costing_panels where costing_id = :'costing_id'::uuid), 2,
  'the panel is copied beside the one it came from');
select test.eq((select name from public.costing_panels where id = :'new_panel'::uuid),
               'MAIN LV BOARD (spare)', 'under the name asked for');
select test.eq((select count(*)::int from public.costing_items i
                join public.costing_assemblies a on a.id = i.costing_assembly_id
                where a.panel_id = :'new_panel'::uuid), 3,
  'with all three lines');
select test.eq((select sum(i.quantity * i.unit_price) from public.costing_items i
                join public.costing_assemblies a on a.id = i.costing_assembly_id
                where a.panel_id = :'new_panel'::uuid),
               (select sum(i.quantity * i.unit_price) from public.costing_items i
                join public.costing_assemblies a on a.id = i.costing_assembly_id
                where a.panel_id = :'panel_id'::uuid),
  'and the same material, prices being unchanged since');
rollback;

-- === What a copy may not do =================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'costing_id'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.copy_panel(%L, %L, 'Nope')$$, :'panel_id', :'costing_id'),
  'a panel cannot be copied into a costing that is not an open draft',
  'not open for editing');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.refuses(
  format($$select app.copy_costing(%L, 'Not mine')$$, :'costing_id'),
  'another company cannot copy a costing it cannot even see', 'no such costing');
rollback;

delete from public.costings where company_id = :'alpha'::uuid and title like 'Board for Triclover%';
