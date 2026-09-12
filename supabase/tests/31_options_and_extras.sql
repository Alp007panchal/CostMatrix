-- Options, alternatives and optional extras (migration 0109, roadmap 2.7).
-- Runs after 14 and 15, so the parts are the owner's own.
--
-- The shape under test: one job offered two ways, with a panel common to both
-- and an extra the customer may take or leave.
--
--   DISTRIBUTION BOARD   no option label   — part of whichever option is taken
--   MAIN BOARD (ACB)     Option 1
--   MAIN BOARD (MCCB)    Option 2
--   SPARE FEEDER         Option 1, optional extra

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset
select id as extra_part from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder and id <> :'part_id'::uuid order by code limit 1 \gset

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Options: the same job two ways') \gset

insert into public.costing_panels (costing_id, company_id, name, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'DISTRIBUTION BOARD', 1, 'PC', 0)
returning id as common_panel \gset
insert into public.costing_panels (costing_id, company_id, name, option_label, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'MAIN BOARD (ACB)', 'Option 1', 1, 'PC', 1)
returning id as one_panel \gset
insert into public.costing_panels (costing_id, company_id, name, option_label, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'MAIN BOARD (MCCB)', 'Option 2', 1, 'PC', 2)
returning id as two_panel \gset
insert into public.costing_panels (costing_id, company_id, name, option_label, is_option, quantity, uom, sort_order)
values (:'job'::uuid, :'alpha'::uuid, 'SPARE FEEDER', 'Option 1', true, 1, 'PC', 3)
returning id as extra_panel \gset

select app.add_component_to_costing(:'common_panel'::uuid, :'part_id'::uuid, 2);
select app.add_component_to_costing(:'one_panel'::uuid,    :'part_id'::uuid, 4);
select app.add_component_to_costing(:'two_panel'::uuid,    :'part_id'::uuid, 6);
select app.add_component_to_costing(:'extra_panel'::uuid,  :'extra_part'::uuid, 1);
commit;

-- Each panel is priced, the extra included: an optional extra is a price the
-- customer is given, not a blank.
select test.ok((select unit_price from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid) > 0,
  'an optional extra is priced like any other panel');

-- === No choice made: the totals add everything, exactly as before ============
select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select sum(line_total) from public.v_costing_panel_prices
    where costing_id = :'job'::uuid and not is_option),
  'with no option chosen the total adds both options together, as it always has');
select test.eq(
  (select optional_subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select line_total from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid),
  'and the optional extra is reported beside the total, not inside it');
select test.ok(
  (select chosen_option_label is null from public.v_costing_totals where costing_id = :'job'::uuid),
  'no option is chosen yet');
select test.eq((select option_count from public.v_costing_totals where costing_id = :'job'::uuid), 2,
  'and the job is on offer two ways');
select test.ok(
  (select not counts_in_total from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid),
  'the extra does not count towards the total');
select test.ok(
  (select in_chosen_offer from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid),
  'though it is part of the offer it belongs to');

-- Every option's own figures, which is the table the engineer compares.
select test.eq((select count(*)::int from public.v_costing_option_totals where costing_id = :'job'::uuid), 3,
  'the comparison table has a row for each option and one for the common scope');
select test.eq(
  (select subtotal from public.v_costing_option_totals
    where costing_id = :'job'::uuid and option_label = 'Option 1'),
  (select line_total from public.v_costing_panel_prices where panel_id = :'one_panel'::uuid),
  'Option 1 is priced on its own panels');
select test.eq(
  (select optional_subtotal from public.v_costing_option_totals
    where costing_id = :'job'::uuid and option_label = 'Option 1'),
  (select line_total from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid),
  'with its extra shown separately');
select test.ok(
  (select not is_chosen from public.v_costing_option_totals
    where costing_id = :'job'::uuid and option_label = 'Option 1'),
  'and nothing is marked as the offer until somebody chooses');

-- === Choosing Option 2 ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costings set chosen_option_label = 'Option 2' where id = :'job'::uuid;
commit;

select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select sum(line_total) from public.v_costing_panel_prices
    where panel_id in (:'common_panel'::uuid, :'two_panel'::uuid)),
  'the total is now the common panel plus Option 2');
select test.eq(
  (select tax from public.v_costing_totals where costing_id = :'job'::uuid),
  (select round(sum(pp.line_total) * c.tax_pct / 100, 2)
     from public.v_costing_panel_prices pp
     join public.costings c on c.id = pp.costing_id
    where pp.panel_id in (:'common_panel'::uuid, :'two_panel'::uuid)
    group by c.tax_pct),
  'and VAT is charged on that figure, not on both options');
select test.eq(
  (select grand_total from public.v_costing_totals where costing_id = :'job'::uuid),
  (select subtotal + tax from public.v_costing_totals where costing_id = :'job'::uuid),
  'the grand total is the two added up');
select test.eq(
  (select optional_subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  0::numeric,
  'the extra belongs to Option 1, so this offer has no extras');
select test.ok(
  (select not in_chosen_offer from public.v_costing_panel_prices where panel_id = :'one_panel'::uuid),
  'Option 1''s panel is no longer part of the offer');
select test.ok(
  (select is_chosen from public.v_costing_option_totals
    where costing_id = :'job'::uuid and option_label = 'Option 2'),
  'Option 2 is marked as the one the total means');
select test.ok(
  (select subtotal > 0 from public.v_costing_option_totals
    where costing_id = :'job'::uuid and option_label = 'Option 1'),
  'while Option 1 is still priced, because it is still on offer');

-- The BOM keeps every row and says which are which.
select test.ok(
  (select is_option from public.v_costing_items_by_category
    where costing_id = :'job'::uuid and code = (select code from public.components where id = :'extra_part'::uuid)),
  'the extra''s part is on the BOM, marked as an extra');
select test.ok(
  (select not in_chosen_offer from public.v_costing_items_by_category
    where costing_id = :'job'::uuid and code = (select code from public.components where id = :'extra_part'::uuid)),
  'and marked as belonging to an option nobody is buying');

-- === Choosing Option 1 ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costings set chosen_option_label = 'Option 1' where id = :'job'::uuid;
commit;

select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select sum(line_total) from public.v_costing_panel_prices
    where panel_id in (:'common_panel'::uuid, :'one_panel'::uuid)),
  'the total follows the choice');
select test.eq(
  (select optional_subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select line_total from public.v_costing_panel_prices where panel_id = :'extra_panel'::uuid),
  'and the extra offered with Option 1 is reported again');
select test.eq(
  (select optional_total from public.v_costing_totals where costing_id = :'job'::uuid),
  (select optional_subtotal + optional_tax from public.v_costing_totals where costing_id = :'job'::uuid),
  'the extra carries its own VAT, so the customer sees what taking it costs');
select test.eq(
  (select material_cost from public.v_costing_totals where costing_id = :'job'::uuid),
  (select sum(pp.material_cost * pp.quantity) from public.v_costing_panel_prices pp
    where pp.panel_id in (:'common_panel'::uuid, :'one_panel'::uuid)),
  'the cost figures follow the same rule as the price figures');

-- === A label that matches nothing is ignored, not obeyed =====================
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costings set chosen_option_label = 'Option 9' where id = :'job'::uuid;
commit;

select test.eq(
  (select asked_for from public.v_costing_option_choice where costing_id = :'job'::uuid),
  'Option 9',
  'the label asked for is kept, so a mistake can be seen');
select test.ok(
  (select chosen_option_label is null from public.v_costing_option_choice where costing_id = :'job'::uuid),
  'but it matches no panel, so no option is taken as chosen');
select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  (select sum(line_total) from public.v_costing_panel_prices
    where costing_id = :'job'::uuid and not is_option),
  'and the total falls back to everything rather than dropping panels silently');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$update public.costings set chosen_option_label = '   ' where id = %L$$, :'job'),
  'a blank choice is refused: null is how "no choice" is written', 'chosen_option_label');
rollback;

-- === A revision and a copy keep the choice ==================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costings set chosen_option_label = 'Option 1' where id = :'job'::uuid;
select app.submit_costing(:'job'::uuid);
commit;
begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'job'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as rev from app.create_costing_revision(:'job'::uuid) \gset
commit;

select test.eq(
  (select chosen_option_label from public.costings where id = :'rev'::uuid),
  'Option 1',
  'a revision is the same job offered the same way');
select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'rev'::uuid),
  (select subtotal from public.v_costing_totals where costing_id = :'job'::uuid),
  'so it totals the same figure');
select test.ok(
  (select bool_or(is_option) from public.costing_panels where costing_id = :'rev'::uuid),
  'and the extra came across as an extra');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select (app.copy_costing(:'rev'::uuid, 'Options: copied') ->> 'costing_id') as copy_id \gset
commit;

select test.eq(
  (select chosen_option_label from public.costings where id = :'copy_id'::uuid),
  'Option 1',
  'a copy is offered the same way too');
select test.eq(
  (select option_count from public.v_costing_totals where costing_id = :'copy_id'::uuid), 2,
  'with both options copied across');

-- === A job with no options is untouched by any of this =======================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as plain from app.create_costing('Options: a plain job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'plain'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 2, 'PC') returning id as plain_panel \gset
select app.add_component_to_costing(:'plain_panel'::uuid, :'part_id'::uuid, 3);
commit;

select test.eq((select option_count from public.v_costing_totals where costing_id = :'plain'::uuid), 0,
  'a job offered one way has no options');
select test.eq(
  (select subtotal from public.v_costing_totals where costing_id = :'plain'::uuid),
  (select line_total from public.v_costing_panel_prices where panel_id = :'plain_panel'::uuid),
  'and its total is simply its panels');
select test.eq((select optional_subtotal from public.v_costing_totals where costing_id = :'plain'::uuid),
  0::numeric, 'with nothing optional about it');
select test.eq((select count(*)::int from public.v_costing_option_totals where costing_id = :'plain'::uuid), 1,
  'the comparison table has the one row');

-- === Isolation ==============================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_costing_option_choice where costing_id = :'job'::uuid), 0,
  'another company cannot see which option this job is offered as');
select test.eq((select count(*)::int from public.v_costing_totals where costing_id = :'job'::uuid), 0,
  'nor its totals');
rollback;
