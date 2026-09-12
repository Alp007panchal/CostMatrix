-- 0108  Approval rules in force, and what happens when a quotation runs out
--       (roadmap 2.5 and 2.6, advanced track)
--
-- Two halves of one idea: the app should know when a costing needs a second pair
-- of eyes, and should not let a quotation quietly go stale.
--
-- 2.5. The rules engine of 0102 has been sitting there, evaluated by nobody. It
-- is now called by `submit_costing` and `approve_costing`, and the screen can
-- show why. **The default rule keeps today's behaviour exactly**: every company
-- has one rule, "Always require an approver", and until somebody writes another
-- one nothing about submitting or approving changes.
--
-- 2.6. A quotation has carried `valid_until` since 0102 and nothing has read it.
-- Now a job marks the ones that have run out, raises a follow-up on the ones
-- that were sent, and a costing can be re-issued at today's prices as a new
-- revision.

-- ===========================================================================
-- 1. Why does this costing need an approver?
-- ===========================================================================
-- The verdict, plus every active rule and whether it holds, so the screen can
-- explain itself instead of announcing a decision. Read-only.
create or replace function app.approval_review(target uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  facts jsonb;
  verdict jsonb;
  target_company uuid;
  r record;
  cond jsonb;
  holds boolean;
  conditions jsonb;
  rules jsonb := '[]'::jsonb;
begin
  select company_id into target_company from public.costings where id = target;
  if target_company is null then raise exception 'no such costing, or it is not visible to you'; end if;

  facts := app.costing_facts(target);
  verdict := app.evaluate_approval_rules(target);

  for r in
    select id, name, condition, outcome, sort_order from public.approval_rules
     where company_id = target_company and is_active
     order by sort_order, created_at
  loop
    holds := true;
    conditions := '[]'::jsonb;
    for cond in select * from jsonb_array_elements(coalesce(r.condition, '[]'::jsonb)) loop
      conditions := conditions || (cond || jsonb_build_object(
        'holds', app.approval_condition_holds(facts, cond),
        'actual', facts -> (cond ->> 'field')));
      if not app.approval_condition_holds(facts, cond) then holds := false; end if;
    end loop;
    rules := rules || jsonb_build_object(
      'rule_id', r.id, 'name', r.name, 'outcome', r.outcome, 'sort_order', r.sort_order,
      'holds', holds, 'conditions', conditions,
      'decided', (verdict ->> 'rule_id') = r.id::text);
  end loop;

  return jsonb_build_object(
    'outcome', verdict ->> 'outcome',
    'rule_name', verdict ->> 'rule_name',
    'rule_id', verdict ->> 'rule_id',
    'facts', facts,
    'rules', rules);
end;
$$;

comment on function app.approval_review(uuid) is
  'What the company''s rules make of one costing: the verdict, and every active
   rule with each of its conditions and whether it holds. For the "why this
   needs approval" panel; changes nothing.';

-- ===========================================================================
-- 2. Submit and approve, with the rules in force
-- ===========================================================================
-- Derived from the 0004 text by insertion. What is added: the verdict is asked
-- for, `block` refuses, `auto_approve` approves on the spot, and the rule that
-- decided is written into the history so the record says why. `require_approver`
-- — the only outcome any company has today — behaves exactly as before.
create or replace function app.submit_costing(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.costings;
  verdict jsonb;
  outcome text;
begin
  select * into c from public.costings where id = target and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if c.status <> 'draft' then raise exception 'only a draft can be submitted'; end if;
  if not app.can_edit_costings() then raise exception 'you may not submit costings'; end if;

  verdict := app.evaluate_approval_rules(target);
  outcome := verdict ->> 'outcome';

  if outcome = 'block' then
    raise exception 'this costing cannot be submitted: %', verdict ->> 'rule_name';
  end if;

  update public.costings
     set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target, c.company_id, auth.uid(), 'submitted',
          jsonb_build_object('rule', verdict ->> 'rule_name', 'outcome', outcome));

  -- A company that has written a rule saying a small, healthy job needs nobody
  -- gets what it asked for: approved on the spot, by the rule rather than by a
  -- person, and the history says which rule it was.
  if outcome = 'auto_approve' then
    update public.costings
       set status = 'approved', approved_by = null, approved_at = now()
     where id = target;
    insert into public.costing_history (costing_id, company_id, user_id, action, details)
    values (target, c.company_id, auth.uid(), 'approved by rule',
            jsonb_build_object('rule', verdict ->> 'rule_name', 'facts', verdict -> 'facts'));
  end if;
end;
$$;

create or replace function app.approve_costing(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.costings;
  verdict jsonb;
  outcome text;
begin
  select * into c from public.costings where id = target and company_id = app.current_company_id();
  if c is null then raise exception 'no such costing'; end if;
  if c.status <> 'submitted' then raise exception 'only a submitted costing can be approved'; end if;
  if not app.has_role('approver') then
    raise exception 'only an approver may approve a costing';
  end if;

  verdict := app.evaluate_approval_rules(target);
  outcome := verdict ->> 'outcome';

  if outcome = 'block' then
    raise exception 'this costing cannot be approved: %', verdict ->> 'rule_name';
  elsif outcome = 'require_master_admin' and not app.is_master_admin() then
    raise exception 'this one needs the master administrator: %', verdict ->> 'rule_name';
  end if;

  update public.costings
     set status = 'approved', approved_by = auth.uid(), approved_at = now()
   where id = target;

  insert into public.costing_history (costing_id, company_id, user_id, action, details)
  values (target, c.company_id, auth.uid(), 'approved',
          jsonb_build_object('rule', verdict ->> 'rule_name', 'outcome', outcome));
end;
$$;

-- ===========================================================================
-- 3. A quotation that has run out
-- ===========================================================================
-- Not a new status: a quotation that expired may still be won later, and one
-- that was sent should still read "sent". `expired_at` is a fact beside the
-- status, and `v_quotations_due` is what a screen or a job reads.
alter table public.quotations
  add column if not exists expired_at timestamptz;

comment on column public.quotations.expired_at is
  'When app.expire_quotations noticed that valid_until had passed. A fact beside
   the status, not a status: an expired quotation can still be won.';

create or replace view public.v_quotation_validity
with (security_invoker = true)
as
select
  q.id                as quotation_id,
  q.company_id,
  q.costing_id,
  q.reference_no,
  q.status,
  q.valid_until,
  q.expired_at,
  q.sent_at,
  q.customer_name,
  case when q.valid_until is null then null
       else (q.valid_until - current_date) end                      as days_left,
  (q.valid_until is not null and q.valid_until < current_date
   and q.status in ('released', 'sent'))                            as has_run_out
from public.quotations q;

comment on view public.v_quotation_validity is
  'How long each quotation has left, and whether it has run out: valid_until in
   the past while it is still only released or sent.';

-- The job. SECURITY DEFINER and company-blind on purpose: it runs on a schedule
-- with nobody signed in, over every company at once. It writes three things —
-- the date it noticed, an activity row, and, for a quotation that was actually
-- sent to somebody, a follow-up for a person to chase or re-issue.
create or replace function app.expire_quotations()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q record;
  expired integer := 0;
  followups integer := 0;
begin
  for q in
    select id, company_id, reference_no, status, valid_until, customer_name
    from public.quotations
    where valid_until is not null
      and valid_until < current_date
      and status in ('released', 'sent')
      and expired_at is null
    order by valid_until
  loop
    update public.quotations set expired_at = now() where id = q.id;
    expired := expired + 1;

    insert into public.activity_log
      (company_id, actor_user_id, actor_kind, entity_type, entity_id, action, after, note)
    values (q.company_id, null, 'system', 'quotation', q.id, 'quotation.expired',
            jsonb_build_object('reference_no', q.reference_no, 'valid_until', q.valid_until,
                               'status', q.status),
            format('%s ran out on %s', q.reference_no, q.valid_until));

    -- Only one that reached the customer earns a chase; a released quotation
    -- nobody sent is the engineer's own business.
    if q.status = 'sent' and not exists (
         select 1 from public.quotation_followups f
          where f.quotation_id = q.id and f.done_at is null) then
      insert into public.quotation_followups (quotation_id, company_id, due_on, note)
      values (q.id, q.company_id, current_date,
              format('%s ran out on %s. Chase %s, or re-issue it at today''s prices.',
                     q.reference_no, q.valid_until, q.customer_name));
      followups := followups + 1;
    end if;
  end loop;

  return jsonb_build_object('expired', expired, 'followups', followups, 'checked_at', now());
end;
$$;

comment on function app.expire_quotations() is
  'Marks every quotation whose validity has passed while it was still released or
   sent, logs it, and raises a follow-up on the ones that were sent. Safe to run
   as often as you like: a quotation is expired once.';

-- Scheduled where pg_cron exists (Supabase has it; the test harness does not),
-- and runnable by hand from the Quotations screen either way.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('costmatrix-expire-quotations', '15 2 * * *',
                          $cron$select app.expire_quotations()$cron$);
  else
    raise notice 'pg_cron is not installed here; app.expire_quotations() is run by hand or by the app';
  end if;
exception when others then
  raise notice 'could not schedule the expiry job (%); it can still be run by hand', sqlerrm;
end;
$$;

-- A person may run it for their own company from the screen — the same work,
-- limited to what they can see, so an administrator need not wait for the night.
create or replace function app.check_my_quotation_expiry()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  q record;
  expired integer := 0;
  followups integer := 0;
begin
  if not app.can_edit_costings() then raise exception 'you may not change quotations'; end if;

  for q in
    select id, reference_no, status, valid_until, customer_name, company_id
    from public.quotations
    where company_id = app.current_company_id()
      and valid_until is not null and valid_until < current_date
      and status in ('released', 'sent') and expired_at is null
  loop
    update public.quotations set expired_at = now() where id = q.id;
    expired := expired + 1;
    perform app.write_activity('quotation', q.id, 'quotation.expired', null,
      jsonb_build_object('reference_no', q.reference_no, 'valid_until', q.valid_until),
      format('%s ran out on %s', q.reference_no, q.valid_until), 'user');
    if q.status = 'sent' and not exists (
         select 1 from public.quotation_followups f
          where f.quotation_id = q.id and f.done_at is null) then
      insert into public.quotation_followups (quotation_id, company_id, due_on, note)
      values (q.id, q.company_id, current_date,
              format('%s ran out on %s. Chase %s, or re-issue it at today''s prices.',
                     q.reference_no, q.valid_until, q.customer_name));
      followups := followups + 1;
    end if;
  end loop;

  return jsonb_build_object('expired', expired, 'followups', followups);
end;
$$;

-- ===========================================================================
-- 4. Re-issue at today's prices
-- ===========================================================================
-- A revision of the approved costing whose lines are priced today rather than
-- carried over: `create_costing_revision` for the numbering, the family and the
-- history, then `copy_panel` for each panel, which is the function that already
-- re-prices and names what it could not. Both are unchanged; this composes them.
create or replace function app.reissue_costing(source uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  src public.costings;
  fresh public.costings;
  pan record;
  report jsonb;
  repriced integer := 0;
  kept jsonb := '[]'::jsonb;
begin
  select * into src from public.costings
   where id = source and company_id = app.current_company_id();
  if src.id is null then raise exception 'no such costing'; end if;
  if src.status <> 'approved' then
    raise exception 'only an approved costing is re-issued; this one is %', src.status;
  end if;
  if not src.is_current then raise exception 'this is not the current revision'; end if;

  fresh := app.create_costing_revision(source);

  -- The revision arrives as a copy at the old prices. Re-priced means exactly
  -- what a copy means, so the panels are rebuilt the way a copy builds them.
  delete from public.costing_panels where costing_id = fresh.id;
  for pan in select id from public.costing_panels where costing_id = source order by sort_order loop
    report := app.copy_panel(pan.id, fresh.id, null);
    repriced := repriced + (report ->> 'repriced')::integer;
    kept := kept || (report -> 'kept');
  end loop;

  update public.costings set price_snapshot_at = now() where id = fresh.id;

  perform app.write_history(fresh.id, 're-issued at today''s prices', jsonb_build_object(
    'from_revision_no', src.revision_no,
    'lines_repriced', repriced,
    'lines_kept_at_the_old_price', jsonb_array_length(kept)));

  return jsonb_build_object(
    'costing_id', fresh.id, 'costing_no', fresh.costing_no, 'revision_no', fresh.revision_no,
    'repriced', repriced, 'kept', kept);
end;
$$;

comment on function app.reissue_costing(uuid) is
  'A new revision of an approved costing with every line re-priced at today''s
   prices and a fresh price snapshot. What could not be re-priced is named, as
   in a copy. The approved revision is untouched.';

-- ===========================================================================
-- 5. Wrappers and grants
-- ===========================================================================
create or replace function public.approval_review(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.approval_review(target) $$;
create or replace function public.expire_quotations() returns jsonb
  language sql security definer set search_path = public, pg_temp as $$ select app.expire_quotations() $$;
create or replace function public.check_my_quotation_expiry() returns jsonb
  language plpgsql security invoker as $$ begin return app.check_my_quotation_expiry(); end $$;
create or replace function public.reissue_costing(source uuid) returns jsonb
  language plpgsql security invoker as $$ begin return app.reissue_costing(source); end $$;

grant select on public.v_quotation_validity to authenticated;
grant execute on function
  app.approval_review(uuid), public.approval_review(uuid),
  app.check_my_quotation_expiry(), public.check_my_quotation_expiry(),
  app.reissue_costing(uuid), public.reissue_costing(uuid)
to authenticated;
-- The nightly job is the scheduler's, not a person's: nobody is granted it.
revoke execute on function public.expire_quotations() from authenticated;
