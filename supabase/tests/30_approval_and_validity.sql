-- Approval rules in force, and what happens when a quotation runs out
-- (migration 0108, roadmap 2.5 and 2.6). Runs after 14 and 15, so the parts and
-- the company settings are the owner's own.
--
-- The first block is the one that matters most: with only the default rule —
-- which is all any company has — submitting and approving behave exactly as they
-- did before this migration.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- Both halves of 0108 are behind switches since 0116, off for every company.
-- This file is what tests them, so it switches them on and off again at the end.
select test.feature(:'alpha'::uuid, 'approval_rules', true);
select test.feature(:'alpha'::uuid, 'quotation_validity', true);
select test.feature(:'beta'::uuid,  'approval_rules', true);
select test.feature(:'beta'::uuid,  'quotation_validity', true);

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset
select id as placeholder_id from public.components
 where company_id is null and is_placeholder order by code limit 1 \gset

-- === With the default rule, nothing has changed =============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as plain_id from app.create_costing('Rules: the ordinary way') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'plain_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC') returning id as plain_panel \gset
select app.add_component_to_costing(:'plain_panel'::uuid, :'part_id'::uuid, 4);
select app.submit_costing(:'plain_id'::uuid);
commit;

select test.eq((select status from public.costings where id = :'plain_id'::uuid), 'submitted',
  'a costing still goes to an approver, exactly as before');
select test.eq((select details ->> 'outcome' from public.costing_history
                where costing_id = :'plain_id'::uuid and action = 'submitted'), 'require_approver',
  'and the history now records what the rules said');
select test.eq((select details ->> 'rule' from public.costing_history
                where costing_id = :'plain_id'::uuid and action = 'submitted'), 'Always require an approver',
  'naming the rule that decided it');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(format($$select app.approve_costing(%L)$$, :'plain_id'),
  'an engineer still cannot approve their own work', 'only an approver');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'plain_id'::uuid);
commit;
select test.eq((select status from public.costings where id = :'plain_id'::uuid), 'approved',
  'and an approver still approves it');
select test.eq((select approved_by from public.costings where id = :'plain_id'::uuid), :'alice'::uuid,
  'with their name on it');

-- === Why does this need an approver? ========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.approval_review(:'plain_id'::uuid) as review \gset
rollback;
select test.eq(:'review'::jsonb ->> 'outcome', 'require_approver', 'the panel says what will happen');
select test.eq(:'review'::jsonb ->> 'rule_name', 'Always require an approver', 'and which rule says so');
select test.eq(jsonb_array_length(:'review'::jsonb -> 'rules'), 1, 'listing every active rule');
select test.eq((:'review'::jsonb -> 'rules' -> 0 ->> 'holds')::boolean, true,
  'with whether each one holds');
select test.eq((:'review'::jsonb -> 'rules' -> 0 ->> 'decided')::boolean, true,
  'and which one decided');
select test.ok((:'review'::jsonb -> 'facts' ->> 'total_ex_vat')::numeric > 0,
  'beside the facts it judged: what the job comes to');
select test.eq((:'review'::jsonb -> 'facts' ->> 'uses_placeholder_part')::boolean, false,
  'and whether anything on it is unpriced');

-- === A rule that approves small, healthy jobs ===============================
begin;
set local role authenticated;
select test.sign_in(:'alice');   -- company admin writes the rules
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -10, 'Small jobs under 500,000 approve themselves',
        jsonb_build_array(
          jsonb_build_object('field', 'total_ex_vat', 'op', '<', 'value', 500000),
          jsonb_build_object('field', 'uses_placeholder_part', 'op', '=', 'value', false)),
        'auto_approve');

select test.sign_in(:'carol');
select id as small_id from app.create_costing('Rules: a small job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'small_id'::uuid, :'alpha'::uuid, 'SMALL BOARD', 1, 'PC') returning id as small_panel \gset
select app.add_component_to_costing(:'small_panel'::uuid, :'part_id'::uuid, 1);
select app.submit_costing(:'small_id'::uuid);
select app.approval_review(:'small_id'::uuid) as small_review \gset

select test.eq((select status from public.costings where id = :'small_id'::uuid), 'approved',
  'a small job with nothing unpriced approves itself, as the company asked');
select test.ok((select approved_by is null from public.costings where id = :'small_id'::uuid),
  'with nobody''s name on it, because nobody approved it');
select test.eq((select count(*)::int from public.costing_history
                where costing_id = :'small_id'::uuid and action = 'approved by rule'), 1,
  'and the history says it was a rule');
select test.eq((select details ->> 'rule' from public.costing_history
                where costing_id = :'small_id'::uuid and action = 'approved by rule'),
               'Small jobs under 500,000 approve themselves',
  'naming which rule');

-- The same rule, a job that is too big for it.
select test.sign_in(:'carol');
select id as big_id from app.create_costing('Rules: a big job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'big_id'::uuid, :'alpha'::uuid, 'BIG BOARD', 1, 'PC') returning id as big_panel \gset
select app.add_manual_item(:'big_panel'::uuid, 'A VERY EXPENSIVE THING', 'switchgear', 900000, 1);
select app.submit_costing(:'big_id'::uuid);
select test.eq((select status from public.costings where id = :'big_id'::uuid), 'submitted',
  'a job over the threshold still waits for an approver');
select app.approval_review(:'big_id'::uuid) as big_review \gset
select test.eq((:'big_review'::jsonb -> 'rules' -> 0 ->> 'holds')::boolean, false,
  'the panel shows the rule that did not hold');
select test.eq(((:'big_review'::jsonb -> 'rules' -> 0 -> 'conditions' -> 0) ->> 'holds')::boolean, false,
  'and which of its conditions failed');
select test.ok(((:'big_review'::jsonb -> 'rules' -> 0 -> 'conditions' -> 0) ->> 'actual')::numeric >= 500000,
  'with the figure it looked at');
rollback;

-- === A rule that blocks ======================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -20, 'Nothing with an unpriced part may be submitted',
        jsonb_build_array(jsonb_build_object('field', 'uses_placeholder_part', 'op', '=', 'value', true)),
        'block');

select test.sign_in(:'carol');
select id as bad_id from app.create_costing('Rules: a costing with a placeholder') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'bad_id'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC') returning id as bad_panel \gset
-- A placeholder cannot be costed by the engine, so the fact is made the way the
-- rules see it: a line whose part was priced when added and unpriced afterwards.
select app.add_component_to_costing(:'bad_panel'::uuid, :'part_id'::uuid, 1);
-- The master catalogue is the master administrator's to change, so it is theirs
-- to make unpriced too; a company admin's write would be filtered away silently.
select test.sign_in(:'master');
update public.components set is_placeholder = true, purchase_price = null where id = :'part_id'::uuid;
select test.sign_in(:'carol');
select test.refuses(format($$select app.submit_costing(%L)$$, :'bad_id'),
  'a rule that blocks refuses the submission, naming itself',
  'Nothing with an unpriced part may be submitted');
select test.eq((select status from public.costings where id = :'bad_id'::uuid), 'draft',
  'and the costing stays a draft');
rollback;

-- === A rule that reserves the decision for the master administrator =========
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -30, 'Anything over 10,000,000 is the master administrator''s',
        jsonb_build_array(jsonb_build_object('field', 'total_ex_vat', 'op', '>', 'value', 10000000)),
        'require_master_admin');

select test.sign_in(:'carol');
select id as huge_id from app.create_costing('Rules: a very big job') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'huge_id'::uuid, :'alpha'::uuid, 'HUGE BOARD', 1, 'PC') returning id as huge_panel \gset
select app.add_manual_item(:'huge_panel'::uuid, 'AN ENORMOUS THING', 'switchgear', 20000000, 1);
select app.submit_costing(:'huge_id'::uuid);
select test.eq((select status from public.costings where id = :'huge_id'::uuid), 'submitted',
  'it can still be submitted');
select test.sign_in(:'alice');
select test.refuses(format($$select app.approve_costing(%L)$$, :'huge_id'),
  'but the company''s own approver is told it is not hers to approve',
  'needs the master administrator');
rollback;

-- === Quotations that run out ================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select id as q_sent from public.release_quotation(:'plain_id'::uuid,
  format('%s/expiry-test.pdf', :'alpha'),
  '{"customer_name": "TRICLOVER LIMITED"}'::jsonb) \gset
select app.set_quotation_status(:'q_sent'::uuid, 'sent');
commit;

-- Backdated here rather than through the app: `release_quotation` sets
-- valid_until from the company's validity_days, and nothing in the app moves it
-- afterwards. The harness writes it directly, as the seeded fixtures do.
update public.quotations set valid_until = current_date - 3 where id = :'q_sent'::uuid;

select test.eq((select has_run_out from public.v_quotation_validity where quotation_id = :'q_sent'::uuid), true,
  'a quotation whose date has passed reads as run out');
select test.eq((select days_left from public.v_quotation_validity where quotation_id = :'q_sent'::uuid), -3,
  'with how many days ago it went');

select app.expire_quotations() as swept \gset
select test.eq((:'swept'::jsonb ->> 'expired')::int, 1, 'the nightly job marks it');
select test.eq((:'swept'::jsonb ->> 'followups')::int, 1, 'and raises a follow-up, because it had been sent');
select test.ok((select expired_at is not null from public.quotations where id = :'q_sent'::uuid),
  'the quotation records when it was noticed');
select test.eq((select status from public.quotations where id = :'q_sent'::uuid), 'sent',
  'but its status is unchanged: an expired quotation can still be won');
select test.eq((select count(*)::int from public.quotation_followups
                where quotation_id = :'q_sent'::uuid and done_at is null), 1,
  'somebody is asked to chase it');
select test.ok((select note like '%ran out on%re-issue it at today''s prices%'
                from public.quotation_followups where quotation_id = :'q_sent'::uuid),
  'and told what the two choices are');
select test.eq((select count(*)::int from public.activity_log
                where entity_id = :'q_sent'::uuid and action = 'quotation.expired'), 1,
  'the activity log says it expired');
select test.eq((select actor_kind from public.activity_log
                where entity_id = :'q_sent'::uuid and action = 'quotation.expired'), 'system',
  'and that nobody did it: a job did');

select app.expire_quotations() as swept_again \gset
select test.eq((:'swept_again'::jsonb ->> 'expired')::int, 0,
  'running the job again changes nothing: a quotation runs out once');
select test.eq((select count(*)::int from public.quotation_followups
                where quotation_id = :'q_sent'::uuid), 1,
  'and raises no second follow-up');

-- === Re-issue at today's prices =============================================
-- The part is dearer than it was when the costing was approved.
begin;
set local role authenticated;
select test.sign_in(:'master');
select purchase_price as old_price from public.components where id = :'part_id'::uuid \gset
update public.components set purchase_price = :old_price::numeric * 2 where id = :'part_id'::uuid;
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.reissue_costing(:'plain_id'::uuid) as reissued \gset
commit;

select test.eq((:'reissued'::jsonb ->> 'revision_no')::int, 1, 'a re-issue is the next revision');
select test.ok((:'reissued'::jsonb ->> 'repriced')::int > 0, 'with its lines priced again');
select test.eq((select status from public.costings where id = :'plain_id'::uuid), 'approved',
  'the approved revision is untouched');
select test.eq((select is_current from public.costings where id = :'plain_id'::uuid), false,
  'though it is no longer the current one');
select test.eq((select status from public.costings where id = (:'reissued'::jsonb ->> 'costing_id')::uuid), 'draft',
  'and the new revision is a draft to check before it goes out');
select test.ok((select price_snapshot_at > (select price_snapshot_at from public.costings where id = :'plain_id'::uuid)
                from public.costings where id = (:'reissued'::jsonb ->> 'costing_id')::uuid),
  'its price snapshot is today''s');
select test.eq((select sum(unit_price * quantity) from public.costing_items
                where costing_id = (:'reissued'::jsonb ->> 'costing_id')::uuid),
               (select sum(unit_price * quantity) * 2 from public.costing_items where costing_id = :'plain_id'::uuid),
  'and the doubled price is what the new revision carries');
select test.eq((select count(*)::int from public.costing_history
                where costing_id = (:'reissued'::jsonb ->> 'costing_id')::uuid
                  and action = 're-issued at today''s prices'), 1,
  'the history says why this revision exists');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$select app.reissue_costing(%L)$$, (:'reissued'::jsonb ->> 'costing_id')),
  'a draft cannot be re-issued: only an approved costing can', 'only an approved costing');
rollback;

-- === A person can sweep their own company's quotations =======================
begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta's administrator, who costs nothing himself
select test.refuses('select app.check_my_quotation_expiry()',
  'somebody who may not change costings may not sweep quotations either',
  'you may not change quotations');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.check_my_quotation_expiry() as swept_by_hand \gset
select test.eq((:'swept_by_hand'::jsonb ->> 'expired')::int, 0,
  'and sweeping by hand after the job has run finds nothing left to do');
rollback;

-- Leave things as found.
update public.components set purchase_price = :old_price::numeric where id = :'part_id'::uuid;
delete from public.quotation_followups where quotation_id = :'q_sent'::uuid;
delete from public.quotations where id = :'q_sent'::uuid;
delete from public.costings where family_id = (select family_id from public.costings where id = :'plain_id'::uuid);
select test.feature(:'alpha'::uuid, 'approval_rules', false);
select test.feature(:'alpha'::uuid, 'quotation_validity', false);
select test.feature(:'beta'::uuid,  'approval_rules', false);
select test.feature(:'beta'::uuid,  'quotation_validity', false);
