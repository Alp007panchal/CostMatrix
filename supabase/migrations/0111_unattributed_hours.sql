-- 0111  The hours the kit-group report cannot account for.
--
-- 0110 shares a panel's recorded hours across its kit lines in proportion to
-- the estimate, which is the only honest split while the shop records hours per
-- board. Where the proportion cannot be worked out, though, the hours go
-- nowhere: `v_kit_group_labour_variance` divides by the panel's estimated hours
-- for that process, so a panel costed at **no** hours of that kind — a board of
-- loose parts, a kit whose group has no standard typed in yet, a line somebody
-- added by hand — contributes nothing and leaves no trace.
--
-- Those hours were worked. A report that quietly drops them is telling the
-- company its standards are closer to the truth than they are, so this names
-- them instead: same figures, one more view, nothing else touched.

create or replace view public.v_panel_labour_unattributed
with (security_invoker = true)
as
select
  p.company_id,
  p.costing_id,
  p.id           as panel_id,
  p.name         as panel_name,
  la.process_type,
  pt.name        as process_name,
  pt.sort_order  as process_sort,
  sum(la.hours)  as hours
from public.labour_actuals la
join public.costing_panels p on p.id = la.panel_id
join public.process_types pt on pt.code = la.process_type
-- The same condition 0110's allocation divides by: kit lines with hours on them.
where coalesce((
  select sum(cl.hours * ca.quantity) * p.quantity * p.productivity_factor
  from public.costing_labour cl
  join public.costing_assemblies ca on ca.id = cl.costing_assembly_id
  where ca.panel_id = la.panel_id and ca.kind = 'kit' and cl.process_type = la.process_type
), 0) = 0
group by p.company_id, p.costing_id, p.id, p.name, la.process_type, pt.name, pt.sort_order;

comment on view public.v_panel_labour_unattributed is
  'Hours recorded against a panel that was costed at none of that work, so
   v_kit_group_labour_variance has no estimate to share them out in proportion
   to and counts them nowhere. Shown beside that report rather than dropped: the
   usual causes are a board of loose parts and a kit group whose standard hours
   are still blank.';

grant select on public.v_panel_labour_unattributed to authenticated;
