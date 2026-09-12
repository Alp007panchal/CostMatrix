-- 0116  Sales analytics (roadmap 3.6).
--
-- Which jobs were won, which were lost and why, how the hit rate looks by
-- customer, by product group, by value and by month — and whether the margin the
-- shop achieved matches the margin that was quoted.
--
-- **Read-only, every line of it.** No table, no write, no change to a costing, a
-- quotation or an enquiry. Every figure comes from what the app already records:
-- the decision on the enquiry (0016), the quotation it names, the costing's frozen
-- totals, and the actual hours recorded against panels (0110). Nothing here can
-- move a price.
--
-- One deliberate shape: a **row per enquiry**, and the grouping — by customer, by
-- band, by month — is done in the web layer, where it is pure and unit-tested. The
-- alternative, a view per grouping, is four near-identical queries to keep in step.
-- What cannot be done up there is the joining through costing lines to kit groups,
-- so that one has a view of its own.

-- ===========================================================================
-- 1. Value bands, which are the company's own
-- ===========================================================================
-- Re-derived from the 0106 text to add `analytics_value_bands`, so a company
-- created *after* this migration gets it too — the trigger on `companies` calls
-- this, and an insert here would only have covered the companies of today.
--
-- `apfc_step_pattern` joins it for the same reason: 0113 inserted that key for the
-- companies that existed then and never added it here, so a company created since
-- has been running on the function's fallback rather than a row it can edit. Two
-- lines, and one fewer setting that cannot be changed on a screen.
create or replace function app.seed_company_options(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_options (company_id, key, value, value_type)
  values
    (target_company, 'ai_enabled',                'false'::jsonb, 'boolean'),
    (target_company, 'ai_monthly_token_budget',   '2000000'::jsonb, 'number'),
    (target_company, 'ai_price_age_warning_days', '90'::jsonb, 'number'),
    (target_company, 'ai_min_margin_pct',
       coalesce((select to_jsonb(least(material_margin_pct, labour_margin_pct))
                   from public.companies where id = target_company), '0'::jsonb), 'number'),
    (target_company, 'layout_safety_factor',      '1.3'::jsonb, 'number'),
    (target_company, 'apfc_step_pattern',         '"50,25,18.75,6.25"'::jsonb, 'string'),
    -- 3.6: the thresholds the sales reports band a job's value by.
    (target_company, 'analytics_value_bands',     '"500000,2000000,10000000"'::jsonb, 'string')
  on conflict (company_id, key) do nothing;
end;
$$;

select app.seed_company_options(id) from public.companies;

-- The thresholds read as labels an engineer would say out loud. Largest first so
-- the first match wins, as a price list is read.
create or replace function app.value_band(value numeric)
returns text
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  edges numeric[];
  i integer;
begin
  if value is null then return 'no value yet'; end if;
  edges := string_to_array(
    app.company_option('analytics_value_bands', '"500000,2000000,10000000"'::jsonb) #>> '{}',
    ',')::numeric[];

  for i in reverse array_length(edges, 1) .. 1 loop
    if value >= edges[i] then
      return case
        when i = array_length(edges, 1) then format('over %s', app.money_words(edges[i]))
        else format('%s to %s', app.money_words(edges[i]), app.money_words(edges[i + 1]))
      end;
    end if;
  end loop;
  return format('under %s', app.money_words(edges[1]));
end;
$$;

-- "500 K", "2 M" — short enough for a column heading.
create or replace function app.money_words(value numeric)
returns text
language sql
immutable
as $$
  -- FM drops the padding but keeps the decimal point when the fraction is zero, so
  -- 500,000 would read "500. K" without the trailing trim.
  select case
    when value >= 1000000
      then trim(trailing '.' from trim(to_char(value / 1000000, 'FM999999990.9'))) || ' M'
    when value >= 1000
      then trim(trailing '.' from trim(to_char(value / 1000,    'FM999999990.9'))) || ' K'
    else trim(to_char(value, 'FM999999990'))
  end
$$;

comment on function app.value_band(numeric) is
  'Which value band a job falls in, from the company''s own analytics_value_bands
   (default 500 K / 2 M / 10 M). A setting, not a rule in code (roadmap 3.6).';

-- ===========================================================================
-- 2. One row per enquiry: what happened to it, and what it was worth
-- ===========================================================================
-- The value is the job's **ex-VAT subtotal**, from the costing that was actually
-- offered: the one the winning quotation names, else the latest quotation
-- released, else the enquiry's current costing. Ex-VAT because VAT is not the
-- company's money and a hit rate by value should not count it.
create or replace view public.v_sales_outcomes
with (security_invoker = true)
as
select
  e.company_id,
  e.id                                        as enquiry_id,
  e.enquiry_no,
  e.title,
  e.customer_id,
  cu.name                                     as customer_name,
  e.project_id,
  e.received_on,
  e.status,
  -- The decision's date lives on the quotation, not the enquiry (0016), so it is
  -- read from the offers: the latest of them to be decided.
  d.decided_at,
  e.lost_reason,
  e.owner_user_id,
  e.won_quotation_id,
  case when d.decided_at is not null
       then (d.decided_at::date - e.received_on) end as days_to_decide,
  (select count(*)::int from public.quotations q
    join public.costings c2 on c2.id = q.costing_id
   where c2.enquiry_id = e.id)                 as quotations_released,
  v.costing_id,
  v.costing_no,
  v.subtotal                                  as value_ex_vat,
  app.value_band(v.subtotal)                  as value_band
from public.enquiries e
join public.customers cu on cu.id = e.customer_id
left join lateral (
  select max(q.decided_at) as decided_at
  from public.quotations q
  join public.costings c on c.id = q.costing_id
  where c.enquiry_id = e.id
) d on true
left join lateral (
  select c.id as costing_id, c.costing_no, t.subtotal
  from public.costings c
  join public.v_costing_totals t on t.costing_id = c.id
  left join public.quotations q on q.costing_id = c.id
  where c.enquiry_id = e.id
  order by
    -- The offer that won, then the most recent offer that went out, then the
    -- current working costing: the best answer to "what was this job worth?".
    (e.won_quotation_id is not null and q.id = e.won_quotation_id) desc,
    q.released_at desc nulls last,
    c.is_current desc,
    c.revision_no desc
  limit 1
) v on true;

comment on view public.v_sales_outcomes is
  'One row per enquiry: its decision, why it was lost, how long it took to decide,
   and what it was worth ex-VAT with its value band. The grouping — by customer, by
   band, by month — is done in the web layer from these rows (roadmap 3.6).';

-- ===========================================================================
-- 3. By product group, which means by kit group
-- ===========================================================================
-- "Product group" is the library's own kit group: ACB frame 1, MCCB, ATS, APFC
-- bank. A job counts towards every group it used, and carries that group's share
-- of the material and labour, so a hit rate by group can be read beside the money
-- at stake in it.
create or replace view public.v_sales_group_outcomes
with (security_invoker = true)
as
select
  o.company_id,
  o.enquiry_id,
  o.status,
  o.value_ex_vat,
  coalesce(g.name, 'Kits with no group')      as kit_group_name,
  a.kit_group_id,
  count(*)::int                               as lines,
  sum(t.material_total * p.quantity)          as material,
  sum(t.labour_total * p.quantity)            as labour,
  sum(t.hours_total * p.quantity)             as hours
from public.v_sales_outcomes o
join public.costing_assemblies ca on ca.costing_id = o.costing_id and ca.kind = 'kit'
join public.costing_panels p on p.id = ca.panel_id
join public.v_costing_assembly_totals t on t.costing_assembly_id = ca.id
left join public.assemblies a on a.id = ca.source_assembly_id
left join public.kit_groups g on g.id = a.kit_group_id
group by o.company_id, o.enquiry_id, o.status, o.value_ex_vat, g.name, a.kit_group_id;

comment on view public.v_sales_group_outcomes is
  'One row per enquiry and kit group: what that group came to on the job that was
   offered, beside the enquiry''s outcome. Win and loss by product group are read
   from this (roadmap 3.6).';

-- ===========================================================================
-- 4. The margin quoted, against the margin achieved
-- ===========================================================================
-- Quoted: what the costing was priced on. Achieved: the same sum with the hours
-- the shop actually recorded (0110) in place of the estimate, **panel by panel**,
-- and the estimate kept where no hours were recorded — with `labour_measured_pct`
-- saying how much of the labour is fact rather than estimate, so nobody reads a
-- figure as more solid than it is.
create or replace view public.v_margin_achieved
with (security_invoker = true)
as
with per_panel as (
  select
    p.costing_id,
    p.company_id,
    p.id                                                   as panel_id,
    pc.material_cost * p.quantity                          as material_cost,
    pc.labour_cost * p.quantity                            as labour_estimate,
    pc.hours * p.quantity                                  as hours_estimate,
    (select sum(la.hours) from public.labour_actuals la where la.panel_id = p.id) as hours_actual,
    -- The frozen rate this costing was priced at, for the process types it used.
    (select avg(cl.hourly_rate) from public.costing_labour cl
      join public.costing_assemblies ca2 on ca2.id = cl.costing_assembly_id
     where ca2.panel_id = p.id)                            as hourly_rate
  from public.costing_panels p
  join public.v_costing_panel_costs pc on pc.panel_id = p.id
)
select
  c.id                                          as costing_id,
  c.company_id,
  c.costing_no,
  c.revision_no,
  t.subtotal                                    as price_ex_vat,
  sum(pp.material_cost)                         as material_cost,
  sum(pp.labour_estimate)                       as labour_quoted,
  sum(coalesce(pp.hours_actual * pp.hourly_rate, pp.labour_estimate)) as labour_achieved,
  sum(pp.hours_estimate)                        as hours_quoted,
  sum(coalesce(pp.hours_actual, pp.hours_estimate)) as hours_achieved,
  case when t.subtotal > 0 then round(
    (t.subtotal - sum(pp.material_cost) - sum(pp.labour_estimate)) / t.subtotal * 100, 1) end
                                                as margin_quoted_pct,
  case when t.subtotal > 0 then round(
    (t.subtotal - sum(pp.material_cost)
     - sum(coalesce(pp.hours_actual * pp.hourly_rate, pp.labour_estimate))) / t.subtotal * 100, 1) end
                                                as margin_achieved_pct,
  -- How much of the labour is measured rather than estimated.
  case when sum(pp.hours_estimate) > 0 then round(
    sum(case when pp.hours_actual is not null then pp.hours_estimate else 0 end)
    / sum(pp.hours_estimate) * 100, 0) else 0 end as labour_measured_pct
from public.costings c
join public.v_costing_totals t on t.costing_id = c.id
join per_panel pp on pp.costing_id = c.id
group by c.id, c.company_id, c.costing_no, c.revision_no, t.subtotal;

comment on view public.v_margin_achieved is
  'Margin as quoted against margin as the shop achieved it: the same arithmetic with
   recorded hours in place of the estimate where there are any, and
   labour_measured_pct saying how much of the labour is fact (roadmap 3.6).';

-- ===========================================================================
-- 5. What is still out there
-- ===========================================================================
create or replace view public.v_sales_pipeline
with (security_invoker = true)
as
select
  o.company_id,
  o.enquiry_id,
  o.enquiry_no,
  o.title,
  o.customer_name,
  o.status,
  o.received_on,
  (current_date - o.received_on)                as age_days,
  o.value_ex_vat,
  o.value_band,
  o.owner_user_id,
  o.quotations_released,
  q.reference_no                                as latest_quotation,
  q.status                                      as quotation_status,
  q.sent_at,
  q.days_left,
  q.has_run_out
from public.v_sales_outcomes o
left join lateral (
  select v.reference_no, v.status, v.sent_at, v.days_left, v.has_run_out
  from public.v_quotation_validity v
  join public.costings c on c.id = v.costing_id
  where c.enquiry_id = o.enquiry_id
  order by v.sent_at desc nulls last, v.valid_until desc nulls last
  limit 1
) q on true
where o.status in ('open', 'quoted');

comment on view public.v_sales_pipeline is
  'The jobs still out there: open and quoted enquiries with their value, their age,
   and the latest quotation''s state and how long it has left (roadmap 3.6).';

-- ===========================================================================
-- 6. Grants
-- ===========================================================================
grant select on
  public.v_sales_outcomes, public.v_sales_group_outcomes,
  public.v_margin_achieved, public.v_sales_pipeline
to authenticated;

grant execute on function app.value_band(numeric), app.money_words(numeric) to authenticated;
