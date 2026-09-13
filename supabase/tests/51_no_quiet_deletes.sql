-- Can anything the library depends on still be deleted quietly? (migration 0127)
--
-- Each of the three guards is tested the same way, and the order matters:
--
--   1. the deletion is **refused**, and the message names what is holding it;
--   2. once nothing is holding it, the same deletion **succeeds** — a guard that
--      refuses for ever is a guard people work around;
--   3. `v_library_dependents` said the count beforehand, so a screen can warn
--      rather than let somebody find out by being refused.
--
-- Step 2 is the one worth writing. Without it these tests would still pass if
-- the triggers simply refused everything.
--
-- One transaction, rolled back.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set master '00000000-0000-0000-0000-0000000000a1'
\set carol  '00000000-0000-0000-0000-0000000000a4'

begin;

select id as good_part from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset
select category_code as cat from public.components where id = :'good_part'::uuid \gset

insert into public.kit_groups (id, company_id, name) values
  ('00000000-0000-0000-0000-0000000051a1', null, 'ND group with a kit in it'),
  ('00000000-0000-0000-0000-0000000051a2', null, 'ND group nobody uses');
insert into public.assemblies (id, company_id, code, name, kit_group_id, rating, rating_unit)
values ('00000000-0000-0000-0000-0000000051b1', null, 'ND-KIT', 'A KIT IN THAT GROUP',
        '00000000-0000-0000-0000-0000000051a1', 100, 'A');
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-0000000051b1', :'good_part'::uuid, 1, true);

-- A currency and a rate of their own, so the seed's EUR and copper are untouched.
insert into public.currency_factors (company_id, currency_code, landed_factor, note) values
  (null, 'CHF', 150, 'Added by test 51'),
  (null, 'SEK', 20,  'Added by test 51, nobody buys in it');
insert into public.components (id, company_id, category_code, code, name, unit, pricing_mode,
                               purchase_price, purchase_currency)
values ('00000000-0000-0000-0000-0000000051c1', null, :'cat', 'ND-CHF', 'A PART BOUGHT IN SWISS FRANCS',
        'pcs', 'fixed', 99, 'CHF');

insert into public.material_rates (id, company_id, code, name, unit, rate, currency_code) values
  ('00000000-0000-0000-0000-0000000051d1', null, 'nd_brass', 'Brass bar', 'kg', 9, 'EUR'),
  ('00000000-0000-0000-0000-0000000051d2', null, 'nd_spare', 'A rate nobody uses', 'kg', 9, 'EUR');
insert into public.components (id, company_id, category_code, code, name, unit, pricing_mode,
                               weight_per_unit, material_rate_code, purchase_currency)
values ('00000000-0000-0000-0000-0000000051c2', null, :'cat', 'ND-BRASS', 'A BAR PRICED BY WEIGHT',
        'm', 'weight_rate', 2.5, 'nd_brass', 'KES');

set local role authenticated;
select test.sign_in(:'master');

-- === It says so before anybody tries ========================================
select test.eq((select dependents::int from public.v_library_dependents
                 where kind = 'kit_group' and entity_id = '00000000-0000-0000-0000-0000000051a1'::uuid),
  1, 'the screen can say how many kits are in a group before the delete button is pressed');
select test.eq((select dependents::int from public.v_library_dependents
                 where kind = 'currency_factor'
                   and entity_id = (select id from public.currency_factors
                                     where company_id is null and currency_code = 'CHF')),
  1, 'and how many parts are bought in a currency');
select test.eq((select dependents::int from public.v_library_dependents
                 where kind = 'material_rate' and entity_id = '00000000-0000-0000-0000-0000000051d1'::uuid),
  1, 'and how many parts a material rate prices');
select test.eq((select dependents::int from public.v_library_dependents
                 where kind = 'kit_group' and entity_id = '00000000-0000-0000-0000-0000000051a2'::uuid),
  0, 'a row nothing depends on reads zero, so the screen offers it freely');

-- === A kit group its kits are still in ======================================
select test.refuses(
  $$delete from public.kit_groups where id = '00000000-0000-0000-0000-0000000051a1'$$,
  'a kit group its kits are still in cannot be deleted',
  '1 kit(s) are still in "ND group with a kit in it"');
select test.ok(
  (select count(*) > 0 from public.assemblies
    where id = '00000000-0000-0000-0000-0000000051b1'::uuid and kit_group_id is not null),
  'and the kit is still in it: the refusal happened before anything was set to null');

-- Move the kit out, and the very same delete goes through.
update public.assemblies set kit_group_id = '00000000-0000-0000-0000-0000000051a2'
 where id = '00000000-0000-0000-0000-0000000051b1'::uuid;
delete from public.kit_groups where id = '00000000-0000-0000-0000-0000000051a1';
select test.eq((select count(*)::int from public.kit_groups
                 where id = '00000000-0000-0000-0000-0000000051a1'::uuid), 0,
  'once nothing is in it, the same group deletes: the guard refuses a fault, not a delete');

-- === A currency parts are still bought in ===================================
select test.refuses(
  $$delete from public.currency_factors where company_id is null and currency_code = 'CHF'$$,
  'the landed factor for a currency parts are bought in cannot be deleted',
  '1 part(s) are bought in CHF');

-- A currency nobody buys in is not defended.
delete from public.currency_factors where company_id is null and currency_code = 'SEK';
select test.eq((select count(*)::int from public.currency_factors
                 where company_id is null and currency_code = 'SEK'), 0,
  'a currency nobody buys in goes without argument');

-- A company's own factor falls back to the master one, so it is never held.
-- Written by that company's own administrator, because that is who may.
select test.sign_in(:'alice');
insert into public.currency_factors (company_id, currency_code, landed_factor)
values (:'alpha'::uuid, 'CHF', 160);
delete from public.currency_factors where company_id = :'alpha'::uuid and currency_code = 'CHF';
select test.eq((select count(*)::int from public.currency_factors
                 where company_id = :'alpha'::uuid and currency_code = 'CHF'), 0,
  'and a company''s own factor always goes, because the master row catches the parts');
select test.sign_in(:'master');

-- === A material rate weight-priced parts still use ==========================
select test.refuses(
  $$delete from public.material_rates where id = '00000000-0000-0000-0000-0000000051d1'$$,
  'a material rate that prices parts cannot be deleted, though no foreign key says so',
  '1 part(s) are priced by the nd_brass rate');
delete from public.material_rates where id = '00000000-0000-0000-0000-0000000051d2';
select test.eq((select count(*)::int from public.material_rates
                 where id = '00000000-0000-0000-0000-0000000051d2'::uuid), 0,
  'a rate nothing uses goes');

-- === The refusal says what to do next =======================================
-- A message that only says no is how people learn to work around a guard.
select test.refuses(
  $$delete from public.currency_factors where company_id is null and currency_code = 'CHF'$$,
  'and every refusal names the way forward as well as the reason',
  'reprice them in another currency first');

-- === The copper rate the whole busbar catalogue rests on ====================
-- Not a made-up row: the owner's own seed. This is what the guard is for.
select test.refuses(
  $$delete from public.material_rates where company_id is null and code = 'copper_busbar'$$,
  'the copper rate the owner''s busbar is priced by is held by the parts that use it',
  'are priced by the copper_busbar rate');

rollback;

-- === Nothing that was already true stopped being true =======================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
select test.eq((select count(*)::int from public.kit_groups where name like 'ND %'), 0,
  'and every fixture this file made is rolled back');
