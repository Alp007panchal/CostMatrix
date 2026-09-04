-- 0004  Costings: the thing the app exists for.
--
-- A costing holds panels; a panel holds assemblies; an assembly holds material
-- and labour. Everything is copied in at the moment it is used and never
-- changes afterwards, so an approved costing means the same thing next year as
-- it did the day it was approved.
--
-- Every child row carries both its parent and its costing, tied together by a
-- composite foreign key, so a row cannot drift into another costing and the
-- security policies can be simple.

create type public.costing_status as enum ('draft', 'submitted', 'approved');

-- ---------------------------------------------------------------------------
-- 1. The costing
-- ---------------------------------------------------------------------------

create table public.costings (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete restrict,

  costing_no            text not null,
  revision_no           integer not null default 0 check (revision_no >= 0),
  family_id             uuid not null,          -- shared by every revision
  previous_revision_id  uuid references public.costings(id),
  is_current            boolean not null default true,

  title                 text not null check (length(btrim(title)) > 0),
  notes                 text,
  status                public.costing_status not null default 'draft',

  -- Frozen when the costing is created. Later changes to the company or the
  -- master library never reach back into it.
  currency_code         char(3) not null,
  currency_label        text not null,
  exchange_rate         numeric(14,6) not null,
  discount_pct          numeric(6,3) not null,
  material_margin_pct   numeric(6,3) not null,
  labour_margin_pct     numeric(6,3) not null,
  negotiation_margin_pct numeric(6,3) not null default 0
    check (negotiation_margin_pct >= 0 and negotiation_margin_pct < 100),
  price_rounding_step   numeric(14,2) not null,
  tax_pct               numeric(6,3) not null,

  submitted_by          uuid, submitted_at timestamptz,
  approved_by           uuid, approved_at  timestamptz,
  returned_by           uuid, returned_at  timestamptz,
  return_comment        text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,

  unique (company_id, costing_no, revision_no),
  unique (id, company_id)
);

comment on table public.costings is
  'One priced job. Revisions share a family_id and a costing_no, and differ by
   revision_no; exactly one revision of a family is current.';
comment on column public.costings.is_current is
  'Only the current revision may be edited or quoted. Older ones are the record
   of what was agreed at the time.';

create index costings_company_idx on public.costings (company_id, status);
create unique index costings_one_current_per_family
  on public.costings (family_id) where is_current;

-- The company's labour rates as they stood when the costing was created.
create table public.costing_labour_rates (
  id           uuid primary key default gen_random_uuid(),
  costing_id   uuid not null references public.costings(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  process_type text not null references public.process_types(code),
  hourly_rate  numeric(14,2) not null check (hourly_rate >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  unique (costing_id, process_type)
);

-- ---------------------------------------------------------------------------
-- 2. Panels, assemblies, material and labour
-- ---------------------------------------------------------------------------

create table public.costing_panels (
  id                    uuid primary key default gen_random_uuid(),
  costing_id            uuid not null references public.costings(id) on delete cascade,
  company_id            uuid not null references public.companies(id) on delete cascade,

  name                  text not null check (length(btrim(name)) > 0),
  tag                   text,
  option_label          text,          -- panels sharing a label form one priced option
  uom                   text not null default 'PC',
  quantity              numeric(12,3) not null default 1 check (quantity > 0),

  technical_description text,          -- printed in Annexure IV of the quotation
  enclosure_dimensions  text,
  sort_order            integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,

  unique (id, costing_id)
);

comment on column public.costing_panels.option_label is
  'When a job is offered two ways, panels carry "Option 1" or "Option 2" and
   the quotation prints a price schedule for each. Null is the base offer.';

create index costing_panels_costing_idx on public.costing_panels (costing_id);

create table public.costing_assemblies (
  id                 uuid primary key default gen_random_uuid(),
  costing_id         uuid not null references public.costings(id) on delete cascade,
  panel_id           uuid not null,
  company_id         uuid not null references public.companies(id) on delete cascade,

  source_assembly_id uuid references public.assemblies(id) on delete set null,
  code               text not null,     -- snapshots, so a renamed library row
  name               text not null,     -- does not rewrite history
  quantity           numeric(12,3) not null default 1 check (quantity > 0),
  sort_order         integer not null default 0,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,

  unique (id, costing_id),
  foreign key (panel_id, costing_id)
    references public.costing_panels(id, costing_id) on delete cascade
);

create index costing_assemblies_panel_idx on public.costing_assemblies (panel_id);

create table public.costing_items (
  id                  uuid primary key default gen_random_uuid(),
  costing_id          uuid not null references public.costings(id) on delete cascade,
  costing_assembly_id uuid not null,
  company_id          uuid not null references public.companies(id) on delete cascade,

  source_component_id uuid references public.components(id) on delete set null,
  code                text not null,
  name                text not null,
  category_code       text not null references public.component_categories(code),
  unit                text not null default 'pcs',
  manufacturer        text,
  part_number         text,

  quantity            numeric(12,3) not null check (quantity >= 0),

  -- How the price was arrived at, kept so an old costing can be explained.
  pricing_mode        public.pricing_mode not null default 'fixed',
  master_price_kes    numeric(14,2),
  discount_pct        numeric(6,3),
  exchange_rate       numeric(14,6),
  weight_per_unit     numeric(12,3),
  material_rate       numeric(14,2),
  unit_price          numeric(14,2) not null check (unit_price >= 0),

  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,

  foreign key (costing_assembly_id, costing_id)
    references public.costing_assemblies(id, costing_id) on delete cascade
);

comment on table public.costing_items is
  'Material inside one assembly of one panel. unit_price is frozen: the master
   price, the discount and the exchange rate that produced it are kept beside it
   so the number can always be explained.';

create index costing_items_assembly_idx on public.costing_items (costing_assembly_id);
create index costing_items_category_idx on public.costing_items (costing_id, category_code);

create table public.costing_labour (
  id                  uuid primary key default gen_random_uuid(),
  costing_id          uuid not null references public.costings(id) on delete cascade,
  costing_assembly_id uuid not null,
  company_id          uuid not null references public.companies(id) on delete cascade,

  process_type        text not null references public.process_types(code),
  hours               numeric(8,2) not null check (hours >= 0),
  source_hours        numeric(8,2),      -- what the library said, for comparison
  source              text not null default 'master',
  hourly_rate         numeric(14,2) not null check (hourly_rate >= 0),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,

  unique (costing_assembly_id, process_type),
  foreign key (costing_assembly_id, costing_id)
    references public.costing_assemblies(id, costing_id) on delete cascade
);

comment on column public.costing_labour.source_hours is
  'The library figure when this line was added. The engineer may change hours;
   showing both makes a deviation visible rather than silent.';

create table public.costing_history (
  id         uuid primary key default gen_random_uuid(),
  costing_id uuid not null references public.costings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid,
  action     text not null,
  details    jsonb,
  at         timestamptz not null default now()
);

comment on table public.costing_history is
  'Append-only. Written by the status functions, readable by the company, and
   editable by nobody at all.';

create index costing_history_costing_idx on public.costing_history (costing_id, at desc);

select app.add_audit_triggers('public.costings');
select app.add_audit_triggers('public.costing_labour_rates');
select app.add_audit_triggers('public.costing_panels');
select app.add_audit_triggers('public.costing_assemblies');
select app.add_audit_triggers('public.costing_items');
select app.add_audit_triggers('public.costing_labour');

-- ---------------------------------------------------------------------------
-- 3. The calculation
--
-- The whole formula, once, here. Screens, PDFs and exports all read these
-- views, which is what stops the numbers drifting apart the way they do
-- between spreadsheets.
--
-- Margins are applied by division, as the existing sheets do: a 20% margin on
-- a cost of 100 sells at 125. That keeps the percentages meaning what the
-- costing team already takes them to mean.
-- ---------------------------------------------------------------------------

create or replace view public.v_costing_assembly_totals
with (security_invoker = true)
as
select
  ca.id                    as costing_assembly_id,
  ca.costing_id,
  ca.panel_id,
  ca.code,
  ca.name,
  ca.quantity,
  coalesce(m.material, 0)                    as material_each,
  coalesce(l.labour, 0)                      as labour_each,
  coalesce(m.material, 0) * ca.quantity      as material_total,
  coalesce(l.labour, 0)   * ca.quantity      as labour_total,
  coalesce(l.hours, 0)                       as hours_each,
  coalesce(l.hours, 0)    * ca.quantity      as hours_total
from public.costing_assemblies ca
left join lateral (
  select sum(i.quantity * i.unit_price) as material
  from public.costing_items i
  where i.costing_assembly_id = ca.id
) m on true
left join lateral (
  select sum(cl.hours * cl.hourly_rate) as labour, sum(cl.hours) as hours
  from public.costing_labour cl
  where cl.costing_assembly_id = ca.id
) l on true;

comment on view public.v_costing_assembly_totals is
  'Material and labour for one assembly line: "each" is one of them, "total" is
   times the quantity of that assembly in the panel.';

-- The cost of building one of this panel, before any margin.
create or replace view public.v_costing_panel_costs
with (security_invoker = true)
as
select
  p.id                 as panel_id,
  p.costing_id,
  p.company_id,
  p.name,
  p.tag,
  p.option_label,
  p.uom,
  p.quantity,
  p.sort_order,
  coalesce(sum(t.material_total), 0) as material_cost,
  coalesce(sum(t.labour_total), 0)   as labour_cost,
  coalesce(sum(t.hours_total), 0)    as hours
from public.costing_panels p
left join public.v_costing_assembly_totals t on t.panel_id = p.id
group by p.id, p.costing_id, p.company_id, p.name, p.tag, p.option_label,
         p.uom, p.quantity, p.sort_order;

-- Cost turned into a selling price, panel by panel.
create or replace view public.v_costing_panel_prices
with (security_invoker = true)
as
select
  pc.panel_id,
  pc.costing_id,
  pc.company_id,
  pc.name,
  pc.tag,
  pc.option_label,
  pc.uom,
  pc.quantity,
  pc.sort_order,
  pc.material_cost,
  pc.labour_cost,
  pc.hours,
  round(pc.material_cost / (1 - c.material_margin_pct / 100), 2) as material_sell,
  round(pc.labour_cost   / (1 - c.labour_margin_pct   / 100), 2) as labour_sell,
  -- Rounded up to the company's step, so a price reads as a price and not as
  -- an arithmetic result. The costs underneath stay exact.
  ceil(
    ( pc.material_cost / (1 - c.material_margin_pct / 100)
    + pc.labour_cost   / (1 - c.labour_margin_pct   / 100)
    ) / (1 - c.negotiation_margin_pct / 100)
    / c.price_rounding_step
  ) * c.price_rounding_step                                      as unit_price,
  ceil(
    ( pc.material_cost / (1 - c.material_margin_pct / 100)
    + pc.labour_cost   / (1 - c.labour_margin_pct   / 100)
    ) / (1 - c.negotiation_margin_pct / 100)
    / c.price_rounding_step
  ) * c.price_rounding_step * pc.quantity                        as line_total
from public.v_costing_panel_costs pc
join public.costings c on c.id = pc.costing_id;

comment on view public.v_costing_panel_prices is
  'One row per panel, priced. This is what the quotation price schedule prints.';

-- Whole-costing totals, and the same again per option where a job is offered
-- more than one way.
create or replace view public.v_costing_totals
with (security_invoker = true)
as
select
  c.id                                  as costing_id,
  c.company_id,
  c.currency_code,
  c.currency_label,
  coalesce(sum(pp.material_cost * pp.quantity), 0) as material_cost,
  coalesce(sum(pp.labour_cost   * pp.quantity), 0) as labour_cost,
  coalesce(sum(pp.hours         * pp.quantity), 0) as hours,
  coalesce(sum(pp.line_total), 0)                  as subtotal,
  round(coalesce(sum(pp.line_total), 0) * c.tax_pct / 100, 2)     as tax,
  coalesce(sum(pp.line_total), 0)
    + round(coalesce(sum(pp.line_total), 0) * c.tax_pct / 100, 2) as grand_total
from public.costings c
left join public.v_costing_panel_prices pp on pp.costing_id = c.id
group by c.id, c.company_id, c.currency_code, c.currency_label, c.tax_pct;

create or replace view public.v_costing_option_totals
with (security_invoker = true)
as
select
  pp.costing_id,
  pp.company_id,
  coalesce(pp.option_label, '')                    as option_label,
  sum(pp.line_total)                               as subtotal,
  round(sum(pp.line_total) * c.tax_pct / 100, 2)   as tax,
  sum(pp.line_total) + round(sum(pp.line_total) * c.tax_pct / 100, 2) as grand_total
from public.v_costing_panel_prices pp
join public.costings c on c.id = pp.costing_id
group by pp.costing_id, pp.company_id, coalesce(pp.option_label, ''), c.tax_pct;

comment on view public.v_costing_option_totals is
  'A subtotal, VAT and total for each option the customer is offered.';

-- Every item flattened, with quantities multiplied through the assembly and
-- panel above it. The BOM exports read this.
create or replace view public.v_costing_items_by_category
with (security_invoker = true)
as
select
  i.costing_id,
  i.company_id,
  i.category_code,
  cat.name                            as category_name,
  i.code,
  i.name,
  i.manufacturer,
  i.part_number,
  i.unit,
  i.unit_price,
  p.option_label,
  sum(i.quantity * ca.quantity * p.quantity) as quantity,
  sum(i.quantity * ca.quantity * p.quantity * i.unit_price) as line_total
from public.costing_items i
join public.costing_assemblies ca on ca.id = i.costing_assembly_id
join public.costing_panels p on p.id = ca.panel_id
join public.component_categories cat on cat.code = i.category_code
group by i.costing_id, i.company_id, i.category_code, cat.name, i.code, i.name,
         i.manufacturer, i.part_number, i.unit, i.unit_price, p.option_label;

comment on view public.v_costing_items_by_category is
  'One row per distinct component in a costing, quantities multiplied through
   assembly and panel quantities. The four BOM exports filter this by category.';

-- ---------------------------------------------------------------------------
-- 4. Doing things to a costing
-- ---------------------------------------------------------------------------

-- Used by the policies below. A costing is open for editing only while it is
-- the current revision, still a draft, and belongs to the caller's company.
create or replace function app.costing_is_editable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.costings c
    where c.id = target
      and c.company_id = app.current_company_id()
      and c.status = 'draft'
      and c.is_current
  )
$$;

create or replace function app.can_edit_costings()
returns boolean
language sql
stable
as $$
  select app.has_role('costing_engineer') or app.has_role('approver')
$$;

-- Creates a costing, freezing everything about the company that affects a
-- price: its currency, rate, discount, margins, rounding, VAT and labour rates.
create or replace function app.create_costing(title text, notes text default null)
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
  if target_company is null then
    raise exception 'no company for the signed-in user';
  end if;
  if not app.can_edit_costings() then
    raise exception 'you need the costing engineer or approver role to create a costing';
  end if;

  select * into co from public.companies where id = target_company;

  insert into public.costings (
    company_id, costing_no, family_id, title, notes,
    currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, price_rounding_step, tax_pct, created_by)
  values (
    target_company, app.next_number('costing'), gen_random_uuid(), title, notes,
    co.currency_code, co.currency_label, co.exchange_rate, co.discount_pct,
    co.material_margin_pct, co.labour_margin_pct, co.price_rounding_step, co.tax_pct, auth.uid())
  returning * into new_costing;

  -- The company's hourly rates as they stand today, so a rate rise next month
  -- does not silently reprice this job.
  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, target_company, pt.code,
         coalesce(own.hourly_rate, master.hourly_rate / nullif(co.exchange_rate, 0), 0)
  from public.process_types pt
  left join public.labour_rates own    on own.company_id = target_company and own.process_type = pt.code
  left join public.labour_rates master on master.company_id is null and master.process_type = pt.code;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (new_costing.id, target_company, auth.uid(), 'created',
          jsonb_build_object('costing_no', new_costing.costing_no));

  return new_costing;
end;
$$;

comment on function app.create_costing(text, text) is
  'Creates a costing and freezes every company setting that affects a price.';

-- Copies an assembly into a panel: its material at today''s prices for this
-- company, and its hours at this costing''s frozen rates.
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

  -- Material, priced as this company would pay today, with the workings kept.
  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     unit_price, sort_order, created_by)
  select
    target_costing, new_line, target_company, p.id, p.code, p.name,
    p.category_code, p.unit, p.manufacturer, p.part_number, ac.quantity, p.pricing_mode,
    case when p.company_id is null and p.pricing_mode = 'fixed' then p.raw_price end,
    case when p.company_id is null and p.pricing_mode = 'fixed' then c.discount_pct end,
    case when p.company_id is null and p.pricing_mode = 'fixed' then c.exchange_rate end,
    p.weight_per_unit,
    case when p.pricing_mode = 'weight_rate'
         then round(p.unit_price / nullif(p.weight_per_unit, 0), 2) end,
    p.unit_price, ac.sort_order, auth.uid()
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
  'Copies an assembly into a panel, freezing its prices and hours into the costing.';

-- Status changes. Each checks the role and the current status, and writes to
-- the history, so the log cannot disagree with the costing.
create or replace function app.submit_costing(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.costings;
begin
  select * into c from public.costings where id = target and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if c.status <> 'draft' then raise exception 'only a draft can be submitted'; end if;
  if not app.can_edit_costings() then raise exception 'you may not submit costings'; end if;

  update public.costings
     set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action)
  values (target, c.company_id, auth.uid(), 'submitted');
end;
$$;

create or replace function app.approve_costing(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.costings;
begin
  select * into c from public.costings where id = target and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if c.status <> 'submitted' then raise exception 'only a submitted costing can be approved'; end if;
  if not app.has_role('approver') then
    raise exception 'only an approver may approve a costing';
  end if;

  update public.costings
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action)
  values (target, c.company_id, auth.uid(), 'approved');
end;
$$;

create or replace function app.return_costing(target uuid, comment text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare c public.costings;
begin
  select * into c from public.costings where id = target and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if c.status <> 'submitted' then raise exception 'only a submitted costing can be returned'; end if;
  if not app.has_role('approver') then
    raise exception 'only an approver may return a costing';
  end if;
  -- A costing handed back without a reason wastes the engineer's next hour.
  if comment is null or length(btrim(comment)) = 0 then
    raise exception 'say why you are returning it';
  end if;

  update public.costings
     set status = 'draft', returned_by = auth.uid(), returned_at = now(), return_comment = comment
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target, c.company_id, auth.uid(), 'returned to draft',
          jsonb_build_object('comment', comment));
end;
$$;

-- After approval, nothing changes: a change means a new revision, and the old
-- one stays exactly as it was approved.
create or replace function app.create_costing_revision(target uuid)
returns public.costings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_costing public.costings;
  new_costing public.costings;
begin
  select * into old_costing from public.costings
   where id = target and company_id = app.current_company_id();

  if old_costing is null then raise exception 'no such costing'; end if;
  if old_costing.status <> 'approved' then
    raise exception 'only an approved costing needs a revision; this one can still be edited';
  end if;
  if not old_costing.is_current then
    raise exception 'revise the current revision, not an older one';
  end if;
  if not app.can_edit_costings() then raise exception 'you may not revise costings'; end if;

  update public.costings set is_current = false where id = target;

  insert into public.costings (
    company_id, costing_no, revision_no, family_id, previous_revision_id, is_current,
    title, notes, status, currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
    tax_pct, created_by)
  select company_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, auth.uid()
  from public.costings where id = target
  returning * into new_costing;

  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, company_id, process_type, hourly_rate
  from public.costing_labour_rates where costing_id = target;

  -- Copy the whole tree, keeping a map from old row to new so the children
  -- land under the right parents.
  create temporary table copied_panels (old_id uuid, new_id uuid) on commit drop;
  create temporary table copied_assemblies (old_id uuid, new_id uuid) on commit drop;

  with inserted as (
    insert into public.costing_panels
      (costing_id, company_id, name, tag, option_label, uom, quantity,
       technical_description, enclosure_dimensions, sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, sort_order, auth.uid()
    from public.costing_panels where costing_id = target
    returning id, sort_order, name
  )
  insert into copied_panels (old_id, new_id)
  select o.id, i.id
  from inserted i
  join public.costing_panels o
    on o.costing_id = target and o.sort_order = i.sort_order and o.name = i.name;

  with inserted as (
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, source_assembly_id, code, name, quantity, sort_order, created_by)
    select new_costing.id, cp.new_id, ca.company_id, ca.source_assembly_id, ca.code, ca.name,
           ca.quantity, ca.sort_order, auth.uid()
    from public.costing_assemblies ca
    join copied_panels cp on cp.old_id = ca.panel_id
    where ca.costing_id = target
    returning id, panel_id, sort_order, code
  )
  insert into copied_assemblies (old_id, new_id)
  select o.id, i.id
  from inserted i
  join copied_panels cp on cp.new_id = i.panel_id
  join public.costing_assemblies o
    on o.costing_id = target and o.panel_id = cp.old_id
   and o.sort_order = i.sort_order and o.code = i.code;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     unit_price, sort_order, created_by)
  select new_costing.id, cav.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.unit_price, i.sort_order, auth.uid()
  from public.costing_items i
  join copied_assemblies cav on cav.old_id = i.costing_assembly_id
  where i.costing_id = target;

  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
     source, hourly_rate, created_by)
  select new_costing.id, cav.new_id, l.company_id, l.process_type, l.hours, l.source_hours,
         l.source, l.hourly_rate, auth.uid()
  from public.costing_labour l
  join copied_assemblies cav on cav.old_id = l.costing_assembly_id
  where l.costing_id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (new_costing.id, new_costing.company_id, auth.uid(), 'revision created',
          jsonb_build_object('revision_no', new_costing.revision_no,
                             'from_costing_id', target));

  return new_costing;
end;
$$;

comment on function app.create_costing_revision(uuid) is
  'Deep-copies an approved costing into a new draft revision and makes it the
   current one. The approved revision stays exactly as it was.';

-- ---------------------------------------------------------------------------
-- 5. Row-level security
--
-- Reading: your own company, or anything if you are the master admin.
-- Writing: your own company, only while the costing is an editable draft, and
-- only with a role that builds costings. Status changes go through the
-- functions above, which is why there is no update policy on the status.
-- ---------------------------------------------------------------------------

alter table public.costings             enable row level security;
alter table public.costing_labour_rates enable row level security;
alter table public.costing_panels       enable row level security;
alter table public.costing_assemblies   enable row level security;
alter table public.costing_items        enable row level security;
alter table public.costing_labour       enable row level security;
alter table public.costing_history      enable row level security;

create policy costings_read on public.costings
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

-- Created through app.create_costing, which issues the number and freezes the
-- settings; a bare insert would produce a costing with neither.
create policy costings_update on public.costings
  for update to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings()
         and status = 'draft' and is_current)
  with check (company_id = app.current_company_id() and app.can_edit_costings());

create policy costing_labour_rates_read on public.costing_labour_rates
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

-- The four child tables share one shape.
create policy costing_panels_read on public.costing_panels
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy costing_panels_write on public.costing_panels
  for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings()
         and app.costing_is_editable(costing_id))
  with check (company_id = app.current_company_id() and app.can_edit_costings()
              and app.costing_is_editable(costing_id));

create policy costing_assemblies_read on public.costing_assemblies
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy costing_assemblies_write on public.costing_assemblies
  for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings()
         and app.costing_is_editable(costing_id))
  with check (company_id = app.current_company_id() and app.can_edit_costings()
              and app.costing_is_editable(costing_id));

create policy costing_items_read on public.costing_items
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy costing_items_write on public.costing_items
  for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings()
         and app.costing_is_editable(costing_id))
  with check (company_id = app.current_company_id() and app.can_edit_costings()
              and app.costing_is_editable(costing_id));

create policy costing_labour_read on public.costing_labour
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy costing_labour_write on public.costing_labour
  for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings()
         and app.costing_is_editable(costing_id))
  with check (company_id = app.current_company_id() and app.can_edit_costings()
              and app.costing_is_editable(costing_id));

-- Read-only to everyone. The functions write it, and they are security definer.
create policy costing_history_read on public.costing_history
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------

grant select, update on public.costings to authenticated;
grant select on public.costing_labour_rates to authenticated;
grant select, insert, update, delete on
  public.costing_panels, public.costing_assemblies, public.costing_items, public.costing_labour
to authenticated;
grant select on public.costing_history to authenticated;

grant select on
  public.v_costing_assembly_totals, public.v_costing_panel_costs,
  public.v_costing_panel_prices, public.v_costing_totals,
  public.v_costing_option_totals, public.v_costing_items_by_category
to authenticated;

grant execute on function app.costing_is_editable(uuid)              to authenticated;
grant execute on function app.can_edit_costings()                    to authenticated;
grant execute on function app.create_costing(text, text)             to authenticated;
grant execute on function app.add_assembly_to_costing(uuid, uuid, numeric) to authenticated;
grant execute on function app.submit_costing(uuid)                   to authenticated;
grant execute on function app.approve_costing(uuid)                  to authenticated;
grant execute on function app.return_costing(uuid, text)             to authenticated;
grant execute on function app.create_costing_revision(uuid)          to authenticated;
