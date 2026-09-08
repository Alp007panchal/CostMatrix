-- 0007  CRM, phase 1: customers, contacts, projects, enquiries, follow-ups.
--
-- Single-entry master data: a customer is typed once and chosen from a list
-- everywhere else. Every child row carries the company and points at its
-- customer through a composite key, so a contact can never belong to a
-- customer of another company.

create type public.enquiry_status as enum ('open', 'quoted', 'won', 'lost', 'closed');

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  address     text,
  city        text,
  country     text default 'Kenya',
  tax_pin     text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (id, company_id)
);

create index customers_company_idx on public.customers (company_id, name);

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  name        text not null check (length(btrim(name)) > 0),
  email       text,
  phone       text,
  job_title   text,
  is_primary  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id) on delete cascade
);

create index contacts_customer_idx on public.contacts (customer_id);

create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  customer_id   uuid not null,
  name          text not null check (length(btrim(name)) > 0),
  site_location text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id) on delete cascade
);

create index projects_customer_idx on public.projects (customer_id);

create table public.enquiries (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  enquiry_no    text not null,
  customer_id   uuid not null,
  contact_id    uuid,
  project_id    uuid,
  received_on   date not null default current_date,
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  source        text,
  status        public.enquiry_status not null default 'open',
  stage         text,                       -- reserved for the pipeline view
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  unique (company_id, enquiry_no),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers(id, company_id) on delete restrict,
  foreign key (contact_id, company_id)  references public.contacts(id, company_id)  on delete set null,
  foreign key (project_id, company_id)  references public.projects(id, company_id)  on delete set null
);

comment on column public.enquiries.stage is
  'Reserved for the sales pipeline view in a later phase; unused in release 1.';

create index enquiries_company_idx on public.enquiries (company_id, received_on desc);

create table public.quotation_followups (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  company_id   uuid not null references public.companies(id) on delete cascade,
  due_on       date not null,
  note         text,
  assigned_to  uuid references public.profiles(id) on delete set null,
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid
);

create index followups_due_idx on public.quotation_followups (company_id, done_at, due_on);

-- Links from what already exists.
alter table public.costings   add column enquiry_id  uuid references public.enquiries(id) on delete set null;
alter table public.quotations add column customer_id uuid references public.customers(id) on delete set null;
alter table public.quotations add column contact_id  uuid references public.contacts(id)  on delete set null;

create index costings_enquiry_idx on public.costings (enquiry_id);

select app.add_audit_triggers('public.customers');
select app.add_audit_triggers('public.contacts');
select app.add_audit_triggers('public.projects');
select app.add_audit_triggers('public.enquiries');
select app.add_audit_triggers('public.quotation_followups');

-- ---------------------------------------------------------------------------
-- 2. Functions
-- ---------------------------------------------------------------------------

-- Logs an enquiry with its number. The only way to insert one.
create or replace function app.create_enquiry(input jsonb)
returns public.enquiries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company uuid := app.current_company_id();
  e public.enquiries;
begin
  if target_company is null then raise exception 'no company for the signed-in user'; end if;
  if not app.can_edit_costings() then raise exception 'you may not log enquiries'; end if;
  if coalesce(btrim(input->>'title'), '') = '' then raise exception 'an enquiry needs a title'; end if;
  if not exists (select 1 from public.customers where id = (input->>'customer_id')::uuid and company_id = target_company) then
    raise exception 'choose a customer of your own company';
  end if;

  insert into public.enquiries (
    company_id, enquiry_no, customer_id, contact_id, project_id, received_on,
    title, description, source, owner_user_id, created_by)
  values (
    target_company, app.next_number('enquiry'), (input->>'customer_id')::uuid,
    nullif(input->>'contact_id', '')::uuid, nullif(input->>'project_id', '')::uuid,
    coalesce((input->>'received_on')::date, current_date),
    btrim(input->>'title'), input->>'description', input->>'source', auth.uid(), auth.uid())
  returning * into e;
  return e;
end;
$$;

create or replace function public.create_enquiry(input jsonb)
returns public.enquiries language sql
as $$ select app.create_enquiry(input) $$;

-- create_costing gains an optional enquiry. The two-argument versions are
-- dropped rather than overloaded, so the API call stays unambiguous.
drop function public.create_costing(text, text);
drop function app.create_costing(text, text);

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
    material_margin_pct, labour_margin_pct, price_rounding_step, tax_pct, created_by)
  values (
    target_company, enquiry, app.next_number('costing'), gen_random_uuid(), title, notes,
    co.currency_code, co.currency_label, co.exchange_rate, co.discount_pct,
    co.material_margin_pct, co.labour_margin_pct, co.price_rounding_step, co.tax_pct, auth.uid())
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

create or replace function public.create_costing(title text, notes text default null, enquiry uuid default null)
returns public.costings language sql
as $$ select app.create_costing(title, notes, enquiry) $$;

-- A revision inherits the enquiry.
create or replace function app.copy_enquiry_to_revision()
returns trigger language plpgsql as $$
begin
  if new.previous_revision_id is not null and new.enquiry_id is null then
    select enquiry_id into new.enquiry_id from public.costings where id = new.previous_revision_id;
  end if;
  return new;
end;
$$;
create trigger costings_copy_enquiry before insert on public.costings
  for each row execute function app.copy_enquiry_to_revision();

-- release_quotation: also record which customer record and contact, when given.
create or replace function app.release_quotation(target_costing uuid, pdf_path text, texts jsonb)
returns public.quotations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c   public.costings;
  co  public.companies;
  cs  public.company_settings;
  seq integer;
  seq_year integer;
  reference text;
  q public.quotations;
  cust uuid := nullif(texts->>'customer_id', '')::uuid;
  cont uuid := nullif(texts->>'contact_id', '')::uuid;
begin
  select * into c from public.costings where id = target_costing and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if not app.has_role('approver') then raise exception 'only an approver may release a quotation'; end if;
  if c.status <> 'approved' then raise exception 'only an approved costing can be quoted'; end if;
  if not c.is_current then raise exception 'quote the current revision, not an older one'; end if;
  if exists (select 1 from public.quotations where costing_id = target_costing) then
    raise exception 'this revision has already been quoted';
  end if;
  if pdf_path is null or length(btrim(pdf_path)) = 0 then
    raise exception 'no PDF was stored, so nothing can be released';
  end if;
  if coalesce(btrim(texts->>'customer_name'), '') = '' then
    raise exception 'the quotation needs a customer name';
  end if;
  if cust is not null and not exists (select 1 from public.customers where id = cust and company_id = c.company_id) then
    raise exception 'that customer is not one of yours';
  end if;
  if cont is not null and not exists (select 1 from public.contacts where id = cont and company_id = c.company_id) then
    raise exception 'that contact is not one of yours';
  end if;

  select * into co from public.companies where id = c.company_id;
  select * into cs from public.company_settings where company_id = c.company_id;

  select f.quotation_seq, f.quotation_seq_year into seq, seq_year
  from public.costings f where f.family_id = c.family_id and f.quotation_seq is not null limit 1;
  if seq is null then
    seq := app.next_sequence('quotation', co.quotation_no_includes_year);
    seq_year := case when co.quotation_no_includes_year then extract(year from now())::integer else 0 end;
  end if;
  update public.costings set quotation_seq = seq, quotation_seq_year = seq_year where id = target_costing;

  reference := co.quotation_prefix
            || case when seq_year > 0 then '-' || seq_year else '' end
            || '-' || lpad(seq::text, 4, '0') || '-REV' || c.revision_no;

  insert into public.quotations (
    company_id, costing_id, reference_no, customer_id, contact_id,
    customer_name, customer_address, client_snapshot,
    subject, salutation, intro_text, closing_text, notes_on_offer, terms,
    signatory_name, signatory_email, letterhead_snapshot, pdf_path, released_by, created_by)
  values (
    c.company_id, target_costing, reference, cust, cont,
    btrim(texts->>'customer_name'), texts->>'customer_address', texts->'client',
    coalesce(nullif(texts->>'subject', ''), 'QUOTATION FOR ' || upper(c.title)),
    coalesce(nullif(texts->>'salutation', ''), cs.salutation),
    coalesce(nullif(texts->>'intro_text', ''), cs.intro_text),
    coalesce(nullif(texts->>'closing_text', ''), cs.closing_text),
    coalesce(texts->>'notes_on_offer', cs.default_notes_on_offer),
    coalesce(texts->'terms', jsonb_build_object(
      'scope_of_supply', cs.scope_of_supply,
      'validity', format('This offer is open for acceptance for %s days from the date hereof; thereafter subject to confirmation.', cs.validity_days),
      'payment', cs.payment_terms, 'delivery_terms', cs.delivery_terms, 'delivery_timelines', cs.delivery_timelines)),
    coalesce(nullif(texts->>'signatory_name', ''), cs.signatory_name),
    coalesce(nullif(texts->>'signatory_email', ''), cs.signatory_email),
    jsonb_build_object('company_name', co.name, 'po_box', cs.po_box, 'street_address', cs.street_address,
      'phones', cs.phones, 'email', cs.email, 'tax_pin', co.tax_pin, 'logo_path', co.logo_path,
      'currency_label', co.currency_label),
    pdf_path, auth.uid(), auth.uid())
  returning * into q;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target_costing, c.company_id, auth.uid(), 'quotation released',
          jsonb_build_object('reference_no', reference, 'quotation_id', q.id));
  return q;
end;
$$;

-- set_quotation_status: the enquiry follows the quotation.
create or replace function app.set_quotation_status(target uuid, new_status public.quotation_status, reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q public.quotations;
  linked_enquiry uuid;
begin
  select * into q from public.quotations where id = target and company_id = app.current_company_id();
  if q is null then raise exception 'no such quotation'; end if;
  if not app.can_edit_costings() then raise exception 'you may not change quotation status'; end if;

  if new_status = 'released' then raise exception 'a quotation cannot go back to released';
  elsif new_status = 'sent' and q.status <> 'released' then raise exception 'only a released quotation can be marked sent';
  elsif new_status in ('won', 'lost') and q.status not in ('released', 'sent') then raise exception 'this quotation has already been decided';
  end if;
  if new_status = 'lost' and coalesce(btrim(reason), '') = '' then raise exception 'say why it was lost'; end if;

  update public.quotations
     set status = new_status,
         sent_at = case when new_status = 'sent' then now() else sent_at end,
         decided_at = case when new_status in ('won', 'lost') then now() else decided_at end,
         lost_reason = case when new_status = 'lost' then btrim(reason) else lost_reason end
   where id = target;

  select enquiry_id into linked_enquiry from public.costings where id = q.costing_id;
  if linked_enquiry is not null then
    if new_status = 'sent' then
      update public.enquiries set status = 'quoted' where id = linked_enquiry and status = 'open';
    elsif new_status in ('won', 'lost') then
      update public.enquiries set status = new_status::text::public.enquiry_status where id = linked_enquiry;
    end if;
  end if;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (q.costing_id, q.company_id, auth.uid(), 'quotation ' || new_status,
          case when new_status = 'lost' then jsonb_build_object('reason', btrim(reason)) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Row-level security and grants
-- ---------------------------------------------------------------------------

alter table public.customers            enable row level security;
alter table public.contacts             enable row level security;
alter table public.projects             enable row level security;
alter table public.enquiries            enable row level security;
alter table public.quotation_followups  enable row level security;

create policy customers_read on public.customers for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy customers_write on public.customers for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

create policy contacts_read on public.contacts for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy contacts_write on public.contacts for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

create policy projects_read on public.projects for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy projects_write on public.projects for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

-- Enquiries are inserted through create_enquiry, which issues the number.
create policy enquiries_read on public.enquiries for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy enquiries_update on public.enquiries for update to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

create policy followups_read on public.quotation_followups for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());
create policy followups_write on public.quotation_followups for all to authenticated
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

grant select, insert, update, delete on public.customers, public.contacts, public.projects, public.quotation_followups to authenticated;
grant select, update on public.enquiries to authenticated;
grant execute on function app.create_enquiry(jsonb) to authenticated;
grant execute on function public.create_enquiry(jsonb) to authenticated;
grant execute on function app.create_costing(text, text, uuid) to authenticated;
grant execute on function public.create_costing(text, text, uuid) to authenticated;
revoke execute on all functions in schema public from anon;
