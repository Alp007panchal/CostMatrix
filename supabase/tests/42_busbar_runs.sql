-- The busbar run calculator (migration 0118, roadmap 4.1). Runs after 14, so the
-- bar sizes and the kits are the owner's own.
--
-- The acceptance case is his own `CU-OPT1` sheet for NPP-192 Option 1, all
-- seventeen runs of it, which reference §1.4 records the totals of:
--
--     50×10  70.4 m      20×10  95.3 m      40×10  12.8 m
--     30×10   9.9 m      40×5    7.2 m
--
-- Those are the figures this file asserts. Worth seeing beside what the estimate
-- actually carried (test 15, the workbook's own BUSBAR block): 30 / 77 / 18 / 13
-- / 8. The calculator and the estimate never agreed, because nothing carried one
-- into the other — which is the whole point of `v_panel_busbar_check`.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select test.feature(:'alpha'::uuid, 'busbar_runs', true);

-- ===========================================================================
-- The bar sizes, and which one a rating takes
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select count(*)::int from public.v_busbar_bars), 10,
  'the ten copper bar sizes of the owner''s catalogue are the bars a run can use');
select test.eq((select kg_per_metre from public.v_busbar_bars where code = '100X10MM'), 9::numeric,
  'and each carries the kilograms per metre the catalogue holds');
select test.eq((select price_per_metre from public.v_busbar_bars where code = '100X10MM'), 27000::numeric,
  'priced at the copper rate: 9 kg at 3,000 a kilogram');
select test.ok((select width_mm = 100 and thickness_mm = 10 and area_mm2 = 1000
                from public.v_busbar_bars where code = '100X10MM'),
  'the millimetres are read off the part number, not stored a second time');

select test.eq(app.bar_for_rating(800) ->> 'bar_code', '40X10MM',
  'an 800 A board takes the bar the library''s own 800 A kits carry');
select test.eq(app.bar_for_rating(1000) ->> 'bar_code', '60X10MM',
  'and a 1000 A board the bar its 1000 A kits carry');
select test.ok((app.bar_for_rating(870) ->> 'bar_code') is not null,
  'a rating between two the library knows takes the next one up');
select test.ok((app.bar_for_rating(870) ->> 'how') like '%next rating up%',
  'and says so rather than looking certain');
select test.ok((app.bar_for_rating(99999) ->> 'how') like '%largest%',
  'a rating bigger than anything in the catalogue gets the largest bar, named as such');

-- ===========================================================================
-- His own CU-OPT1 sheet, run through the app
-- ===========================================================================
select app.busbar_run_totals($json$[
  {"label": "Incoming tails-1600A",          "bar_code": "50X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 1.6, "sets": 1},
  {"label": "HBB 1-1600A",                   "bar_code": "20X10MM", "phases": 4, "runs_per_phase": 4, "length_m": 1.2, "sets": 1},
  {"label": "Isolator tails-1600A",          "bar_code": "50X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 1.6, "sets": 1},
  {"label": "Onload changeover tails-1600A", "bar_code": "50X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 2.4, "sets": 1},
  {"label": "HBB 2-1600A",                   "bar_code": "20X10MM", "phases": 4, "runs_per_phase": 4, "length_m": 1.8, "sets": 1},
  {"label": "Solar ACB tails-1250A",         "bar_code": "40X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 1.6, "sets": 1},
  {"label": "ATS tails-1600A",               "bar_code": "50X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 1.6, "sets": 2},
  {"label": "HBB to outgoers-1600A",         "bar_code": "20X10MM", "phases": 4, "runs_per_phase": 4, "length_m": 0.9, "sets": 1},
  {"label": "VBB-1600A",                     "bar_code": "20X10MM", "phases": 4, "runs_per_phase": 4, "length_m": 1.8, "sets": 1},
  {"label": "Outgoing tails-400A",           "bar_code": "40X5MM",  "phases": 3, "runs_per_phase": 1, "length_m": 0.8, "sets": 3},
  {"label": "APFC tails-630A",               "bar_code": "30X10MM", "phases": 3, "runs_per_phase": 1, "length_m": 0.8, "sets": 1},
  {"label": "HBB+VBB-630A",                  "bar_code": "30X10MM", "phases": 3, "runs_per_phase": 1, "length_m": 2.5, "sets": 1},
  {"label": "Earth bar",                     "bar_code": "20X10MM", "phases": 1, "runs_per_phase": 1, "length_m": 4.1, "sets": 1}
]$json$::jsonb) as cu_opt1 \gset

select test.eq((select (b ->> 'metres')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '50X10MM'), 70.4::numeric,
  'the app totals his 50×10 runs at 70.4 m, the figure on his own sheet');
select test.eq((select (b ->> 'metres')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '20X10MM'), 95.3::numeric,
  'the 20×10 runs at 95.3 m');
select test.eq((select (b ->> 'metres')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '40X10MM'), 12.8::numeric,
  'the 40×10 run at 12.8 m');
select test.eq((select (b ->> 'metres')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '30X10MM'), 9.9::numeric,
  'the 30×10 runs at 9.9 m');
select test.eq((select (b ->> 'metres')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '40X5MM'), 7.2::numeric,
  'and the 40×5 outgoing tails at 7.2 m');
select test.eq((:'cu_opt1'::jsonb ->> 'total_metres')::numeric, 195.6::numeric,
  'which is 195.6 m of copper in all');
select test.eq((select (b ->> 'kg')::numeric from jsonb_array_elements(:'cu_opt1'::jsonb -> 'bars') as t(b)
                where b ->> 'bar_code' = '50X10MM'), 323.84::numeric,
  'the kilograms follow from the catalogue: 70.4 m of 50×10 at 4.6 kg/m');
select test.ok((:'cu_opt1'::jsonb ->> 'unpriced_bars') is null,
  'every bar in the schedule has a price behind it');

-- === What it refuses, by name ===============================================
select test.refuses($$select app.busbar_run_totals('[{"label":"Tails","bar_code":"75X12MM","phases":4,"runs_per_phase":2,"length_m":1.6,"sets":1}]'::jsonb)$$,
  'a bar size the catalogue does not hold is refused, not costed at nothing',
  'does not hold');
select test.refuses($$select app.busbar_run_totals('[{"label":"Tails","bar_code":"50X10MM","phases":4,"runs_per_phase":2,"length_m":0,"sets":1}]'::jsonb)$$,
  'a run with no length is refused rather than silently adding nothing',
  'all above zero');
select test.refuses($$select app.busbar_run_totals('[{"bar_code":"50X10MM","phases":4,"runs_per_phase":2,"length_m":1.6,"sets":1}]'::jsonb)$$,
  'every run has to say what it is, so the schedule can be read back',
  'needs a name');
rollback;

-- ===========================================================================
-- A schedule on a real panel: saved, compared, applied
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Busbar: runs against metres costed') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, parameters)
values (:'job'::uuid, :'alpha'::uuid, 'PANEL 4.1', 1, 'PC',
        jsonb_build_object('sources', jsonb_build_array('kplc', 'generator'),
                           'incomer_rating_a', 1600, 'changeover', 'ats',
                           'feeders', jsonb_build_array(jsonb_build_object('rating_a', 400, 'quantity', 3)),
                           'apfc_kvar', 400))
returning id as panel \gset

-- === A schedule to start from ===============================================
select app.starting_busbar_runs(:'panel'::uuid) as start \gset

select test.ok(jsonb_array_length(:'start'::jsonb -> 'runs') >= 8,
  'a configured board gets the runs it needs, named, rather than an empty grid');
select test.eq((select count(*)::int from jsonb_array_elements(:'start'::jsonb -> 'runs') as t(r)
                where r ->> 'label' like 'Incoming tails%' and (r ->> 'sets')::numeric = 2), 1,
  'two supplies means two sets of incoming tails');
select test.ok(exists (select 1 from jsonb_array_elements(:'start'::jsonb -> 'runs') as t(r)
                       where r ->> 'label' like 'ATS tails%'),
  'a board with a changeover gets its ATS tails');
select test.ok(exists (select 1 from jsonb_array_elements(:'start'::jsonb -> 'runs') as t(r)
                       where r ->> 'label' like 'Outgoing tails — 400%' and (r ->> 'sets')::numeric = 3),
  'three 400 A ways means three sets of outgoing tails, at the 400 A bar');
select test.ok(exists (select 1 from jsonb_array_elements(:'start'::jsonb -> 'runs') as t(r)
                       where r ->> 'label' like 'APFC tails — 400 kVAr (556 A)%'),
  '400 kVAr at 415 V draws 556 A, and the tails are sized for it');
select test.ok(exists (select 1 from jsonb_array_elements(:'start'::jsonb -> 'runs') as t(r)
                       where r ->> 'label' = 'Earth bar'),
  'and every board has an earth bar');
select test.ok((:'start'::jsonb ->> 'note') like '%correct them against the drawing%',
  'the lengths are said to be the company''s usual figures, not a measurement');

select test.refuses(format($$select app.starting_busbar_runs(
  (select id from public.costing_panels where costing_id = %L and name = 'NO PARAMETERS'))$$, :'job'),
  'a panel nobody has configured cannot have its runs guessed', 'no such panel');

-- === Saving moves no money ==================================================
select coalesce(subtotal, 0) as before from public.v_costing_totals where costing_id = :'job'::uuid \gset

select app.save_busbar_runs(:'panel'::uuid, $json$[
  {"label": "Incoming tails-1600A", "bar_code": "50X10MM", "phases": 4, "runs_per_phase": 2, "length_m": 1.6, "sets": 1},
  {"label": "HBB 1-1600A",          "bar_code": "20X10MM", "phases": 4, "runs_per_phase": 4, "length_m": 1.2, "sets": 1},
  {"label": "Earth bar",            "bar_code": "20X10MM", "phases": 1, "runs_per_phase": 1, "length_m": 4.1, "sets": 1}
]$json$::jsonb) as saved \gset

select test.eq((:'saved'::jsonb ->> 'total_metres')::numeric, 36.1::numeric,
  'the three runs come to 36.1 m: 12.8 of 50×10 and 23.3 of 20×10');
select test.eq((select count(*)::int from public.v_panel_busbar_runs where panel_id = :'panel'::uuid), 3,
  'the schedule is kept with the panel, a row at a time');
select test.eq((select metres from public.v_panel_busbar_runs
                where panel_id = :'panel'::uuid and label = 'HBB 1-1600A'), 19.2::numeric,
  'each row carrying the metres his formula gives');
select test.eq((select coalesce(subtotal, 0) from public.v_costing_totals where costing_id = :'job'::uuid),
               :'before'::numeric,
  'and writing a schedule has moved no price at all: it is a calculation, not a line');

select test.eq((select scheduled_m from public.v_panel_busbar_check
                where panel_id = :'panel'::uuid and bar_code = '20X10MM'), 23.3::numeric,
  'the check reads what the schedule asks for');
select test.eq((select costed_m from public.v_panel_busbar_check
                where panel_id = :'panel'::uuid and bar_code = '20X10MM'), 0::numeric,
  'against nothing costed yet — the gap the workbook never showed');

-- === Applying it ============================================================
select app.apply_busbar_runs(:'panel'::uuid) as applied \gset

select test.eq((:'applied'::jsonb ->> 'sizes')::int, 2,
  'applying adds one line per bar size');
select test.eq((:'applied'::jsonb ->> 'metres')::numeric, 36.1::numeric,
  'for the metres the schedule worked out');
select test.eq((select sum(ci.quantity) from public.costing_items ci
                join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
                join public.v_busbar_bars b on b.id = ci.source_component_id
                where ca.panel_id = :'panel'::uuid), 36.1::numeric,
  'and the lines on the panel are those metres, priced and frozen like any other');
select test.eq((select section from public.costing_assemblies
                where panel_id = :'panel'::uuid and section = 'Busbar'), 'Busbar',
  'in a section called Busbar, where a person would look for them');
select test.eq((select difference_m from public.v_panel_busbar_check
                where panel_id = :'panel'::uuid and bar_code = '50X10MM'), 0::numeric,
  'after which the schedule and the costing agree');
select test.ok((select coalesce(subtotal, 0) > :'before'::numeric
                from public.v_costing_totals where costing_id = :'job'::uuid),
  'the copper is now in the price, because a person put it there');

-- === Twice is a refusal, not a doubling =====================================
select test.refuses(format($$select app.apply_busbar_runs(%L)$$, :'panel'),
  'applying twice would double the metres, so the second time is refused',
  'busbar lines in Busbar');
select app.apply_busbar_runs(:'panel'::uuid, 'Busbar', true) as again \gset
select test.eq((:'again'::jsonb ->> 'replaced')::int, 2,
  'told to replace, it says how many lines it took out');
select test.eq((select sum(ci.quantity) from public.costing_items ci
                join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
                join public.v_busbar_bars b on b.id = ci.source_component_id
                where ca.panel_id = :'panel'::uuid), 36.1::numeric,
  'and the metres are the same afterwards, not twice as many');

-- === A costing that is closed ===============================================
select app.submit_costing(:'job'::uuid);
select test.refuses(format($$select app.save_busbar_runs(%L, '[]'::jsonb)$$, :'panel'),
  'a submitted costing takes no more schedules', 'not open for editing');
select test.refuses(format($$select app.apply_busbar_runs(%L)$$, :'panel'),
  'nor any more busbar lines', 'not open for editing');
rollback;

-- ===========================================================================
-- Somebody else's board
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job2 from app.create_costing('Busbar: Alpha only') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, parameters)
values (:'job2'::uuid, :'alpha'::uuid, 'ALPHA PANEL', 1,
        jsonb_build_object('incomer_rating_a', 800))
returning id as panel2 \gset
select app.save_busbar_runs(:'panel2'::uuid,
  '[{"label":"Incoming tails","bar_code":"40X10MM","phases":4,"runs_per_phase":2,"length_m":1.6,"sets":1}]'::jsonb);
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.eq((select count(*)::int from public.v_panel_busbar_runs where panel_id = :'panel2'::uuid), 0,
  'another company sees none of this board''s runs');
select test.eq((select count(*)::int from public.v_panel_busbar_check where panel_id = :'panel2'::uuid), 0,
  'nor what it is short of');
select test.refuses(format($$select app.save_busbar_runs(%L, '[]'::jsonb)$$, :'panel2'),
  'nor can it write a schedule onto it', 'no such panel');
rollback;

delete from public.costings where id = :'job2'::uuid;
select test.feature(:'alpha'::uuid, 'busbar_runs', false);
