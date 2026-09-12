-- Hours that belong to no kit group (migration 0111). 0110 shares a panel's
-- hours across its kit lines in proportion to the estimate; this is what
-- happens to hours there is no estimate to divide by.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000f301', null, 'Unattributed test group');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000f301', 'wiring', 4);
insert into public.components (id, company_id, category_code, code, name, pricing_mode, purchase_price)
values ('00000000-0000-0000-0000-00000000f3f1', null, 'switchgear', 'UNA-DEV', 'Unattributed test device', 'fixed', 8000);
insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-00000000f3a1', null, 'UNA-KIT', 'Unattributed test kit',
        '00000000-0000-0000-0000-00000000f301');
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-00000000f3a1', '00000000-0000-0000-0000-00000000f3f1', 1, true);

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Hours with nowhere to go') \gset

-- One board built from a kit with a standard, one of loose parts with none.
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'KITTED BOARD', 2, 'PC', 0) returning id as kitted \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'LOOSE PARTS BOARD', 1, 'PC', 1) returning id as loose \gset

select app.add_assembly_to_costing(:'kitted'::uuid, '00000000-0000-0000-0000-00000000f3a1'::uuid, 1, 'Incomer');
select app.add_component_to_costing(:'loose'::uuid, '00000000-0000-0000-0000-00000000f3f1'::uuid, 3);

select app.record_actual_hours(:'kitted'::uuid, 'wiring', 9);
select app.record_actual_hours(:'loose'::uuid,  'wiring', 6);
select app.record_actual_hours(:'kitted'::uuid, 'busbar', 2);   -- costed at none
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');

-- The kitted board's wiring is estimated, so 0110 shares it out as before.
select test.eq((select round(actual_hours, 2) from public.v_kit_group_labour_variance
                where kit_group_name = 'Unattributed test group' and process_type = 'wiring'),
               9.00, 'hours on a board costed for that work are still allocated to its kit group');
select test.eq((select count(*)::int from public.v_panel_labour_unattributed
                where panel_id = :'kitted'::uuid and process_type = 'wiring'), 0,
  'and are not counted twice by being called unattributed as well');

-- The loose-parts board was costed at no labour at all: nothing to divide by.
select test.eq((select hours from public.v_panel_labour_unattributed
                where panel_id = :'loose'::uuid and process_type = 'wiring'),
               6.00, 'hours on a board costed at no labour are named, not dropped');
select test.eq((select panel_name from public.v_panel_labour_unattributed
                where panel_id = :'loose'::uuid and process_type = 'wiring'),
               'LOOSE PARTS BOARD', 'with the board they were worked on');

-- A kind of work that panel was not costed for, though its kits were costed for another.
select test.eq((select hours from public.v_panel_labour_unattributed
                where panel_id = :'kitted'::uuid and process_type = 'busbar'),
               2.00, 'busbar hours on a board costed at no busbar work are named too');
select test.eq((select count(*)::int from public.v_kit_group_labour_variance
                where kit_group_name = 'Unattributed test group' and process_type = 'busbar'), 0,
  'rather than landing on a kit group that was costed at none of it');

-- Every recorded hour is either allocated or named: the two add up.
select test.eq((select sum(hours) from public.labour_actuals
                where costing_id = :'job'::uuid),
               (select coalesce((select sum(actual_hours) from public.v_kit_group_labour_variance
                                 where kit_group_name = 'Unattributed test group'), 0)
                     + coalesce((select sum(hours) from public.v_panel_labour_unattributed
                                 where costing_id = :'job'::uuid), 0)),
  'and the report and the unattributed line together account for every hour recorded');

-- Filling the standard in is what moves hours from one to the other.
select test.eq((select count(*)::int from public.v_panel_labour_unattributed
                where costing_id = :'job'::uuid), 2,
  'two lines to explain while the standards are blank');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.eq((select count(*)::int from public.v_panel_labour_unattributed
                where costing_id = :'job'::uuid), 0,
  'another company sees none of it');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.ok((select count(*) > 0 from public.v_panel_labour_unattributed
                where costing_id = :'job'::uuid),
  'the master administrator sees every company''s, as with the report itself');
rollback;

delete from public.costings where id = :'job'::uuid;
delete from public.assembly_components where assembly_id = '00000000-0000-0000-0000-00000000f3a1';
delete from public.assemblies where id = '00000000-0000-0000-0000-00000000f3a1';
delete from public.components where id = '00000000-0000-0000-0000-00000000f3f1';
delete from public.kit_groups where id = '00000000-0000-0000-0000-00000000f301';
