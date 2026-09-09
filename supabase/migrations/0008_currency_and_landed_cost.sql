-- 0008: purchase price, purchase currency and landed-cost factors; enclosure
-- cubicles with a company uplift. Reference document §5, decisions 1 and 2.
--
-- Before: a master component carried one price in KES. After: every component
-- carries the price the supplier charges, in the supplier's currency; one
-- admin-maintained landed-cost factor per currency (exchange rate plus
-- freight, duty and handling in a single number: 200 KES per EUR today) turns
-- it into KES, and only then do the company discount and the company currency
-- apply. The columns are renamed rather than duplicated so there is one price,
-- never two that can disagree. Also: the copper rate is held in EUR per kg and
-- goes through the same factor (decision 3).

-- ---------------------------------------------------------------------------
-- 1. Currency factors: master defaults, company overrides
-- ---------------------------------------------------------------------------

create table public.currency_factors (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id) on delete cascade,  -- NULL = master
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  -- KES per 1 unit of the currency, landed: exchange rate, freight, duty and
  -- handling in one number (decision 2). 1 for KES itself.
  landed_factor numeric(14,6) not null check (landed_factor > 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid
);

comment on table public.currency_factors is
  'How a purchase price in a foreign currency becomes a landed price in KES:
   purchase × landed_factor, one number per currency. Master rows are the
   default; a company may hold its own row for a currency and it wins for it.';

create unique index currency_factors_unique
  on public.currency_factors (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), currency_code);

-- Master defaults. EUR is the NPP-192 workbook's figure: every catalogue part
-- is priced at exactly 200 KES per EUR (reference document §6.2).
insert into public.currency_factors (company_id, currency_code, landed_factor, note) values
  (null, 'KES', 1,   'Master currency'),
  (null, 'EUR', 200, 'Landed cost per EUR as used in NPP-192 (decision 2)');

-- Any other currency a company already works in gets a master row at that
-- company''s exchange rate, so its existing rows keep pricing.
insert into public.currency_factors (company_id, currency_code, landed_factor, note)
select distinct on (upper(currency_code)) null, upper(currency_code), exchange_rate,
       'Added by migration 0008 from an existing company rate'
from public.companies
where upper(currency_code) not in ('KES', 'EUR')
order by upper(currency_code), created_at;

create table public.currency_factor_history (
  id                 uuid primary key default gen_random_uuid(),
  currency_factor_id uuid not null references public.currency_factors(id) on delete cascade,
  old_landed_factor  numeric(14,6),
  new_landed_factor  numeric(14,6) not null,
  changed_by         uuid,
  changed_at         timestamptz not null default now()
);

create index currency_factor_history_idx on public.currency_factor_history (currency_factor_id, changed_at desc);

-- SECURITY DEFINER for the same reason as the other history tables: written by
-- the system as a side effect, never by a person.
create or replace function app.record_currency_factor_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.landed_factor is distinct from old.landed_factor then
    insert into public.currency_factor_history
      (currency_factor_id, old_landed_factor, new_landed_factor, changed_by)
    values (new.id, old.landed_factor, new.landed_factor, auth.uid());
  end if;
  return new;
end;
$$;

create trigger currency_factors_record_change
  after update on public.currency_factors
  for each row execute function app.record_currency_factor_change();

select app.add_audit_triggers('public.currency_factors');

-- The factors this company works with: its own row where set, else the master.
create or replace view public.v_currency_factors
with (security_invoker = true)
as
select
  master.currency_code,
  coalesce(own.landed_factor, master.landed_factor)   as landed_factor,
  case when own.id is null then 'master' else 'company' end as source,
  master.landed_factor                                as master_landed_factor,
  master.id                                           as master_id,
  own.id                                              as own_id
from public.companies c
join public.currency_factors master on master.company_id is null
left join public.currency_factors own
       on own.company_id = c.id and own.currency_code = master.currency_code
where c.id = app.current_company_id();

comment on view public.v_currency_factors is
  'Landed factor (KES per 1 unit) per currency for the signed-in company: its
   own where it has set one, the master default otherwise. Only currencies with
   a master row exist; the master admin adds currencies.';

-- ---------------------------------------------------------------------------
-- 2. Components: purchase price and currency, enclosure cubicles
-- ---------------------------------------------------------------------------

-- The 0003 view depends on the price column; it is rebuilt below with the new
-- pricing, so drop it first and give the purchase price four decimals (the
-- catalogue carries prices like 0.6305 EUR).
drop view public.v_component_prices;
alter table public.components rename column unit_price to purchase_price;
alter table public.components rename column currency_code to purchase_currency;
alter table public.components alter column purchase_price type numeric(14,4);
alter table public.components alter column purchase_currency set default 'KES';
alter table public.components
  add column is_enclosure_cubicle boolean not null default false,
  add column rating            text,
  add column poles             text,
  add column breaking_capacity text,
  add column frame_size        text;
comment on column public.components.rating is
  'Device rating as text (630A, 50KVAR, 1600A/5), parsed from the catalogue; informational.';
alter table public.component_price_history
  alter column old_price type numeric(14,4),
  alter column new_price type numeric(14,4);

comment on column public.components.purchase_price is
  'What the supplier charges, in purchase_currency. The KES landed price and the
   company price are computed in v_component_prices, never stored here.';
comment on column public.components.purchase_currency is
  'ISO code of the purchase price. Must have a master row in currency_factors.';
comment on column public.components.is_enclosure_cubicle is
  'Enclosure cubicle from the catalogue (decision 1). Priced like any component,
   then uplifted by the company''s enclosure uplift when it enters a costing.';

-- Before this migration a company''s own component was "priced in the company''s
-- currency" and the currency column was never set. Say so explicitly now.
update public.components comp
set purchase_currency = upper(co.currency_code)
from public.companies co
where comp.company_id = co.id and comp.pricing_mode = 'fixed';

-- A purchase currency the master has no factor for cannot be priced, so refuse
-- it at the door rather than showing a blank price later.
create or replace function app.check_component_currency()
returns trigger
language plpgsql
as $$
begin
  new.purchase_currency := upper(new.purchase_currency);
  if new.pricing_mode = 'fixed' and not exists (
      select 1 from public.currency_factors cf
      where cf.company_id is null and cf.currency_code = new.purchase_currency) then
    raise exception 'no exchange rate and landed factor for currency %; ask the master admin to add it',
      new.purchase_currency;
  end if;
  return new;
end;
$$;

create trigger components_check_currency
  before insert or update on public.components
  for each row execute function app.check_component_currency();

-- The price history keeps the currency too, so an old entry can be read.
alter table public.component_price_history add column purchase_currency char(3);

create or replace function app.record_component_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.purchase_price is distinct from old.purchase_price
      or new.purchase_currency is distinct from old.purchase_currency)
     and new.purchase_price is not null then
    insert into public.component_price_history
      (component_id, old_price, new_price, purchase_currency, changed_by, import_batch_id)
    values (new.id, old.purchase_price, new.purchase_price, new.purchase_currency,
            coalesce(auth.uid(), new.created_by), new.import_batch_id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Companies and costings: the enclosure uplift
-- ---------------------------------------------------------------------------

alter table public.companies add column enclosure_uplift_pct numeric(6,3) not null default 0
  check (enclosure_uplift_pct >= 0 and enclosure_uplift_pct < 1000);
comment on column public.companies.enclosure_uplift_pct is
  'Percentage added to catalogue cubicle prices for fabrication and finishing
   (decision 1). Set by the company; frozen into each costing.';

alter table public.costings add column enclosure_uplift_pct numeric(6,3) not null default 0;

alter table public.costing_items
  add column purchase_price       numeric(14,4),
  add column purchase_currency    char(3),
  add column landed_factor        numeric(14,6),
  add column uplift_pct           numeric(6,3);

comment on column public.costing_items.purchase_price is
  'Frozen supplier price in purchase_currency; times landed_factor it is
   master_price_kes.';
comment on column public.costing_items.uplift_pct is
  'Enclosure uplift applied to this line (cubicles only), frozen.';

-- ---------------------------------------------------------------------------
-- 3b. Material rates carry a currency: copper is 15 EUR per kg (decision 3)
-- ---------------------------------------------------------------------------

-- The 0003 view depends on the rate column; rebuilt below.
drop view public.v_material_rates;
alter table public.material_rates add column currency_code char(3) not null default 'KES';
alter table public.material_rates alter column rate type numeric(14,4);
alter table public.material_rate_history
  alter column old_rate type numeric(14,4),
  alter column new_rate type numeric(14,4);
comment on column public.material_rates.currency_code is
  'Currency of the rate. The landed factor for that currency turns it into
   KES per kg; 15 EUR × 200 = 3,000 KES.';
update public.material_rates set rate = 15, currency_code = 'EUR'
where company_id is null and code = 'copper_busbar';

create view public.v_material_rates
with (security_invoker = true)
as
select
  coalesce(own.code, master.code)                                    as code,
  coalesce(own.name, master.name)                                    as name,
  coalesce(own.unit, master.unit)                                    as unit,
  -- What this company pays per kilogram in its own currency: its own row, or
  -- the master rate landed into KES and converted.
  round(coalesce(own.rate * ocf.landed_factor, master.rate * mcf.landed_factor)
        / nullif(c.exchange_rate, 0), 4)                             as rate,
  case when own.id is null then 'master' else 'company' end          as source,
  round(master.rate * mcf.landed_factor, 2)                          as master_rate_kes,
  round(coalesce(own.rate * ocf.landed_factor, master.rate * mcf.landed_factor), 2) as kes_per_kg,
  coalesce(own.rate, master.rate)                                    as rate_entered,
  coalesce(own.currency_code, master.currency_code)                  as currency_code,
  master.rate                                                        as master_rate,
  master.currency_code                                               as master_currency
from public.companies c
join public.material_rates master on master.company_id is null
left join public.material_rates own
       on own.company_id = c.id and own.code = master.code
left join lateral (
  select f.landed_factor from public.currency_factors f
  where f.currency_code = master.currency_code and (f.company_id = c.id or f.company_id is null)
  order by f.company_id nulls last limit 1
) mcf on true
left join lateral (
  select f.landed_factor from public.currency_factors f
  where f.currency_code = own.currency_code and (f.company_id = c.id or f.company_id is null)
  order by f.company_id nulls last limit 1
) ocf on true
where c.id = app.current_company_id();

comment on view public.v_material_rates is
  'Material rates for the signed-in company: rate is what it pays per kg in its
   currency; kes_per_kg the landed KES figure; rate_entered and currency_code
   the row as typed (15 EUR).';
grant select on public.v_material_rates to authenticated;  -- the drop above took the 0003 grant with it

-- ---------------------------------------------------------------------------
-- 4. The price view
-- ---------------------------------------------------------------------------

create view public.v_component_prices
with (security_invoker = true)
as
select
  comp.id,
  comp.company_id,
  comp.category_code,
  cat.name                as category_name,
  comp.code,
  comp.name,
  comp.description,
  comp.unit,
  comp.manufacturer,
  comp.part_number,
  comp.pricing_mode,
  comp.weight_per_unit,
  comp.material_rate_code,
  comp.is_active,
  comp.purchase_price     as raw_price,
  case
    -- Priced by weight: kilograms times whatever this company pays per kilogram.
    when comp.pricing_mode = 'weight_rate'
      then round(comp.weight_per_unit * mr.rate, 2)
    -- A company's own component: landed into KES, then into its currency. No discount.
    when comp.company_id is not null
      then round(comp.purchase_price * cf.landed_factor / nullif(co.exchange_rate, 0), 2)
    -- Master component: landed into KES, discounted, then into the company currency.
    else round(comp.purchase_price * cf.landed_factor
               * (1 - co.discount_pct / 100) / nullif(co.exchange_rate, 0), 2)
  end                     as unit_price,
  co.currency_code,
  co.currency_label,
  case when comp.company_id is null then 'master' else 'company' end as source,
  comp.purchase_currency,
  cf.landed_factor,
  case when comp.pricing_mode = 'fixed'
       then round(comp.purchase_price * cf.landed_factor, 2) end as landed_price_kes,
  comp.rating,
  comp.poles,
  comp.is_enclosure_cubicle
from public.components comp
join public.component_categories cat on cat.code = comp.category_code
join public.companies co on co.id = app.current_company_id()
left join public.v_material_rates mr on mr.code = comp.material_rate_code
left join lateral (
  -- The company's own factor row for this currency if it has one, else the master's.
  select f.landed_factor
  from public.currency_factors f
  where f.currency_code = comp.purchase_currency
    and (f.company_id = co.id or f.company_id is null)
  order by f.company_id nulls last
  limit 1
) cf on true;

comment on view public.v_component_prices is
  'Every component the signed-in company may use, priced as it would pay:
   purchase price × the currency''s landed factor gives landed_price_kes; the
   company discount (master rows only) and the company currency follow.
   raw_price is the purchase price in purchase_currency, up to four decimals.';
grant select on public.v_component_prices to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Costing functions: freeze the new workings, apply the uplift
-- ---------------------------------------------------------------------------

create or replace function app.create_costing(title text, notes text default null, enquiry uuid default null)
returns public.costings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company uuid := app.current_company_id();
  co public.companies;
  new_costing public.costings;
begin
  if target_company is null then raise exception 'no company for the signed-in user'; end if;
  if not app.can_edit_costings() then
    raise exception 'you need the costing engineer or approver role to create a costing';
  end if;
  if enquiry is not null and not exists (
    select 1 from public.enquiries where id = enquiry and company_id = target_company) then
    raise exception 'that enquiry is not one of yours';
  end if;

  select * into co from public.companies where id = target_company;

  insert into public.costings (
    company_id, enquiry_id, costing_no, family_id, title, notes,
    currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, price_rounding_step, tax_pct,
    enclosure_uplift_pct, created_by)
  values (
    target_company, enquiry, app.next_number('costing'), gen_random_uuid(), title, notes,
    co.currency_code, co.currency_label, co.exchange_rate, co.discount_pct,
    co.material_margin_pct, co.labour_margin_pct, co.price_rounding_step, co.tax_pct,
    co.enclosure_uplift_pct, auth.uid())
  returning * into new_costing;

  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, target_company, pt.code,
         coalesce(own.hourly_rate, master.hourly_rate / nullif(co.exchange_rate, 0), 0)
  from public.process_types pt
  left join public.labour_rates own    on own.company_id = target_company and own.process_type = pt.code
  left join public.labour_rates master on master.company_id is null and master.process_type = pt.code;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (new_costing.id, target_company, auth.uid(), 'created',
          jsonb_build_object('costing_no', new_costing.costing_no, 'enquiry_id', enquiry));

  return new_costing;
end;
$$;

create or replace function app.add_assembly_to_costing(
  target_panel_id uuid,
  source_assembly uuid,
  qty numeric default 1)
returns uuid
language plpgsql
as $$
declare
  target_costing uuid;
  target_company uuid;
  new_line uuid;
  a public.assemblies;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;

  if target_costing is null then
    raise exception 'no such panel';
  end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select * into a from public.assemblies where id = source_assembly;
  if a is null then
    raise exception 'no such assembly';
  end if;

  insert into public.costing_assemblies
    (costing_id, panel_id, company_id, source_assembly_id, code, name, quantity, created_by,
     sort_order)
  values (target_costing, target_panel_id, target_company, a.id, a.code, a.name, qty, auth.uid(),
          coalesce((select max(sort_order) + 1 from public.costing_assemblies
                    where panel_id = target_panel_id), 0))
  returning id into new_line;

  -- Material, priced as this company would pay today, with every working kept:
  -- purchase price and currency, the factor that landed it, the discount, the
  -- company rate, and for a cubicle the uplift.
  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     purchase_price, purchase_currency, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, sort_order, created_by)
  select
    target_costing, new_line, target_company, p.id, p.code, p.name,
    p.category_code, p.unit, p.manufacturer, p.part_number, ac.quantity, p.pricing_mode,
    case when p.pricing_mode = 'fixed' then p.raw_price end,
    case when p.pricing_mode = 'fixed' then p.purchase_currency end,
    case when p.pricing_mode = 'fixed' then p.landed_factor end,
    case when p.company_id is null and p.pricing_mode = 'fixed' then p.landed_price_kes end,
    case when p.company_id is null and p.pricing_mode = 'fixed' then c.discount_pct end,
    case when p.pricing_mode = 'fixed' then c.exchange_rate end,
    p.weight_per_unit,
    case when p.pricing_mode = 'weight_rate'
         then round(p.unit_price / nullif(p.weight_per_unit, 0), 2) end,
    case when p.is_enclosure_cubicle then c.enclosure_uplift_pct end,
    case when p.is_enclosure_cubicle
         then round(p.unit_price * (1 + c.enclosure_uplift_pct / 100), 2)
         else p.unit_price end,
    ac.sort_order, auth.uid()
  from public.assembly_components ac
  join public.v_component_prices p on p.id = ac.component_id
  join public.costings c on c.id = target_costing
  where ac.assembly_id = source_assembly;

  -- Labour, at the hours this company plans and the rates this costing froze.
  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
     source, hourly_rate, created_by)
  select target_costing, new_line, target_company, h.process_type, h.effective_hours,
         h.effective_hours, h.source, coalesce(r.hourly_rate, 0), auth.uid()
  from public.v_assembly_hours h
  left join public.costing_labour_rates r
         on r.costing_id = target_costing and r.process_type = h.process_type
  where h.assembly_id = source_assembly
    and h.effective_hours > 0;

  return new_line;
end;
$$;

comment on function app.add_assembly_to_costing(uuid, uuid, numeric) is
  'Copies an assembly into a panel, freezing its prices, factors, uplift and hours.';

-- ---------------------------------------------------------------------------
-- 6. Row-level security and grants, the library shape
-- ---------------------------------------------------------------------------

alter table public.currency_factors         enable row level security;
alter table public.currency_factor_history  enable row level security;

create policy currency_factors_read on public.currency_factors
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy currency_factors_write_master on public.currency_factors
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy currency_factors_write_own on public.currency_factors
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy currency_factor_history_read on public.currency_factor_history
  for select to authenticated
  using (exists (select 1 from public.currency_factors f
                 where f.id = currency_factor_id
                   and (f.company_id is null or f.company_id = app.current_company_id()
                        or app.is_master_admin())));

grant select, insert, update, delete on public.currency_factors to authenticated;
grant select on public.currency_factor_history to authenticated;
grant select on public.v_currency_factors to authenticated;
