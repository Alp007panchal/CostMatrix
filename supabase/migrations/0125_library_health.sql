-- 0125  What the library is missing, before a costing finds out.
--
-- `data/seed/README.md` lists what the owner's own clean-up could not settle:
-- seven placeholder parts with no price, one catalogue part without one, fifteen
-- kits with only a main device and no connection material, kit groups with no
-- hours. That list is in a file nobody opens, it was written on 8 September, and
-- it says nothing about what has been fixed since. So the same faults are found
-- the hard way — halfway through costing a real board.
--
-- This reads the **live library** and says the same things, sorted by what they
-- do to a costing:
--
--   refuses  the costing will not take it at all, and says why
--   silent   it will be costed, and something will quietly be left out
--   check    worth a look; nothing breaks
--
-- The `refuses` rules test **exactly the predicate the refusal tests** —
-- `v_component_prices.unit_price is null`, which is what `add_assembly_to_costing`
-- and `add_component_to_costing` use — so this view and the error message can
-- never disagree. It matters that the three different causes of that one null are
-- told apart, because they are fixed on three different screens: a part with no
-- purchase price, a purchase currency with no landed factor, and a weight-priced
-- part whose material rate is missing.
--
-- Read-only. It changes no price, blocks nothing, and refuses nothing itself.

-- ===========================================================================
-- 1. One row per fault
-- ===========================================================================

create or replace view public.v_library_issues
with (security_invoker = true)
as
with priced as (
  select p.id, p.unit_price, p.landed_factor, p.pricing_mode, p.purchase_currency
  from public.v_component_prices p
),
part_use as (
  select ac.component_id, count(distinct ac.assembly_id)::int as used_by_kits
  from public.assembly_components ac
  join public.assemblies a on a.id = ac.assembly_id and a.is_active
  group by ac.component_id
),
parts as (
  select
    c.company_id,
    'part'::text                       as entity,
    c.id                               as entity_id,
    c.code,
    c.name,
    coalesce(u.used_by_kits, 0)        as used_by_kits,
    case
      when c.is_placeholder                                   then 'part_placeholder'
      when c.pricing_mode = 'fixed' and c.purchase_price is null then 'part_no_price'
      when c.pricing_mode = 'weight_rate'                     then 'part_no_rate'
      when pr.landed_factor is null                           then 'part_no_factor'
      else 'part_no_price'
    end                                as kind,
    case
      when c.is_placeholder then
        'The importer added it because a kit named a part number the catalogue did not have. '
        'It needs a real description and a purchase price.'
      when c.pricing_mode = 'fixed' and c.purchase_price is null then
        'On the catalogue with no purchase price.'
      when c.pricing_mode = 'weight_rate' then
        'Priced by weight, but there is no material rate for ' || coalesce(c.material_rate_code, '(none set)') || '.'
      when pr.landed_factor is null then
        'Priced in ' || coalesce(c.purchase_currency, '(no currency)') ||
        ', for which no landed-cost factor is set — so no price can be worked out.'
      else 'No price can be worked out for it.'
    end                                as detail
  from public.components c
  join priced pr on pr.id = c.id
  left join part_use u on u.component_id = c.id
  where c.is_active and pr.unit_price is null
),
kit_parts as (
  -- The kit's own lines, joined to the price the costing would use.
  select
    ac.assembly_id,
    string_agg(c.code, ', ' order by c.code) filter (where pr.unit_price is null) as unpriced,
    string_agg(c.code, ', ' order by c.code) filter (where not c.is_active)       as obsolete,
    count(*)::int                                                                as lines,
    count(*) filter (where ac.is_main_device)::int                               as main_devices
  from public.assembly_components ac
  join public.components c on c.id = ac.component_id
  join priced pr on pr.id = c.id
  group by ac.assembly_id
),
kits as (
  select
    a.company_id,
    'kit'::text     as entity,
    a.id            as entity_id,
    a.code,
    a.name,
    0               as used_by_kits,
    k.kind,
    k.detail
  from public.assemblies a
  left join public.kit_groups kg on kg.id = a.kit_group_id
  left join kit_parts p on p.assembly_id = a.id
  cross join lateral (
    -- Worst first: a kit is listed once, under the fault that matters most. The
    -- ordinal is explicit because a VALUES list has no order of its own, and a
    -- kit quietly filed under its second-worst fault would be a bug nobody saw.
    select v.kind, v.detail from (values
      (1, 'kit_unpriced_part', p.unpriced is not null,
       'Refused when costed: ' || coalesce(p.unpriced, '') || ' has no price.'),
      (2, 'kit_no_lines', coalesce(p.lines, 0) = 0,
       'An empty kit. It costs nothing and adds nothing.'),
      (3, 'kit_no_group', a.kit_group_id is null,
       'No kit group, so it can never take group hours: it will cost zero labour whatever is filled in.'),
      (4, 'kit_no_hours', a.kit_group_id is not null and not exists (
          select 1 from public.v_assembly_hours h
          where h.assembly_id = a.id and h.effective_hours > 0),
       'Group "' || coalesce(kg.name, '') || '" has no hours, so this kit costs zero labour.'),
      (5, 'kit_only_main_device', coalesce(p.lines, 0) = 1 and coalesce(p.main_devices, 0) = 1,
       'Only its main device: no busbar, cable or accessories. Every sibling kit has them.'),
      (6, 'kit_no_main_device', coalesce(p.lines, 0) > 0 and coalesce(p.main_devices, 0) = 0,
       'No line marked as the main device, so the kit cannot be found by rating.'),
      (7, 'kit_no_rating', a.rating is null,
       'No rating, so it does not appear when a rating is picked.'),
      (8, 'kit_obsolete_part', p.obsolete is not null,
       'Holds a part marked obsolete: ' || coalesce(p.obsolete, '') || '.')
    ) as v(ord, kind, hit, detail)
    where v.hit
    order by v.ord
    limit 1
  ) k
  where a.is_active
)
select
  i.company_id,
  case when i.company_id is null then 'master' else 'private' end as library,
  i.entity,
  i.entity_id,
  i.code,
  i.name,
  i.used_by_kits,
  i.kind,
  s.severity,
  s.sort_order,
  i.detail,
  s.fix_on
from (
  select company_id, entity, entity_id, code, name, used_by_kits, kind, detail from parts
  union all
  select company_id, entity, entity_id, code, name, used_by_kits, kind, detail from kits
) i
join (values
  ('part_no_price',        'refuses', 10, 'Library → Components'),
  ('part_placeholder',     'refuses', 20, 'Library → Components'),
  ('part_no_factor',       'refuses', 30, 'Rates → Currency factors'),
  ('part_no_rate',         'refuses', 40, 'Rates → Material rates'),
  ('kit_unpriced_part',    'refuses', 50, 'Library → Components'),
  ('kit_no_lines',         'silent',  60, 'Library → Kits'),
  ('kit_no_group',         'silent',  70, 'Library → Kits'),
  ('kit_no_hours',         'silent',  80, 'Library → Kit groups'),
  ('kit_only_main_device', 'check',   90, 'Library → Kits'),
  ('kit_no_main_device',   'check',  100, 'Library → Kits'),
  ('kit_no_rating',        'check',  110, 'Library → Kits'),
  ('kit_obsolete_part',    'check',  120, 'Library → Kits')
) as s(kind, severity, sort_order, fix_on) on s.kind = i.kind;

comment on view public.v_library_issues is
  'One row per fault in the library the signed-in company can see, live rather
   than from the seed README: parts with no price a costing can work out, kits
   that would be refused, kits that would silently cost zero labour, and things
   worth a look. Severity says what it does to a costing — refuses, silent,
   check — and fix_on names the screen. Read-only; it blocks nothing.';

grant select on public.v_library_issues to authenticated;

-- ===========================================================================
-- 2. The same thing counted, for the top of the screen
-- ===========================================================================

create or replace view public.v_library_health
with (security_invoker = true)
as
select
  library,
  kind,
  severity,
  min(sort_order)                                       as sort_order,
  min(fix_on)                                           as fix_on,
  count(*)::int                                         as items,
  sum(used_by_kits)::int                                as used_by_kits,
  (array_agg(code order by used_by_kits desc, code))[1:5] as examples
from public.v_library_issues
group by library, kind, severity;

comment on view public.v_library_health is
  'v_library_issues counted by kind, with up to five example codes — the summary
   the Library health screen opens on. A part is ordered by how many kits hold
   it, so the one that breaks the most costings is named first.';

grant select on public.v_library_health to authenticated;

-- ===========================================================================
-- 3. A switch of its own
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('library_health', 'Library health',
   'A screen listing what the library is missing, live: parts with no price a costing can work out, kits that would be refused at the door, kits that would silently cost zero labour, and things worth a look. Each says what it does to a costing and which screen fixes it. It reads only — nothing is changed, blocked or refused.',
   false, 'feature.library_health', 200)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;
