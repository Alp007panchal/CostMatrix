-- Does the library say what it is missing, before a costing finds out?
-- (migration 0128)
--
-- Runs after 14, so the library here is the owner's real seed: 735 parts, 296
-- kits, eight parts with no price, and a labour template nobody has filled in.
-- Two kinds of assertion, on purpose:
--
--   * against rows made here, so each rule can be told from its neighbours;
--   * against the live library as invariants — never a hardcoded count, because
--     a count is exactly what the feature register had to give up (D-2026-09-13).
--
-- Everything is inside one transaction and rolled back, so the files after this
-- one see the library the owner imported and nothing of mine.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
select test.feature(:'alpha'::uuid, 'library_health', true);

-- === What the screen is looking at =========================================
-- A priced master part to build the healthy kits from, taken from the seed
-- rather than invented, so the prices are the owner's own.
select id as good_part from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset
select id as good_part2 from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code offset 1 limit 1 \gset
select category_code as cat from public.components where id = :'good_part'::uuid \gset

-- A part with no price at all. The constraint allows that only for a
-- placeholder, which is why the importer flags all eight of the seed's own.
insert into public.components (id, company_id, category_code, code, name, unit, pricing_mode,
                               purchase_price, purchase_currency, is_placeholder)
values ('00000000-0000-0000-0000-0000000049a1', null, :'cat', 'LH-NOPRICE', 'PART WITH NO PRICE',
        'pcs', 'fixed', null, 'EUR', true);

-- A part with a price, in a currency that has no landed factor any more. The
-- app refuses to *create* such a part (`app.check_component_currency`), so the
-- only way to reach this state is to remove the factor afterwards — which is
-- exactly what happens, and which nothing guards. On the part screen it then
-- shows a purchase price and looks fine; the costing refuses it. That gap is
-- what this rule exists to name, so it is reached here the way it is reached in
-- life: add the currency, price the part in it, take the currency away.
insert into public.currency_factors (company_id, currency_code, landed_factor, note)
values (null, 'CHF', 150, 'Added by test 49, removed three lines below');
insert into public.components (id, company_id, category_code, code, name, unit, pricing_mode,
                               purchase_price, purchase_currency)
values ('00000000-0000-0000-0000-0000000049a2', null, :'cat', 'LH-NOFACTOR', 'PART IN A CURRENCY NOBODY PRICES',
        'pcs', 'fixed', 99, 'CHF');
-- Migration 0130 refuses this deletion — which is the point of it. So the state
-- is reachable only on a database where a factor went before that guard existed,
-- which is every database today, 0130 being unmerged: the rule stays, and the
-- test reaches the state the one way left, by standing the guard down for a
-- single statement. Written to work whether or not 0130 is present, because the
-- two arrive as separate pull requests and either may merge first — found by
-- merging all nine open branches together and running the suite on the result,
-- which neither branch's own CI could have shown.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'currency_factors_refuse_orphaning') then
    execute 'alter table public.currency_factors disable trigger currency_factors_refuse_orphaning';
  end if;
end $$;
delete from public.currency_factors where company_id is null and currency_code = 'CHF';
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'currency_factors_refuse_orphaning') then
    execute 'alter table public.currency_factors enable trigger currency_factors_refuse_orphaning';
  end if;
end $$;

insert into public.kit_groups (id, company_id, name) values
  ('00000000-0000-0000-0000-0000000049b1', null, 'LH timed group'),
  ('00000000-0000-0000-0000-0000000049b2', null, 'LH group with no hours');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-0000000049b1', 'assembly', 4);

insert into public.assemblies (id, company_id, code, name, kit_group_id, rating, rating_unit) values
  ('00000000-0000-0000-0000-0000000049c1', null, 'LH-UNPRICED', 'KIT HOLDING AN UNPRICED PART',
   '00000000-0000-0000-0000-0000000049b1', 100, 'A'),
  ('00000000-0000-0000-0000-0000000049c2', null, 'LH-NOGROUP',  'KIT WITH NO GROUP',
   null, 100, 'A'),
  ('00000000-0000-0000-0000-0000000049c3', null, 'LH-NOHOURS',  'KIT WHOSE GROUP HAS NO HOURS',
   '00000000-0000-0000-0000-0000000049b2', 100, 'A'),
  ('00000000-0000-0000-0000-0000000049c4', null, 'LH-BARE',     'KIT WITH ONLY ITS MAIN DEVICE',
   '00000000-0000-0000-0000-0000000049b1', 100, 'A'),
  ('00000000-0000-0000-0000-0000000049c5', null, 'LH-NORATING', 'KIT WITH NO RATING',
   '00000000-0000-0000-0000-0000000049b1', null, null),
  ('00000000-0000-0000-0000-0000000049c6', null, 'LH-WELL',     'A KIT WITH NOTHING WRONG WITH IT',
   '00000000-0000-0000-0000-0000000049b1', 100, 'A');

-- Beta's own private kit, for the isolation check at the end.
insert into public.assemblies (id, company_id, code, name, rating, rating_unit)
values ('00000000-0000-0000-0000-0000000049d1', :'beta'::uuid, 'LH-BETA', 'BETA''S OWN BARE KIT', 100, 'A');

insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device) values
  ('00000000-0000-0000-0000-0000000049d1', :'good_part'::uuid, 1, true),
  -- Holds the unpriced part beside a good one.
  ('00000000-0000-0000-0000-0000000049c1', :'good_part'::uuid, 1, true),
  ('00000000-0000-0000-0000-0000000049c1', '00000000-0000-0000-0000-0000000049a1'::uuid, 1, false),
  -- No group, otherwise sound.
  ('00000000-0000-0000-0000-0000000049c2', :'good_part'::uuid, 1, true),
  ('00000000-0000-0000-0000-0000000049c2', :'good_part2'::uuid, 2, false),
  -- A group, but nobody has said how long it takes.
  ('00000000-0000-0000-0000-0000000049c3', :'good_part'::uuid, 1, true),
  ('00000000-0000-0000-0000-0000000049c3', :'good_part2'::uuid, 2, false),
  -- Its main device and nothing else: no busbar, no cable, no accessories.
  ('00000000-0000-0000-0000-0000000049c4', :'good_part'::uuid, 1, true),
  -- Sound but unratable.
  ('00000000-0000-0000-0000-0000000049c5', :'good_part'::uuid, 1, true),
  ('00000000-0000-0000-0000-0000000049c5', :'good_part2'::uuid, 2, false),
  -- Nothing wrong with it at all.
  ('00000000-0000-0000-0000-0000000049c6', :'good_part'::uuid, 1, true),
  ('00000000-0000-0000-0000-0000000049c6', :'good_part2'::uuid, 2, false);

set local role authenticated;
select test.sign_in(:'carol');

-- === One row per fault, under the name of the fault ========================
select kind as k_noprice, severity as s_noprice, fix_on as f_noprice
  from public.v_library_issues where code = 'LH-NOPRICE' \gset
select test.eq(:'k_noprice'::text, 'part_placeholder',
  'a part with no price is named as the placeholder it has to be');
select test.eq(:'s_noprice'::text, 'refuses',
  'and the severity says what it does to a costing: it refuses');
select test.eq(:'f_noprice'::text, 'Library → Components',
  'and the row names the screen that fixes it, not just the fault');

select kind as k_nofactor, detail as d_nofactor, fix_on as f_nofactor
  from public.v_library_issues where code = 'LH-NOFACTOR' \gset
select test.eq(:'k_nofactor'::text, 'part_no_factor',
  'a part priced in a currency with no landed factor is told apart from one with no price');
select test.ok(:'d_nofactor'::text like '%CHF%',
  'and the currency is named, because that is what has to be set');
select test.eq(:'f_nofactor'::text, 'Rates → Currency factors',
  'and it sends you to the rates screen, not to the part — the part is fine');

-- === The rules that matter to labour =======================================
select test.eq((select kind from public.v_library_issues where code = 'LH-NOGROUP'),
  'kit_no_group', 'a kit with no kit group is named');
select test.eq((select severity from public.v_library_issues where code = 'LH-NOGROUP'),
  'silent', 'and marked silent: it costs, and the labour is simply left out');
select test.eq((select kind from public.v_library_issues where code = 'LH-NOHOURS'),
  'kit_no_hours', 'a kit whose group has no hours is named');
select test.ok((select detail like '%LH group with no hours%' from public.v_library_issues
                 where code = 'LH-NOHOURS'),
  'and the group to fill in is named, because that is the row of the template');

-- === The ones that are only worth a look ===================================
select test.eq((select kind from public.v_library_issues where code = 'LH-BARE'),
  'kit_only_main_device', 'a kit with only its main device is named');
select test.eq((select severity from public.v_library_issues where code = 'LH-BARE'),
  'check', 'and marked as worth a look rather than broken: it may be right');
select test.eq((select kind from public.v_library_issues where code = 'LH-NORATING'),
  'kit_no_rating', 'a kit with no rating is named, because a rating is how it is found');

-- === A kit with nothing wrong with it is not mentioned =====================
select test.eq((select count(*)::int from public.v_library_issues where code = 'LH-WELL'), 0,
  'a sound kit appears nowhere: the screen is a list of work, not a list of kits');

-- === Worst first, and once ==================================================
select test.eq((select count(*)::int from public.v_library_issues where code = 'LH-UNPRICED'), 1,
  'a kit with more than one fault is listed once, not once per fault');
select test.eq((select kind from public.v_library_issues where code = 'LH-UNPRICED'),
  'kit_unpriced_part', 'and under the worst of them');

-- === It cannot disagree with the refusal ====================================
-- The whole point. The view tests the same predicate the engine tests, so a kit
-- it calls refusable really is refused, and the same part is named in both.
select id as job from app.create_costing('Library health: the refusal') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC') returning id as panel \gset

select test.refuses(
  format($$select app.add_assembly_to_costing(%L::uuid, '00000000-0000-0000-0000-0000000049c1'::uuid, 1)$$,
         :'panel'),
  'the kit the view says would be refused is refused, naming the same part',
  'LH-NOPRICE has no price yet');

select test.ok((select detail like '%LH-NOPRICE%' from public.v_library_issues
                 where code = 'LH-UNPRICED'),
  'and the view had already named that part, before anybody tried');

-- The kit with nothing wrong with it is taken without complaint, so the view is
-- not simply refusing everything.
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000049c6'::uuid, 1);
select test.ok((select count(*) > 0 from public.costing_assemblies where panel_id = :'panel'::uuid),
  'while the sound kit goes on to the costing');

-- === Invariants over the owner's own library ================================
-- Never a count: what is asserted is that the view and the library agree.
select test.eq(
  (select count(*)::int from public.v_component_prices p
    where p.unit_price is null and p.is_active
      and not exists (select 1 from public.v_library_issues i
                      where i.entity = 'part' and i.entity_id = p.id)),
  0, 'every part a costing could not price appears on the list');
select test.eq(
  (select count(*)::int from public.v_library_issues i
     join public.v_component_prices p on p.id = i.entity_id
    where i.entity = 'part' and p.unit_price is not null),
  0, 'and no part that can be priced is on it');
select test.eq(
  (select count(*)::int from (
     select entity_id from public.v_library_issues
      where entity = 'part' group by entity_id having count(*) > 1) dup),
  0, 'each part appears at most once, whatever is wrong with it');
select test.ok(
  (select count(*) > 0 from public.v_library_issues
    where kind = 'part_placeholder' and code <> 'LH-NOPRICE'),
  'the seed''s own unpriced parts are on the list, not only the ones made here');
select test.ok(
  (select count(*) > 0 from public.v_library_issues where kind = 'kit_no_hours'),
  'and so is the state the whole library is in: the labour template is empty');

-- === The summary the screen opens on ========================================
select items as bare_items, severity as bare_sev
  from public.v_library_health where kind = 'kit_only_main_device' and library = 'master' \gset
select test.ok(:bare_items >= 1, 'the summary counts each kind');
select test.eq(:'bare_sev'::text, 'check', 'and carries its severity up with it');
select test.ok(
  (select array_length(examples, 1) <= 5 from public.v_library_health
    where kind = 'kit_no_hours' and library = 'master'),
  'and names at most five examples, so a library-wide fault is a line rather than a page');
select test.eq(
  (select sum(items)::int from public.v_library_health),
  (select count(*)::int from public.v_library_issues),
  'the summary and the list are the same rows counted two ways');

-- === One company cannot see another's private library ======================
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_library_issues where code = 'LH-BETA'), 1,
  'a company sees what is wrong with its own private kits');
select test.eq((select library from public.v_library_issues where code = 'LH-BETA'), 'private',
  'and they are marked as its own rather than the master catalogue''s');

select test.sign_in(:'carol');
select test.eq((select count(*)::int from public.v_library_issues where code = 'LH-BETA'), 0,
  'and another company sees nothing of them at all');

rollback;

-- === Nothing that was already true stopped being true =======================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
select test.eq((select count(*)::int from public.assemblies where code like 'LH-%'), 0,
  'and the library this file worked on is the one it found: every fixture is rolled back');
