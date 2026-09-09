-- Purchase prices land in KES through a per-currency exchange rate and landed
-- factor (migration 0008), then the discount and the company currency apply.
-- Enclosure cubicles are uplifted by the company's percentage when costed.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === The master defaults ===================================================
select test.eq((select landed_factor from public.currency_factors
                where company_id is null and currency_code = 'EUR'), 200.000000,
  'the master EUR landed factor is 200 KES per EUR, one number (decision 2)');
select test.eq((select rate from public.material_rates where company_id is null and code = 'copper_busbar'), 15.0000,
  'the copper rate is 15 per kg');
select test.eq((select currency_code from public.material_rates where company_id is null and code = 'copper_busbar'), 'EUR',
  'in EUR (decision 3)');
select test.eq((select landed_factor from public.currency_factors
                where company_id is null and currency_code = 'KES'), 1.000000,
  'KES lands at face value');
-- (In production the migration also adds a master row for every currency a
-- company already works in; here the companies are created after the
-- migrations, so there is nothing to back-fill.)

-- A master EUR busbar link at 42 EUR, a master cubicle at 380 EUR, a kit holding one of each.
insert into public.components (id, company_id, category_code, code, name, unit, manufacturer,
                               pricing_mode, purchase_price, purchase_currency)
values ('00000000-0000-0000-0000-0000000000d1', null, 'busbar', 'LK-42', 'Busbar link', 'pcs',
        'LINKWELL', 'fixed', 42, 'EUR');
insert into public.components (id, company_id, category_code, code, name, unit, manufacturer,
                               pricing_mode, purchase_price, purchase_currency, is_enclosure_cubicle)
values ('00000000-0000-0000-0000-0000000000d2', null, 'enclosure_parts', 'CUB-800',
        '800(W)X800(D)X2100(H)-2B', 'pcs', 'LOCAL', 'fixed', 380, 'EUR', true);
insert into public.assemblies (id, company_id, code, name)
values ('00000000-0000-0000-0000-0000000000d9', null, 'CUB-KIT', 'Cubicle with link');
insert into public.assembly_components (assembly_id, component_id, quantity) values
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d1', 1),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000d2', 1);

-- Prices in this file are checked from Nationwide's point of view (KES, 0 %)
-- and Alpha's (KES, 10 %; an earlier test file set it to 0, so set it here).
update public.companies set discount_pct = 10 where id = :'alpha'::uuid;
begin;
set local role authenticated;
select test.sign_in(:'master');
-- 42 × 200 = 8,400.00
select test.eq((select unit_price from public.v_component_prices where code = 'LK-42'), 8400.00,
  '42 EUR lands at 8,400 KES for a company with no discount');
select test.eq((select kes_per_kg from public.v_material_rates where code = 'copper_busbar'), 3000.00,
  'and copper at 15 EUR/kg lands at 3,000 KES/kg');
select test.eq((select landed_price_kes from public.v_component_prices where code = 'LK-42'), 8400.00,
  'and the landed KES price is shown in its own right');
select test.eq((select purchase_currency from public.v_component_prices where code = 'LK-42'), 'EUR',
  'with the purchase currency beside it');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.eq((select unit_price from public.v_component_prices where code = 'LK-42'), 7560.00,
  'Alpha pays the landed price less its 10 % discount');
select test.eq((select unit_price from public.v_component_prices where code = 'MCCB-160'), 9000.00,
  'a KES-priced master component prices exactly as before the migration');
rollback;

-- === A company may hold its own factor for a currency ======================
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.currency_factors (company_id, currency_code, landed_factor)
values (:'alpha'::uuid, 'EUR', 180);
select test.eq((select unit_price from public.v_component_prices where code = 'LK-42'), 6804.00,
  'Alpha''s own EUR factor is used for Alpha: 42 × 180 less 10 %');
select test.eq((select kes_per_kg from public.v_material_rates where code = 'copper_busbar'), 2700.00,
  'and Alpha''s copper follows its own EUR factor: 15 × 180');
select test.eq((select source from public.v_currency_factors where currency_code = 'EUR'), 'company',
  'and the factors view says the row is the company''s own');
commit;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select unit_price from public.v_component_prices where code = 'LK-42'), 8400.00,
  'Alpha''s override changes nobody else''s price');
rollback;

delete from public.currency_factors where company_id = :'alpha'::uuid;

-- === Only the master admin touches master factors ==========================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  $$insert into public.currency_factors (company_id, currency_code, landed_factor)
    values (null, 'GBP', 225)$$,
  'a company admin cannot add a master currency', 'row-level security');
with attempted as (
  update public.currency_factors set landed_factor = 1 where company_id is null and currency_code = 'EUR'
  returning 1)
select test.eq((select count(*) from attempted)::int, 0,
  'and cannot change a master factor: the update reaches no rows');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
update public.currency_factors set landed_factor = 205 where company_id is null and currency_code = 'EUR';
select test.eq((select count(*) from public.currency_factor_history h
                join public.currency_factors f on f.id = h.currency_factor_id
                where f.currency_code = 'EUR' and h.new_landed_factor = 205)::int, 1,
  'changing a factor writes one history row');
rollback;

-- === A currency without a master row is refused ============================
select test.refuses(
  $$insert into public.components (company_id, category_code, code, name, pricing_mode, purchase_price, purchase_currency)
    values (null, 'switchgear', 'X-GBP', 'Priced in pounds', 'fixed', 10, 'GBP')$$,
  'a purchase currency with no factor row cannot be saved', 'no exchange rate');

-- === Cubicles are uplifted when they enter a costing ========================
update public.companies set enclosure_uplift_pct = 7.5 where id = :'alpha'::uuid;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Cubicle job') \gset
select test.eq((select enclosure_uplift_pct from public.costings where id = :'costing_id'), 7.500,
  'the company uplift is frozen into the costing');

insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Board', 1, 'PC')
returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-0000000000d9', 1);

-- Link: 42 EUR → 8,400 less 10 % = 7,560, no uplift.
select test.eq((select unit_price from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'LK-42'), 7560.00,
  'an ordinary part is frozen at the company price');
select test.eq((select uplift_pct from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'LK-42'), null::numeric,
  'with no uplift recorded');
-- Cubicle: 380 EUR → 76,000 less 10 % = 68,400, plus 7.5 % = 73,530.
select test.eq((select unit_price from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 73530.00,
  'a cubicle is frozen at the company price plus the enclosure uplift');
select test.eq((select uplift_pct from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 7.500,
  'and the uplift used is kept on the line');
select test.eq((select purchase_price from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 380.00,
  'as are the purchase price');
select test.eq((select purchase_currency from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 'EUR',
  'the purchase currency');
select test.eq((select landed_factor from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 200.000000,
  'and the landed factor that produced the KES price');
select test.eq((select master_price_kes from public.costing_items
                where costing_id = :'costing_id'::uuid and code = 'CUB-800'), 76000.00,
  'master_price_kes is the landed price before the discount');
rollback;

update public.companies set enclosure_uplift_pct = 0, discount_pct = 0 where id = :'alpha'::uuid;
delete from public.assemblies where id = '00000000-0000-0000-0000-0000000000d9';
delete from public.components where id in ('00000000-0000-0000-0000-0000000000d1',
                                           '00000000-0000-0000-0000-0000000000d2');
