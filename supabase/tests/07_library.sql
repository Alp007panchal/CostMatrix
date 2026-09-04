-- The library: master rows are shared and untouchable, private rows are
-- invisible to everyone else, and every company sees its own prices.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- Alpha has a 10% discount and works in KES; Beta has 5% and works in USD.
-- Give Beta a realistic rate so the conversion is visible.
update public.companies set exchange_rate = 130 where id = :'beta'::uuid;

-- A master component priced at 10,000 KES, and a master busbar priced by weight.
insert into public.components (id, company_id, category_code, code, name, unit, manufacturer,
                               part_number, pricing_mode, unit_price)
values ('00000000-0000-0000-0000-0000000000f1', null, 'switchgear', 'MCCB-160',
        '160A TP MCCB 25kA', 'pcs', 'SIEMENS', '3VJ1216-3DB32-0AA0', 'fixed', 10000);

insert into public.components (id, company_id, category_code, code, name, unit, manufacturer,
                               pricing_mode, weight_per_unit, material_rate_code)
values ('00000000-0000-0000-0000-0000000000f2', null, 'busbar', 'BB-30X10',
        'Busbar 30 x 10 mm', 'm', 'REPUTED', 'weight_rate', 2.8, 'copper_busbar');

insert into public.assemblies (id, company_id, code, name)
values ('00000000-0000-0000-0000-0000000000e9', null, 'INC-1600', 'Incomer, 1600A ACB');

insert into public.assembly_components (assembly_id, component_id, quantity)
values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f1', 2);

insert into public.assembly_labour (assembly_id, process_type, hours) values
  ('00000000-0000-0000-0000-0000000000e9', 'assembly', 8),
  ('00000000-0000-0000-0000-0000000000e9', 'wiring',   4);

-- === Everyone sees the master library ====================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.eq((select count(*) from public.components)::int, 2,
  'Alpha sees both master components');

-- 10,000 less 10% is 9,000; the exchange rate is 1, so no conversion.
select test.eq((select unit_price from public.v_component_prices where code = 'MCCB-160'),
               9000.00,
  'Alpha pays the master price less its 10% discount');

-- 2.8 kg per metre at the master copper rate of 3,000 KES/kg.
select test.eq((select unit_price from public.v_component_prices where code = 'BB-30X10'),
               8400.00,
  'busbar is priced by weight, not from a price list');

select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-0000000000e9'
                  and process_type = 'assembly'), 8.00,
  'Alpha gets the master hours for a master assembly');
rollback;

-- === Another company, another price ======================================
begin;
set local role authenticated;
select test.sign_in(:'bob');

-- 10,000 less 5% is 9,500 KES; at 130 KES per dollar that is 73.08 dollars.
select test.eq((select unit_price from public.v_component_prices where code = 'MCCB-160'),
               73.08,
  'Beta sees the same component in its own currency, at its own discount');
rollback;

-- === A company may not touch the master library ==========================
begin;
set local role authenticated;
select test.sign_in(:'alice');

-- No policy lets a company write a master row, so these statements match
-- nothing and change nothing. Silently affecting zero rows is what row-level
-- security does; an error would mean something else went wrong.
with attempted as (
  update public.components set unit_price = 1 where code = 'MCCB-160' returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'a company admin cannot reprice a master component');

with attempted as (
  delete from public.components where code = 'MCCB-160' returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'nor delete one');

with attempted as (
  update public.assembly_labour set hours = 99
   where assembly_id = '00000000-0000-0000-0000-0000000000e9' returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'nor change the master hours');

with attempted as (
  update public.material_rates set rate = 1 where company_id is null returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'nor the master copper rate');

-- The master price is genuinely untouched, not merely un-updated by that
-- statement: the view still shows the discounted 10,000.
select test.eq((select unit_price from public.v_component_prices where code = 'MCCB-160'),
               9000.00,
  'and the master price is still what it was');
rollback;

-- === But it may keep its own hours =======================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

insert into public.company_assembly_hours (company_id, assembly_id, process_type, hours)
values (:'alpha'::uuid, '00000000-0000-0000-0000-0000000000e9', 'assembly', 6);

select test.eq((select effective_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-0000000000e9'
                  and process_type = 'assembly'), 6.00,
  'a company override replaces the master hours');
select test.eq((select master_hours from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-0000000000e9'
                  and process_type = 'assembly'), 8.00,
  'and the master figure stays visible beside it');
select test.eq((select source from public.v_assembly_hours
                where assembly_id = '00000000-0000-0000-0000-0000000000e9'
                  and process_type = 'assembly'), 'company_override',
  'and the screen can say where the number came from');
rollback;

-- === Private components stay private =====================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.components (id, company_id, category_code, code, name, pricing_mode, unit_price)
values ('00000000-0000-0000-0000-0000000000f3', :'alpha'::uuid, 'accessories_hardware',
        'ALP-BRACKET', 'Alpha''s own bracket', 'fixed', 250);

select test.eq((select unit_price from public.v_component_prices where code = 'ALP-BRACKET'),
               250.00,
  'a private component is priced as entered, with no discount applied');
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.components where code = 'ALP-BRACKET')::int, 0,
  'and another company cannot see it at all');
rollback;

-- === A costing engineer is not a librarian ===============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format('insert into public.components (company_id, category_code, code, name, pricing_mode, unit_price)
          values (%L, ''switchgear'', ''X'', ''X'', ''fixed'', 1)', :'alpha'::uuid),
  'a costing engineer cannot add components',
  'row-level security');
rollback;

-- === Structural rules ====================================================
begin;
set local role authenticated;
select test.sign_in(:'master');

select test.refuses(
  format('insert into public.assembly_components (assembly_id, component_id, quantity)
          values (%L, %L, 1)',
         '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000f3'),
  'a master assembly cannot use a company''s private component',
  'master assembly may only use master components');

-- A price change is recorded whoever makes it.
update public.components set unit_price = 11000 where code = 'MCCB-160';
select test.eq((select new_price from public.component_price_history
                where component_id = '00000000-0000-0000-0000-0000000000f1'
                order by changed_at desc limit 1), 11000.00,
  'a price change is written to the history');
select test.eq((select old_price from public.component_price_history
                where component_id = '00000000-0000-0000-0000-0000000000f1'
                order by changed_at desc limit 1), 10000.00,
  'with the price it replaced');
rollback;

-- A component must be fully configured for its pricing mode.
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses(
  'insert into public.components (company_id, category_code, code, name, pricing_mode)
   values (null, ''busbar'', ''BROKEN'', ''No price at all'', ''fixed'')',
  'a fixed-price component must have a price',
  'components_pricing_fields');
select test.refuses(
  'insert into public.components (company_id, category_code, code, name, pricing_mode, unit_price, weight_per_unit)
   values (null, ''busbar'', ''BROKEN2'', ''Both kinds at once'', ''weight_rate'', 5, 2)',
  'a weight-priced component cannot also carry a fixed price',
  'components_pricing_fields');
rollback;

-- Clean up the private component committed above.
delete from public.components where code = 'ALP-BRACKET';

-- The history tables are written by the system and by nobody else: a person
-- with an insert grant could forge or tidy away a price change.
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses(
  format('insert into public.component_price_history (component_id, new_price) values (%L, 1)',
         '00000000-0000-0000-0000-0000000000f1'),
  'nobody can write a price history row by hand',
  'permission denied');
select test.refuses(
  format('delete from public.component_price_history where component_id = %L',
         '00000000-0000-0000-0000-0000000000f1'),
  'nor delete one',
  'permission denied');
rollback;
