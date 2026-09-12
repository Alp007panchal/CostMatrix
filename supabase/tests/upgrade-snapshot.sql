-- One half of the upgrade rehearsal: write down what this database says.
--
-- Run once against a database at migration 0017 that already holds real rows,
-- and again after the advanced migrations have been applied on top. The second
-- run compares and refuses any difference, because a costing that was priced
-- before an upgrade must say exactly the same thing after it.
--
-- Called with -v phase=before or -v phase=after by upgrade-rehearsal.sh.

create table if not exists test.rehearsal (
  label text not null,
  phase text not null,
  value text,
  primary key (label, phase)
);

insert into test.rehearsal (label, phase, value)
select label, :'phase', value from (
  -- Counts: nothing in the catalogue or the costings may appear or vanish.
  select 'components'          as label, count(*)::text as value from public.components
  union all select 'kits',            count(*)::text from public.assemblies
  union all select 'kit lines',       count(*)::text from public.assembly_components
  union all select 'kit groups',      count(*)::text from public.kit_groups
  union all select 'costings',        count(*)::text from public.costings
  union all select 'panels',          count(*)::text from public.costing_panels
  union all select 'costing lines',   count(*)::text from public.costing_assemblies
  union all select 'costing items',   count(*)::text from public.costing_items
  union all select 'quotations',      count(*)::text from public.quotations

  -- The frozen money on every costing line, to the cent.
  union all select 'frozen material',
    coalesce(sum(unit_price * quantity), 0)::text from public.costing_items

  -- NPP-192, the figure the whole app is measured against.
  union all select 'NPP-192 material',
    coalesce((select c.material_cost::text from public.v_costing_panel_costs c
               join public.costings k on k.id = c.costing_id
              where k.title = 'NPP-192 Option 1, from the seed'), 'not built')

  -- Every costing's totals, and every panel's price, as one string each: a
  -- difference anywhere shows up as a difference here.
  union all select 'costing totals',
    coalesce(string_agg(costing_id::text || '=' || subtotal::text || '/' || tax::text
                        || '/' || grand_total::text, ' ' order by costing_id::text), '')
    from public.v_costing_totals
  union all select 'panel prices',
    coalesce(string_agg(panel_id::text || '=' || unit_price::text || '/' || line_total::text,
                        ' ' order by panel_id::text), '')
    from public.v_costing_panel_prices

  -- Quotation numbering never resets (decision 7), so it must survive too.
  union all select 'quotation references',
    coalesce(string_agg(reference_no, ' ' order by reference_no), '') from public.quotations
) figures
on conflict (label, phase) do update set value = excluded.value;
