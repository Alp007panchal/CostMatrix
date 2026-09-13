-- EPLAN project metadata and the parts list (migration 0122, roadmap 4.3).
--
-- Three things under test, and one of them is the trap: the hand-written column
-- list in `create_costing_revision` has silently dropped frozen data twice before
-- (0011, 0014), so there is an assertion here that a revision carries the drawing
-- numbers, and one that a **copy** deliberately does not — a copy is a different
-- board and will have its own drawings.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select test.feature(:'alpha'::uuid, 'eplan_exports', true);

-- ===========================================================================
-- Typing the project and the drawings in
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('EPLAN: the metadata') \gset

select test.ok((select eplan_project is null and drawing_numbers is null
                from public.costings where id = :'job'::uuid),
  'a new costing claims no project and no drawings');

select app.set_eplan_metadata(:'job'::uuid, 'NPP-201 MAIN LV', E'E-201-01\nE-201-02');
select test.eq((select eplan_project from public.costings where id = :'job'::uuid),
  'NPP-201 MAIN LV', 'the project name is kept as the drawing office writes it');
select test.eq((select drawing_numbers from public.costings where id = :'job'::uuid),
  E'E-201-01\nE-201-02', 'and the drawing numbers, one per line');

select test.eq((select count(*)::int from public.v_costing_history
                 where costing_id = :'job'::uuid and action = 'eplan_metadata'), 1,
  'the change is in the history, because a drawing number is a fact about the job');

-- Blank means none, not the string "".
select app.set_eplan_metadata(:'job'::uuid, '   ', '');
select test.ok((select eplan_project is null and drawing_numbers is null
                from public.costings where id = :'job'::uuid),
  'clearing them leaves nothing rather than an empty string');

-- Setting them to what they already are is not a history line.
select app.set_eplan_metadata(:'job'::uuid, null, null);
select test.eq((select count(*)::int from public.v_costing_history
                 where costing_id = :'job'::uuid and action = 'eplan_metadata'), 2,
  'and a change that changes nothing writes no second line');

select test.eq((select round(coalesce(sum(line_total), 0), 2) from public.v_costing_panel_prices
                 where costing_id = :'job'::uuid), 0::numeric,
  'none of it has moved a price: there is nothing to price');
rollback;

-- ===========================================================================
-- Reading an EPLAN export that was pasted in
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('EPLAN: the import') \gset

-- The shapes a house actually pastes: colons, equals signs, a CSV pair, a tab.
select app.import_eplan_metadata(:'job'::uuid, E'Project name: NPP-201 TRICLOVER\nDrawing no: E-201-01\nDRAWING NUMBER = E-201-02\nPage name,E-201-03\nRevision: 2\n') as seen \gset

select test.eq(:'seen'::jsonb ->> 'project', 'NPP-201 TRICLOVER',
  'the project name is read whichever way it is written');
select test.eq(jsonb_array_length(:'seen'::jsonb -> 'drawings'), 3,
  'and every drawing number, across colons, equals signs and commas');
select test.eq(:'seen'::jsonb ->> 'lines_read', '5', 'it says how many lines it looked at');
select test.eq(jsonb_array_length(:'seen'::jsonb -> 'unmatched'), 1,
  'the revision line is a field it does not read, and it says so rather than swallowing it');
select test.ok(:'seen'::jsonb -> 'unmatched' -> 0 ->> 'why' like '%not a field this reads%',
  'in words a person can act on');

-- Proposed, not applied.
select test.ok((select eplan_project is null from public.costings where id = :'job'::uuid),
  'reading it has written nothing: a proposal is not a change');

select app.import_eplan_metadata(:'job'::uuid, E'Project: NPP-201 TRICLOVER\nSheet: E-201-01\n', true) as done \gset
select test.eq(:'done'::jsonb ->> 'applied', 'true', 'asked to apply, it applies');
select test.eq((select eplan_project from public.costings where id = :'job'::uuid),
  'NPP-201 TRICLOVER', 'and the project is on the costing');
select test.eq((select drawing_numbers from public.costings where id = :'job'::uuid),
  'E-201-01', 'with the drawing it found');

-- Nothing useful in it is said plainly rather than wiping what is there.
select app.import_eplan_metadata(:'job'::uuid, E'Customer: Triclover\nDate: 12/09/2026\n', true) as nothing \gset
select test.ok(:'nothing'::jsonb ->> 'why' like '%none of these lines%',
  'a paste with no project or drawing in it says so');
select test.eq((select eplan_project from public.costings where id = :'job'::uuid),
  'NPP-201 TRICLOVER', 'and leaves what was already there alone');

select test.ok((app.import_eplan_metadata(:'job'::uuid, '') ->> 'why') like '%nothing was pasted%',
  'an empty paste is answered, not an error');
rollback;

-- ===========================================================================
-- The trap: does a revision carry the drawing numbers?
-- ===========================================================================
-- `create_costing_revision` lists its columns by hand, and that list has dropped
-- frozen data twice. This is the assertion that stops it happening a third time.
begin;
set local role authenticated;
select test.sign_in(:'alice');

select id as job from app.create_costing('EPLAN: a revision') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 4.3', 1) returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-00000000bb01'::uuid, 1);
select app.set_eplan_metadata(:'job'::uuid, 'NPP-201 MAIN LV', E'E-201-01\nE-201-02');
select app.submit_costing(:'job'::uuid);
select app.approve_costing(:'job'::uuid);

select id as rev from app.create_costing_revision(:'job'::uuid) \gset
select test.eq((select eplan_project from public.costings where id = :'rev'::uuid),
  'NPP-201 MAIN LV',
  'a revision is the same board on the same drawings, so it carries the project');
select test.eq((select drawing_numbers from public.costings where id = :'rev'::uuid),
  E'E-201-01\nE-201-02', 'and the drawing numbers with it');
select test.eq((select revision_no from public.costings where id = :'rev'::uuid)::int, 1,
  'and it is still just a revision, numbered one higher');

-- A copy is a different job, and starts with no drawings of anyone else's.
select app.copy_costing(:'job'::uuid, 'EPLAN: a copy') as copied \gset
select test.ok((select eplan_project is null and drawing_numbers is null
                from public.costings where id = (:'copied'::jsonb ->> 'costing_id')::uuid),
  'a copy is a different board, so it carries no project and no drawings');
rollback;

-- ===========================================================================
-- The parts list, and the tags it shares with the drawing
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('EPLAN: the parts list') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 4.3', 2, 'PC') returning id as panel \gset
select app.add_assembly_to_costing(:'panel'::uuid, '00000000-0000-0000-0000-00000000bb01'::uuid, 1);

select test.ok((select count(*) > 0 from public.v_eplan_parts where costing_id = :'job'::uuid),
  'every frozen line of the costing is a row the drawing office can import');
select test.ok((select bool_and(panel = 'PANEL 4.3') from public.v_eplan_parts
                 where costing_id = :'job'::uuid),
  'each one says which panel it belongs to');
select test.ok((select bool_and(description is not null and description <> '')
                from public.v_eplan_parts where costing_id = :'job'::uuid),
  'and carries the description that was frozen onto the costing, not today''s catalogue');
select test.ok((select bool_and(device_tag is null) from public.v_eplan_parts
                 where costing_id = :'job'::uuid),
  'with no device tag until somebody has laid the panel out — a tag is the drawing''s, not a guess');

-- Lay the panel out, and the tags appear on the parts of the kits that were placed.
select app.save_panel_layout(:'panel'::uuid, jsonb_build_array(
  app.layout_section('S1', 800, 0, 'busbar_fed',
    (select jsonb_agg(jsonb_build_object(
       'costing_assembly_id', ca.id, 'face', 'front', 'name', ca.name,
       'slot', 0, 'height_mm', 1200, 'unsized', false))
     from public.costing_assemblies ca
     where ca.panel_id = :'panel'::uuid and ca.kind = 'kit'))), 'S4');

select test.ok((select bool_or(device_tag = 'Q1') from public.v_eplan_parts
                 where costing_id = :'job'::uuid),
  'once it is drawn, the kit''s parts carry the tag the drawing gave it: Q1');
select test.ok((select bool_and(device_tag = 'Q1') from public.v_eplan_parts
                 where costing_id = :'job'::uuid and kit is not null and device_tag is not null),
  'the same tag on every part of that kit, because they are one device');

-- Another company sees none of it.
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_eplan_parts where costing_id = :'job'::uuid), 0,
  'another company can export nothing of Alpha''s');
rollback;

select test.feature(:'alpha'::uuid, 'eplan_exports', false);
