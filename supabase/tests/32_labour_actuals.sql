-- Estimate against actual labour (migration 0110, roadmap 2.8). Runs after 14
-- and 15, so the parts are the owner's own; the kit groups and hours are made
-- here, because the owner has not filled the labour standards yet and what is
-- under test is the arithmetic, not the standards.
--
--   PANEL 2.8 (quantity 2)
--     3 × SPARE-ACB-KIT   (group A: assembly 4 h, wiring 2 h each)
--     1 × SPARE-MCCB-KIT  (group B: assembly 1 h each)
--
--   Estimated assembly hours for the batch: (4 × 3 + 1 × 1) × 2 = 26
--   Estimated wiring hours:                 (2 × 3)          × 2 = 12

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'
\set group_a '00000000-0000-0000-0000-00000000f801'
\set group_b '00000000-0000-0000-0000-00000000f802'
\set group_c '00000000-0000-0000-0000-00000000f803'

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.kit_groups (id, company_id, name) values
  (:'group_a'::uuid, null, 'VARIANCE GROUP A'),
  (:'group_b'::uuid, null, 'VARIANCE GROUP B'),
  (:'group_c'::uuid, null, 'VARIANCE GROUP C');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  (:'group_a'::uuid, 'assembly', 4), (:'group_a'::uuid, 'wiring', 2),
  (:'group_b'::uuid, 'assembly', 1),
  (:'group_c'::uuid, 'assembly', 7);

insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-00000000f8a1', null, 'VAR-KIT-A', 'VARIANCE KIT A', :'group_a'::uuid),
       ('00000000-0000-0000-0000-00000000f8a2', null, 'VAR-KIT-B', 'VARIANCE KIT B', :'group_b'::uuid),
       ('00000000-0000-0000-0000-00000000f8a3', null, 'VAR-KIT-C', 'VARIANCE KIT C', :'group_c'::uuid);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device) values
  ('00000000-0000-0000-0000-00000000f8a1', :'part_id'::uuid, 1, true),
  ('00000000-0000-0000-0000-00000000f8a2', :'part_id'::uuid, 1, true),
  ('00000000-0000-0000-0000-00000000f8a3', :'part_id'::uuid, 1, true);

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Labour: estimate against actual') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 2.8', 2, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-00000000f8a1'::uuid, 3);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-00000000f8a2'::uuid, 1);
-- A known rate, so the money in the variance is checkable.
update public.costing_labour set hourly_rate = 500 where costing_id = :'job'::uuid;
commit;

select test.eq((select estimated_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 26::numeric,
  'the estimate is the kit hours through the kit and panel quantities');
select test.eq((select estimated_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'wiring'), 12::numeric,
  'each process type on its own');
select test.eq((select count(*)::int from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid), 2,
  'and a process nobody estimated or worked is not listed at all');
select test.ok((select not has_actuals from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'),
  'nothing has been worked yet');

select grand_total as total_before from public.v_costing_totals where costing_id = :'job'::uuid \gset
select hours as hours_before from public.v_costing_totals where costing_id = :'job'::uuid \gset

-- === The shop floor files its hours =========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as entry_one from app.record_actual_hours(:'panel'::uuid, 'assembly', 18, 'first week') \gset
select id as entry_two from app.record_actual_hours(:'panel'::uuid, 'assembly', 12, 'second week') \gset
select app.record_actual_hours(:'panel'::uuid, 'wiring', 10);
commit;

select test.eq((select actual_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 30::numeric,
  'hours arrive a week at a time and are added up');
select test.eq((select entries from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 2,
  'the entries say how many times somebody filed something');
select test.eq((select difference_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 4::numeric,
  'four hours more than the estimate');
select test.eq((select variance_pct from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 15.4::numeric,
  'which is 15.4 % over');
select test.eq((select difference_cost from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 2000.00::numeric,
  'and 2,000 at the rate this costing froze');
select test.eq((select variance_pct from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'wiring'), -16.7::numeric,
  'wiring came in under, and reads as a negative variance');

-- The point of the whole feature: the costing does not move.
select test.eq((select grand_total from public.v_costing_totals where costing_id = :'job'::uuid),
  :total_before::numeric, 'recording actual hours changes no price');
select test.eq((select hours from public.v_costing_totals where costing_id = :'job'::uuid),
  :hours_before::numeric, 'nor the hours the costing was priced on');

select test.eq((select count(*)::int from public.activity_log
                where entity_id = :'job'::uuid and action = 'actual_hours_recorded'), 3,
  'every entry is in the activity log');

-- Hours worked on something nobody estimated still show up.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.record_actual_hours(:'panel'::uuid, 'busbar', 3);
commit;
select test.eq((select estimated_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'busbar'), 0::numeric,
  'busbar was never estimated');
select test.ok((select has_actuals from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'busbar'),
  'but three hours went on it, and the report says so');
select test.ok((select variance_pct is null from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'busbar'),
  'with no percentage, because there is nothing to compare it with');

-- A wrong figure is corrected by removing the entry.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.remove_actual_hours(:'entry_two'::uuid);
commit;
select test.eq((select actual_hours from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid and process_type = 'assembly'), 18::numeric,
  'removing an entry takes its hours with it');
select test.eq((select count(*)::int from public.activity_log
                where entity_id = :'job'::uuid and action = 'actual_hours_removed'), 1,
  'and that is logged too');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.record_actual_hours(:'panel'::uuid, 'assembly', 12, 'second week, again');
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(format($$select app.record_actual_hours(%L, 'assembly', -1)$$, :'panel'),
  'negative hours are refused', 'zero or more');
select test.refuses(format($$select app.record_actual_hours(%L, 'polishing', 1)$$, :'panel'),
  'and so is a process type that does not exist', 'unknown process type');
rollback;

-- === Where the standards are wrong, by kit group ============================
-- The panel's 30 assembly hours are shared between the two groups in proportion
-- to the estimate: group A was estimated 24 of the 26, group B 2.
select test.eq((select estimated_hours from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 24.00::numeric,
  'group A was estimated 24 hours on this job');
select test.eq((select kit_units from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 6::numeric,
  'over six kits: three on each of two panels');
select test.eq((select actual_hours from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 27.69::numeric,
  'and takes 24/26ths of the thirty hours actually worked');
select test.eq((select estimated_hours_per_kit from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 4.00::numeric,
  'four hours a kit was the standard');
select test.eq((select suggested_hours from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 4.62::numeric,
  'the job says 4.62, which is what it suggests');
select test.eq((select standard_hours from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 4.00::numeric,
  'printed beside the standard in force, which has not changed');
select test.eq((select jobs from public.v_kit_group_labour_variance
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 1,
  'and says it rests on one job, so nobody mistakes it for a standard');
select test.eq((select actual_hours from public.v_kit_group_labour_variance
                where kit_group_id = :'group_b'::uuid and process_type = 'assembly'), 2.31::numeric,
  'group B takes the other 2/26ths');
select test.eq((select count(*)::int from public.v_kit_group_labour_variance
                where kit_group_id = :'group_c'::uuid), 0,
  'a group nobody has recorded hours against is not in the report at all');

-- === Taking a suggestion is a person's decision =============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.apply_labour_suggestion(%L, 'assembly')$$, :'group_a'),
  'a costing engineer cannot rewrite a master standard', 'row-level security');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
select app.apply_labour_suggestion(:'group_a'::uuid, 'assembly') as applied \gset
commit;
select test.eq(:'applied'::numeric, 4.62::numeric, 'the master administrator applies it deliberately');
select test.eq((select hours from public.kit_group_labour
                where kit_group_id = :'group_a'::uuid and process_type = 'assembly'), 4.62::numeric,
  'and the group standard is now what the shop floor showed');

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses(
  format($$select app.apply_labour_suggestion(%L, 'busbar')$$, :'group_a'),
  'nothing can be applied where nothing has been recorded', 'no suggestion');
rollback;

-- The costing that was priced on four hours a kit is untouched by the new standard.
select test.eq((select grand_total from public.v_costing_totals where costing_id = :'job'::uuid),
  :total_before::numeric, 'and the costing priced on the old standard still says what it said');

-- === Isolation ==============================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_panel_labour_variance
                where panel_id = :'panel'::uuid), 0,
  'another company sees none of this job''s hours');
select test.eq((select count(*)::int from public.v_kit_group_labour_variance
                where company_id = :'alpha'::uuid), 0,
  'nor its variance by kit group');
select test.refuses(format($$select app.record_actual_hours(%L, 'assembly', 5)$$, :'panel'),
  'and cannot file hours against its panel', 'no such panel');
rollback;
