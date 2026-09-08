-- 0006  Quotations: the document that leaves the building.
--
-- A quotation is released from an approved, current costing by an approver.
-- It carries the wording as it was printed, the letterhead as it was, and the
-- path of the PDF, and none of that changes afterwards: a change means a new
-- costing revision and a new release.

create type public.quotation_status as enum ('released', 'sent', 'won', 'lost');

-- ---------------------------------------------------------------------------
-- 1. Sequence issuing, split so the quotation reference can be formatted here
-- ---------------------------------------------------------------------------

-- The raw next number for a kind, per company and year. next_number (below)
-- formats it for costings and enquiries; release_quotation formats it its own
-- way with the company prefix and the revision suffix.
create or replace function app.next_sequence(counter public.counter_kind, use_year boolean default true)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  company uuid := app.current_company_id();
  yr integer := case when use_year then extract(year from now())::integer else 0 end;
  seq integer;
begin
  if company is null then
    raise exception 'no company for the signed-in user';
  end if;

  insert into public.company_counters (company_id, kind, year, last_no)
  values (company, counter, yr, 1)
  on conflict (company_id, kind, year)
    do update set last_no = public.company_counters.last_no + 1, updated_at = now()
  returning last_no into seq;

  return seq;
end;
$$;

create or replace function app.next_number(counter public.counter_kind, use_year boolean default true)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yr integer := case when use_year then extract(year from now())::integer else 0 end;
  seq integer := app.next_sequence(counter, use_year);
  prefix text := case counter when 'costing' then 'CM' when 'enquiry' then 'EN' else 'QT' end;
begin
  return case
           when yr = 0 then format('%s-%s', prefix, lpad(seq::text, 4, '0'))
           else format('%s-%s-%s', prefix, yr, lpad(seq::text, 4, '0'))
         end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- A family of revisions shares one quotation sequence, issued at first release.
alter table public.costings add column quotation_seq integer;
alter table public.costings add column quotation_seq_year integer;

create table public.quotations (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete restrict,
  costing_id          uuid not null unique references public.costings(id) on delete restrict,

  reference_no        text not null,

  -- Who it is addressed to. Free text until the CRM slice links a customer record.
  customer_name       text not null,
  customer_address    text,
  client_snapshot     jsonb,

  -- The wording, as printed.
  subject             text not null,
  salutation          text not null,
  intro_text          text not null,
  closing_text        text not null,
  notes_on_offer      text,
  terms               jsonb not null,          -- scope_of_supply, validity, payment, delivery_terms, delivery_timelines
  signatory_name      text,
  signatory_email     text,
  letterhead_snapshot jsonb not null,

  pdf_path            text not null,
  released_by         uuid,
  released_at         timestamptz not null default now(),

  status              public.quotation_status not null default 'released',
  sent_at             timestamptz,
  decided_at          timestamptz,
  lost_reason         text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,

  unique (company_id, reference_no)
);

comment on table public.quotations is
  'One per released costing revision. Everything on it is frozen at release;
   the PDF at pdf_path is the document of record.';

create index quotations_company_idx on public.quotations (company_id, released_at desc);

select app.add_audit_triggers('public.quotations');

-- ---------------------------------------------------------------------------
-- 3. Releasing
-- ---------------------------------------------------------------------------

create or replace function app.release_quotation(
  target_costing uuid,
  pdf_path text,
  texts jsonb)
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
begin
  select * into c from public.costings
   where id = target_costing and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if not app.has_role('approver') then
    raise exception 'only an approver may release a quotation';
  end if;
  if c.status <> 'approved' then
    raise exception 'only an approved costing can be quoted';
  end if;
  if not c.is_current then
    raise exception 'quote the current revision, not an older one';
  end if;
  if exists (select 1 from public.quotations where costing_id = target_costing) then
    raise exception 'this revision has already been quoted';
  end if;
  if pdf_path is null or length(btrim(pdf_path)) = 0 then
    raise exception 'no PDF was stored, so nothing can be released';
  end if;
  if coalesce(btrim(texts->>'customer_name'), '') = '' then
    raise exception 'the quotation needs a customer name';
  end if;

  select * into co from public.companies where id = c.company_id;
  select * into cs from public.company_settings where company_id = c.company_id;

  -- The sequence belongs to the family: revision 1 reuses revision 0's number
  -- with a different REV suffix, so the customer sees one reference throughout.
  select f.quotation_seq, f.quotation_seq_year into seq, seq_year
  from public.costings f
  where f.family_id = c.family_id and f.quotation_seq is not null
  limit 1;

  if seq is null then
    seq := app.next_sequence('quotation', co.quotation_no_includes_year);
    seq_year := case when co.quotation_no_includes_year then extract(year from now())::integer else 0 end;
  end if;

  update public.costings set quotation_seq = seq, quotation_seq_year = seq_year
   where id = target_costing;

  reference := co.quotation_prefix
            || case when seq_year > 0 then '-' || seq_year else '' end
            || '-' || lpad(seq::text, 4, '0')
            || '-REV' || c.revision_no;

  insert into public.quotations (
    company_id, costing_id, reference_no,
    customer_name, customer_address, client_snapshot,
    subject, salutation, intro_text, closing_text, notes_on_offer, terms,
    signatory_name, signatory_email, letterhead_snapshot,
    pdf_path, released_by, created_by)
  values (
    c.company_id, target_costing, reference,
    btrim(texts->>'customer_name'), texts->>'customer_address', texts->'client',
    coalesce(nullif(texts->>'subject', ''), 'QUOTATION FOR ' || upper(c.title)),
    coalesce(nullif(texts->>'salutation', ''), cs.salutation),
    coalesce(nullif(texts->>'intro_text', ''), cs.intro_text),
    coalesce(nullif(texts->>'closing_text', ''), cs.closing_text),
    coalesce(texts->>'notes_on_offer', cs.default_notes_on_offer),
    coalesce(texts->'terms', jsonb_build_object(
      'scope_of_supply',    cs.scope_of_supply,
      'validity',           format('This offer is open for acceptance for %s days from the date hereof; thereafter subject to confirmation.', cs.validity_days),
      'payment',            cs.payment_terms,
      'delivery_terms',     cs.delivery_terms,
      'delivery_timelines', cs.delivery_timelines)),
    coalesce(nullif(texts->>'signatory_name', ''), cs.signatory_name),
    coalesce(nullif(texts->>'signatory_email', ''), cs.signatory_email),
    jsonb_build_object(
      'company_name', co.name, 'po_box', cs.po_box, 'street_address', cs.street_address,
      'phones', cs.phones, 'email', cs.email, 'tax_pin', co.tax_pin,
      'logo_path', co.logo_path, 'currency_label', co.currency_label),
    pdf_path, auth.uid(), auth.uid())
  returning * into q;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target_costing, c.company_id, auth.uid(), 'quotation released',
          jsonb_build_object('reference_no', reference, 'quotation_id', q.id));

  return q;
end;
$$;

comment on function app.release_quotation(uuid, text, jsonb) is
  'Releases a quotation from an approved, current costing. Issues the family''s
   sequence on first release, freezes the wording and letterhead, writes history.';

-- Sent, then won or lost. Lost needs a reason: that is the one piece of
-- information the sales pipeline later depends on.
create or replace function app.set_quotation_status(
  target uuid,
  new_status public.quotation_status,
  reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare q public.quotations;
begin
  select * into q from public.quotations
   where id = target and company_id = app.current_company_id();
  if q is null then raise exception 'no such quotation'; end if;
  if not app.can_edit_costings() then raise exception 'you may not change quotation status'; end if;

  if new_status = 'released' then
    raise exception 'a quotation cannot go back to released';
  elsif new_status = 'sent' and q.status <> 'released' then
    raise exception 'only a released quotation can be marked sent';
  elsif new_status in ('won', 'lost') and q.status not in ('released', 'sent') then
    raise exception 'this quotation has already been decided';
  end if;
  if new_status = 'lost' and coalesce(btrim(reason), '') = '' then
    raise exception 'say why it was lost';
  end if;

  update public.quotations
     set status = new_status,
         sent_at = case when new_status = 'sent' then now() else sent_at end,
         decided_at = case when new_status in ('won', 'lost') then now() else decided_at end,
         lost_reason = case when new_status = 'lost' then btrim(reason) else lost_reason end
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (q.costing_id, q.company_id, auth.uid(), 'quotation ' || new_status,
          case when new_status = 'lost' then jsonb_build_object('reason', btrim(reason)) end);
end;
$$;

-- Public wrappers, since the API client reaches only public.
create or replace function public.release_quotation(target_costing uuid, pdf_path text, texts jsonb)
returns public.quotations language sql
as $$ select app.release_quotation(target_costing, pdf_path, texts) $$;

create or replace function public.set_quotation_status(target uuid, new_status public.quotation_status, reason text default null)
returns void language sql
as $$ select app.set_quotation_status(target, new_status, reason) $$;

-- ---------------------------------------------------------------------------
-- 4. Row-level security and grants
--
-- No insert or update policy: the two functions above are the only way in, and
-- they are security definer. People read; the database writes.
-- ---------------------------------------------------------------------------

alter table public.quotations enable row level security;

create policy quotations_read on public.quotations
  for select to authenticated
  using (company_id = app.current_company_id() or app.is_master_admin());

grant select on public.quotations to authenticated;
grant execute on function app.next_sequence(public.counter_kind, boolean) to authenticated;
grant execute on function app.release_quotation(uuid, text, jsonb) to authenticated;
grant execute on function app.set_quotation_status(uuid, public.quotation_status, text) to authenticated;
grant execute on function public.release_quotation(uuid, text, jsonb) to authenticated;
grant execute on function public.set_quotation_status(uuid, public.quotation_status, text) to authenticated;
revoke execute on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- 5. Storage
--
-- Two private buckets. Object paths start with the company id, and the
-- policies check that first folder, so a company's files are as invisible to
-- another company as its rows are. Guarded on the storage schema so the
-- migration also runs on a plain PostgreSQL in the test harness.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'no storage schema here; skipping bucket setup (fine outside Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('quotations', 'quotations', false, 20971520, array['application/pdf'])
  on conflict (id) do nothing;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', false, 5242880, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
  on conflict (id) do nothing;

  -- quotations: the company reads its own; approvers write into their own folder.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'quotations_read_own') then
    execute $p$ create policy quotations_read_own on storage.objects for select to authenticated
      using (bucket_id = 'quotations'
             and ((storage.foldername(name))[1] = app.current_company_id()::text or app.is_master_admin())) $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'quotations_write_own') then
    execute $p$ create policy quotations_write_own on storage.objects for insert to authenticated
      with check (bucket_id = 'quotations'
                  and (storage.foldername(name))[1] = app.current_company_id()::text
                  and app.has_role('approver')) $p$;
  end if;

  -- logos: the company reads its own; company admins manage them.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'logos_read_own') then
    execute $p$ create policy logos_read_own on storage.objects for select to authenticated
      using (bucket_id = 'logos'
             and ((storage.foldername(name))[1] = app.current_company_id()::text or app.is_master_admin())) $p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'logos_write_own') then
    execute $p$ create policy logos_write_own on storage.objects for all to authenticated
      using (bucket_id = 'logos'
             and (storage.foldername(name))[1] = app.current_company_id()::text
             and app.has_role('company_admin'))
      with check (bucket_id = 'logos'
                  and (storage.foldername(name))[1] = app.current_company_id()::text
                  and app.has_role('company_admin')) $p$;
  end if;
end;
$$;
