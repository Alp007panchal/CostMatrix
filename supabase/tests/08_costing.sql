-- Costing a panel end to end, and the lifecycle around it.
--
-- The arithmetic is checked against the reference job in
-- docs/reference/costing-NPP-192-REV1.xlsm, so the app and the spreadsheet
-- can be compared line for line.

-- Alice is a company admin and approver at Alpha, Carol a costing engineer
-- there, and Bob belongs to Beta. (psql \set takes the rest of the line
-- literally, so these comments cannot sit beside the values.)
\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- Alpha: no discount and no margins, so the first assertions test the costing
-- arithmetic on its own before margins are added.
update public.companies
   set discount_pct = 0, material_margin_pct = 0, labour_margin_pct = 0,
       tax_pct = 16, price_rounding_step = 100, exchange_rate = 1
 where id = :'alpha'::uuid;

insert into public.labour_rates (company_id, process_type, hourly_rate) values
  (:'alpha'::uuid, 'assembly', 1000),
  (:'alpha'::uuid, 'wiring',   1200),
  (:'alpha'::uuid, 'busbar',   1500);

-- A master assembly: two 10,000 breakers, 8 hours assembly, 4 hours wiring.
-- Material 20,000; labour 8 x 1000 + 4 x 1200 = 12,800.
insert into public.components (id, company_id, category_code, code, name, pricing_mode, unit_price)
values ('00000000-0000-0000-0000-00000000aa01', null, 'switchgear', 'ACB-1600',
        '1600A ACB', 'fixed', 10000);

insert into public.assemblies (id, company_id, code, name)
values ('00000000-0000-0000-0000-00000000bb01', null, 'INC', 'Incomer section');
insert into public.assembly_components (assembly_id, component_id, quantity)
values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-00000000aa01', 2);
insert into public.assembly_labour (assembly_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000bb01', 'assembly', 8),
  ('00000000-0000-0000-0000-00000000bb01', 'wiring',   4);

-- === Build one ============================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as costing_id from app.create_costing('MCC for Triclover', 'test job') \gset
select test.ok(:'costing_id' is not null, 'a costing engineer can create a costing');

select test.eq((select costing_no from public.costings where id = :'costing_id'),
               format('CM-%s-0001', extract(year from now())::int),
  'and it is numbered for the company and the year');

select test.eq((select count(*) from public.costing_labour_rates where costing_id = :'costing_id')::int,
               3,
  'the company hourly rates are frozen into it, one per process type');

insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 2, 'PC')
returning id as panel_id \gset

select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 1);

select test.eq((select material_each from public.v_costing_assembly_totals
                where costing_id = :'costing_id'::uuid), 20000.00,
  'material is quantity times price: two breakers at 10,000');

select test.eq((select labour_each from public.v_costing_assembly_totals
                where costing_id = :'costing_id'::uuid), 12800.00,
  'labour is hours times rate per process type, not a percentage of material');

select test.eq((select hours_each from public.v_costing_assembly_totals
                where costing_id = :'costing_id'::uuid), 12.00,
  'and the hours are visible in their own right');

-- No margins yet, so the panel price is simply its cost, rounded up to 100.
select test.eq((select unit_price from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 32800.00,
  'with no margin the panel price is its cost');

select test.eq((select line_total from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 65600.00,
  'and the line total is that times the panel quantity');

select test.eq((select tax from public.v_costing_totals where costing_id = :'costing_id'::uuid),
               10496.00,
  'VAT is 16% of the subtotal');
select test.eq((select grand_total from public.v_costing_totals where costing_id = :'costing_id'::uuid),
               76096.00,
  'and the grand total includes it');
rollback;

-- === Margins are applied by division, as the spreadsheets do ==============
-- Set the margins as the owner: Carol is a costing engineer, and the policies
-- correctly stop her changing her own company's margins.
update public.companies set material_margin_pct = 10, labour_margin_pct = 20
 where id = :'alpha'::uuid;

begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as costing_id from app.create_costing('Margin check') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Panel', 1) returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 1);

-- 20,000 / 0.9 = 22,222.22 and 12,800 / 0.8 = 16,000. A 10% margin is a share
-- of the selling price, not a markup on cost, which is how the sheets read.
select test.eq((select material_sell from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 22222.22,
  'a 10% material margin divides by 0.9, matching the spreadsheets');
select test.eq((select labour_sell from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 16000.00,
  'a 20% labour margin divides by 0.8');
select test.eq((select unit_price from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 38300.00,
  'and the panel price is the two together, rounded up to the nearest 100');
rollback;

-- === The reference job ====================================================
-- Option 1 of docs/reference/costing-NPP-192-REV1.xlsm: material 4,164,997.80,
-- a 10% profit margin applied by division, rounded up. The sheet reaches
-- 5,784,800 after also dividing by 0.8 for labour; here labour is hours times
-- rate instead, so only the material half is comparable.
update public.companies set material_margin_pct = 10, labour_margin_pct = 0
 where id = :'alpha'::uuid;

-- Master library rows, added as the owner: only the master admin may write
-- them, and Carol is a costing engineer.
insert into public.components (id, company_id, category_code, code, name, pricing_mode, unit_price)
values ('00000000-0000-0000-0000-00000000aa02', null, 'switchgear', 'REF-LOT',
        'Reference job material', 'fixed', 4164997.80);
insert into public.assemblies (id, company_id, code, name)
values ('00000000-0000-0000-0000-00000000bb02', null, 'REF', 'Reference job');
insert into public.assembly_components (assembly_id, component_id, quantity)
values ('00000000-0000-0000-0000-00000000bb02', '00000000-0000-0000-0000-00000000aa02', 1);

begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as costing_id from app.create_costing('NPP-192 Option 1') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, '1600A MAIN LV BOARD', 1)
returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb02', 1);

select test.eq((select material_cost from public.v_costing_panel_costs
                where costing_id = :'costing_id'::uuid), 4164997.80,
  'the reference job material subtotal is reproduced exactly');
select test.eq((select material_sell from public.v_costing_panel_prices
                where costing_id = :'costing_id'::uuid), 4627775.33,
  'and dividing by 0.9 gives what the spreadsheet gives');
rollback;

-- === Frozen prices ========================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as costing_id from app.create_costing('Freeze check') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Panel', 1) returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 1);

set local role postgres;
update public.components set unit_price = 999999 where code = 'ACB-1600';
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select material_each from public.v_costing_assembly_totals
                where costing_id = :'costing_id'::uuid), 20000.00,
  'a later price rise does not reach back into an existing costing');
rollback;

-- === The lifecycle ========================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Lifecycle') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Panel', 1) returning id as panel_id \gset

select test.refuses(format('select app.approve_costing(%L)', :'costing_id'),
  'a draft cannot be approved without being submitted',
  'only a submitted costing can be approved');

select app.submit_costing(:'costing_id'::uuid);
select test.eq((select status::text from public.costings where id = :'costing_id'), 'submitted',
  'the engineer can submit it');

-- Submitted means read-only, and the database says so, not just the screen.
with attempted as (
  update public.costing_panels set name = 'Sneaky' where id = :'panel_id'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'a submitted costing cannot be edited');

select test.refuses(format('select app.approve_costing(%L)', :'costing_id'),
  'and a costing engineer cannot approve it',
  'only an approver may approve');

select test.sign_in(:'alice');
select test.refuses(format('select app.return_costing(%L, %L)', :'costing_id', '   '),
  'an approver must say why they are returning it',
  'say why you are returning it');

select app.return_costing(:'costing_id'::uuid, 'Busbar hours look low, please check');
select test.eq((select status::text from public.costings where id = :'costing_id'), 'draft',
  'a returned costing goes back to draft');
select test.eq((select return_comment from public.costings where id = :'costing_id'),
               'Busbar hours look low, please check',
  'with the reason attached');

select app.submit_costing(:'costing_id'::uuid);
select app.approve_costing(:'costing_id'::uuid);
select test.eq((select status::text from public.costings where id = :'costing_id'), 'approved',
  'and an approver can approve it');

with attempted as (
  update public.costing_panels set name = 'Sneaky' where id = :'panel_id'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'an approved costing is read-only for ever');

select test.eq((select count(*) from public.costing_history where costing_id = :'costing_id')::int,
               5,
  'and every step is in the history: created, submitted, returned, submitted, approved');
rollback;

-- === Revisions ============================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select id as costing_id from app.create_costing('Revision test') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'Panel A', 3) returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 2);
select app.submit_costing(:'costing_id'::uuid);
select app.approve_costing(:'costing_id'::uuid);

select id as rev_id from app.create_costing_revision(:'costing_id'::uuid) \gset

select test.eq((select revision_no from public.costings where id = :'rev_id')::int, 1,
  'a revision is numbered one higher');
select test.eq((select costing_no from public.costings where id = :'rev_id'),
               (select costing_no from public.costings where id = :'costing_id'),
  'and keeps the same costing number');
select test.eq((select status::text from public.costings where id = :'rev_id'), 'draft',
  'and starts as a draft');
select test.ok((select not is_current from public.costings where id = :'costing_id'),
  'the approved revision is no longer the current one');
select test.eq((select status::text from public.costings where id = :'costing_id'), 'approved',
  'but stays approved, exactly as it was');

select test.eq((select count(*) from public.costing_panels where costing_id = :'rev_id')::int, 1,
  'the panels are copied');
select test.eq((select quantity from public.costing_panels where costing_id = :'rev_id'), 3.000,
  'with their quantities');
select test.eq((select material_each from public.v_costing_assembly_totals
                where costing_id = :'rev_id'::uuid), 20000.00,
  'and the material comes across at the price the original froze');
select test.eq((select quantity from public.costing_assemblies where costing_id = :'rev_id'), 2.000,
  'and the assembly quantities survive the copy');
rollback;

-- === Another company sees none of it ======================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('Alpha private work') \gset
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.costings)::int, 0,
  'Beta cannot see Alpha''s costings');
select test.eq((select count(*) from public.v_costing_totals)::int, 0,
  'nor their totals');
rollback;

delete from public.costings where title = 'Alpha private work';
