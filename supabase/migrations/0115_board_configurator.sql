-- 0115  The guided LV board configurator (roadmap 3.1).
--
-- The question an engineer is actually asked by a customer is not "which kits do
-- you want"; it is "a 1600 A board, grid and generator on a changeover, twelve
-- 100 A ways, six 63 A ways, 400 kVAr of correction, form 4B, IP54". This turns
-- that sentence into a proposal of kits at quantities, fills the panel's
-- `parameters` with the answers, and leaves the engineer to edit the result.
--
-- Three things it deliberately does not do:
--
-- * It invents no kit and no price. Every line is a kit from the library, added
--   through the same `add_assembly_to_costing` as a hand-added one, so prices
--   freeze and the history reads the same. It proposes; a person applies — the
--   rule 3.2 set, and the same two functions: propose, then apply what is on the
--   screen rather than what the proposal said.
-- * It does not price the enclosure from the form, IP, access or cable entry.
--   Decision 1 is explicit: the enclosure is catalogue cubicles plus an uplift,
--   and there is no fabrication calculator. Those answers are **recorded** on the
--   panel, where the quotation and the engineer can read them.
-- * It does not grade an APFC bank of its own. `app.propose_apfc` (0113) already
--   does that from the company's own pattern, so the kVAr answer is handed
--   straight to it. Two graders would be two answers waiting to disagree.
--
-- How a kit is chosen: **the next size up**. The smallest kit of the right role
-- whose rating reaches what was asked for — which is what an engineer does with a
-- frame chart — and when the library has nothing that big, the largest there is,
-- named as such in the proposal rather than silently under-rated.

-- ===========================================================================
-- 1. Which kits can play which part in a board
-- ===========================================================================
-- The role is read off the **kit group**, because that is where the library keeps
-- it: ACB frames and incomer kits are incomers, MCCB and MCB kits are outgoers,
-- and so on. A kit whose group says none of this has role `other` and is never
-- proposed — it can still be added by hand, as it always could.
create or replace view public.v_board_kits
with (security_invoker = true)
as
select
  k.id,
  k.company_id,
  k.code,
  k.name,
  k.rating,
  k.rating_unit,
  k.poles,
  k.group_name,
  k.has_unpriced_part,
  case
    when upper(coalesce(k.group_name, '')) like 'ACB%'            then 'incomer'
    when upper(coalesce(k.group_name, '')) = 'INCOMER-KIT'        then 'incomer'
    when upper(coalesce(k.group_name, '')) in ('SWITCH DISCONNECTOR', 'ISOLATOR') then 'incomer'
    when upper(coalesce(k.group_name, '')) in ('OUTGOER-KIT', 'MCCB')             then 'outgoer'
    when upper(coalesce(k.group_name, '')) in ('MCB', 'RCBO')                     then 'outgoer'
    when upper(coalesce(k.group_name, '')) in ('ATS', 'ATS-SWITCH', 'ONLOAD CHANGEOVER') then 'changeover'
    when upper(coalesce(k.group_name, '')) = 'SYNCHRONIZATION'    then 'sync'
    when upper(coalesce(k.group_name, '')) like 'METERBOARD%'     then 'metering'
    when upper(coalesce(k.group_name, '')) = 'APFC BANK'          then 'apfc'
    when upper(coalesce(k.group_name, '')) = 'ACCESSORIES'        then 'accessory'
    else 'other'
  end as role,
  -- Which kind of device, for the answers that name one: an ACB incomer and an
  -- MCCB incomer are both incomers, and the customer asked for one of them.
  case
    when upper(coalesce(k.group_name, '')) like 'ACB%'            then 'acb'
    when upper(coalesce(k.group_name, '')) in ('INCOMER-KIT', 'MCCB', 'OUTGOER-KIT') then 'mccb'
    when upper(coalesce(k.group_name, '')) in ('MCB', 'RCBO')     then 'mcb'
    when upper(coalesce(k.group_name, '')) in ('SWITCH DISCONNECTOR', 'ISOLATOR') then 'switch'
    when upper(coalesce(k.group_name, '')) = 'ATS-SWITCH'         then 'switch'
    when upper(coalesce(k.group_name, '')) = 'ONLOAD CHANGEOVER'  then 'manual'
    when upper(coalesce(k.group_name, '')) = 'ATS'                then 'ats'
    else null
  end as flavour
from public.v_kits k
where k.is_active;

comment on view public.v_board_kits is
  'Every active kit with the part it can play in a board — incomer, outgoer,
   changeover, sync, metering, APFC, accessory — read off its kit group, and the
   kind of device it is where the answer names one. What the configurator chooses
   among (roadmap 3.1).';

grant select on public.v_board_kits to authenticated;

-- ===========================================================================
-- 2. The next size up
-- ===========================================================================
-- One place decides which kit answers "N amps of this kind", so every part of a
-- proposal is chosen the same way. Returns the kit and how it was chosen, or a
-- reason nothing could be.
create or replace function app.pick_board_kit(
  want_role text, want_rating numeric, want_flavour text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  chosen record;
  biggest record;
begin
  -- The smallest kit that reaches the rating: the next frame up.
  select k.* into chosen
  from public.v_board_kits k
  where k.role = want_role
    and (want_flavour is null or k.flavour = want_flavour)
    and not k.has_unpriced_part
    and (want_rating is null or (k.rating is not null and k.rating >= want_rating))
  order by k.rating nulls last, k.name
  limit 1;

  if chosen.id is not null then
    return jsonb_build_object(
      'assembly_id', chosen.id, 'code', chosen.code, 'name', chosen.name,
      'rating', chosen.rating, 'group_name', chosen.group_name,
      'exact', want_rating is null or chosen.rating = want_rating);
  end if;

  -- Nothing that big. The largest there is, said plainly, so the engineer decides
  -- rather than the app quietly under-rating a board.
  select k.* into biggest
  from public.v_board_kits k
  where k.role = want_role
    and (want_flavour is null or k.flavour = want_flavour)
    and not k.has_unpriced_part
    and k.rating is not null
  order by k.rating desc, k.name
  limit 1;

  if biggest.id is not null then
    return jsonb_build_object(
      'assembly_id', biggest.id, 'code', biggest.code, 'name', biggest.name,
      'rating', biggest.rating, 'group_name', biggest.group_name,
      'exact', false,
      'note', format('the library has nothing above %s A of this kind', biggest.rating));
  end if;

  return jsonb_build_object(
    'assembly_id', null,
    'reason', case
      when exists (select 1 from public.v_board_kits k where k.role = want_role
                     and (want_flavour is null or k.flavour = want_flavour))
      then 'every kit of that kind still holds a part with no price — price it on the Components screen'
      else 'this library has no kit of that kind'
    end);
end;
$$;

comment on function app.pick_board_kit(text, numeric, text) is
  'The kit that answers "this many amps, of this kind": the smallest whose rating
   reaches it, else the largest there is with a note saying so, else a reason
   nothing could be chosen. The one place that rule is written (roadmap 3.1).';

-- ===========================================================================
-- 3. The proposal, which writes nothing
-- ===========================================================================
-- The answers, as the screen asks them:
--   {"sources": ["grid","generator"], "incomer_rating_a": 1600,
--    "incomer_type": "acb", "changeover": "ats", "feeders": [
--      {"rating_a": 100, "quantity": 12, "type": "mccb"}, …],
--    "apfc_kvar": 400, "metering": true,
--    "form": "4B", "ip": "IP54", "access": "front", "cable_entry": "bottom"}
create or replace function app.propose_board(target_panel uuid, answers jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  lines jsonb := '[]'::jsonb;
  missing jsonb := '[]'::jsonb;
  pick jsonb;
  feeder jsonb;
  sources text[];
  extra_sources integer;
  changeover text;
  kvar numeric;
  apfc jsonb;
  step jsonb;
  rating numeric;
begin
  select cp.id, cp.costing_id, cp.company_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if answers is null or jsonb_typeof(answers) <> 'object' then
    raise exception 'answer the questions first';
  end if;

  rating := (answers ->> 'incomer_rating_a')::numeric;
  if rating is null or rating <= 0 then
    raise exception 'say what the incomer is rated at, in amps';
  end if;

  sources := coalesce(
    (select array_agg(value #>> '{}') from jsonb_array_elements(
       case when jsonb_typeof(answers -> 'sources') = 'array' then answers -> 'sources' else '[]'::jsonb end)),
    array['grid']::text[]);
  extra_sources := greatest(coalesce(array_length(sources, 1), 1) - 1, 0);
  changeover := lower(nullif(btrim(coalesce(answers ->> 'changeover', '')), ''));
  kvar := (answers ->> 'apfc_kvar')::numeric;

  -- The incomer.
  pick := app.pick_board_kit('incomer', rating, nullif(lower(coalesce(answers ->> 'incomer_type', '')), ''));
  if pick ->> 'assembly_id' is null then
    missing := missing || jsonb_build_object('what', format('a %s A incomer', rating), 'why', pick ->> 'reason');
  else
    lines := lines || jsonb_build_array(pick || jsonb_build_object(
      'role', 'incomer', 'section', 'Incomer', 'quantity', 1,
      'why', format('%s A asked for', rating)));
  end if;

  -- A second incomer for every source beyond the first: a generator or a solar
  -- infeed arrives on its own way in.
  if extra_sources > 0 then
    pick := app.pick_board_kit('incomer', rating, nullif(lower(coalesce(answers ->> 'incomer_type', '')), ''));
    if pick ->> 'assembly_id' is not null then
      lines := lines || jsonb_build_array(pick || jsonb_build_object(
        'role', 'incomer', 'section', '2nd incomer', 'quantity', extra_sources,
        'why', format('%s source%s beyond the first (%s)',
                      extra_sources, case when extra_sources = 1 then '' else 's' end,
                      array_to_string(sources[2:], ', '))));
    end if;
  end if;

  -- How the sources are changed over, if they are.
  if changeover in ('ats', 'manual', 'switch') then
    pick := app.pick_board_kit('changeover', rating, changeover);
    if pick ->> 'assembly_id' is null then
      pick := app.pick_board_kit('changeover', rating, null);
    end if;
    if pick ->> 'assembly_id' is null then
      missing := missing || jsonb_build_object('what', format('a %s A changeover', rating), 'why', pick ->> 'reason');
    else
      lines := lines || jsonb_build_array(pick || jsonb_build_object(
        'role', 'changeover', 'section', 'ATS', 'quantity', 1,
        'why', format('%s between %s', changeover, array_to_string(sources, ' and '))));
    end if;
  elsif changeover = 'sync' then
    pick := app.pick_board_kit('sync', rating, null);
    if pick ->> 'assembly_id' is null then
      missing := missing || jsonb_build_object('what', 'a synchronisation kit', 'why', pick ->> 'reason');
    else
      lines := lines || jsonb_build_array(pick || jsonb_build_object(
        'role', 'sync', 'section', 'ATS', 'quantity', 1,
        'why', format('%s sources run in parallel', coalesce(array_length(sources, 1), 2))));
    end if;
  end if;

  -- The feeder schedule, a line per rating asked for.
  for feeder in
    select value from jsonb_array_elements(
      case when jsonb_typeof(answers -> 'feeders') = 'array' then answers -> 'feeders' else '[]'::jsonb end)
  loop
    if coalesce((feeder ->> 'quantity')::integer, 0) <= 0 then continue; end if;
    pick := app.pick_board_kit('outgoer', (feeder ->> 'rating_a')::numeric,
                               nullif(lower(coalesce(feeder ->> 'type', '')), ''));
    if pick ->> 'assembly_id' is null then
      missing := missing || jsonb_build_object(
        'what', format('%s × %s A outgoer', feeder ->> 'quantity', feeder ->> 'rating_a'),
        'why', pick ->> 'reason');
    else
      lines := lines || jsonb_build_array(pick || jsonb_build_object(
        'role', 'outgoer', 'section', 'Outgoers',
        'quantity', (feeder ->> 'quantity')::integer,
        'why', format('%s ways at %s A', feeder ->> 'quantity', feeder ->> 'rating_a')));
    end if;
  end loop;

  -- Metering, if the board is metered.
  if coalesce((answers ->> 'metering')::boolean, false) then
    pick := app.pick_board_kit('metering', null, null);
    if pick ->> 'assembly_id' is null then
      missing := missing || jsonb_build_object('what', 'a metering kit', 'why', pick ->> 'reason');
    else
      lines := lines || jsonb_build_array(pick || jsonb_build_object(
        'role', 'metering', 'section', 'Accessories', 'quantity', 1, 'why', 'metered board'));
    end if;
  end if;

  -- Correction: 3.2's grader, not a second one.
  if kvar is not null and kvar > 0 then
    begin
      apfc := app.propose_apfc(target_panel, kvar, nullif(answers ->> 'apfc_family', ''), null);
      for step in select value from jsonb_array_elements(apfc -> 'steps') loop
        lines := lines || jsonb_build_array(jsonb_build_object(
          'assembly_id', step -> 'assembly_id', 'code', step -> 'code', 'name', step -> 'name',
          'rating', step -> 'rating', 'exact', true,
          'role', 'apfc', 'section', 'APFC bank', 'quantity', (step ->> 'quantity')::integer,
          'why', format('%s kVAr of the %s asked for', step ->> 'kvar', kvar)));
      end loop;
      if coalesce((apfc ->> 'shortfall_kvar')::numeric, 0) > 0 then
        missing := missing || jsonb_build_object(
          'what', format('%s kVAr of correction', apfc ->> 'shortfall_kvar'),
          'why', 'the step sizes in the library cannot reach the target exactly');
      end if;
    exception when others then
      missing := missing || jsonb_build_object(
        'what', format('%s kVAr of correction', kvar), 'why', sqlerrm);
    end;
  end if;

  return jsonb_build_object(
    'panel_id', target_panel,
    'panel', p.name,
    'lines', lines,
    -- What could not be answered from this library, named. A proposal that
    -- quietly leaves a feeder out is worse than one that says it cannot.
    'missing', missing,
    -- The answers, shaped for costing_panels.parameters (foundation F4). The
    -- form, IP, access and cable entry are recorded, not priced: the enclosure is
    -- cubicles plus an uplift (decision 1).
    'parameters', jsonb_strip_nulls(jsonb_build_object(
      'sources', to_jsonb(sources),
      'incomer_rating_a', rating,
      'incomer_type', nullif(lower(coalesce(answers ->> 'incomer_type', '')), ''),
      'changeover', changeover,
      'feeders', case when jsonb_typeof(answers -> 'feeders') = 'array' then answers -> 'feeders' end,
      'apfc_kvar', kvar,
      'metering', (answers ->> 'metering')::boolean,
      'form', nullif(btrim(coalesce(answers ->> 'form', '')), ''),
      'ip', nullif(btrim(coalesce(answers ->> 'ip', '')), ''),
      'access', nullif(btrim(coalesce(answers ->> 'access', '')), ''),
      'cable_entry', nullif(btrim(coalesce(answers ->> 'cable_entry', '')), ''),
      'configured_at', to_jsonb(now()))));
end;
$$;

comment on function app.propose_board(uuid, jsonb) is
  'Turns the answers about a board — sources, incomer, changeover, the feeder
   schedule, correction, metering, form, IP, access, cable entry — into kits at
   quantities, and into the parameters to freeze on the panel. Writes nothing, and
   names what this library cannot answer (roadmap 3.1).';

-- ===========================================================================
-- 4. Applying what is on the screen
-- ===========================================================================
create or replace function app.apply_board(
  target_panel uuid, lines jsonb, parameters jsonb default null)
returns jsonb
language plpgsql
as $$
declare
  p record;
  line jsonb;
  kit record;
  added integer := 0;
  units numeric := 0;
  -- Held in a variable of its own: inside the update below, a bare `parameters`
  -- could mean this argument or the column, and Postgres says so.
  merge_in jsonb := parameters;
begin
  select cp.id, cp.costing_id, cp.name, cp.parameters into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;
  if lines is null or jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'there is nothing to add';
  end if;

  for line in select value from jsonb_array_elements(lines) loop
    if coalesce((line ->> 'quantity')::numeric, 0) <= 0 then continue; end if;
    select * into kit from public.v_board_kits where id = (line ->> 'assembly_id')::uuid;
    if kit.id is null then raise exception 'that is not a kit of this library'; end if;

    perform app.add_assembly_to_costing(
      target_panel, kit.id, (line ->> 'quantity')::numeric,
      nullif(btrim(coalesce(line ->> 'section', '')), ''));
    added := added + 1;
    units := units + (line ->> 'quantity')::numeric;
  end loop;

  if added = 0 then raise exception 'every line was zero; nothing to add'; end if;

  -- The answers are kept on the panel, merged over whatever was there, so the
  -- board can be read back — and so 3.4's checks and the assistant can read it.
  if merge_in is not null and jsonb_typeof(merge_in) = 'object' then
    update public.costing_panels
       set parameters = coalesce(p.parameters, '{}'::jsonb) || merge_in
     where id = target_panel;
  end if;

  perform app.write_activity('costing', p.costing_id, 'board.configured', null,
    jsonb_build_object('panel', p.name, 'kinds', added, 'kits', units),
    format('%s kinds of kit configured onto %s', added, p.name));

  return jsonb_build_object('panel_id', target_panel, 'kinds', added, 'kits', units);
end;
$$;

comment on function app.apply_board(uuid, jsonb, jsonb) is
  'Adds the kits the engineer settled on, each into its section, through the
   ordinary kit function — so they are priced and frozen exactly as hand-added
   ones — and records the answers on the panel. What is applied is what was on the
   screen, not what the proposal said.';

-- ===========================================================================
-- 5. Wrappers and grants
-- ===========================================================================
create or replace function public.propose_board(target_panel uuid, answers jsonb)
returns jsonb language sql stable as $$ select app.propose_board(target_panel, answers) $$;

create or replace function public.apply_board(
  target_panel uuid, lines jsonb, parameters jsonb default null)
returns jsonb language sql as $$ select app.apply_board(target_panel, lines, parameters) $$;

grant execute on function
  app.pick_board_kit(text, numeric, text),
  app.propose_board(uuid, jsonb), public.propose_board(uuid, jsonb),
  app.apply_board(uuid, jsonb, jsonb), public.apply_board(uuid, jsonb, jsonb)
to authenticated;
revoke execute on all functions in schema public from anon;
