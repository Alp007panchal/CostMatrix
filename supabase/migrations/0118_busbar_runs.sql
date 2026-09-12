-- 0118  The busbar run calculator (roadmap 4.1).
--
-- This is the `CU-OPT1` sheet of the owner's own workbook, which reference §1.4
-- describes and decision 12 deliberately left out of phase 1: standard kits carry
-- fixed busbar metres and an engineer adjusts them by hand on a non-standard
-- board. Adjusting them by hand means doing this arithmetic on paper, thirteen
-- rows of it, and the workbook's own note admits the answer was never carried
-- back into the estimate: its BUSBAR block says 30 / 18 / 13 / 77 / 8 metres
-- where the calculator totalled 70.4 / 12.8 / 9.9 / 95.3 / 7.2.
--
-- So the arithmetic is the owner's, unchanged, one row per bar run:
--
--     metres = phases × runs per phase × length × sets
--
-- summed by bar size. What is new is that the answer is kept with the panel, can
-- be compared with the metres actually costed on it, and can be applied as
-- busbar lines through the ordinary component function, so every metre is priced
-- and frozen exactly as a hand-typed one.
--
-- **No existing costing moves.** The schedule lives in `costing_panels.parameters`
-- (foundation F4), which a revision and a copy already carry; nothing reads it
-- unless somebody applies it; and NPP-192 is unchanged, which the suite proves.

-- ===========================================================================
-- 0. A switch of its own
-- ===========================================================================
-- 0117's rule: every advanced feature arrives off, for every company, and only
-- the master administrator flips it. Like the other two configurators this one
-- only proposes — the costing changes when a person presses Apply — so it is not
-- one of the three that change what an existing costing does.

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('busbar_runs', 'The busbar run calculator',
   'List the bar runs a board needs — incoming tails, horizontal and vertical busbar, outgoing tails, the earth bar — and the app totals the metres and kilograms per bar size, compares them with what is costed on the panel, and can add them as busbar lines. Your own CU-OPT1 sheet, kept with the job.',
   false, 'feature.busbar_runs', 160)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;

-- ===========================================================================
-- 1. The bar sizes a board can be built from
-- ===========================================================================
-- Copper bar is the one thing in the catalogue priced by weight (0003): kilograms
-- per metre against the company's copper rate. The size is in the part number the
-- owner's library uses — `100X10MM` — so it is read from there rather than stored
-- twice and allowed to disagree.

create or replace view public.v_busbar_bars
with (security_invoker = true)
as
select
  p.id,
  p.company_id,
  p.code,
  p.name,
  (regexp_match(upper(p.code), '^([0-9]+)X([0-9]+)\s*MM$'))[1]::numeric as width_mm,
  (regexp_match(upper(p.code), '^([0-9]+)X([0-9]+)\s*MM$'))[2]::numeric as thickness_mm,
  (regexp_match(upper(p.code), '^([0-9]+)X([0-9]+)\s*MM$'))[1]::numeric
    * (regexp_match(upper(p.code), '^([0-9]+)X([0-9]+)\s*MM$'))[2]::numeric as area_mm2,
  p.weight_per_unit as kg_per_metre,
  p.unit_price      as price_per_metre,
  p.currency_code,
  p.unit_price is not null as is_priced
from public.v_component_prices p
where p.pricing_mode = 'weight_rate'
  and p.material_rate_code = 'copper_busbar'
  and p.is_active
  and upper(p.code) ~ '^[0-9]+X[0-9]+\s*MM$';

comment on view public.v_busbar_bars is
  'The copper bar sizes this company can buy, with the millimetres read off the
   part number, the kilograms per metre the catalogue holds and the price per
   metre at today''s copper rate. What a run schedule chooses among (roadmap 4.1).';

grant select on public.v_busbar_bars to authenticated;

-- Which bar the library itself puts on a board of a given rating. Not a table of
-- ampacities invented here: the 296 kits already answer it — an 800 A ACB kit
-- carries 40×10, a 1000 A one carries 60×10 — and that is the answer an engineer
-- of this company would give.
create or replace view public.v_busbar_bar_by_rating
with (security_invoker = true)
as
select distinct on (k.rating)
  k.rating as rating_a,
  b.code   as bar_code,
  count(*) over (partition by k.rating, b.code) as kits
from public.v_kits k
join public.assembly_components ac on ac.assembly_id = k.id
join public.v_busbar_bars b on b.id = ac.component_id
where k.rating_unit = 'A' and k.rating is not null and k.is_active
order by k.rating, count(*) over (partition by k.rating, b.code) desc, b.code;

comment on view public.v_busbar_bar_by_rating is
  'The bar size this library uses at each device rating, read from the kits
   themselves — the most common one where a rating has more than one.';

grant select on public.v_busbar_bar_by_rating to authenticated;

-- The bar for a rating: what the library uses at that rating, else at the next
-- rating up, else the largest bar there is. Says which, so a proposal can.
create or replace function app.bar_for_rating(amps numeric)
returns jsonb
language plpgsql
stable
as $$
declare
  found record;
begin
  if amps is null or amps <= 0 then
    return jsonb_build_object('bar_code', null, 'how', 'no rating given');
  end if;

  select r.bar_code, r.rating_a into found
  from public.v_busbar_bar_by_rating r
  where r.rating_a = amps;
  if found.bar_code is not null then
    return jsonb_build_object('bar_code', found.bar_code, 'how', 'what the library uses at this rating');
  end if;

  select r.bar_code, r.rating_a into found
  from public.v_busbar_bar_by_rating r
  where r.rating_a >= amps
  order by r.rating_a
  limit 1;
  if found.bar_code is not null then
    return jsonb_build_object('bar_code', found.bar_code,
      'how', format('the bar the library uses at %s A, the next rating up', found.rating_a));
  end if;

  select b.code into found
  from public.v_busbar_bars b
  where b.is_priced
  order by b.area_mm2 desc nulls last
  limit 1;
  return jsonb_build_object('bar_code', found.code,
    'how', 'the largest bar in the catalogue — nothing bigger exists to offer');
end;
$$;

comment on function app.bar_for_rating(numeric) is
  'Which copper bar answers a rating, and how that was decided: the size the
   library uses there, the next rating up, or the largest there is.';

-- ===========================================================================
-- 2. The arithmetic, which writes nothing
-- ===========================================================================
-- One row per run, the workbook's own formula, and the totals by size. A bar the
-- catalogue does not hold, or a figure that is not a positive number, is refused
-- by name: a schedule that silently drops a run is worse than one that will not
-- be saved.

create or replace function app.busbar_run_totals(runs jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  run jsonb;
  bar record;
  i integer := 0;
  label text;
  phases numeric;
  per_phase numeric;
  length_m numeric;
  sets numeric;
  metres numeric;
  rows_out jsonb := '[]'::jsonb;
  by_bar jsonb := '{}'::jsonb;
  bars_out jsonb := '[]'::jsonb;
  total_m numeric := 0;
  total_kg numeric := 0;
  total_value numeric := 0;
  unpriced text;
begin
  if runs is null or jsonb_typeof(runs) <> 'array' then
    raise exception 'the run schedule must be a list of runs';
  end if;

  for run in select value from jsonb_array_elements(runs) loop
    i := i + 1;
    label     := nullif(btrim(coalesce(run ->> 'label', '')), '');
    phases    := coalesce((run ->> 'phases')::numeric, 0);
    per_phase := coalesce((run ->> 'runs_per_phase')::numeric, 0);
    length_m  := coalesce((run ->> 'length_m')::numeric, 0);
    sets      := coalesce((run ->> 'sets')::numeric, 1);

    if label is null then raise exception 'run % needs a name', i; end if;
    select * into bar from public.v_busbar_bars where code = upper(btrim(coalesce(run ->> 'bar_code', '')));
    if bar.id is null then
      raise exception '% names a bar size this catalogue does not hold (%)', label,
        coalesce(run ->> 'bar_code', '—');
    end if;
    if phases <= 0 or per_phase <= 0 or length_m <= 0 or sets <= 0 then
      raise exception '% needs phases, runs per phase, a length and a number of sets, all above zero', label;
    end if;

    -- CU-OPT1, column F.
    metres := round(phases * per_phase * length_m * sets, 3);

    rows_out := rows_out || jsonb_build_array(jsonb_build_object(
      'label', label, 'bar_code', bar.code, 'phases', phases,
      'runs_per_phase', per_phase, 'length_m', length_m, 'sets', sets,
      'metres', metres));
    by_bar := by_bar || jsonb_build_object(
      bar.code, coalesce((by_bar ->> bar.code)::numeric, 0) + metres);
  end loop;

  select jsonb_agg(jsonb_build_object(
           'bar_code', b.code,
           'kg_per_metre', b.kg_per_metre,
           'price_per_metre', b.price_per_metre,
           'metres', (by_bar ->> b.code)::numeric,
           'kg', round((by_bar ->> b.code)::numeric * b.kg_per_metre, 2),
           'value', case when b.price_per_metre is not null
                         then round((by_bar ->> b.code)::numeric * b.price_per_metre, 2) end,
           'is_priced', b.is_priced)
         order by b.area_mm2 desc nulls last),
         sum((by_bar ->> b.code)::numeric),
         sum((by_bar ->> b.code)::numeric * b.kg_per_metre),
         sum((by_bar ->> b.code)::numeric * coalesce(b.price_per_metre, 0)),
         string_agg(b.code, ', ' order by b.code) filter (where not b.is_priced)
    into bars_out, total_m, total_kg, total_value, unpriced
  from public.v_busbar_bars b
  where by_bar ? b.code;

  return jsonb_build_object(
    'runs', rows_out,
    'bars', coalesce(bars_out, '[]'::jsonb),
    'total_metres', round(coalesce(total_m, 0), 3),
    'total_kg', round(coalesce(total_kg, 0), 2),
    'total_value', round(coalesce(total_value, 0), 2),
    -- Named rather than quietly costed at nothing: a bar with no copper rate
    -- behind it has no price, and the value above is short by that much.
    'unpriced_bars', unpriced);
end;
$$;

comment on function app.busbar_run_totals(jsonb) is
  'The CU-OPT1 arithmetic: phases × runs per phase × length × sets for each run,
   totalled by bar size into metres, kilograms and value at today''s copper rate.
   Writes nothing, and refuses a run it cannot work out rather than dropping it.';

-- ===========================================================================
-- 3. A schedule to start from
-- ===========================================================================
-- The rows a board like this one needs, named, with the bar sizes right and the
-- lengths the company's own boards usually run to. The lengths are a setting,
-- not an opinion in code: they are the figures off the owner's NPP-192 sheet and
-- another board, or another company, will want their own.

insert into public.company_options (company_id, key, value, value_type)
select c.id, 'busbar_run_lengths',
       jsonb_build_object(
         'incoming_tails_m', 1.6, 'changeover_tails_m', 2.4, 'ats_tails_m', 1.6,
         'solar_tails_m', 1.6, 'hbb_m', 1.5, 'vbb_m', 1.8,
         'outgoing_tails_m', 0.8, 'apfc_tails_m', 0.8, 'earth_bar_m', 4.1),
       'json'
from public.companies c
on conflict (company_id, key) do nothing;

create or replace function app.starting_busbar_runs(target_panel uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  lengths jsonb;
  params jsonb;
  rating numeric;
  incomer_bar text;
  sources text[];
  feeder jsonb;
  kvar numeric;
  apfc_amps numeric;
  runs jsonb := '[]'::jsonb;
begin
  select cp.id, cp.costing_id, cp.company_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;

  params  := coalesce(p.parameters, '{}'::jsonb);
  lengths := coalesce(app.company_option('busbar_run_lengths', null), '{}'::jsonb);

  rating := nullif(params ->> 'incomer_rating_a', '')::numeric;
  if rating is null then
    raise exception 'this panel does not say what its incomer is yet — configure the board first, or add the runs by hand';
  end if;
  incomer_bar := app.bar_for_rating(rating) ->> 'bar_code';

  select coalesce(array_agg(value #>> '{}'), '{}'::text[]) into sources
  from jsonb_array_elements(
    case when jsonb_typeof(params -> 'sources') = 'array' then params -> 'sources' else '[]'::jsonb end);

  -- Incoming tails, one set per supply the board is fed from.
  runs := runs || jsonb_build_array(jsonb_build_object(
    'label', format('Incoming tails — %s A', rating), 'bar_code', incomer_bar,
    'phases', 4, 'runs_per_phase', 2,
    'length_m', coalesce((lengths ->> 'incoming_tails_m')::numeric, 1.6),
    'sets', greatest(coalesce(array_length(sources, 1), 1), 1)));

  -- Changeover, and the ATS pair where the board has one.
  if coalesce(params ->> 'changeover', '') <> '' and lower(params ->> 'changeover') <> 'none' then
    runs := runs || jsonb_build_array(jsonb_build_object(
      'label', format('Changeover tails — %s A', rating), 'bar_code', incomer_bar,
      'phases', 4, 'runs_per_phase', 2,
      'length_m', coalesce((lengths ->> 'changeover_tails_m')::numeric, 2.4), 'sets', 1));
    if lower(coalesce(params ->> 'changeover', '')) in ('ats', 'sync', 'synchronisation') then
      runs := runs || jsonb_build_array(jsonb_build_object(
        'label', format('ATS tails — %s A', rating), 'bar_code', incomer_bar,
        'phases', 4, 'runs_per_phase', 2,
        'length_m', coalesce((lengths ->> 'ats_tails_m')::numeric, 1.6), 'sets', 2));
    end if;
  end if;

  -- Solar, where it is one of the supplies.
  if exists (select 1 from unnest(sources) s where lower(s) like '%solar%') then
    runs := runs || jsonb_build_array(jsonb_build_object(
      'label', 'Solar ACB tails', 'bar_code', incomer_bar,
      'phases', 4, 'runs_per_phase', 2,
      'length_m', coalesce((lengths ->> 'solar_tails_m')::numeric, 1.6), 'sets', 1));
  end if;

  -- Horizontal and vertical busbar: the board's spine, at the incomer's size.
  runs := runs || jsonb_build_array(
    jsonb_build_object('label', format('Horizontal busbar — %s A', rating), 'bar_code', incomer_bar,
      'phases', 4, 'runs_per_phase', 4,
      'length_m', coalesce((lengths ->> 'hbb_m')::numeric, 1.5), 'sets', 1),
    jsonb_build_object('label', format('Vertical busbar — %s A', rating), 'bar_code', incomer_bar,
      'phases', 4, 'runs_per_phase', 4,
      'length_m', coalesce((lengths ->> 'vbb_m')::numeric, 1.8), 'sets', 1));

  -- Outgoing tails, a row per rating in the feeder schedule, at that rating's bar.
  for feeder in select value from jsonb_array_elements(
    case when jsonb_typeof(params -> 'feeders') = 'array' then params -> 'feeders' else '[]'::jsonb end)
  loop
    if coalesce((feeder ->> 'quantity')::numeric, 0) <= 0 then continue; end if;
    if coalesce((feeder ->> 'rating_a')::numeric, 0) <= 0 then continue; end if;
    runs := runs || jsonb_build_array(jsonb_build_object(
      'label', format('Outgoing tails — %s A', feeder ->> 'rating_a'),
      'bar_code', app.bar_for_rating((feeder ->> 'rating_a')::numeric) ->> 'bar_code',
      'phases', 3, 'runs_per_phase', 1,
      'length_m', coalesce((lengths ->> 'outgoing_tails_m')::numeric, 0.8),
      'sets', (feeder ->> 'quantity')::numeric));
  end loop;

  -- Correction: the bank's own tails, sized from its kVAr. Three-phase at 415 V,
  -- which is the arithmetic on the owner's sheet: 400 kVAr is 557 A, and 557 A
  -- takes the 630 A bar his CU-OPT1 row names.
  kvar := nullif(params ->> 'apfc_kvar', '')::numeric;
  if kvar is not null and kvar > 0 then
    apfc_amps := round((kvar * 1000 / (sqrt(3) * 415))::numeric, 0);
    runs := runs || jsonb_build_array(jsonb_build_object(
      'label', format('APFC tails — %s kVAr (%s A)', kvar, apfc_amps),
      'bar_code', app.bar_for_rating(apfc_amps) ->> 'bar_code',
      'phases', 3, 'runs_per_phase', 1,
      'length_m', coalesce((lengths ->> 'apfc_tails_m')::numeric, 0.8), 'sets', 1));
  end if;

  -- The earth bar, one run of the smallest bar the catalogue holds.
  runs := runs || jsonb_build_array(jsonb_build_object(
    'label', 'Earth bar',
    'bar_code', (select b.code from public.v_busbar_bars b where b.is_priced
                  order by b.area_mm2 nulls last limit 1),
    'phases', 1, 'runs_per_phase', 1,
    'length_m', coalesce((lengths ->> 'earth_bar_m')::numeric, 4.1), 'sets', 1));

  return jsonb_build_object(
    'panel_id', target_panel,
    'panel', p.name,
    'runs', runs,
    'totals', app.busbar_run_totals(runs),
    -- Said plainly on the screen: these are the runs a board like this needs and
    -- the lengths this company's boards usually run to, not a measurement of the
    -- board in front of you. The lengths are the part to correct.
    'note', 'the rows and bar sizes come from this board and your library; the lengths are your company''s usual figures — correct them against the drawing');
end;
$$;

comment on function app.starting_busbar_runs(uuid) is
  'A run schedule to start from: the rows a board like this one needs, the bar
   sizes its ratings take, and the lengths the company keeps in
   `busbar_run_lengths`. Writes nothing; the engineer corrects the lengths.';

-- ===========================================================================
-- 4. Keeping the schedule with the panel
-- ===========================================================================
-- In `costing_panels.parameters`, so a revision and a copy carry it without
-- another table and another three column lists to forget (0011's bug, twice).

create or replace function app.save_busbar_runs(target_panel uuid, runs jsonb)
returns jsonb
language plpgsql
as $$
declare
  p record;
  totals jsonb;
  merge_in jsonb;
begin
  select cp.id, cp.costing_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;

  -- Checked before it is kept: the same arithmetic the screen showed.
  totals := app.busbar_run_totals(coalesce(runs, '[]'::jsonb));

  merge_in := jsonb_build_object(
    'busbar_runs', totals -> 'runs',
    'busbar_runs_saved_at', to_jsonb(now()));

  update public.costing_panels
     set parameters = coalesce(p.parameters, '{}'::jsonb) || merge_in
   where id = target_panel;

  return totals;
end;
$$;

comment on function app.save_busbar_runs(uuid, jsonb) is
  'Keeps a run schedule on the panel and returns its totals. The schedule is
   checked first, so what is kept is something the app can always add up.';

-- What is on the panel's schedule, a row at a time, for the screen and for
-- anybody reading the database directly.
create or replace view public.v_panel_busbar_runs
with (security_invoker = true)
as
select
  cp.id   as panel_id,
  cp.costing_id,
  cp.company_id,
  cp.name as panel,
  r.ordinality as sort_order,
  r.run ->> 'label'                     as label,
  r.run ->> 'bar_code'                  as bar_code,
  (r.run ->> 'phases')::numeric         as phases,
  (r.run ->> 'runs_per_phase')::numeric as runs_per_phase,
  (r.run ->> 'length_m')::numeric       as length_m,
  (r.run ->> 'sets')::numeric           as sets,
  (r.run ->> 'metres')::numeric         as metres
from public.costing_panels cp
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(cp.parameters -> 'busbar_runs') = 'array'
       then cp.parameters -> 'busbar_runs' else '[]'::jsonb end)
  with ordinality as r(run, ordinality);

comment on view public.v_panel_busbar_runs is
  'The bar runs saved against each panel, one row each, with the metres the
   CU-OPT1 formula gives (roadmap 4.1).';

grant select on public.v_panel_busbar_runs to authenticated;

-- The calculator against the costing: metres the schedule asks for, metres the
-- panel is actually costed at, and the difference. The workbook never compared
-- the two, which is how its estimate came to be 30 metres where its own
-- calculator said 70.
create or replace view public.v_panel_busbar_check
with (security_invoker = true)
as
with scheduled as (
  select r.panel_id, r.costing_id, r.company_id, r.bar_code, sum(r.metres) as scheduled_m
  from public.v_panel_busbar_runs r
  group by r.panel_id, r.costing_id, r.company_id, r.bar_code
),
costed as (
  select ca.panel_id, ca.costing_id, ca.company_id, b.code as bar_code,
         sum(ci.quantity) as costed_m
  from public.costing_items ci
  join public.costing_assemblies ca on ca.id = ci.costing_assembly_id
  join public.v_busbar_bars b on b.id = ci.source_component_id
  group by ca.panel_id, ca.costing_id, ca.company_id, b.code
)
select
  coalesce(s.panel_id, c.panel_id)     as panel_id,
  coalesce(s.costing_id, c.costing_id) as costing_id,
  coalesce(s.company_id, c.company_id) as company_id,
  coalesce(s.bar_code, c.bar_code)     as bar_code,
  coalesce(s.scheduled_m, 0)           as scheduled_m,
  coalesce(c.costed_m, 0)              as costed_m,
  round(coalesce(c.costed_m, 0) - coalesce(s.scheduled_m, 0), 3) as difference_m,
  b.kg_per_metre,
  round(coalesce(s.scheduled_m, 0) * b.kg_per_metre, 2) as scheduled_kg
from scheduled s
full join costed c
  on c.panel_id = s.panel_id and c.bar_code = s.bar_code
left join public.v_busbar_bars b on b.code = coalesce(s.bar_code, c.bar_code);

comment on view public.v_panel_busbar_check is
  'Per panel and bar size: the metres the run schedule asks for, the metres the
   panel is costed at, and the difference. Advisory — it moves no price.';

grant select on public.v_panel_busbar_check to authenticated;

-- ===========================================================================
-- 5. Applying the answer
-- ===========================================================================
-- Through `add_component_to_costing`, the function the kit picker and the free
-- line both call, so the metres are priced at today's copper rate and frozen on
-- the line like every other figure. Nothing here prices anything itself.

create or replace function app.apply_busbar_runs(
  target_panel uuid, section text default 'Busbar', replace_existing boolean default false)
returns jsonb
language plpgsql
as $$
declare
  p record;
  totals jsonb;
  bar jsonb;
  component record;
  existing integer;
  removed integer := 0;
  added integer := 0;
  metres numeric := 0;
  holder uuid;
begin
  select cp.id, cp.costing_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;

  totals := app.busbar_run_totals(
    case when jsonb_typeof(p.parameters -> 'busbar_runs') = 'array'
         then p.parameters -> 'busbar_runs' else '[]'::jsonb end);
  if jsonb_array_length(totals -> 'bars') = 0 then
    raise exception 'this panel has no run schedule saved yet';
  end if;
  if totals ->> 'unpriced_bars' is not null then
    raise exception '% has no price yet — set the copper rate or the part''s price before costing these runs',
      totals ->> 'unpriced_bars';
  end if;

  -- What the calculator put here before. Adding twice would double the metres,
  -- because adding the same component again adds to its quantity (0014), so a
  -- second apply either replaces what the first one left or is refused.
  holder := app.free_line(target_panel, section);
  select count(*) into existing
  from public.costing_items ci
  join public.v_busbar_bars b on b.id = ci.source_component_id
  where ci.costing_assembly_id = holder and not ci.is_manual;

  if existing > 0 and not replace_existing then
    raise exception 'there are already % busbar lines in % — apply again with replace to put the new metres in their place',
      existing, section;
  end if;
  if existing > 0 then
    delete from public.costing_items ci
    using public.v_busbar_bars b
    where b.id = ci.source_component_id
      and ci.costing_assembly_id = holder and not ci.is_manual;
    removed := existing;
  end if;

  for bar in select value from jsonb_array_elements(totals -> 'bars') loop
    select * into component from public.v_busbar_bars where code = bar ->> 'bar_code';
    perform app.add_component_to_costing(
      target_panel, component.id, (bar ->> 'metres')::numeric, section);
    added := added + 1;
    metres := metres + (bar ->> 'metres')::numeric;
  end loop;

  perform app.write_activity('costing', p.costing_id, 'busbar.applied', null,
    jsonb_build_object('panel', p.name, 'sizes', added, 'metres', metres, 'replaced', removed),
    format('%s m of busbar in %s sizes on %s', metres, added, p.name));

  return jsonb_build_object(
    'panel_id', target_panel, 'section', section,
    'sizes', added, 'metres', round(metres, 3), 'replaced', removed,
    'total_kg', totals -> 'total_kg', 'total_value', totals -> 'total_value');
end;
$$;

comment on function app.apply_busbar_runs(uuid, text, boolean) is
  'Adds one busbar line per size at the metres the schedule works out, through
   the ordinary component function so each is priced and frozen like any other.
   Refuses an unpriced bar, and refuses to add on top of its own earlier lines
   unless told to replace them.';

-- ===========================================================================
-- 6. Wrappers and grants
-- ===========================================================================

create or replace function public.busbar_run_totals(runs jsonb)
returns jsonb language sql stable
as $$ select app.busbar_run_totals(runs) $$;

create or replace function public.starting_busbar_runs(target_panel uuid)
returns jsonb language sql stable
as $$ select app.starting_busbar_runs(target_panel) $$;

create or replace function public.save_busbar_runs(target_panel uuid, runs jsonb)
returns jsonb language sql
as $$ select app.save_busbar_runs(target_panel, runs) $$;

create or replace function public.apply_busbar_runs(
  target_panel uuid, section text default 'Busbar', replace_existing boolean default false)
returns jsonb language sql
as $$ select app.apply_busbar_runs(target_panel, section, replace_existing) $$;

grant execute on function app.bar_for_rating(numeric)                  to authenticated;
grant execute on function app.busbar_run_totals(jsonb)                 to authenticated;
grant execute on function public.busbar_run_totals(jsonb)              to authenticated;
grant execute on function app.starting_busbar_runs(uuid)               to authenticated;
grant execute on function public.starting_busbar_runs(uuid)            to authenticated;
grant execute on function app.save_busbar_runs(uuid, jsonb)            to authenticated;
grant execute on function public.save_busbar_runs(uuid, jsonb)         to authenticated;
grant execute on function app.apply_busbar_runs(uuid, text, boolean)   to authenticated;
grant execute on function public.apply_busbar_runs(uuid, text, boolean) to authenticated;
revoke execute on all functions in schema public from anon;
