-- 0130  Nothing the library depends on disappears quietly.
--
-- This app is careful at the door and careless at the exit.
--
-- At the door it refuses a component in a currency it has no landed factor for
-- (`app.check_component_currency`, 0008), refuses a kit with an unpriced line at
-- the moment it would reach a costing (0010), and insists on exactly one main
-- device per kit (0009). Good rules, all of them.
--
-- At the exit there is nothing. Three rows can be deleted today, through the
-- ordinary API, by somebody with the rights to do it — and each takes something
-- with it without a word:
--
--   * **A kit group.** `assemblies.kit_group_id` is `on delete set null`, so the
--     kits fall out of the group and their hours come from nowhere. They then
--     cost **zero labour**, which is the app's most expensive silent failure and
--     the reason 0123 exists. Nothing says anything.
--   * **A master currency factor.** Every part bought in that currency becomes
--     unpriceable. Its purchase price still shows on the Components screen; the
--     costing refuses the kit that holds it, naming a part that looks fine.
--   * **A master material rate.** `components.material_rate_code` is plain
--     `text` with **no foreign key at all**, so nothing stops it — and it orphans
--     every weight-priced part, which is the whole busbar catalogue.
--
-- So: three `before delete` triggers that refuse and say what depends on the row,
-- in the same voice as the refusals at the door. Each names the count and the
-- remedy, because "cannot delete" without a way forward is how people learn to
-- work around a guard.
--
-- **Not behind a feature switch, deliberately** (D-2026-09-13-no-quiet-deletes).
-- The switch rule exists so that merging cannot change what the app does; a
-- guard switched off changes nothing for anybody and protects nobody. What these
-- change is "quietly corrupts the library" into "refuses, with a reason", and
-- there is no state of the world in which the first is wanted. If the owner
-- would rather have them switchable, that is one `feature_on` call each.
--
-- Deleting a **company's own** currency factor or material rate stays allowed:
-- both fall back to the master row (`v_currency_factors`, `v_material_rates`),
-- so nothing is orphaned. Only the master row is guarded. That distinction is
-- the point — a guard that refuses safe things is a guard people disable.

-- ===========================================================================
-- 1. A kit group its kits are still in
-- ===========================================================================

create or replace function app.refuse_orphaning_kit_group()
returns trigger
language plpgsql
-- Counts what depends on the row, so it must see **everything** that does.
-- Under the caller's own row-level security a dependent row it cannot read
-- would count as zero and the deletion would go through — the exact failure
-- this exists to stop. It reads counts only and writes nothing.
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  select count(*) into n from public.assemblies where kit_group_id = old.id;
  if n > 0 then
    raise exception
      '% kit(s) are still in "%" and would lose their labour hours without a word; move them to another group first',
      n, old.name;
  end if;
  return old;
end;
$$;

comment on function app.refuse_orphaning_kit_group() is
  'Refuses deleting a kit group that kits are still in. The foreign key is
   `on delete set null`, so without this the kits are quietly un-grouped and
   cost zero labour (the failure 0123 reports after the fact).';

drop trigger if exists kit_groups_refuse_orphaning on public.kit_groups;
create trigger kit_groups_refuse_orphaning
  before delete on public.kit_groups
  for each row execute function app.refuse_orphaning_kit_group();

-- ===========================================================================
-- 2. A master currency factor parts are still priced in
-- ===========================================================================

create or replace function app.refuse_orphaning_currency_factor()
returns trigger
language plpgsql
-- Counts what depends on the row, so it must see **everything** that does.
-- Under the caller's own row-level security a dependent row it cannot read
-- would count as zero and the deletion would go through — the exact failure
-- this exists to stop. It reads counts only and writes nothing.
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  -- A company's own row falls back to the master one, so removing it orphans
  -- nothing and is left alone.
  if old.company_id is not null then
    return old;
  end if;
  select count(*) into n
  from public.components
  where pricing_mode = 'fixed' and purchase_currency = old.currency_code;
  if n > 0 then
    raise exception
      '% part(s) are bought in % and could not be priced without its landed factor; reprice them in another currency first',
      n, old.currency_code;
  end if;
  return old;
end;
$$;

comment on function app.refuse_orphaning_currency_factor() is
  'Refuses deleting the master landed factor for a currency parts are still
   bought in. Without it their price cannot be worked out at all, while the
   purchase price still shows on the Components screen.';

drop trigger if exists currency_factors_refuse_orphaning on public.currency_factors;
create trigger currency_factors_refuse_orphaning
  before delete on public.currency_factors
  for each row execute function app.refuse_orphaning_currency_factor();

-- ===========================================================================
-- 3. A master material rate weight-priced parts are still priced by
-- ===========================================================================

create or replace function app.refuse_orphaning_material_rate()
returns trigger
language plpgsql
-- Counts what depends on the row, so it must see **everything** that does.
-- Under the caller's own row-level security a dependent row it cannot read
-- would count as zero and the deletion would go through — the exact failure
-- this exists to stop. It reads counts only and writes nothing.
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if old.company_id is not null then
    return old;
  end if;
  select count(*) into n
  from public.components
  where pricing_mode = 'weight_rate' and material_rate_code = old.code;
  if n > 0 then
    raise exception
      '% part(s) are priced by the % rate and could not be priced without it; give them a fixed price first',
      n, old.code;
  end if;
  return old;
end;
$$;

comment on function app.refuse_orphaning_material_rate() is
  'Refuses deleting a master material rate that weight-priced parts still use.
   `components.material_rate_code` is plain text with no foreign key, so nothing
   else stops this — and it orphans the whole busbar catalogue.';

drop trigger if exists material_rates_refuse_orphaning on public.material_rates;
create trigger material_rates_refuse_orphaning
  before delete on public.material_rates
  for each row execute function app.refuse_orphaning_material_rate();

-- ===========================================================================
-- 4. What is holding each of them, so it can be seen before it is tried
-- ===========================================================================
-- The guards refuse at the moment somebody tries. This says the same thing
-- beforehand, so the Rates and Kit groups screens can show "3 kits" beside a row
-- rather than letting a person find out by being refused.

create or replace view public.v_library_dependents
with (security_invoker = true)
as
select 'kit_group'::text as kind, g.id as entity_id, g.name as label,
       (select count(*)::int from public.assemblies a where a.kit_group_id = g.id) as dependents,
       'kit(s) in this group'::text as dependents_are
from public.kit_groups g
union all
select 'currency_factor', f.id, f.currency_code,
       case when f.company_id is null
            then (select count(*)::int from public.components c
                   where c.pricing_mode = 'fixed' and c.purchase_currency = f.currency_code)
            else 0 end,
       'part(s) bought in this currency'
from public.currency_factors f
union all
select 'material_rate', r.id, r.code,
       case when r.company_id is null
            then (select count(*)::int from public.components c
                   where c.pricing_mode = 'weight_rate' and c.material_rate_code = r.code)
            else 0 end,
       'part(s) priced by this rate'
from public.material_rates r;

comment on view public.v_library_dependents is
  'How many things depend on each kit group, currency factor and material rate,
   so a screen can say so before somebody tries to delete one. A company''s own
   currency factor or material rate always reads zero: deleting it falls back to
   the master row and orphans nothing.';

grant select on public.v_library_dependents to authenticated;
