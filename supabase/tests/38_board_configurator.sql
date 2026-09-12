-- The guided board configurator (migration 0114, roadmap 3.1). Runs after 14, so
-- the kits are the owner's own 296 and the choices are made from a real library.
--
-- The answers under test are a board the owner would recognise: 1250 A ACB
-- incomer, grid and generator on an automatic changeover, twelve 100 A ways and
-- six 63 A ways, 400 kVAr of correction, metered, form 4B, IP54.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- === The next size up, which is the whole choosing rule ======================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.pick_board_kit('incomer', 1250, 'acb') as acb_pick \gset
select app.pick_board_kit('outgoer', 90, 'mccb') as mccb_pick \gset
select app.pick_board_kit('incomer', 99999, 'acb') as huge_pick \gset
select app.pick_board_kit('sync', null, 'nothing-like-this') as no_pick \gset
rollback;

select test.ok((:'acb_pick'::jsonb ->> 'rating')::numeric >= 1250,
  'an incomer for 1250 A is rated at least 1250 A');
select test.eq(
  (select min(k.rating) from public.v_board_kits k
    where k.role = 'incomer' and k.flavour = 'acb' and not k.has_unpriced_part and k.rating >= 1250),
  (:'acb_pick'::jsonb ->> 'rating')::numeric,
  'and it is the smallest one that reaches it: the next frame up, not the biggest');
select test.ok((:'mccb_pick'::jsonb ->> 'rating')::numeric >= 90,
  'a 90 A way takes the next MCCB up, not one below it');
select test.ok(:'huge_pick'::jsonb ->> 'assembly_id' is not null,
  'asked for more than the library holds, it still answers');
select test.ok((:'huge_pick'::jsonb ->> 'exact')::boolean = false,
  'saying plainly that it is not what was asked for');
select test.ok(:'huge_pick'::jsonb ->> 'note' like '%nothing above%',
  'with the reason an engineer can act on');
select test.ok(:'no_pick'::jsonb ->> 'assembly_id' is null,
  'and a kind of kit this library has none of is refused, not guessed at');

-- === A board from the answers ===============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job from app.create_costing('Configurator: a factory board') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC') returning id as panel \gset
select app.propose_board(:'panel'::uuid, jsonb_build_object(
  'sources', jsonb_build_array('grid', 'generator'),
  'incomer_rating_a', 1250,
  'incomer_type', 'acb',
  'changeover', 'ats',
  'feeders', jsonb_build_array(
    jsonb_build_object('rating_a', 100, 'quantity', 12, 'type', 'mccb'),
    jsonb_build_object('rating_a', 63, 'quantity', 6, 'type', 'mcb')),
  'apfc_kvar', 400,
  'metering', true,
  'form', '4B', 'ip', 'IP54', 'access', 'front', 'cable_entry', 'bottom')) as proposal \gset
commit;

select test.ok(jsonb_array_length(:'proposal'::jsonb -> 'lines') >= 5,
  'the answers come back as a proposal of kits');
select test.eq((select count(*)::int from public.costing_assemblies where costing_id = :'job'::uuid), 0,
  'and nothing has been written: a proposal is a proposal');

select test.eq(
  (select jsonb_array_length(jsonb_path_query_array(:'proposal'::jsonb, '$.lines[*] ? (@.role == "incomer" && @.section == "Incomer")'))),
  1, 'one incomer');
select test.eq(
  (select (jsonb_path_query_first(:'proposal'::jsonb, '$.lines[*] ? (@.section == "2nd incomer")') ->> 'quantity')::int),
  1, 'a second way in for the generator');
select test.eq(
  (select jsonb_array_length(jsonb_path_query_array(:'proposal'::jsonb, '$.lines[*] ? (@.section == "ATS")'))),
  1, 'and one changeover between the two sources');
select test.eq(
  (select (jsonb_path_query_first(:'proposal'::jsonb, '$.lines[*] ? (@.role == "outgoer" && @.quantity == 12)') ->> 'quantity')::int),
  12, 'twelve ways at 100 A, as asked');
select test.eq(
  (select (jsonb_path_query_first(:'proposal'::jsonb, '$.lines[*] ? (@.role == "outgoer" && @.quantity == 6)') ->> 'quantity')::int),
  6, 'and six at 63 A');
select test.ok(
  (select count(*) from jsonb_array_elements(:'proposal'::jsonb -> 'lines') l
    where l.value ->> 'section' = 'APFC bank') > 0,
  'the correction comes from 3.2''s grader rather than a second one here');
select test.ok(
  (select sum((l.value ->> 'quantity')::numeric * (l.value ->> 'rating')::numeric)
     from jsonb_array_elements(:'proposal'::jsonb -> 'lines') l
    where l.value ->> 'section' = 'APFC bank') between 380 and 400,
  'and reaches very nearly the 400 kVAr asked for');
select test.ok(
  (select bool_and((l.value ->> 'why') is not null) from jsonb_array_elements(:'proposal'::jsonb -> 'lines') l),
  'every line says which answer put it there');

-- The answers, shaped for the panel.
select test.eq(:'proposal'::jsonb -> 'parameters' ->> 'form', '4B',
  'the form is recorded');
select test.eq(:'proposal'::jsonb -> 'parameters' ->> 'ip', 'IP54', 'and the IP rating');
select test.eq(:'proposal'::jsonb -> 'parameters' ->> 'access', 'front', 'and the access');
select test.eq(:'proposal'::jsonb -> 'parameters' ->> 'cable_entry', 'bottom', 'and where the cables come in');
select test.eq((:'proposal'::jsonb -> 'parameters' ->> 'incomer_rating_a')::numeric, 1250::numeric,
  'with what the board is rated at');
select test.ok(jsonb_array_length(:'proposal'::jsonb -> 'parameters' -> 'feeders') = 2,
  'and the feeder schedule as it was asked for');

-- === Applying it ============================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.apply_board(:'panel'::uuid,
  :'proposal'::jsonb -> 'lines', :'proposal'::jsonb -> 'parameters') as applied \gset
commit;

select test.ok((:'applied'::jsonb ->> 'kinds')::int >= 5, 'applying adds every kind of kit');
select test.eq(
  (select count(*)::int from public.costing_assemblies
    where panel_id = :'panel'::uuid and kind = 'kit'),
  (:'applied'::jsonb ->> 'kinds')::int,
  'and the panel holds exactly those lines');
select test.eq(
  (select count(*)::int from public.costing_assemblies
    where panel_id = :'panel'::uuid and section = 'Outgoers'),
  2, 'the outgoers are in the outgoers section');
select test.eq(
  (select quantity from public.costing_assemblies
    where panel_id = :'panel'::uuid and section = 'Outgoers' order by quantity desc limit 1),
  12::numeric, 'at the quantities the engineer settled on');
select test.ok(
  (select bool_and(unit_price is not null and unit_price > 0) from public.costing_items
    where costing_id = :'job'::uuid),
  'every line is priced and frozen, because it went through the ordinary kit function');
select test.ok(
  (select count(*) > 0 from public.costing_labour where costing_id = :'job'::uuid),
  'and carries the labour hours of its kit group');
select test.ok(
  (select material_cost > 0 from public.v_costing_panel_costs where panel_id = :'panel'::uuid),
  'so the panel has a cost the moment it is configured');

-- The answers are on the panel, for the quotation and for 3.4's checks to read.
select test.eq((select parameters ->> 'form' from public.costing_panels where id = :'panel'::uuid), '4B',
  'the answers are kept on the panel');
select test.eq((select (parameters ->> 'apfc_kvar')::numeric from public.costing_panels where id = :'panel'::uuid),
  400::numeric, 'including the correction asked for');
select test.eq((select count(*)::int from public.activity_log
                where entity_id = :'job'::uuid and action = 'board.configured'), 1,
  'and the activity log says the board was configured');

-- Parameters already on a panel are kept, not wiped, by a later run.
begin;
set local role authenticated;
select test.sign_in(:'carol');
update public.costing_panels
   set parameters = parameters || jsonb_build_object('note_from_engineer', 'cable entry confirmed on site')
 where id = :'panel'::uuid;
select app.apply_board(:'panel'::uuid,
  jsonb_build_array(jsonb_path_query_first(:'proposal'::jsonb, '$.lines[*] ? (@.role == "metering")')),
  jsonb_build_object('ip', 'IP65'));
commit;
select test.eq((select parameters ->> 'note_from_engineer' from public.costing_panels where id = :'panel'::uuid),
  'cable entry confirmed on site', 'a second run keeps what was already on the panel');
select test.eq((select parameters ->> 'ip' from public.costing_panels where id = :'panel'::uuid), 'IP65',
  'and takes the newer answer where they disagree');

-- === What it refuses ========================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(format($$select app.propose_board(%L, '{}'::jsonb)$$, :'panel'),
  'a board with no incomer rating is refused', 'rated at, in amps');
select test.refuses(format($$select app.apply_board(%L, '[]'::jsonb)$$, :'panel'),
  'and so is an empty proposal', 'nothing to add');
rollback;

-- A library with nothing to answer an answer says so, rather than proposing a
-- board with a hole in it.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.propose_board(:'panel'::uuid, jsonb_build_object(
  'incomer_rating_a', 400, 'changeover', 'sync',
  'feeders', jsonb_build_array(jsonb_build_object('rating_a', 100, 'quantity', 2, 'type', 'nonsense')))
) as thin \gset
rollback;
select test.ok(jsonb_array_length(:'thin'::jsonb -> 'missing') > 0,
  'what this library cannot answer is named');
select test.ok(
  (select bool_and((m.value ->> 'why') is not null) from jsonb_array_elements(:'thin'::jsonb -> 'missing') m),
  'each with a reason');

-- === Lifecycle and isolation ================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
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
select test.refuses(
  format($$select app.apply_board(%L, %L::jsonb)$$, :'panel', :'proposal'::jsonb -> 'lines'),
  'an approved costing takes no configured board', 'not open for editing');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.refuses(
  format($$select app.propose_board(%L, '{"incomer_rating_a": 100}'::jsonb)$$, :'panel'),
  'another company cannot configure a panel it cannot see', 'no such panel');
rollback;
