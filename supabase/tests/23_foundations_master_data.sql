-- Foundations F1–F3 (migration 0100). Runs after 14, which leaves the owner's
-- seed in the database, and after 15, which sets Alpha to no discount, no
-- margins and no uplift — so every figure here is the cost itself.
--
-- The first block is the one that matters most: it proves what the roadmap calls
-- the single most important foundation, that editing a master kit can never
-- change a costing that already used it.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === A costing built from a real seeded kit =================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

-- A fully priced kit with a few lines, chosen by query rather than by name so
-- this test does not break when the seed changes.
select id as kit_id, code as kit_code, line_count
  from public.v_kits
 where has_unpriced_part = false and line_count >= 3
 order by code limit 1 \gset
select version as kit_version from public.assemblies where id = :'kit_id'::uuid \gset

select id as costing_id from app.create_costing('Foundations: a kit frozen') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC')
returning id as panel_id \gset

select app.add_assembly_to_costing(:'panel_id'::uuid, :'kit_id'::uuid, 1, 'Incomer') as line_id \gset
commit;

select test.eq((select source_version from public.costing_assemblies where id = :'line_id'::uuid),
               :kit_version,
               'the costing line records which version of the kit it copied');
select test.eq((select count(*)::int from public.costing_items
                where costing_assembly_id = :'line_id'::uuid),
               :line_count::int,
               'and copied every line of the kit');

-- A fingerprint of the frozen lines: every part, quantity and price, in order.
create temporary table before_edit as
  select code, quantity, unit_price, purchase_price, purchase_currency, landed_factor, sort_order
  from public.costing_items where costing_assembly_id = :'line_id'::uuid;

-- === The master kit is changed in every way that could hurt =================
-- Renamed, a line's quantity changed, a line removed, a line added, the version
-- bumped, and finally retired. A costing that already used it must not notice.
begin;
set local role authenticated;
select test.sign_in(:'master');

update public.assemblies
   set name = name || ' (RENAMED AFTER COSTING)',
       version = version + 1,
       customer_wording = 'Wording added later',
       tags = array['incomer', 'changed-after-costing']
 where id = :'kit_id'::uuid;

update public.assembly_components
   set quantity = quantity + 7
 where assembly_id = :'kit_id'::uuid
   and component_id = (select component_id from public.assembly_components
                        where assembly_id = :'kit_id'::uuid order by sort_order limit 1);

delete from public.assembly_components
 where assembly_id = :'kit_id'::uuid
   and component_id = (select component_id from public.assembly_components
                        where assembly_id = :'kit_id'::uuid and not is_main_device
                        order by sort_order desc limit 1);

insert into public.assembly_components (assembly_id, component_id, quantity, sort_order)
select :'kit_id'::uuid, c.id, 99, 999
  from public.components c
 where c.company_id is null and c.is_active and not c.is_placeholder
   and c.id not in (select component_id from public.assembly_components where assembly_id = :'kit_id'::uuid)
 order by c.code limit 1;

update public.assemblies set is_active = false where id = :'kit_id'::uuid;
commit;

-- The proof.
select test.eq((select count(*)::int from (
                  select code, quantity, unit_price, purchase_price, purchase_currency,
                         landed_factor, sort_order
                    from public.costing_items where costing_assembly_id = :'line_id'::uuid
                  except all
                  select * from before_edit) d),
               0,
               'editing, shortening, lengthening and retiring the master kit leaves the costing''s lines identical');
select test.eq((select count(*)::int from (
                  select * from before_edit
                  except all
                  select code, quantity, unit_price, purchase_price, purchase_currency,
                         landed_factor, sort_order
                    from public.costing_items where costing_assembly_id = :'line_id'::uuid) d),
               0,
               'and loses none of them either');
select test.ok((select name not like '%RENAMED%' from public.costing_assemblies where id = :'line_id'::uuid),
               'the costing keeps the kit name it was costed under');
select test.eq((select source_version from public.costing_assemblies where id = :'line_id'::uuid),
               :kit_version,
               'and the version it copied, not the version the library is on now');
select test.eq((select version from public.assemblies where id = :'kit_id'::uuid),
               :kit_version + 1,
               'while the library itself has moved on');

-- === The version survives a revision and a panel copy ======================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'costing_id'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'costing_id'::uuid);
select test.sign_in(:'carol');
select (app.create_costing_revision(:'costing_id'::uuid)).id as rev_id \gset
commit;

select test.eq((select source_version from public.costing_assemblies
                where costing_id = :'rev_id'::uuid and kind = 'kit'),
               :kit_version,
               'a revision carries the kit version across');
select test.eq((select count(*)::int from public.costing_items i
                join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.costing_id = :'rev_id'::uuid),
               :line_count::int,
               'with every frozen line');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as copy_id from app.create_costing('Foundations: a copy') \gset
select (app.copy_panel(:'panel_id'::uuid, :'copy_id'::uuid, 'COPIED BOARD') ->> 'panel_id') as copied_panel \gset
commit;

select test.eq((select source_version from public.costing_assemblies
                where panel_id = :'copied_panel'::uuid and kind = 'kit'),
               :kit_version,
               'and so does a copied panel');

-- === F3. The productivity factor ===========================================
-- Hours and the frozen rate are set here rather than relied on from the seed,
-- because the owner has not filled the labour standards yet: the arithmetic is
-- what is under test, not the standards.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as pf_costing from app.create_costing('Foundations: productivity') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'pf_costing'::uuid, :'alpha'::uuid, 'PANEL WITH HOURS', 1, 'PC')
returning id as pf_panel \gset
select app.add_assembly_to_costing(:'pf_panel'::uuid, :'kit_id'::uuid, 1, 'Incomer') as pf_line \gset
-- A retired kit can still be costed: nothing stops it today, and that is a
-- separate decision from this migration.
delete from public.costing_labour where costing_assembly_id = :'pf_line'::uuid;
insert into public.costing_labour
  (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours, source, hourly_rate)
values (:'pf_costing'::uuid, :'pf_line'::uuid, :'alpha'::uuid, 'assembly', 10, 10, 'manual', 500);
commit;

select test.eq((select productivity_factor from public.costing_panels where id = :'pf_panel'::uuid),
               1.000, 'a panel starts at a productivity factor of 1.0');
select test.eq((select labour_cost from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               5000.00, '10 hours at 500 is 5,000');
select test.eq((select labour_cost from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               (select labour_cost_standard from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               'and at 1.0 the factor changes nothing at all');

select material_cost as material_before, labour_cost as labour_before, hours as hours_before
  from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid \gset

begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costing_panels set productivity_factor = 1.2 where id = :'pf_panel'::uuid;
commit;

select test.eq((select labour_cost from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               6000.00, 'a factor of 1.2 raises labour by a fifth');
select test.eq((select hours from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               :hours_before * 1.2, 'and the hours with it');
select test.eq((select labour_cost_standard from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               :labour_before, 'while the standard figure stays, so the difference can be explained');
select test.eq((select material_cost from public.v_costing_panel_costs where panel_id = :'pf_panel'::uuid),
               :material_before, 'and material is untouched: the factor is about labour');
select test.refuses(
  format('update public.costing_panels set productivity_factor = 0 where id = %L', :'pf_panel'),
  'a factor of zero is refused: free labour is a mistake, not a discount',
  'productivity_factor');

-- === F3. Rate history ======================================================
-- No hourly rate is seeded anywhere, so the rate is created here — which also
-- exercises the insert branch of the trigger, not only the update branch.
begin;
set local role authenticated;
select test.sign_in(:'master');
insert into public.labour_rates (company_id, process_type, hourly_rate)
values (null, 'assembly', 500)
on conflict do nothing;
commit;

select id as rate_id from public.labour_rates
 where company_id is null and process_type = 'assembly' \gset

select test.eq((select new_hourly_rate from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid order by changed_at limit 1),
               500.00, 'a new hourly rate is recorded from the moment it exists');
select test.ok((select old_hourly_rate is null from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid order by changed_at limit 1),
               'with nothing before it');

begin;
set local role authenticated;
select test.sign_in(:'master');
update public.labour_rates set hourly_rate = 623 where id = :'rate_id'::uuid;
commit;

select test.eq((select new_hourly_rate from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid order by changed_at desc limit 1),
               623.00, 'changing an hourly rate writes its history');
select test.eq((select old_hourly_rate from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid order by changed_at desc limit 1),
               500.00, 'with the rate it moved from');
select test.eq((select count(*)::int from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid), 2,
               'and nothing is written when the rate does not move');

begin;
set local role authenticated;
select test.sign_in(:'master');
-- Touching the row without moving the rate must add no history row.
update public.labour_rates set hourly_rate = 623 where id = :'rate_id'::uuid;
commit;

select test.eq((select count(*)::int from public.labour_rate_history
                where labour_rate_id = :'rate_id'::uuid), 2,
               'confirmed: a no-op update leaves the history alone');

-- Leave the library as it was found.
begin;
set local role authenticated;
select test.sign_in(:'master');
delete from public.labour_rates where id = :'rate_id'::uuid;
commit;

-- === F1/F2. Status is derived, and cannot be written =======================
select test.eq((select status from public.components
                where company_id is null and is_placeholder order by code limit 1),
               'placeholder', 'a part the catalogue does not price reads as a placeholder');
select test.eq((select status from public.assemblies where id = :'kit_id'::uuid),
               'retired', 'the kit retired above reads as retired');
select test.ok((select count(*) = 0 from public.components
                where company_id is null and status not in ('active', 'obsolete', 'placeholder')),
               'every one of the 735 parts reads as one of the three states');
select test.refuses(
  'update public.components set status = ''active'' where company_id is null and is_placeholder',
  'status cannot be written while the booleans are the authority: it is refused, not silently reverted',
  'can only be updated to DEFAULT');

-- === F1. The new component columns are there and optional ==================
begin;
set local role authenticated;
select test.sign_in(:'master');
select id as part_id from public.components
 where company_id is null and not is_placeholder order by code limit 1 \gset
update public.components
   set supplier = 'Local distributor Ltd',
       attributes = '{"mounting": "withdrawable", "ip": "IP31"}'::jsonb,
       datasheet_url = 'https://example.test/datasheet.pdf',
       lead_time_days = 42,
       price_valid_from = date '2026-09-01',
       price_source = 'Supplier list, September 2026'
 where id = :'part_id'::uuid;
commit;

select test.eq((select attributes ->> 'mounting' from public.components where id = :'part_id'::uuid),
               'withdrawable', 'structured attributes are stored as given');
select test.eq((select lead_time_days from public.components where id = :'part_id'::uuid),
               42, 'and a lead time beside them');
select test.refuses(
  format('update public.components set lead_time_days = -1 where id = %L', :'part_id'),
  'a negative lead time is refused',
  'lead_time_days');
select test.refuses(
  format('update public.components set replaced_by = %L where id = %L', :'part_id', :'part_id'),
  'a part cannot replace itself',
  'replaced_by');

-- === Isolation for the three new tables ====================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.labour_actuals (company_id, costing_id, panel_id, process_type, hours, note)
values (:'alpha'::uuid, :'pf_costing'::uuid, :'pf_panel'::uuid, 'assembly', 11.5, 'two fitters, a day and a half');
commit;

select test.eq((select hours from public.labour_actuals where panel_id = :'pf_panel'::uuid),
               11.50, 'an engineer records the hours actually worked');

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.labour_actuals), 0,
               'another company sees none of them');
select test.refuses(
  format('insert into public.labour_actuals (company_id, costing_id, panel_id, process_type, hours) values (%L, %L, %L, ''assembly'', 1)',
         :'alpha', :'pf_costing', :'pf_panel'),
  'and cannot file hours against a panel it cannot see',
  'row-level security');
select test.refuses(
  format('insert into public.kit_parameters (assembly_id, name) values (%L, ''steps'')', :'kit_id'),
  'nor add a parameter to a master kit: that is the master administrator''s',
  'row-level security');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
insert into public.kit_parameters (assembly_id, name, value_type, unit, default_value, min_value, max_value)
values (:'kit_id'::uuid, 'steps', 'number', 'kVAr', '8', 1, 24);
commit;

select test.eq((select max_value from public.kit_parameters where assembly_id = :'kit_id'::uuid and name = 'steps'),
               24.0000, 'the master administrator describes what a kit asks for');
select test.refuses(
  format('insert into public.kit_parameters (assembly_id, name, min_value, max_value) values (%L, ''feeders'', 10, 2)', :'kit_id'),
  'a minimum above the maximum is refused',
  'min_not_above_max');

-- Put the kit back the way the other tests expect to find it.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.assemblies set is_active = true where id = :'kit_id'::uuid;
commit;
