-- 0110  Estimate against actual labour (roadmap 2.8, advanced track)
--
-- `labour_actuals` has existed since 0100 (foundation F3) and nothing has written
-- or read it. Now the shop floor's hours can be recorded against the panel and
-- process type they were worked on, and the app can say where the standards are
-- wrong — per panel on the costing, and per kit group across every job that has
-- actuals.
--
-- Three things this deliberately does **not** do:
--
-- * It never touches a costing. A costing keeps the hours it froze, for ever; an
--   actual is a separate fact recorded afterwards. No price, no total and no
--   quotation moves because somebody recorded hours.
-- * It never changes a standard by itself (the roadmap's own words). The report
--   suggests; `app.apply_labour_suggestion` writes one group's hours **only when a
--   person asks**, through the ordinary policy on `kit_group_labour`.
-- * It does not pretend to know more than it does. The shop records hours per
--   board, not per kit, so kit-group figures are **apportioned in proportion to
--   the estimate** and every row carries how many jobs and kit units it rests on.

-- ===========================================================================
-- 1. What the costing said the labour would be
-- ===========================================================================
-- Per panel and process type, for the whole batch: the frozen hours of every kit
-- line, times the kit's quantity, times the panel's quantity, times the panel's
-- productivity factor — which is exactly what `v_costing_panel_costs` prices, so
-- the estimate compared against cannot drift from the estimate quoted.
create or replace view public.v_panel_labour_estimate
with (security_invoker = true)
as
select
  p.costing_id,
  p.company_id,
  p.id                                        as panel_id,
  cl.process_type,
  sum(cl.hours * ca.quantity) * p.quantity * p.productivity_factor        as estimated_hours,
  sum(cl.hours * ca.quantity * cl.hourly_rate)
    * p.quantity * p.productivity_factor                                 as estimated_cost,
  max(cl.hourly_rate)                                                    as hourly_rate
from public.costing_labour cl
join public.costing_assemblies ca on ca.id = cl.costing_assembly_id
join public.costing_panels p on p.id = ca.panel_id
group by p.costing_id, p.company_id, p.id, cl.process_type, p.quantity, p.productivity_factor;

comment on view public.v_panel_labour_estimate is
  'The hours this costing froze for one panel and process type, for the whole
   batch: kit hours × kit quantity × panel quantity × productivity factor.';

-- ===========================================================================
-- 2. Estimate against actual, panel by panel
-- ===========================================================================
-- A process type appears when either side has something to say: hours estimated
-- and not yet worked, and hours worked on something nobody estimated, are both
-- worth seeing.
create or replace view public.v_panel_labour_variance
with (security_invoker = true)
as
with keys as (
  select costing_id, company_id, panel_id, process_type from public.v_panel_labour_estimate
  union
  select costing_id, company_id, panel_id, process_type from public.labour_actuals
),
actual as (
  select panel_id, process_type,
         sum(hours)   as actual_hours,
         count(*)::int as entries,
         max(recorded_at) as last_recorded_at
  from public.labour_actuals
  group by panel_id, process_type
)
select
  k.costing_id,
  k.company_id,
  k.panel_id,
  p.name                                              as panel_name,
  p.quantity                                          as panel_quantity,
  k.process_type,
  pt.name                                             as process_name,
  pt.sort_order,
  coalesce(e.estimated_hours, 0)                      as estimated_hours,
  coalesce(a.actual_hours, 0)                         as actual_hours,
  a.actual_hours is not null                          as has_actuals,
  coalesce(a.entries, 0)                              as entries,
  a.last_recorded_at,
  coalesce(a.actual_hours, 0) - coalesce(e.estimated_hours, 0) as difference_hours,
  case when coalesce(e.estimated_hours, 0) > 0 and a.actual_hours is not null
       then round((a.actual_hours - e.estimated_hours) / e.estimated_hours * 100, 1)
  end                                                 as variance_pct,
  coalesce(e.hourly_rate, r.hourly_rate, 0)           as hourly_rate,
  round((coalesce(a.actual_hours, 0) - coalesce(e.estimated_hours, 0))
        * coalesce(e.hourly_rate, r.hourly_rate, 0), 2) as difference_cost
from keys k
join public.costing_panels p on p.id = k.panel_id
join public.process_types pt on pt.code = k.process_type
left join public.v_panel_labour_estimate e
       on e.panel_id = k.panel_id and e.process_type = k.process_type
left join actual a
       on a.panel_id = k.panel_id and a.process_type = k.process_type
left join public.costing_labour_rates r
       on r.costing_id = k.costing_id and r.process_type = k.process_type;

comment on view public.v_panel_labour_variance is
  'Estimate against actual for one panel and process type: hours either way, the
   difference in hours and at the frozen rate, and how many entries the actual
   figure is made of. Nothing here reaches the costing''s own numbers.';

-- ===========================================================================
-- 3. Where the standards are wrong, by kit group
-- ===========================================================================
-- The honest difficulty, and how it is handled: hours are recorded per panel,
-- and a panel holds kits of several groups. So a panel's actual hours are shared
-- out **in proportion to what each kit line was estimated at** — the only
-- division the data supports — and every row says how many jobs and kit units it
-- rests on, so a suggestion from one board is not mistaken for a standard.
create or replace view public.v_kit_group_labour_variance
with (security_invoker = true)
as
with line as (
  select
    p.company_id,
    p.costing_id,
    p.id                                  as panel_id,
    a.kit_group_id,
    cl.process_type,
    cl.hours * ca.quantity * p.quantity * p.productivity_factor as est_hours,
    ca.quantity * p.quantity                                    as kit_units
  from public.costing_labour cl
  join public.costing_assemblies ca on ca.id = cl.costing_assembly_id
  join public.costing_panels p on p.id = ca.panel_id
  left join public.assemblies a on a.id = ca.source_assembly_id
  where ca.kind = 'kit'
),
panel_est as (
  select panel_id, process_type, sum(est_hours) as total_est
  from line group by panel_id, process_type
),
panel_actual as (
  select panel_id, process_type, sum(hours) as actual_hours
  from public.labour_actuals group by panel_id, process_type
)
select
  l.company_id,
  l.kit_group_id,
  g.name                                                          as kit_group_name,
  l.process_type,
  pt.name                                                         as process_name,
  pt.sort_order,
  count(distinct l.costing_id)::int                               as jobs,
  count(distinct l.panel_id)::int                                 as panels,
  sum(l.kit_units)                                                as kit_units,
  round(sum(l.est_hours), 2)                                      as estimated_hours,
  -- The panel's actual hours, shared out in proportion to the estimate.
  round(sum(pa.actual_hours * l.est_hours / nullif(pe.total_est, 0)), 2) as actual_hours,
  round(sum(l.est_hours) / nullif(sum(l.kit_units), 0), 2)         as estimated_hours_per_kit,
  round(sum(pa.actual_hours * l.est_hours / nullif(pe.total_est, 0))
        / nullif(sum(l.kit_units), 0), 2)                          as actual_hours_per_kit,
  case when sum(l.est_hours) > 0 then
    round((sum(pa.actual_hours * l.est_hours / nullif(pe.total_est, 0)) - sum(l.est_hours))
          / sum(l.est_hours) * 100, 1)
  end                                                             as variance_pct,
  -- What the standard would become if the company took the actuals as read. A
  -- suggestion, printed beside the standard in force; nothing applies it.
  round(sum(pa.actual_hours * l.est_hours / nullif(pe.total_est, 0))
        / nullif(sum(l.kit_units), 0), 2)                          as suggested_hours,
  kgl.hours                                                       as standard_hours
from line l
join panel_est pe on pe.panel_id = l.panel_id and pe.process_type = l.process_type
join panel_actual pa on pa.panel_id = l.panel_id and pa.process_type = l.process_type
join public.process_types pt on pt.code = l.process_type
left join public.kit_groups g on g.id = l.kit_group_id
left join public.kit_group_labour kgl
       on kgl.kit_group_id = l.kit_group_id and kgl.process_type = l.process_type
group by l.company_id, l.kit_group_id, g.name, l.process_type, pt.name, pt.sort_order, kgl.hours;

comment on view public.v_kit_group_labour_variance is
  'Estimate against actual by kit group and process type, over every panel that
   has actual hours recorded. A panel''s hours are apportioned across its kit
   lines in proportion to the estimate, because the shop records hours per board.
   suggested_hours is the actual per kit unit; standard_hours is what the group
   says today. Nothing is applied automatically (roadmap 2.8).';

-- ===========================================================================
-- 4. Recording hours, and taking a suggestion
-- ===========================================================================
create or replace function app.record_actual_hours(
  panel uuid, process text, worked numeric, note text default null,
  source text default 'manual', worked_at timestamptz default null)
returns public.labour_actuals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  target public.costing_panels;
  saved public.labour_actuals;
begin
  select * into target from public.costing_panels where id = panel;
  if target.id is null then raise exception 'no such panel'; end if;
  if worked is null or worked < 0 then raise exception 'hours must be zero or more'; end if;
  if not exists (select 1 from public.process_types where code = process) then
    raise exception 'unknown process type %', process;
  end if;

  -- Entries are a log, not a single figure: hours arrive a day or a week at a
  -- time, and the variance views add them up. Correcting one means removing it.
  insert into public.labour_actuals
    (company_id, costing_id, panel_id, process_type, hours, source, note, recorded_at, created_by)
  values (target.company_id, target.costing_id, panel, process, worked,
          coalesce(source, 'manual'), nullif(btrim(coalesce(note, '')), ''),
          coalesce(worked_at, now()), auth.uid())
  returning * into saved;

  perform app.write_activity('costing', target.costing_id, 'actual_hours_recorded',
    null,
    jsonb_build_object('panel_id', panel, 'panel', target.name,
                       'process_type', process, 'hours', worked),
    note);

  return saved;
end;
$$;

comment on function app.record_actual_hours(uuid, text, numeric, text, text, timestamptz) is
  'Files hours actually worked against a panel and process type. Appends an entry
   rather than replacing a figure, writes the activity log, and changes nothing
   about the costing: the hours it froze are what it was priced on.';

create or replace function app.remove_actual_hours(entry uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  row_to_go public.labour_actuals;
begin
  select * into row_to_go from public.labour_actuals where id = entry;
  if row_to_go.id is null then raise exception 'no such entry'; end if;

  delete from public.labour_actuals where id = entry;

  perform app.write_activity('costing', row_to_go.costing_id, 'actual_hours_removed',
    jsonb_build_object('panel_id', row_to_go.panel_id, 'process_type', row_to_go.process_type,
                       'hours', row_to_go.hours),
    null, null);
end;
$$;

comment on function app.remove_actual_hours(uuid) is
  'Removes one entry of actual hours — how a wrong figure is corrected, since the
   entries are a log. Logged like the recording.';

-- Taking a suggestion is a person's decision, which is the whole of decision
-- D-2xx: this writes `kit_group_labour` as the caller, so the policy that already
-- governs that table — master administrator for a master group, company
-- administrator for the company's own — is the only thing that decides whether it
-- is allowed. Nothing calls it but a button.
create or replace function app.apply_labour_suggestion(target_group uuid, process text)
returns numeric
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  suggestion numeric;
begin
  select suggested_hours into suggestion
  from public.v_kit_group_labour_variance
  where kit_group_id = target_group and process_type = process;

  if suggestion is null then
    raise exception 'there is no suggestion for that kit group and process type yet: no actual hours have been recorded against a job that used it';
  end if;

  insert into public.kit_group_labour (kit_group_id, process_type, hours, created_by)
  values (target_group, process, suggestion, auth.uid())
  on conflict (kit_group_id, process_type) do update set hours = excluded.hours, updated_at = now();

  return suggestion;
end;
$$;

comment on function app.apply_labour_suggestion(uuid, text) is
  'Writes the suggested hours into the kit group''s standard, when somebody asks.
   Runs as the caller, so the existing policy on kit_group_labour decides who may:
   a master administrator for a master group, a company administrator for its own.
   Never called by anything but a person pressing the button (roadmap 2.8).';

-- ===========================================================================
-- 5. Wrappers and grants
-- ===========================================================================
create or replace function public.record_actual_hours(
  panel uuid, process text, worked numeric, note text default null,
  source text default 'manual', worked_at timestamptz default null)
returns public.labour_actuals
language plpgsql security invoker as $$
begin return app.record_actual_hours(panel, process, worked, note, source, worked_at); end $$;

create or replace function public.remove_actual_hours(entry uuid)
returns void language plpgsql security invoker as $$
begin perform app.remove_actual_hours(entry); end $$;

create or replace function public.apply_labour_suggestion(target_group uuid, process text)
returns numeric language plpgsql security invoker as $$
begin return app.apply_labour_suggestion(target_group, process); end $$;

grant select on
  public.v_panel_labour_estimate, public.v_panel_labour_variance,
  public.v_kit_group_labour_variance
to authenticated;

grant execute on function
  app.record_actual_hours(uuid, text, numeric, text, text, timestamptz),
  public.record_actual_hours(uuid, text, numeric, text, text, timestamptz),
  app.remove_actual_hours(uuid), public.remove_actual_hours(uuid),
  app.apply_labour_suggestion(uuid, text), public.apply_labour_suggestion(uuid, text)
to authenticated;
