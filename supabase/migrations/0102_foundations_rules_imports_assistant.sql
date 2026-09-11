-- 0102  Foundations F7–F11: rules, validity, imports, settings, the assistant's tables
--
-- F7  approval_rules, with one default rule per company — "always require an
--     approver" — which is exactly what happens today. The engine exists; the
--     lifecycle does not call it yet (roadmap 2.5 does).
-- F8  quotations.valid_until and costings.price_snapshot_at. The nightly expiry
--     job and an `expired` status are roadmap 2.6, not foundations.
-- F9  import_jobs and import_rows, filled from import_batches by trigger so the
--     three validated importers are not touched.
-- F10 company_options: typed key–value settings, seeded with the assistant's.
-- F11 assistant_conversations, assistant_messages, assistant_proposals.
--
-- Nothing here changes a price. `supabase/tests/15_acceptance_npp192.sql` is
-- unchanged and must stay green.

-- ===========================================================================
-- F7. Approval rules
-- ===========================================================================

create table if not exists public.approval_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  sort_order  integer not null default 0,
  name        text not null,
  -- A list of conditions, all of which must hold: [{"field": "total_ex_vat",
  -- "op": ">", "value": 10000000}]. An empty list always holds. The fields the
  -- evaluator knows are listed in app.evaluate_approval_rules.
  condition   jsonb not null default '[]'::jsonb,
  outcome     text not null
    constraint approval_rules_outcome_known
    check (outcome in ('auto_approve', 'require_approver', 'require_master_admin', 'block')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

create index if not exists approval_rules_company_idx on public.approval_rules (company_id, sort_order);
select app.add_audit_triggers('public.approval_rules');

comment on table public.approval_rules is
  'Ordered per company; the first active rule whose conditions all hold decides.
   Phase 1 seeds one rule per company that always requires an approver, which is
   today''s behaviour. submit_costing and approve_costing do not read this yet.';

-- One rule per company that exists today.
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
select c.id, 0, 'Always require an approver', '[]'::jsonb, 'require_approver'
  from public.companies c
 where not exists (select 1 from public.approval_rules r where r.company_id = c.id);

-- The facts a rule can test, for one costing. Read-only; SECURITY DEFINER so
-- the assistant's `get_company_policy` tool and the approver's screen see the
-- same answer, but company-checked so it answers only for the caller's own.
create or replace function app.costing_facts(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.costings;
  total numeric;
  placeholder_count integer;
begin
  select * into c from public.costings
   where id = target and (company_id = app.current_company_id() or app.is_master_admin());
  if c.id is null then raise exception 'no such costing'; end if;

  select coalesce(subtotal, 0) into total from public.v_costing_totals where costing_id = target;

  select count(*) into placeholder_count
    from public.costing_items i
    join public.components comp on comp.id = i.source_component_id
   where i.costing_id = target and comp.is_placeholder;

  return jsonb_build_object(
    'total_ex_vat',         coalesce(total, 0),
    'material_margin_pct',  c.material_margin_pct,
    'labour_margin_pct',    c.labour_margin_pct,
    'negotiation_margin_pct', c.negotiation_margin_pct,
    -- The lower of the two is the margin an approver would worry about.
    'profit_margin_pct',    least(c.material_margin_pct, c.labour_margin_pct),
    'uses_placeholder_part', placeholder_count > 0,
    'placeholder_parts',    placeholder_count,
    'price_age_days',       case when c.price_snapshot_at is null then null
                                 else extract(day from now() - c.price_snapshot_at)::integer end,
    'status',               c.status::text,
    'revision_no',          c.revision_no);
end;
$$;

-- One condition against the facts. Unknown fields and operators are false, not
-- errors: a rule that names a fact the engine does not know should never
-- auto-approve anything by accident.
create or replace function app.approval_condition_holds(facts jsonb, cond jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  f text := cond ->> 'field';
  op text := cond ->> 'op';
  actual jsonb := facts -> f;
  expected jsonb := cond -> 'value';
begin
  if f is null or op is null or actual is null then return false; end if;
  if jsonb_typeof(actual) = 'number' and jsonb_typeof(expected) = 'number' then
    return case op
      when '>'  then (actual::text)::numeric >  (expected::text)::numeric
      when '>=' then (actual::text)::numeric >= (expected::text)::numeric
      when '<'  then (actual::text)::numeric <  (expected::text)::numeric
      when '<=' then (actual::text)::numeric <= (expected::text)::numeric
      when '='  then (actual::text)::numeric =  (expected::text)::numeric
      else false end;
  end if;
  if op = '=' then return actual = expected; end if;
  if op = '!=' then return actual <> expected; end if;
  return false;
end;
$$;

-- What the rules say about one costing: the first active rule, in order, whose
-- conditions all hold. No rule holding means what it means today — an approver
-- is required — so that a company with every rule switched off is not suddenly
-- self-approving.
create or replace function app.evaluate_approval_rules(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  facts jsonb := app.costing_facts(target);
  target_company uuid;
  r record;
  cond jsonb;
  holds boolean;
begin
  select company_id into target_company from public.costings where id = target;

  for r in
    select id, name, condition, outcome from public.approval_rules
     where company_id = target_company and is_active
     order by sort_order, created_at
  loop
    holds := true;
    for cond in select * from jsonb_array_elements(coalesce(r.condition, '[]'::jsonb)) loop
      if not app.approval_condition_holds(facts, cond) then holds := false; exit; end if;
    end loop;
    if holds then
      return jsonb_build_object('outcome', r.outcome, 'rule_id', r.id, 'rule_name', r.name, 'facts', facts);
    end if;
  end loop;

  return jsonb_build_object('outcome', 'require_approver', 'rule_id', null,
                            'rule_name', 'No rule matched; an approver is required', 'facts', facts);
end;
$$;

create or replace function public.evaluate_approval_rules(target uuid)
returns jsonb language sql stable security invoker
as $$ select app.evaluate_approval_rules(target) $$;

-- ===========================================================================
-- F8. Validity and the price snapshot
-- ===========================================================================

alter table public.quotations
  add column if not exists valid_until date;

comment on column public.quotations.valid_until is
  'Set at release from the company''s validity_days; editable per quotation. The
   PDF prints the wording in terms.validity, unchanged; this is the date the
   expiry job (roadmap 2.6) will read.';

alter table public.costings
  add column if not exists price_snapshot_at timestamptz;

comment on column public.costings.price_snapshot_at is
  'When the prices in this costing were last taken from the catalogue: set by
   create_costing, carried by a revision (its prices are the same ones), reset
   by copy_costing (a copy re-prices). "Prices older than N days" is one query.';

-- Costings that exist already were priced when they were created.
update public.costings set price_snapshot_at = created_at where price_snapshot_at is null;

-- ===========================================================================
-- F9. The import framework
-- ===========================================================================
-- import_batches stays: components.import_batch_id and
-- component_price_history.import_batch_id point at it, and the three importers
-- in 0010 write it. These two tables are the record every future import
-- (price lists, BOMs, the assistant's mapping) writes directly; for the three
-- existing importers they are filled by trigger from the batch row, so those
-- validated functions are not touched and their reports are byte-identical.

create table if not exists public.import_jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid references public.companies(id) on delete cascade,   -- null = master library
  user_id         uuid,
  type            text not null
    constraint import_jobs_type_known
    check (type in ('catalogue', 'kits', 'kit_group_hours', 'bom', 'price_list', 'labour_hours')),
  document_id     uuid references public.documents(id) on delete set null,
  file_name       text,
  status          text not null default 'preview'
    constraint import_jobs_status_known
    check (status in ('preview', 'applied', 'failed', 'discarded')),
  column_mapping  jsonb not null default '{}'::jsonb,
  summary         jsonb not null default '{}'::jsonb,
  rows_total      integer,
  legacy_batch_id uuid references public.import_batches(id) on delete set null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  unique (legacy_batch_id)
);

create table if not exists public.import_rows (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.import_jobs(id) on delete cascade,
  row_number        integer,
  raw               jsonb not null default '{}'::jsonb,
  matched_entity_id uuid,
  match_method      text,
  status            text not null
    constraint import_rows_status_known
    check (status in ('new', 'changed', 'unchanged', 'rejected', 'warning', 'accepted', 'skipped')),
  message           text,
  created_at        timestamptz not null default now()
);

create index if not exists import_rows_job_idx on public.import_rows (job_id, row_number);
create index if not exists import_jobs_company_idx on public.import_jobs (company_id, started_at desc);
select app.add_audit_triggers('public.import_jobs');

comment on table public.import_jobs is
  'One row per import, of any kind. Every import ends in a review where a person
   accepts or rejects rows before master data or a costing is written.';
comment on table public.import_rows is
  'The rows of an import, with what each matched and what happened to it. For
   the three seed importers only the rows the report names — rejected, changed,
   warned — are here; every future importer writes every row.';

-- The three importers write import_batches and then update its counts and
-- details; this mirrors both moments into import_jobs / import_rows.
create or replace function app.mirror_import_batch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job uuid;
  kind text := case new.target
                 when 'components' then 'catalogue'
                 when 'assemblies' then 'kits'
                 when 'kits' then 'kits'
                 when 'kit_group_hours' then 'kit_group_hours'
                 else 'catalogue' end;
  r jsonb;
  n integer := 0;
begin
  insert into public.import_jobs
    (company_id, user_id, type, file_name, status, legacy_batch_id, created_by, started_at)
  values (new.company_id, new.user_id, kind, new.file_name, 'applied', new.id, new.user_id, new.created_at)
  on conflict (legacy_batch_id) do update
    set status = 'applied',
        summary = jsonb_build_object('new', new.rows_new, 'changed', new.rows_changed,
                                     'unchanged', new.rows_unchanged, 'rejected', new.rows_rejected)
                  || coalesce(new.details - 'rejected' - 'warnings', '{}'::jsonb),
        rows_total = new.rows_new + new.rows_changed + new.rows_unchanged + new.rows_rejected,
        finished_at = now()
  returning id into job;

  -- Re-derive the interesting rows from the details each time they are written.
  delete from public.import_rows where job_id = job;
  for r in select * from jsonb_array_elements(coalesce(new.details -> 'rejected', '[]'::jsonb)) loop
    n := n + 1;
    insert into public.import_rows (job_id, row_number, raw, status, message)
    values (job, coalesce((r ->> 'row')::integer, n), r, 'rejected', r ->> 'reason');
  end loop;
  for r in select * from jsonb_array_elements(coalesce(new.details -> 'warnings', '[]'::jsonb)) loop
    n := n + 1;
    insert into public.import_rows (job_id, row_number, raw, status, message)
    values (job, coalesce((r ->> 'row')::integer, n), r, 'warning', r ->> 'reason');
  end loop;
  return new;
end;
$$;

drop trigger if exists import_batches_mirror on public.import_batches;
create trigger import_batches_mirror
  after insert or update on public.import_batches
  for each row execute function app.mirror_import_batch();

-- Batches from before 0102 get a job row too, so the history is complete.
insert into public.import_jobs
  (company_id, user_id, type, file_name, status, legacy_batch_id, created_by, started_at, finished_at,
   summary, rows_total)
select b.company_id, b.user_id,
       case b.target when 'components' then 'catalogue' when 'kit_group_hours' then 'kit_group_hours' else 'kits' end,
       b.file_name, 'applied', b.id, b.user_id, b.created_at, b.updated_at,
       jsonb_build_object('new', b.rows_new, 'changed', b.rows_changed,
                          'unchanged', b.rows_unchanged, 'rejected', b.rows_rejected),
       b.rows_new + b.rows_changed + b.rows_unchanged + b.rows_rejected
  from public.import_batches b
 where not exists (select 1 from public.import_jobs j where j.legacy_batch_id = b.id);

-- ===========================================================================
-- F10. Company options: typed key–value settings
-- ===========================================================================
-- `company_settings` is already a wide table of letterhead, wording and
-- commercial defaults, and it stays. Everything new goes here, so a later
-- setting never needs a migration (D-179).

create table if not exists public.company_options (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  value_type  text not null default 'string'
    constraint company_options_type_known
    check (value_type in ('string', 'number', 'boolean', 'json')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid,
  unique (company_id, key)
);

select app.add_audit_triggers('public.company_options');

comment on table public.company_options is
  'Typed key–value settings per company. The assistant''s switches live here:
   ai_enabled (off by default), ai_monthly_token_budget, ai_price_age_warning_days,
   ai_min_margin_pct. company_settings is the older wide table and stays.';

-- The caller's own value, or the fallback. Never another company's.
create or replace function app.company_option(option_key text, fallback jsonb default null)
returns jsonb
language sql
stable
security invoker
as $$
  select coalesce(
    (select value from public.company_options
      where company_id = app.current_company_id() and key = option_key),
    fallback)
$$;

-- The assistant's four settings, for every company that exists today. The
-- assistant is OFF everywhere until the master administrator turns it on for a
-- company (AI spec §1, decision A2).
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
                   from public.companies where id = target_company), '0'::jsonb), 'number')
  on conflict (company_id, key) do nothing;
end;
$$;

select app.seed_company_options(id) from public.companies;

-- A new company gets its default rule and its options at birth, beside the
-- settings row 0002 already gives it.
create or replace function app.create_company_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
  values (new.id, 0, 'Always require an approver', '[]'::jsonb, 'require_approver');
  perform app.seed_company_options(new.id);
  return new;
end;
$$;

drop trigger if exists companies_create_defaults on public.companies;
create trigger companies_create_defaults
  after insert on public.companies
  for each row execute function app.create_company_defaults();

-- ===========================================================================
-- F11. The assistant's tables (AI spec §6). Empty; no screen yet.
-- ===========================================================================

create table if not exists public.assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null,
  entity_type text not null
    constraint assistant_conversations_entity_known check (entity_type in ('enquiry', 'costing')),
  entity_id   uuid not null,
  title       text,
  tokens_in   bigint not null default 0,
  tokens_out  bigint not null default 0,
  cost_usd    numeric(12,6) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

create table if not exists public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role            text not null
    constraint assistant_messages_role_known check (role in ('user', 'assistant', 'tool')),
  content         text,
  tool_calls      jsonb,
  -- Trimmed to ids and summaries, so this table does not duplicate documents.
  tool_results    jsonb,
  model           text,
  tokens_in       integer,
  tokens_out      integer,
  latency_ms      integer,
  created_at      timestamptz not null default now()
);

create table if not exists public.assistant_proposals (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  message_id      uuid references public.assistant_messages(id) on delete set null,
  company_id      uuid not null references public.companies(id) on delete cascade,
  entity_type     text not null
    constraint assistant_proposals_entity_known check (entity_type in ('enquiry', 'costing')),
  entity_id       uuid not null,
  type            text not null
    constraint assistant_proposals_type_known check (type in ('draft_costing', 'review', 'line_change')),
  status          text not null default 'open'
    constraint assistant_proposals_status_known
    check (status in ('open', 'partially_applied', 'applied', 'rejected', 'expired')),
  payload         jsonb not null,
  applied_by      uuid,
  applied_at      timestamptz,
  -- The line ids that were created when it was applied.
  result          jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists assistant_conversations_entity_idx
  on public.assistant_conversations (company_id, entity_type, entity_id);
create index if not exists assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);
create index if not exists assistant_proposals_entity_idx
  on public.assistant_proposals (company_id, entity_type, entity_id, status);
select app.add_audit_triggers('public.assistant_conversations');

comment on table public.assistant_proposals is
  'Nothing the assistant produces is ever applied without a person clicking
   Apply. A proposal sits here until someone does; the lines it creates carry
   origin = ai_proposal and origin_ref = this id (0101).';

-- ===========================================================================
-- Row-level security and grants
-- ===========================================================================

alter table public.approval_rules          enable row level security;
alter table public.import_jobs             enable row level security;
alter table public.import_rows             enable row level security;
alter table public.company_options         enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages      enable row level security;
alter table public.assistant_proposals     enable row level security;

-- Rules and options: the company reads, its administrator writes, the master
-- admin reads everywhere. `ai_enabled` is the master administrator's to flip
-- (spec A2), enforced by a trigger below rather than a policy, so a company
-- admin can still set the thresholds.
drop policy if exists approval_rules_read on public.approval_rules;
create policy approval_rules_read on public.approval_rules for select
  using (company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists approval_rules_write on public.approval_rules;
create policy approval_rules_write on public.approval_rules for all
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

drop policy if exists company_options_read on public.company_options;
create policy company_options_read on public.company_options for select
  using (company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists company_options_write_own on public.company_options;
create policy company_options_write_own on public.company_options for all
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));
drop policy if exists company_options_write_master on public.company_options;
create policy company_options_write_master on public.company_options for all
  using (app.is_master_admin())
  with check (app.is_master_admin());

create or replace function app.protect_master_options()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No signed-in user means a migration, the fixture, or the company-creation
  -- trigger seeding defaults: not a person flipping a switch.
  if auth.uid() is null then return new; end if;
  if new.key = 'ai_enabled' and not app.is_master_admin()
     and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    raise exception 'only the master administrator switches the assistant on or off for a company';
  end if;
  return new;
end;
$$;
drop trigger if exists company_options_protect_master on public.company_options;
create trigger company_options_protect_master
  before insert or update on public.company_options
  for each row execute function app.protect_master_options();

-- Imports: the company (or the master admin for master-library jobs) reads;
-- rows arrive by trigger or by the importer of the day.
drop policy if exists import_jobs_read on public.import_jobs;
create policy import_jobs_read on public.import_jobs for select
  using (company_id = app.current_company_id() or company_id is null or app.is_master_admin());
drop policy if exists import_jobs_write on public.import_jobs;
create policy import_jobs_write on public.import_jobs for all
  using ((company_id is null and app.is_master_admin())
      or (company_id = app.current_company_id() and app.has_role('company_admin')))
  with check ((company_id is null and app.is_master_admin())
      or (company_id = app.current_company_id() and app.has_role('company_admin')));
drop policy if exists import_rows_read on public.import_rows;
create policy import_rows_read on public.import_rows for select
  using (exists (select 1 from public.import_jobs j where j.id = job_id
                   and (j.company_id = app.current_company_id() or j.company_id is null or app.is_master_admin())));
drop policy if exists import_rows_write on public.import_rows;
create policy import_rows_write on public.import_rows for all
  using (exists (select 1 from public.import_jobs j where j.id = job_id
                   and ((j.company_id is null and app.is_master_admin())
                     or (j.company_id = app.current_company_id() and app.has_role('company_admin')))))
  with check (exists (select 1 from public.import_jobs j where j.id = job_id
                   and ((j.company_id is null and app.is_master_admin())
                     or (j.company_id = app.current_company_id() and app.has_role('company_admin')))));

-- The assistant acts as the signed-in user: what they may see, it may see.
drop policy if exists assistant_conversations_read on public.assistant_conversations;
create policy assistant_conversations_read on public.assistant_conversations for select
  using (company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists assistant_conversations_write on public.assistant_conversations;
create policy assistant_conversations_write on public.assistant_conversations for all
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

drop policy if exists assistant_messages_read on public.assistant_messages;
create policy assistant_messages_read on public.assistant_messages for select
  using (exists (select 1 from public.assistant_conversations c where c.id = conversation_id
                   and (c.company_id = app.current_company_id() or app.is_master_admin())));
drop policy if exists assistant_messages_write on public.assistant_messages;
create policy assistant_messages_write on public.assistant_messages for all
  using (exists (select 1 from public.assistant_conversations c where c.id = conversation_id
                   and c.company_id = app.current_company_id() and app.can_edit_costings()))
  with check (exists (select 1 from public.assistant_conversations c where c.id = conversation_id
                   and c.company_id = app.current_company_id() and app.can_edit_costings()));

drop policy if exists assistant_proposals_read on public.assistant_proposals;
create policy assistant_proposals_read on public.assistant_proposals for select
  using (company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists assistant_proposals_write on public.assistant_proposals;
create policy assistant_proposals_write on public.assistant_proposals for all
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

grant select, insert, update, delete on public.approval_rules, public.company_options,
  public.import_jobs, public.import_rows, public.assistant_conversations,
  public.assistant_messages, public.assistant_proposals to authenticated;
grant execute on function app.costing_facts(uuid) to authenticated;
grant execute on function app.evaluate_approval_rules(uuid) to authenticated;
grant execute on function public.evaluate_approval_rules(uuid) to authenticated;
grant execute on function app.company_option(text, jsonb) to authenticated;

-- ===========================================================================
-- F8 in the engine: derived from the existing function text by insertion
-- ===========================================================================

-- A released quotation knows the date it is open until, from the company's
-- validity_days. The printed wording in terms.validity is unchanged.

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
    signatory_name, signatory_email, letterhead_snapshot, pdf_path, released_by, created_by,
    valid_until)
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
    pdf_path, auth.uid(), auth.uid(),
    current_date + coalesce(cs.validity_days, 30))
  returning * into q;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target_costing, c.company_id, auth.uid(), 'quotation released',
          jsonb_build_object('reference_no', reference, 'quotation_id', q.id));
  return q;
end;
$$;

-- A new costing's prices are as of now. copy_costing goes through this, so a
-- copy — which re-prices — gets a fresh snapshot, as it should.

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
    enclosure_uplift_pct, created_by, price_snapshot_at)
  values (
    target_company, enquiry, app.next_number('costing'), gen_random_uuid(), title, notes,
    co.currency_code, co.currency_label, co.exchange_rate, co.discount_pct,
    co.material_margin_pct, co.labour_margin_pct, co.price_rounding_step, co.tax_pct,
    co.enclosure_uplift_pct, auth.uid(), now())
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

-- A revision carries its prices across unchanged, so it carries the date they
-- were taken too. Fifth time this function's lists have grown; tested each time.

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
    company_id, enquiry_id, costing_no, revision_no, family_id, previous_revision_id, is_current,
    title, notes, status, currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
    tax_pct, enclosure_uplift_pct, created_by, price_snapshot_at)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid(), price_snapshot_at
  from public.costings where id = target
  returning * into new_costing;

  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, company_id, process_type, hourly_rate
  from public.costing_labour_rates where costing_id = target;

  create temporary table copied_panels (old_id uuid, new_id uuid) on commit drop;
  create temporary table copied_assemblies (old_id uuid, new_id uuid) on commit drop;

  with inserted as (
    insert into public.costing_panels
      (costing_id, company_id, name, tag, option_label, uom, quantity,
       technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
       sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
           sort_order, auth.uid()
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
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, sort_order, created_by, origin, origin_ref)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.section, ca.source_assembly_id,
           ca.source_version, ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid(),
           ca.origin, ca.origin_ref
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
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name, category_code,
     unit, manufacturer, part_number, quantity, pricing_mode, master_price_kes, discount_pct,
     exchange_rate, weight_per_unit, material_rate, unit_price, purchase_price, purchase_currency,
     landed_factor, uplift_pct, is_manual, sort_order, created_by, origin, origin_ref)
  select new_costing.id, cas.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.unit_price, i.purchase_price, i.purchase_currency, i.landed_factor, i.uplift_pct,
         i.is_manual, i.sort_order, auth.uid(), i.origin, i.origin_ref
  from public.costing_items i
  join copied_assemblies cas on cas.old_id = i.costing_assembly_id
  where i.costing_id = target;

  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours, source,
     hourly_rate, created_by)
  select new_costing.id, cas.new_id, cl.company_id, cl.process_type, cl.hours, cl.source_hours,
         cl.source, cl.hourly_rate, auth.uid()
  from public.costing_labour cl
  join copied_assemblies cas on cas.old_id = cl.costing_assembly_id
  where cl.costing_id = target;

  perform app.write_history(new_costing.id, 'revised',
    jsonb_build_object('from_revision', old_costing.revision_no, 'to_revision', new_costing.revision_no));

  return new_costing;
end;
$$;
