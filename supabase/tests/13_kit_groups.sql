-- Kit groups carry the labour hours; a kit overrides one process type at a
-- time; a company override beats both; one main device per kit (migration 0009).

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000e001', null, 'MCCB');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000e001', 'assembly', 2),
  ('00000000-0000-0000-0000-00000000e001', 'wiring',   1.5),
  ('00000000-0000-0000-0000-00000000e001', 'busbar',   0.5);

insert into public.components (id, company_id, category_code, code, name, pricing_mode, purchase_price)
values ('00000000-0000-0000-0000-00000000e0f1', null, 'switchgear', 'MCCB-250', '250A TP MCCB', 'fixed', 19904),
       ('00000000-0000-0000-0000-00000000e0f2', null, 'switchgear', 'MCCB-160B', '160A TP MCCB', 'fixed', 14176);

insert into public.assemblies (id, company_id, code, name, kit_group_id, rating, rating_unit, poles)
values ('00000000-0000-0000-0000-00000000e0a1', null, 'MCCB-250-KIT', '250A,TP,MCCB, Adjustable, 25KA-KIT',
        '00000000-0000-0000-0000-00000000e001', 250, 'A', 3);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-00000000e0f1', 1, true);

-- === Group hours reach a kit with none of its own ==========================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'assembly'),
               2.00, 'a kit with no hours of its own takes the group hours');
select test.eq((select source from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'assembly'),
               'kit_group', 'and says where they came from');
select test.eq((select group_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'busbar'),
               0.50, 'the group figure is visible in its own right');
rollback;

-- === A kit overrides one process type, the group still covers the rest ======
insert into public.assembly_labour (assembly_id, process_type, hours)
values ('00000000-0000-0000-0000-00000000e0a1', 'wiring', 3);

begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'wiring'),
               3.00, 'the kit''s own wiring hours override the group');
select test.eq((select source from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'wiring'),
               'master', 'and count as the kit''s own (master) hours');
select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'assembly'),
               2.00, 'while assembly hours still come from the group');

-- === A company override beats both =========================================
insert into public.company_assembly_hours (company_id, assembly_id, process_type, hours)
values (:'alpha'::uuid, '00000000-0000-0000-0000-00000000e0a1', 'assembly', 1);
select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'assembly'),
               1.00, 'Alpha''s own figure beats the group');
select test.eq((select source from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-00000000e0a1' and process_type = 'assembly'),
               'company_override', 'and is labelled as an override');
rollback;

-- === Group hours are frozen into a costing =================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Kit hours job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Board', 1, 'PC')
returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000e0a1', 1);
select test.eq((select source_hours from public.costing_labour
                where costing_id = :'costing_id'::uuid and process_type = 'assembly'), 2.00,
  'the costing line freezes the group hours as its source');
select test.eq((select source from public.costing_labour
                where costing_id = :'costing_id'::uuid and process_type = 'assembly'), 'kit_group',
  'and remembers they came from the group');
select test.eq((select hours from public.costing_labour
                where costing_id = :'costing_id'::uuid and process_type = 'wiring'), 3.00,
  'while the kit''s own wiring hours are used where it has them');
rollback;

-- === One main device per kit ===============================================
select test.refuses(
  $$insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
    values ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-00000000e0f2', 1, true)$$,
  'a second main device on the same kit is refused', 'assembly_components_one_main_device');

-- === Ownership of groups ===================================================
insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000e002', :'alpha'::uuid, 'ALPHA SPECIALS');
select test.refuses(
  $$update public.assemblies set kit_group_id = '00000000-0000-0000-0000-00000000e002'
    where id = '00000000-0000-0000-0000-00000000e0a1'$$,
  'a master kit cannot join a company''s group', 'master kit may only belong');

-- === Who may edit group hours ==============================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
with attempted as (
  update public.kit_group_labour set hours = 99
  where kit_group_id = '00000000-0000-0000-0000-00000000e001' returning 1)
select test.eq((select count(*) from attempted)::int, 0,
  'a company admin cannot change master group hours');
insert into public.kit_group_labour (kit_group_id, process_type, hours)
values ('00000000-0000-0000-0000-00000000e002', 'assembly', 4);
select test.eq((select hours from public.kit_group_labour
                where kit_group_id = '00000000-0000-0000-0000-00000000e002'), 4.00,
  'but may set hours on its own group');
rollback;

delete from public.assemblies where id = '00000000-0000-0000-0000-00000000e0a1';
delete from public.components where id in ('00000000-0000-0000-0000-00000000e0f1', '00000000-0000-0000-0000-00000000e0f2');
delete from public.kit_groups where id in ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e002');
