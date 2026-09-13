-- Does a costing say when it has no labour? (migration 0123)
--
-- This is the app's most expensive quiet mistake. `add_assembly_to_costing`
-- freezes labour only `where effective_hours > 0`, so a kit whose group has no
-- hours recorded gets no labour rows, the costing prices its material correctly,
-- adds nothing for the time, and looks finished. With
-- `kit-group-labour-template.csv` still empty that is the normal case, not an
-- edge one.
--
-- The kits here are made on purpose: one with hours, one without, so the three
-- verdicts can be told apart.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select test.feature(:'alpha'::uuid, 'labour_check', true);

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000047a', null, 'Timed group'),
       ('00000000-0000-0000-0000-00000000047b', null, 'Group with no hours')
on conflict do nothing;

insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-0000000047a1', null, 'LAB-WITH', 'KIT WITH HOURS',
        '00000000-0000-0000-0000-00000000047a'),
       ('00000000-0000-0000-0000-0000000047a2', null, 'LAB-NONE', 'KIT WITH NO HOURS',
        '00000000-0000-0000-0000-00000000047b');
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
select id, :'part_id'::uuid, 1, true from public.assemblies
 where id in ('00000000-0000-0000-0000-0000000047a1', '00000000-0000-0000-0000-0000000047a2');
-- Only the first one is told how long it takes.
insert into public.assembly_labour (assembly_id, process_type, hours) values
  ('00000000-0000-0000-0000-0000000047a1', 'assembly', 6);

-- ===========================================================================
-- A costing whose kits all carry hours
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Labour: all timed') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL A', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000047a1'::uuid, 1);

select test.eq((select verdict from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'ok', 'a costing whose every kit carries hours is not complained about');
select test.eq((select kit_lines_without_hours::int from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid), 0,
  'nothing is missing its hours');
select test.ok((select labour_cost > 0 from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'and it actually costs something for the time');
rollback;

-- ===========================================================================
-- The case that matters: kits on it, and not one hour anywhere
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Labour: none at all') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL B', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000047a2'::uuid, 2);

select test.eq((select verdict from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'none', 'a costing with kits on it and no labour at all reads "none"');
select test.eq((select kit_lines_without_hours::int from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid), 1,
  'and names how many kit lines have no hours');
select test.eq((select labour_cost from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  0::numeric, 'the labour really is nothing — this is not a rounding complaint');
select test.ok((select material_cost > 0 from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'while the material priced perfectly well, which is what makes it quiet');

-- The fix is a row of the labour template, so the group is named.
select test.ok((select groups_to_fill like '%Group with no hours%'
                from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'it names the kit group to fill in, not just the kit');
select test.ok((select groups_to_fill like '%(1)%'
                from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'with how many lines that group is responsible for');
rollback;

-- ===========================================================================
-- Some timed, some not — the half-filled template
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Labour: half filled') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL C', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000047a1'::uuid, 1);
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000047a2'::uuid, 1);

select test.eq((select verdict from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'some', 'a costing where only some kits are timed says so, rather than passing');
select test.eq((select kit_lines_without_hours::int from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid), 1,
  'one of its two kit lines has no hours');
select test.ok((select labour_share_pct > 0 from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid),
  'and the labour it does carry is shown against the material, so the share can be judged');
rollback;

-- ===========================================================================
-- Hours recorded, but priced at nothing
-- ===========================================================================
-- The quieter twin: the rate is frozen when the costing is created, so a rate set
-- afterwards never reaches it.
begin;
set local role authenticated;
-- The company's assembly rate is taken to nothing before the costing is made,
-- so the costing freezes a zero rate.
select test.sign_in(:'alice');
update public.labour_rates set hourly_rate = 0
 where company_id = :'alpha'::uuid and process_type = 'assembly';

select test.sign_in(:'carol');
select id as job from app.create_costing('Labour: no rate') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL D', 1, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-0000000047a1'::uuid, 1);

select test.eq((select verdict from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'none', 'hours at a zero rate still cost nothing, and still read as no labour');
select test.eq((select labour_rows_without_rate::int from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid), 1,
  'and the rows priced at nothing are counted separately from the ones with no hours');
select test.ok((select processes_without_rate like '%assembly%'
                from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'naming the process whose rate is missing, because the fix is a rate and not hours');
select test.eq((select kit_lines_without_hours::int from public.v_costing_labour_gaps
                 where costing_id = :'job'::uuid), 0,
  'the hours themselves were never the problem here');
rollback;

-- ===========================================================================
-- An empty costing is not a complaint, and another company sees nothing
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Labour: empty') \gset
select test.eq((select verdict from public.v_costing_labour_gaps where costing_id = :'job'::uuid),
  'no_kits', 'a costing with nothing on it is not accused of missing labour');

select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_costing_labour_gaps where costing_id = :'job'::uuid), 0,
  'and another company sees nothing of Alpha''s costings here');
rollback;

-- ===========================================================================
-- Put back what this file made
-- ===========================================================================
delete from public.assembly_labour where assembly_id in
  ('00000000-0000-0000-0000-0000000047a1', '00000000-0000-0000-0000-0000000047a2');
delete from public.assembly_components where assembly_id in
  ('00000000-0000-0000-0000-0000000047a1', '00000000-0000-0000-0000-0000000047a2');
delete from public.assemblies where id in
  ('00000000-0000-0000-0000-0000000047a1', '00000000-0000-0000-0000-0000000047a2');
delete from public.kit_groups where id in
  ('00000000-0000-0000-0000-00000000047a', '00000000-0000-0000-0000-00000000047b');
select test.feature(:'alpha'::uuid, 'labour_check', false);
