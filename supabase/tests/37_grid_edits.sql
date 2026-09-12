-- The grid view (roadmap 2.9) is a second way of editing the same costing, and
-- this is the database half of that promise: the functions it calls are the ones
-- the panel editor calls, so an edit made in the grid leaves exactly what an edit
-- made on a panel card leaves. There is no migration for the grid — the model is
-- built in the web layer from rows these functions write.
--
-- What is asserted here is the contract the grid relies on:
--   1. the same kit added to two panels freezes the same prices and hours;
--   2. changing a quantity does not re-price the line;
--   3. clearing a cell (removing the line) takes its parts and its hours with it;
--   4. a copy of a panel carries the same kits and quantities.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set carol  '00000000-0000-0000-0000-0000000000a4'

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000f901', null, 'GRID TEST GROUP');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000f901', 'assembly', 2);
insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-00000000f9a1', null, 'GRID-KIT', 'GRID TEST KIT',
        '00000000-0000-0000-0000-00000000f901');
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-00000000f9a1', :'part_id'::uuid, 2, true);

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Grid: the same edit either way') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'MDB', 1, 'PC', 0) returning id as mdb \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'DB-1', 2, 'PC', 1) returning id as db1 \gset
-- Typing 1 into the MDB column and 3 into the DB-1 column of the same row.
select app.add_assembly_to_costing(:'mdb'::uuid, '00000000-0000-0000-0000-00000000f9a1'::uuid, 1) as mdb_line \gset
select app.add_assembly_to_costing(:'db1'::uuid, '00000000-0000-0000-0000-00000000f9a1'::uuid, 3) as db1_line \gset
commit;

select test.eq((select count(distinct unit_price)::int from public.costing_items
                where costing_id = :'job'::uuid), 1,
  'the same kit in two panels freezes the same unit price');
select test.eq((select count(distinct hours)::int from public.costing_labour
                where costing_id = :'job'::uuid), 1,
  'and the same hours per kit');
select test.eq((select quantity from public.costing_assemblies where id = :'mdb_line'::uuid), 1::numeric,
  'the MDB cell holds one');
select test.eq((select quantity from public.costing_assemblies where id = :'db1_line'::uuid), 3::numeric,
  'the DB-1 cell holds three');
-- The roll-up the grid's right-hand column shows: quantity × panel quantity.
select test.eq((select sum(ca.quantity * p.quantity) from public.costing_assemblies ca
                 join public.costing_panels p on p.id = ca.panel_id
                where ca.costing_id = :'job'::uuid and ca.kind = 'kit'), 7::numeric,
  'one on the MDB and three on each of two DB-1s is seven kits');

select unit_price as frozen_price from public.costing_items
 where costing_assembly_id = :'db1_line'::uuid limit 1 \gset

-- 2. Changing a quantity is a quantity change, not a re-pricing.
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.components set purchase_price = purchase_price * 2 where id = :'part_id'::uuid;
rollback;
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costing_assemblies set quantity = 6 where id = :'db1_line'::uuid;
commit;
select test.eq((select unit_price from public.costing_items
                where costing_assembly_id = :'db1_line'::uuid limit 1), :frozen_price::numeric,
  'changing a cell''s quantity leaves the frozen price alone');
select test.eq((select quantity from public.costing_assemblies where id = :'db1_line'::uuid), 6::numeric,
  'and the quantity is what was typed');

-- 3. Clearing a cell removes the line, its parts and its hours.
begin;
set local role authenticated;
select test.sign_in(:'carol');
delete from public.costing_assemblies where id = :'mdb_line'::uuid;
commit;
select test.eq((select count(*)::int from public.costing_items
                where costing_assembly_id = :'mdb_line'::uuid), 0,
  'clearing a cell takes the kit''s parts with it');
select test.eq((select count(*)::int from public.costing_labour
                where costing_assembly_id = :'mdb_line'::uuid), 0,
  'and its hours');
select test.eq((select count(*)::int from public.costing_assemblies
                where costing_id = :'job'::uuid and kind = 'kit'), 1,
  'leaving the other panel''s cell as it was');

-- 4. Copy panel, which is what the grid's "Copy panel…" calls.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select (app.copy_panel(:'db1'::uuid, :'job'::uuid, 'DB-2') ->> 'panel_id') as copied \gset
commit;
select test.eq((select name from public.costing_panels where id = :'copied'::uuid), 'DB-2',
  'the copy is a new column with the name it was given');
select test.eq((select quantity from public.costing_assemblies
                where panel_id = :'copied'::uuid and kind = 'kit'), 6::numeric,
  'carrying the same quantity in that row');
select test.eq((select count(*)::int from public.costing_assemblies
                where panel_id = :'copied'::uuid and kind = 'kit'), 1,
  'and the same kits, no more');
select test.eq((select count(*)::int from public.costing_history
                where costing_id = :'job'::uuid), 1,
  'the costing history is the created line only: editing cells is not a lifecycle event');
