-- Kits that work out their own quantities (migration 0112, roadmap 3.3).
-- The rule 0100 wrote and this keeps: no formula means the quantity as it is,
-- which is every line in the owner's library.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- === Working one out, on its own ===========================================
select test.eq(app.eval_qty_expression('6.5'), 6.500, 'a plain number is a quantity');
select test.eq(app.eval_qty_expression('steps * 2', '{"steps": "4"}'), 8.000,
  'a parameter is substituted and the arithmetic done');
select test.eq(app.eval_qty_expression('round(steps / 3)', '{"steps": "7"}'), 2.000,
  'round, floor, ceil, greatest and least are allowed');
select test.eq(app.eval_qty_expression('greatest(steps - 4, 0)', '{"steps": "2"}'), 0.000,
  'and a formula may legitimately come to zero');
select test.eq(app.eval_qty_expression('metres * steps', '{"metres": "2.5", "steps": "4"}'), 10.000,
  'two parameters together');
select test.eq(app.eval_qty_expression('steps_spare + steps', '{"steps": "2", "steps_spare": "3"}'), 5.000,
  'a longer name is substituted first, so steps cannot eat steps_spare');

select test.refuses($$select app.eval_qty_expression('gremlins * 2', '{"steps": "4"}')$$,
  'a name nobody defined is refused, and named', 'the formula uses gremlins');
select test.refuses($$select app.eval_qty_expression('1; drop table public.components', '{}')$$,
  'and so is anything that is not arithmetic', 'the formula uses drop');
select test.refuses($$select app.eval_qty_expression('(select 1)', '{}')$$,
  'including a query dressed up as a formula', 'the formula uses select');
select test.refuses($$select app.eval_qty_expression('0 - 5', '{}')$$,
  'a quantity cannot come out negative', 'cannot be negative');
select test.refuses($$select app.eval_qty_expression('4 / 0', '{}')$$,
  'and a formula that cannot be worked out says so', 'did not work out');
select test.refuses($$select app.eval_qty_expression('', '{}')$$,
  'an empty formula is not a formula', 'formula is empty');

-- === A parameterised kit ====================================================
insert into public.kit_groups (id, company_id, name) values
  ('00000000-0000-0000-0000-00000000f401', null, 'Parameterised test group');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000f401', 'assembly', 2);

insert into public.components (id, company_id, category_code, code, name, pricing_mode, purchase_price, unit) values
  ('00000000-0000-0000-0000-00000000f4f1', null, 'switchgear', 'PAR-MAIN', 'Parameter test main device', 'fixed', 10000, 'pcs'),
  ('00000000-0000-0000-0000-00000000f4f2', null, 'busbar',     'PAR-BAR',  'Parameter test busbar',      'fixed', 1000,  'm'),
  ('00000000-0000-0000-0000-00000000f4f3', null, 'switchgear', 'PAR-STEP', 'Parameter test step',        'fixed', 2000,  'pcs'),
  ('00000000-0000-0000-0000-00000000f4f4', null, 'accessories_hardware', 'PAR-SPARE', 'Parameter test spare', 'fixed', 500, 'pcs');

insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-00000000f4a1', null, 'PAR-KIT', 'Parameterised test kit',
        '00000000-0000-0000-0000-00000000f401');

-- One fixed line, one metres line, one per step, one that is usually nothing.
insert into public.assembly_components (assembly_id, component_id, quantity, qty_expression, is_main_device, sort_order) values
  ('00000000-0000-0000-0000-00000000f4a1', '00000000-0000-0000-0000-00000000f4f1', 1,   null,                          true,  0),
  ('00000000-0000-0000-0000-00000000f4a1', '00000000-0000-0000-0000-00000000f4f2', 1,   'busbar_metres',               false, 1),
  ('00000000-0000-0000-0000-00000000f4a1', '00000000-0000-0000-0000-00000000f4f3', 1,   'steps',                       false, 2),
  ('00000000-0000-0000-0000-00000000f4a1', '00000000-0000-0000-0000-00000000f4f4', 1,   'greatest(steps - 4, 0)',      false, 3);

insert into public.kit_parameters (assembly_id, name, value_type, unit, default_value, min_value, max_value, sort_order) values
  ('00000000-0000-0000-0000-00000000f4a1', 'busbar_metres', 'number', 'm', '6.5', 1, 40, 0),
  ('00000000-0000-0000-0000-00000000f4a1', 'steps',         'number', null, '4',  1, 12, 1);

-- === Added with its defaults ================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Parameterised kits') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL A', 1, 'PC') returning id as panel_a \gset

select app.add_assembly_to_costing(:'panel_a'::uuid, '00000000-0000-0000-0000-00000000f4a1'::uuid, 1, 'Incomer')
  as default_line \gset

select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'default_line'::uuid and code = 'PAR-BAR'),
               6.500, 'the busbar metres come from the kit''s own default');
select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'default_line'::uuid and code = 'PAR-STEP'),
               4.000, 'and the steps likewise');
select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'default_line'::uuid and code = 'PAR-MAIN'),
               1.000, 'a line with no formula keeps the quantity it always had');
select test.eq((select count(*)::int from public.costing_items
                where costing_assembly_id = :'default_line'::uuid and code = 'PAR-SPARE'), 0,
  'and a line whose formula comes to zero is not written at all');
select test.eq((select parameters from public.costing_assemblies where id = :'default_line'::uuid),
               '{"busbar_metres": "6.5", "steps": "4"}'::jsonb,
  'what it was worked out from is frozen on the line');

-- === Added with answers of its own ==========================================
select app.add_assembly_to_costing(:'panel_a'::uuid, '00000000-0000-0000-0000-00000000f4a1'::uuid, 1, 'Outgoers',
       '{"busbar_metres": "9", "steps": "6"}'::jsonb) as answered_line \gset

select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'answered_line'::uuid and code = 'PAR-BAR'),
               9.000, 'nine metres asked for, nine metres costed');
select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'answered_line'::uuid and code = 'PAR-STEP'),
               6.000, 'six steps asked for, six costed');
select test.eq((select quantity from public.costing_items
                where costing_assembly_id = :'answered_line'::uuid and code = 'PAR-SPARE'),
               2.000, 'and the spare line, nothing at four steps, is two at six');
select test.eq((select round(sum(quantity * unit_price), 2) from public.costing_items
                where costing_assembly_id = :'answered_line'::uuid),
               round(10000 + 9 * 1000 + 6 * 2000 + 2 * 500, 2)::numeric,
  'the money follows the quantities, through the ordinary pricing');

-- === What it refuses ========================================================
select test.refuses(format($$select app.add_assembly_to_costing(%L, '00000000-0000-0000-0000-00000000f4a1', 1, null,
                             '{"busbar_metres": "0.5"}')$$, :'panel_a'),
  'a figure under the kit''s minimum is refused', 'must be at least');
select test.refuses(format($$select app.add_assembly_to_costing(%L, '00000000-0000-0000-0000-00000000f4a1', 1, null,
                             '{"steps": "20"}')$$, :'panel_a'),
  'and one over its maximum', 'must be at most');
select test.refuses(format($$select app.add_assembly_to_costing(%L, '00000000-0000-0000-0000-00000000f4a1', 1, null,
                             '{"steps": "a few"}')$$, :'panel_a'),
  'and one that is not a number', 'must be a number');
select test.refuses(format($$select app.add_assembly_to_costing(%L, '00000000-0000-0000-0000-00000000f4a1', 1, null,
                             '{"stpes": "6"}')$$, :'panel_a'),
  'a typo is refused rather than quietly ignored', 'no parameter called stpes');
commit;

-- === A revision and a copy repeat the same answers ==========================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'job'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'job'::uuid);
select id as rev from app.create_costing_revision(:'job'::uuid) \gset

select test.eq((select parameters from public.costing_assemblies
                where costing_id = :'rev'::uuid and section = 'Outgoers'),
               '{"busbar_metres": "9", "steps": "6"}'::jsonb,
  'a revision carries the parameters, as it carries every other frozen figure');
select test.eq((select i.quantity from public.costing_items i
                join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.costing_id = :'rev'::uuid and ca.section = 'Outgoers' and i.code = 'PAR-BAR'),
               9.000, 'and the quantities they gave');

insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'rev'::uuid, :'alpha'::uuid, 'PANEL B', 1, 'PC') returning id as panel_b \gset
select app.copy_panel((select id from public.costing_panels where costing_id = :'rev'::uuid and name = 'PANEL A'),
                      :'rev'::uuid, 'PANEL A (copy)');
select test.eq((select ca.parameters from public.costing_assemblies ca
                join public.costing_panels p on p.id = ca.panel_id
                where p.name = 'PANEL A (copy)' and ca.section = 'Outgoers'),
               '{"busbar_metres": "9", "steps": "6"}'::jsonb,
  'and a copied panel does too');
rollback;

-- === A formula nobody can work out stops at the door ========================
update public.assembly_components set qty_expression = 'gremlins * 2'
 where assembly_id = '00000000-0000-0000-0000-00000000f4a1'
   and component_id = '00000000-0000-0000-0000-00000000f4f4';

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job2 from app.create_costing('A formula nobody can work out') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job2'::uuid, :'alpha'::uuid, 'PANEL', 1, 'PC') returning id as panel2 \gset
select test.refuses(format($$select app.add_assembly_to_costing(%L, '00000000-0000-0000-0000-00000000f4a1')$$, :'panel2'),
  'a kit whose formula names something undefined is refused, naming it',
  'the formula uses gremlins');
select test.eq((select count(*)::int from public.costing_assemblies where panel_id = :'panel2'::uuid), 0,
  'and nothing of it is left behind on the panel');
rollback;

update public.assembly_components set qty_expression = 'greatest(steps - 4, 0)'
 where assembly_id = '00000000-0000-0000-0000-00000000f4a1'
   and component_id = '00000000-0000-0000-0000-00000000f4f4';

-- === The library as it stands is untouched ==================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job3 from app.create_costing('An ordinary kit') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job3'::uuid, :'alpha'::uuid, 'PANEL', 1, 'PC') returning id as panel3 \gset

select id as plain_kit from public.v_kits
 where company_id is null and not has_unpriced_part and line_count > 1
 order by name limit 1 \gset
select app.add_assembly_to_costing(:'panel3'::uuid, :'plain_kit'::uuid, 2) as plain_line \gset

select test.eq((select count(*)::int from public.costing_items where costing_assembly_id = :'plain_line'::uuid),
               (select count(*)::int from public.assembly_components where assembly_id = :'plain_kit'::uuid),
  'a kit with no parameters brings every line it always did');
select test.eq((select parameters from public.costing_assemblies where id = :'plain_line'::uuid),
               '{}'::jsonb, 'with no parameters recorded, because it has none');
select test.eq((select sum(i.quantity) from public.costing_items i where i.costing_assembly_id = :'plain_line'::uuid),
               (select sum(x.quantity) from public.assembly_components x where x.assembly_id = :'plain_kit'::uuid),
  'at the quantities the library holds');
rollback;

delete from public.costings where id = :'job'::uuid;
delete from public.kit_parameters where assembly_id = '00000000-0000-0000-0000-00000000f4a1';
delete from public.assembly_components where assembly_id = '00000000-0000-0000-0000-00000000f4a1';
delete from public.assemblies where id = '00000000-0000-0000-0000-00000000f4a1';
delete from public.components where id in (
  '00000000-0000-0000-0000-00000000f4f1', '00000000-0000-0000-0000-00000000f4f2',
  '00000000-0000-0000-0000-00000000f4f3', '00000000-0000-0000-0000-00000000f4f4');
delete from public.kit_groups where id = '00000000-0000-0000-0000-00000000f401';
