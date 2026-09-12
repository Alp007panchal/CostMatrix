-- 0113  The APFC configurator (roadmap 3.2).
--
-- Decision 4 said an APFC bank would be manual step kits in phase 1, with the
-- app showing the total kVAr, and a configurator later. This is later.
--
-- What it does not do is invent anything: a bank is still built from the step
-- kits in the library, at whole quantities, added through the same
-- add_assembly_to_costing every other kit goes through. What it adds is the
-- arithmetic somebody does on paper today — how many of each size reach the
-- target — and it proposes; a person applies.
--
-- **The grading is the owner's, and it is a setting, not an opinion in code.**
-- Their own 400 kVAr bank on NPP-192 is 50×4, 25×4, 12.5×6, 5×5: shares of
-- 50, 25, 18.75 and 6.25 per cent across the four largest sizes they stock.
-- That is seeded as `apfc_step_pattern`, beside the other company options, so
-- the grading can change without a deploy and another company can grade
-- differently.
--
-- A bank is built from **one family** — every step fuse-protected, or every
-- step breaker-protected — never a mixture, so the family is part of the
-- proposal and defaults to whatever the panel already has.

insert into public.company_options (company_id, key, value, value_type)
select c.id, 'apfc_step_pattern', '"50,25,18.75,6.25"'::jsonb, 'string'
from public.companies c
on conflict (company_id, key) do nothing;

comment on table public.company_options is
  'Typed key–value settings per company: the assistant''s switches, the layout
   safety factor, and the APFC step pattern (the shares of a target that go to
   each size, largest first).';

-- ---------------------------------------------------------------------------
-- 1. Which step kits this company has, and in which family
-- ---------------------------------------------------------------------------
-- The family is in the kit's name, because that is where the library keeps it:
-- "50KVAR APFC-FUSE KIT". A kit that says neither is its own family, offered on
-- its own rather than mixed into somebody else's bank.

create or replace view public.v_apfc_kits
with (security_invoker = true)
as
select
  k.id,
  k.company_id,
  k.code,
  k.name,
  k.rating,
  k.has_unpriced_part,
  case
    when upper(k.name) like '%FUSE%'    then 'FUSE'
    when upper(k.name) like '%BREAKER%' then 'BREAKER'
    else 'OTHER'
  end as family
from public.v_kits k
where k.rating_unit = 'KVAR' and k.rating is not null and k.rating > 0 and k.is_active;

comment on view public.v_apfc_kits is
  'The step kits a bank can be built from: kVAr-rated, active, with the family
   read off the kit name. What the configurator chooses among.';

grant select on public.v_apfc_kits to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The proposal — which writes nothing
-- ---------------------------------------------------------------------------

create or replace function app.propose_apfc(
  target_panel uuid,
  target_kvar numeric,
  family text default null,
  pattern text default null)
returns jsonb
language plpgsql
stable
as $$
declare
  p record;
  chosen_family text := upper(nullif(btrim(coalesce(family, '')), ''));
  shares numeric[];
  share numeric;
  sizes record;
  step record;
  steps jsonb := '[]'::jsonb;
  quantities jsonb := '{}'::jsonb;
  total numeric := 0;
  remaining numeric;
  qty integer;
  i integer := 0;
begin
  select cp.id, cp.costing_id, cp.company_id into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if target_kvar is null or target_kvar <= 0 then
    raise exception 'say how many kVAr the bank is for';
  end if;

  -- The family already on the panel wins, then the one with the most sizes:
  -- an engineer who has started a bank is not offered the other kind halfway.
  if chosen_family is null then
    select ak.family into chosen_family
    from public.costing_assemblies ca
    join public.v_apfc_kits ak on ak.id = ca.source_assembly_id
    where ca.panel_id = target_panel
    group by ak.family
    order by count(*) desc, ak.family
    limit 1;
  end if;
  if chosen_family is null then
    select ak.family into chosen_family
    from public.v_apfc_kits ak
    where not ak.has_unpriced_part
    group by ak.family
    order by count(distinct ak.rating) desc, ak.family
    limit 1;
  end if;
  if chosen_family is null then
    raise exception 'this library has no kVAr step kits to build a bank from';
  end if;

  -- The shares, from the argument, else the company's setting, else the owner's.
  shares := string_to_array(
    coalesce(nullif(btrim(coalesce(pattern, '')), ''),
             -- #>> '{}' reads a jsonb string as text, quotes and all removed.
             app.company_option('apfc_step_pattern', '"50,25,18.75,6.25"'::jsonb) #>> '{}'),
    ',')::numeric[];

  -- One kit per size, largest size first; a size with two kits takes the first
  -- by name, which is a choice the engineer can change on the line afterwards.
  for sizes in
    select ak.rating,
           (select ak2.id from public.v_apfc_kits ak2
             where ak2.family = chosen_family and ak2.rating = ak.rating and not ak2.has_unpriced_part
             order by ak2.name limit 1) as kit_id
    from public.v_apfc_kits ak
    where ak.family = chosen_family and not ak.has_unpriced_part
    group by ak.rating
    order by ak.rating desc
  loop
    i := i + 1;
    share := coalesce(shares[i], 0);
    qty := floor(target_kvar * share / 100 / sizes.rating)::integer;
    if qty > 0 then
      quantities := quantities || jsonb_build_object(sizes.kit_id::text, qty);
      total := total + qty * sizes.rating;
    end if;
  end loop;

  if i = 0 then
    -- True of the breaker family in the owner's library today: every one of its
    -- kits holds one of the eight parts that still have no price, and a kit with
    -- an unpriced part cannot be costed at all (0010). Say which and why.
    raise exception 'every % step kit still holds a part with no price — price it on the Components screen, or build the bank from the other family', lower(chosen_family);
  end if;

  -- Whatever the shares left behind, in the largest size that still fits.
  loop
    remaining := target_kvar - total;
    exit when remaining <= 0;
    select ak.rating,
           (select ak2.id from public.v_apfc_kits ak2
             where ak2.family = chosen_family and ak2.rating = ak.rating and not ak2.has_unpriced_part
             order by ak2.name limit 1) as kit_id
      into step
    from public.v_apfc_kits ak
    where ak.family = chosen_family and not ak.has_unpriced_part and ak.rating <= remaining
    group by ak.rating
    order by ak.rating desc
    limit 1;
    exit when step.kit_id is null;
    quantities := quantities || jsonb_build_object(
      step.kit_id::text, coalesce((quantities ->> step.kit_id::text)::integer, 0) + 1);
    total := total + step.rating;
  end loop;

  select jsonb_agg(jsonb_build_object(
           'assembly_id', k.id, 'code', k.code, 'name', k.name,
           'rating', k.rating, 'quantity', (quantities ->> k.id::text)::integer,
           'kvar', k.rating * (quantities ->> k.id::text)::integer)
         order by k.rating desc)
    into steps
  from public.v_apfc_kits k
  where quantities ? k.id::text;

  return jsonb_build_object(
    'panel_id', target_panel,
    'family', chosen_family,
    'target_kvar', target_kvar,
    'total_kvar', total,
    -- Named rather than papered over: the sizes this company stocks cannot
    -- always add up to a target exactly, and a bank that is 1 kVAr short is a
    -- fact the engineer should decide about.
    'shortfall_kvar', greatest(target_kvar - total, 0),
    'steps', coalesce(steps, '[]'::jsonb));
end;
$$;

comment on function app.propose_apfc(uuid, numeric, text, text) is
  'How many of each step kit reach a target kVAr, graded by the company''s
   apfc_step_pattern and taken from one family. Writes nothing: the engineer
   edits the quantities and applies them.';

-- ---------------------------------------------------------------------------
-- 3. Applying what is on the screen
-- ---------------------------------------------------------------------------
-- One call, so a bank is all there or not there at all, through the ordinary
-- engine function: the lines are priced and frozen exactly as a hand-added kit.

create or replace function app.apply_apfc_steps(target_panel uuid, steps jsonb)
returns jsonb
language plpgsql
as $$
declare
  p record;
  step jsonb;
  kit record;
  added integer := 0;
  total numeric := 0;
begin
  select cp.id, cp.costing_id, cp.name into p
  from public.costing_panels cp where cp.id = target_panel;
  if p.id is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(p.costing_id) then
    raise exception 'this costing is not open for editing';
  end if;
  if steps is null or jsonb_typeof(steps) <> 'array' or jsonb_array_length(steps) = 0 then
    raise exception 'there are no steps to add';
  end if;

  for step in select value from jsonb_array_elements(steps) loop
    select * into kit from public.v_apfc_kits where id = (step ->> 'assembly_id')::uuid;
    if kit.id is null then raise exception 'that is not a step kit of this library'; end if;
    if coalesce((step ->> 'quantity')::integer, 0) <= 0 then continue; end if;

    perform app.add_assembly_to_costing(
      target_panel, kit.id, (step ->> 'quantity')::integer, 'APFC bank');
    added := added + 1;
    total := total + kit.rating * (step ->> 'quantity')::integer;
  end loop;

  if added = 0 then raise exception 'every step was zero; nothing to add'; end if;

  perform app.write_activity('costing', p.costing_id, 'apfc.applied', null,
    jsonb_build_object('panel', p.name, 'kinds', added, 'total_kvar', total),
    format('%s kVAr of steps on %s', total, p.name));

  return jsonb_build_object('panel_id', target_panel, 'kinds', added, 'total_kvar', total);
end;
$$;

comment on function app.apply_apfc_steps(uuid, jsonb) is
  'Adds the steps the engineer settled on to the panel''s APFC bank section,
   through the ordinary kit function, in one transaction. What is applied is
   what was on the screen, not what the proposal said.';

-- ---------------------------------------------------------------------------
-- 4. Wrappers and grants
-- ---------------------------------------------------------------------------

create or replace function public.propose_apfc(
  target_panel uuid, target_kvar numeric, family text default null, pattern text default null)
returns jsonb language sql stable
as $$ select app.propose_apfc(target_panel, target_kvar, family, pattern) $$;

create or replace function public.apply_apfc_steps(target_panel uuid, steps jsonb)
returns jsonb language sql
as $$ select app.apply_apfc_steps(target_panel, steps) $$;

grant execute on function app.propose_apfc(uuid, numeric, text, text)    to authenticated;
grant execute on function public.propose_apfc(uuid, numeric, text, text) to authenticated;
grant execute on function app.apply_apfc_steps(uuid, jsonb)    to authenticated;
grant execute on function public.apply_apfc_steps(uuid, jsonb) to authenticated;
revoke execute on all functions in schema public from anon;
