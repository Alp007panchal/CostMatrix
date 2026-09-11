-- What is in the library, counted. Read only: SELECTs and nothing else.
--
-- Run against staging by .github/workflows/check-staging.yml. It answers the
-- question the owner asks after a seed import — did everything land? — and the
-- expected figures are in CLAUDE.md: 735 components, 296 kits, 17 labour groups,
-- 8 parts without a price, one main device per kit.
--
-- It reads as the database owner, so it sees every company's rows. The master
-- library is the part with company_id is null.

select 'components (master library)' as what, count(*)::text as n
  from public.components where company_id is null
union all
select 'kits (master library)', count(*)::text
  from public.assemblies where company_id is null
union all
select 'kit lines', count(*)::text
  from public.assembly_components ac
  join public.assemblies a on a.id = ac.assembly_id and a.company_id is null
union all
select 'kit groups', count(*)::text
  from public.kit_groups where company_id is null
union all
-- Only fixed-price rows: the ten busbar sizes are priced by weight × the copper
-- rate and have no unit price of their own, which is correct, not missing.
select 'fixed-price parts with no price', count(*)::text
  from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is null
union all
select 'placeholders flagged', count(*)::text
  from public.components where company_id is null and is_placeholder
union all
select 'kits with exactly one main device', count(*)::text
  from (
    select ac.assembly_id
      from public.assembly_components ac
      join public.assemblies a on a.id = ac.assembly_id and a.company_id is null
     group by ac.assembly_id
    having count(*) filter (where ac.is_main_device) = 1
  ) ok
union all
select 'busbar sizes priced by weight', count(*)::text
  from public.components where company_id is null and pricing_mode = 'weight_rate'
union all
select 'kit groups with hours filled', count(distinct kit_group_id)::text
  from public.kit_group_labour where hours > 0
union all
select 'companies', count(*)::text from public.companies
union all
select 'costings', count(*)::text from public.costings;
