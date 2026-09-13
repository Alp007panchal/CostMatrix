-- 0123  A costing that has no labour says so.
--
-- Labour is hours × an hourly rate per process type, and the hours live on the
-- kit group. `add_assembly_to_costing` freezes a labour row only
-- `where h.effective_hours > 0`, so a kit whose group has no hours recorded gets
-- **no labour rows at all**. The costing then prices its material correctly, adds
-- nothing for labour, and looks finished.
--
-- That is the app's most expensive failure mode today, because it is silent and
-- it is currently the normal case: `data/seed/kit-group-labour-template.csv` is
-- still empty, so every kit in the library costs zero labour. A quotation can be
-- released, printed on the letterhead and sent, with the assembly, wiring and
-- busbar time simply left out.
--
-- There is a second, quieter way to get the same result: hours recorded but the
-- hourly rate for that process left at zero. The rate is frozen onto the costing
-- when it is created, so a rate set afterwards does not reach it.
--
-- This adds a read-only view that names both, and the kit groups to fill in to
-- fix the first. **It changes no price and blocks nothing** — a supply-only job
-- with no labour is legitimate, and the app must not refuse it. It says what it
-- sees and leaves the judgement where it belongs.

-- ===========================================================================
-- 1. What is missing, per costing
-- ===========================================================================

create or replace view public.v_costing_labour_gaps
with (security_invoker = true)
as
with kit_lines as (
  select
    ca.costing_id,
    ca.company_id,
    ca.id            as costing_assembly_id,
    ca.name          as kit_name,
    ca.source_assembly_id,
    -- A kit line with no labour row at all: nothing in the library said how long
    -- it takes, so nothing was frozen.
    not exists (
      select 1 from public.costing_labour cl
      where cl.costing_assembly_id = ca.id and cl.hours > 0
    )                as without_hours
  from public.costing_assemblies ca
  where ca.kind = 'kit'
),
groups_missing as (
  -- Which kit groups those lines belong to — the rows of the labour template
  -- that would fix them. A kit with no group at all is named as "(no kit group)".
  select
    k.costing_id,
    coalesce(kg.name, '(no kit group)') as group_name,
    count(*)                            as kit_lines
  from kit_lines k
  left join public.assemblies a  on a.id = k.source_assembly_id
  left join public.kit_groups kg on kg.id = a.kit_group_id
  where k.without_hours
  group by k.costing_id, coalesce(kg.name, '(no kit group)')
),
rates as (
  -- Hours recorded, but the rate frozen on this costing is zero, so they cost
  -- nothing. The process is named because the fix is a rate, not hours.
  select
    cl.costing_id,
    string_agg(distinct cl.process_type, ', ' order by cl.process_type) as processes,
    count(*) as rows_affected
  from public.costing_labour cl
  where cl.hours > 0 and cl.hourly_rate = 0
  group by cl.costing_id
)
select
  c.id                                                      as costing_id,
  c.company_id,
  count(k.costing_assembly_id)                              as kit_lines,
  count(k.costing_assembly_id) filter (where k.without_hours) as kit_lines_without_hours,
  (select string_agg(g.group_name || ' (' || g.kit_lines || ')', ', ' order by g.group_name)
     from groups_missing g where g.costing_id = c.id)       as groups_to_fill,
  coalesce((select r.processes from rates r where r.costing_id = c.id), null) as processes_without_rate,
  coalesce((select r.rows_affected from rates r where r.costing_id = c.id), 0) as labour_rows_without_rate,
  coalesce(t.material_cost, 0)                              as material_cost,
  coalesce(t.labour_cost, 0)                                as labour_cost,
  case when coalesce(t.material_cost, 0) > 0
       then round(coalesce(t.labour_cost, 0) * 100 / t.material_cost, 1)
       else null end                                        as labour_share_pct,
  -- The verdict, worst first. "none" is the case that matters: a costing with
  -- kits on it and not one hour of labour anywhere.
  case
    when count(k.costing_assembly_id) = 0 then 'no_kits'
    when coalesce(t.labour_cost, 0) = 0 then 'none'
    when count(k.costing_assembly_id) filter (where k.without_hours) > 0 then 'some'
    when exists (select 1 from rates r where r.costing_id = c.id) then 'no_rate'
    else 'ok'
  end                                                       as verdict
from public.costings c
left join kit_lines k on k.costing_id = c.id
left join public.v_costing_totals t on t.costing_id = c.id
group by c.id, c.company_id, t.material_cost, t.labour_cost;

comment on view public.v_costing_labour_gaps is
  'Whether a costing has the labour it ought to: how many of its kit lines have no
   hours in the library, which kit groups to fill in to fix them, and whether any
   hours are priced at a zero rate. Read-only and advisory — a supply-only job
   with no labour is legitimate, so it reports and never refuses (roadmap: the
   labour template is empty, so this is currently the normal case).';

grant select on public.v_costing_labour_gaps to authenticated;

-- ===========================================================================
-- 2. A switch of its own
-- ===========================================================================

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('labour_check', 'The missing-labour check',
   'Warns on a costing when its kits carry no labour hours, naming the kit groups to fill in, and when hours are priced at a zero rate. It changes no price and blocks nothing — but a quotation with the labour left out is the most expensive mistake this app can make quietly, so it is worth switching on.',
   false, 'feature.labour_check', 190)
on conflict (code) do nothing;

select app.seed_feature_options(id) from public.companies;
