-- 0002  Tenancy: companies, the people in them, their roles, and the row-level
--       security that keeps one company's data invisible to another.
--
-- Read this file as three parts: the tables, the security predicates, and the
-- policies. The policies are the product's promise to its customers, so they
-- are written out per table rather than generated, and every one is covered by
-- a test in supabase/tests.

-- ---------------------------------------------------------------------------
-- 1. Types
-- ---------------------------------------------------------------------------

create type public.company_kind as enum ('in_house', 'external', 'buyer');
create type public.user_role    as enum ('company_admin', 'costing_engineer', 'approver');
create type public.counter_kind as enum ('costing', 'quotation', 'enquiry');

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table public.companies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) > 0),
  kind                  public.company_kind not null default 'external',

  -- Money. exchange_rate is KES per 1 unit of currency_code: 1 for a KES
  -- company, about 130 for a USD one.
  currency_code         char(3) not null default 'KES',
  currency_label        text    not null default 'KES',   -- printed on quotations ("KSH")
  exchange_rate         numeric(14,6) not null default 1 check (exchange_rate > 0),

  -- Set by the master admin only; guarded by a trigger further down.
  discount_pct          numeric(6,3) not null default 0 check (discount_pct >= 0 and discount_pct < 100),

  -- Set by the company itself.
  material_margin_pct   numeric(6,3) not null default 0 check (material_margin_pct >= 0 and material_margin_pct < 100),
  labour_margin_pct     numeric(6,3) not null default 0 check (labour_margin_pct >= 0 and labour_margin_pct < 100),
  tax_pct               numeric(6,3) not null default 16 check (tax_pct >= 0 and tax_pct < 100),
  price_rounding_step   numeric(14,2) not null default 100 check (price_rounding_step > 0),

  quotation_prefix      text not null default 'QT' check (quotation_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  quotation_no_includes_year boolean not null default false,

  address               text,
  tax_pin               text,
  logo_path             text,
  is_active             boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid
);

comment on table public.companies is
  'One tenant. Every other tenant-owned row points at one of these.';
comment on column public.companies.exchange_rate is
  'KES per 1 unit of currency_code. 1 for a KES company.';
comment on column public.companies.discount_pct is
  'Set by the master admin only. Applied to master prices for this company.';

create table public.company_settings (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null unique references public.companies(id) on delete cascade,

  -- Letterhead, printed on every page of a quotation.
  po_box                text,
  street_address        text,
  phones                text,
  email                 text,

  -- Cover letter defaults, editable again per quotation.
  salutation            text not null default 'Dear Sir/Madam,',
  intro_text            text not null default 'We thank you for your enquiry for the above project, and are pleased to quote as follows:',
  closing_text          text not null default 'We trust that you will find our offer in line with your requirements and should you require any further information, please do not hesitate to contact the undersigned.',
  signatory_name        text,
  signatory_email       text,

  -- Annexure defaults.
  default_notes_on_offer text,
  scope_of_supply       text,
  validity_days         integer not null default 30 check (validity_days > 0),
  payment_terms         text,
  delivery_terms        text,
  delivery_timelines    text,

  bank_details          text,
  quotation_footer      text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid
);

comment on table public.company_settings is
  'One row per company: letterhead, quotation wording and commercial defaults.';

create table public.company_footer_logos (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  image_path            text not null,
  caption               text,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid
);

comment on table public.company_footer_logos is
  'Partner logos and certification marks printed as a strip in the quotation footer.';

create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  company_id            uuid not null references public.companies(id) on delete restrict,
  full_name             text not null check (length(btrim(full_name)) > 0),
  email                 text,
  is_master_admin       boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,

  -- Redundant given the primary key, but it lets user_roles carry a composite
  -- foreign key, so a role row cannot name a person from another company.
  unique (id, company_id)
);

comment on table public.profiles is
  'One row per signed-in person. A user belongs to exactly one company.';
comment on column public.profiles.is_active is
  'False stops the person signing in usefully: every security predicate ignores them.';

create index profiles_company_id_idx on public.profiles(company_id);

create table public.user_roles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null,
  company_id            uuid not null references public.companies(id) on delete cascade,
  role                  public.user_role not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  unique (user_id, role),

  -- The pair, not two separate references: an administrator cannot hand a role
  -- to somebody who belongs to a different company.
  foreign key (user_id, company_id)
    references public.profiles(id, company_id) on delete cascade
);

comment on table public.user_roles is
  'A person may hold several roles in their company; a small company is often all three.';

create index user_roles_user_id_idx on public.user_roles(user_id);

create table public.company_counters (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  kind                  public.counter_kind not null,
  year                  integer not null,          -- 0 when the number carries no year
  last_no               integer not null default 0 check (last_no >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  unique (company_id, kind, year)
);

comment on table public.company_counters is
  'Per company, per kind, per year sequence. Read and bumped only by app.next_number.';
comment on column public.company_counters.last_no is
  'The last number issued, so the next one is last_no + 1.';

-- ---------------------------------------------------------------------------
-- 3. Security predicates
--
-- SECURITY DEFINER on purpose: these read profiles and user_roles, which are
-- themselves protected by row-level security, and a policy that queried those
-- tables directly would call itself forever. Running as the owner side-steps
-- row-level security and ends the recursion. STABLE so Postgres calls them once
-- per statement rather than once per row.
-- ---------------------------------------------------------------------------

create or replace function app.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.company_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

comment on function app.current_company_id() is
  'The company of the signed-in user, or null when there is no active profile.';

create or replace function app.is_master_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_master_admin from public.profiles p where p.id = auth.uid() and p.is_active),
    false)
$$;

comment on function app.is_master_admin() is
  'True when the signed-in user owns the master library and the list of companies.';

create or replace function app.has_role(role_wanted public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and r.role = role_wanted and p.is_active)
$$;

comment on function app.has_role(public.user_role) is
  'True when the signed-in user holds this role in their own company.';

-- ---------------------------------------------------------------------------
-- 4. Number issuing
-- ---------------------------------------------------------------------------

create or replace function app.next_number(counter public.counter_kind, use_year boolean default true)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  company uuid := app.current_company_id();
  yr integer := case when use_year then extract(year from now())::integer else 0 end;
  seq integer;
  prefix text;
begin
  if company is null then
    raise exception 'no company for the signed-in user';
  end if;

  -- One row per company, kind and year, holding the last number issued. The
  -- insert and the returning clause are a single statement, so two people
  -- creating a costing at the same moment cannot be handed the same number:
  -- the second waits for the first to commit.
  insert into public.company_counters (company_id, kind, year, last_no)
  values (company, counter, yr, 1)
  on conflict (company_id, kind, year)
    do update set last_no = public.company_counters.last_no + 1, updated_at = now()
  returning last_no into seq;

  prefix := case counter
              when 'costing'   then 'CM'
              when 'enquiry'   then 'EN'
              when 'quotation' then (select c.quotation_prefix from public.companies c where c.id = company)
            end;

  return case
           when yr = 0 then format('%s-%s', prefix, lpad(seq::text, 4, '0'))
           else format('%s-%s-%s', prefix, yr, lpad(seq::text, 4, '0'))
         end;
end;
$$;

comment on function app.next_number(public.counter_kind, boolean) is
  'Issues the next number for the signed-in user''s company, e.g. CM-2026-0007.';

-- ---------------------------------------------------------------------------
-- 5. Guards
-- ---------------------------------------------------------------------------

create or replace function app.protect_company_columns()
returns trigger
language plpgsql
as $$
begin
  -- No signed-in user means a direct database connection: a migration, the
  -- bootstrap script or the service role. Those are trusted; the API always has
  -- a user. Same carve-out as app.protect_profile_columns.
  if auth.uid() is null then
    return new;
  end if;

  -- The discount is the master admin's commercial lever, not the company's.
  if new.discount_pct is distinct from old.discount_pct and not app.is_master_admin() then
    raise exception 'only the master admin may change a company discount';
  end if;
  if new.kind is distinct from old.kind and not app.is_master_admin() then
    raise exception 'only the master admin may change a company kind';
  end if;
  return new;
end;
$$;

create trigger companies_protect_columns
  before update on public.companies
  for each row execute function app.protect_company_columns();

-- Without this, the self-service clause in profiles_update would let anyone set
-- is_master_admin on their own row and read every company in the system, or move
-- themselves into another company. The policy decides which rows you may touch;
-- this decides which columns.
create or replace function app.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  -- No signed-in user means a direct database connection: a migration, the seed
  -- script or the service role. Those are trusted; the API always has a user.
  if auth.uid() is null then
    return new;
  end if;

  if new.is_master_admin is distinct from old.is_master_admin and not app.is_master_admin() then
    raise exception 'only the master admin may grant master admin';
  end if;

  if new.company_id is distinct from old.company_id and not app.is_master_admin() then
    raise exception 'only the master admin may move a person between companies';
  end if;

  if new.is_active is distinct from old.is_active
     and not (app.is_master_admin() or app.has_role('company_admin')) then
    raise exception 'only an administrator may activate or deactivate a person';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function app.protect_profile_columns();

-- A new company always has somewhere to put its quotation wording, so the
-- company admin finds a form to fill rather than an error.
create or replace function app.create_default_company_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_settings (company_id) values (new.id);
  return new;
end;
$$;

create trigger companies_create_settings
  after insert on public.companies
  for each row execute function app.create_default_company_settings();

select app.add_audit_triggers('public.companies');
select app.add_audit_triggers('public.company_settings');
select app.add_audit_triggers('public.company_footer_logos');
select app.add_audit_triggers('public.profiles');
select app.add_audit_triggers('public.user_roles');
select app.add_audit_triggers('public.company_counters');

-- ---------------------------------------------------------------------------
-- 6. Row-level security
--
-- The pattern, repeated per table:
--   read   own company, or anything if master admin
--   write  own company only, and only with the right role
-- The master admin deliberately has no write policy on a company's own
-- settings: support means looking, not editing someone's commercial text.
-- ---------------------------------------------------------------------------

alter table public.companies            enable row level security;
alter table public.company_settings     enable row level security;
alter table public.company_footer_logos enable row level security;
alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.company_counters     enable row level security;

-- companies ------------------------------------------------------------------
create policy companies_read on public.companies
  for select to authenticated
  using (id = app.current_company_id() or app.is_master_admin());

create policy companies_insert on public.companies
  for insert to authenticated
  with check (app.is_master_admin());

-- A company admin may edit its own company; the trigger above still blocks the
-- discount and the kind.
create policy companies_update on public.companies
  for update to authenticated
  using (app.is_master_admin() or (id = app.current_company_id() and app.has_role('company_admin')))
  with check (app.is_master_admin() or (id = app.current_company_id() and app.has_role('company_admin')));

create policy companies_delete on public.companies
  for delete to authenticated
  using (app.is_master_admin());

-- company_settings -----------------------------------------------------------
create policy company_settings_read on public.company_settings
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

create policy company_settings_write on public.company_settings
  for update to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

-- company_footer_logos -------------------------------------------------------
create policy company_footer_logos_read on public.company_footer_logos
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

create policy company_footer_logos_insert on public.company_footer_logos
  for insert to authenticated
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy company_footer_logos_update on public.company_footer_logos
  for update to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

create policy company_footer_logos_delete on public.company_footer_logos
  for delete to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'));

-- profiles -------------------------------------------------------------------
-- Everyone may read their colleagues, so a costing can show who submitted it.
create policy profiles_read on public.profiles
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

-- The master admin creates a new company's first administrator; after that a
-- company administers itself.
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (app.is_master_admin()
              or (company_id = app.current_company_id() and app.has_role('company_admin')));

-- The last clause lets people fix their own name. The column guard above stops
-- it from being a way to promote yourself or change companies.
create policy profiles_update on public.profiles
  for update to authenticated
  using (app.is_master_admin()
         or (company_id = app.current_company_id() and app.has_role('company_admin'))
         or id = auth.uid())
  with check (app.is_master_admin()
              or (company_id = app.current_company_id() and app.has_role('company_admin'))
              or id = auth.uid());

-- No delete policy. People are deactivated, never deleted: their name has to
-- stay attached to the costings they built.

-- user_roles -----------------------------------------------------------------
create policy user_roles_read on public.user_roles
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check (app.is_master_admin()
              or (company_id = app.current_company_id() and app.has_role('company_admin')));

create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using (app.is_master_admin()
         or (company_id = app.current_company_id() and app.has_role('company_admin')));

-- company_counters -----------------------------------------------------------
-- Read-only to people; only app.next_number writes, and it is security definer.
create policy company_counters_read on public.company_counters
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

-- ---------------------------------------------------------------------------
-- 7. Grants
--
-- Row-level security decides which rows; these decide which tables are visible
-- at all. Nothing is granted to anon: CostMatrix has no public pages.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant usage on schema app to authenticated;

grant select, insert, update, delete on public.companies            to authenticated;
grant select, insert, update, delete on public.company_settings     to authenticated;
grant select, insert, update, delete on public.company_footer_logos to authenticated;
grant select, insert, update          on public.profiles            to authenticated;
grant select, insert, delete          on public.user_roles          to authenticated;
grant select                          on public.company_counters    to authenticated;

grant execute on function app.current_company_id()        to authenticated;
grant execute on function app.is_master_admin()           to authenticated;
grant execute on function app.has_role(public.user_role)  to authenticated;
grant execute on function app.next_number(public.counter_kind, boolean) to authenticated;
