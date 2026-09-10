-- Two behaviours the earlier files never asserted head-on (sessions 5 and 6
-- review): the master admin reads every company's records but writes none of
-- them, and a company builds private kits from master parts and its own.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === Alpha builds a private kit from a master part and its own =============
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.components (id, company_id, category_code, code, name, pricing_mode, purchase_price, purchase_currency)
values ('00000000-0000-0000-0000-00000000f6c1', :'alpha'::uuid, 'accessories_hardware', 'ALP-LABELS', 'Engraved labels, set', 'fixed', 1500, 'KES');
insert into public.kit_groups (id, company_id, name) values ('00000000-0000-0000-0000-00000000f6e1', :'alpha'::uuid, 'ALPHA SPECIALS');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values ('00000000-0000-0000-0000-00000000f6e1', 'assembly', 3);
insert into public.assemblies (id, company_id, code, name, kit_group_id, rating, rating_unit, poles)
values ('00000000-0000-0000-0000-00000000f6a1', :'alpha'::uuid, 'ALP-MCCB-250', 'Alpha 250A MCCB kit', '00000000-0000-0000-0000-00000000f6e1', 250, 'A', 3);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device) values
  ('00000000-0000-0000-0000-00000000f6a1', (select id from public.components where company_id is null and code = '3VJ1225-3DB32-0AA0'), 1, true),
  ('00000000-0000-0000-0000-00000000f6a1', '00000000-0000-0000-0000-00000000f6c1', 1, false);
select test.eq((select count(*) from public.assembly_components where assembly_id = '00000000-0000-0000-0000-00000000f6a1')::int, 2,
  'a company admin builds a private kit from a master part and one of her own');
select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000f6a1' and process_type = 'assembly'), 3.00,
  'and its hours come from her own kit group');
select test.eq((select group_name from public.v_kits where id = '00000000-0000-0000-0000-00000000f6a1'), 'ALPHA SPECIALS',
  'and the picker shows it under her group');
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.assemblies where id = '00000000-0000-0000-0000-00000000f6a1')::int, 0,
  'Beta cannot see Alpha''s kit');
select test.eq((select count(*) from public.kit_groups where id = '00000000-0000-0000-0000-00000000f6e1')::int, 0,
  'nor its group');
select test.eq((select count(*) from public.components where id = '00000000-0000-0000-0000-00000000f6c1')::int, 0,
  'nor its part');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses(
  $$insert into public.assembly_components (assembly_id, component_id, quantity)
    values ((select id from public.assemblies where company_id is null and code = app.kit_code('250A,TP,MCCB, Adjustable, 25KA-KIT')),
            '00000000-0000-0000-0000-00000000f6c1', 1)$$,
  'a master kit cannot use Alpha''s private part', 'master assembly may only use master components');
rollback;

-- Alpha costs its private kit like any other.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Private kit job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Board', 1, 'PC') returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000f6a1', 1);
-- 19,904.00 for the master MCCB (no discount: Alpha's is 0 in this run) + 1,500 for the labels.
select test.eq((select material_each from public.v_costing_assembly_totals where costing_id = :'costing_id'::uuid), 21404.00,
  'the private kit prices its master and private parts together');
commit;

-- === The master admin reads everything and writes nothing of theirs =========
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.customers (id, company_id, name, city)
values ('00000000-0000-0000-0000-00000000f6d1', :'alpha'::uuid, 'Review Customer Ltd', 'Mombasa');
select id as enq from public.create_enquiry(jsonb_build_object(
  'customer_id', '00000000-0000-0000-0000-00000000f6d1', 'received_on', current_date, 'title', 'Review enquiry')) \gset
commit;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*) from public.costings where title = 'Private kit job')::int, 1,
  'the master admin sees Alpha''s costing');
select test.eq((select count(*) from public.costing_items where costing_id = :'costing_id'::uuid)::int, 2,
  'and its lines');
select test.eq((select count(*) from public.customers where id = '00000000-0000-0000-0000-00000000f6d1')::int, 1,
  'and Alpha''s customer');
select test.eq((select count(*) from public.enquiries where id = :'enq'::uuid)::int, 1,
  'and Alpha''s enquiry');
with attempted as (update public.costings set title = 'Renamed by master' where id = :'costing_id'::uuid returning 1)
select test.eq((select count(*) from attempted)::int, 0, 'but cannot rename it: the update reaches no rows');
with attempted as (update public.customers set name = 'X' where id = '00000000-0000-0000-0000-00000000f6d1' returning 1)
select test.eq((select count(*) from attempted)::int, 0, 'nor change the customer');
select test.refuses(
  format('insert into public.costing_panels (costing_id, company_id, name) values (%L, %L, ''Master panel'')', :'costing_id', :'alpha'),
  'nor add a panel to it', 'row-level security');
select test.refuses(
  format('select app.add_assembly_to_costing(%L, %L, 1)', :'panel_id', '00000000-0000-0000-0000-00000000f6a1'),
  'nor cost anything into it', 'not open for editing');
rollback;

-- Clean up what was committed.
delete from public.costings where title = 'Private kit job';
delete from public.enquiries where id = :'enq'::uuid;
delete from public.customers where id = '00000000-0000-0000-0000-00000000f6d1';
delete from public.assemblies where id = '00000000-0000-0000-0000-00000000f6a1';
delete from public.kit_groups where id = '00000000-0000-0000-0000-00000000f6e1';
delete from public.components where id = '00000000-0000-0000-0000-00000000f6c1';
