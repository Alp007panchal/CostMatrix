-- Does the home page show the work waiting on you? (migration 0126)
--
-- Four things that nothing else in the app will mention again on its own: a
-- costing sent back with a comment (it is a draft again, indistinguishable from
-- any other draft), a costing waiting for an approver, a quotation released and
-- never sent, and one sent that nobody has answered.
--
-- The assertions worth reading are the negative ones. A desk that lists work you
-- cannot do, or somebody else's work, is a screen people stop looking at — which
-- costs more than not having built it.
--
-- One transaction, rolled back, so the files after this see what they expected.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
select test.feature(:'alpha'::uuid, 'my_desk', true);

set local role authenticated;
select test.sign_in(:'carol');

-- Carol makes three jobs: one that comes back to her, one she submits and leaves
-- with the approver, and one she simply leaves in draft.
select id as sent_back from app.create_costing('Desk: sent back to me') \gset
select id as submitted from app.create_costing('Desk: waiting for an approver') \gset
select id as untouched from app.create_costing('Desk: a draft like any other') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom) values
  (:'sent_back'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC'),
  (:'submitted'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC');
select app.submit_costing(:'sent_back'::uuid);
select app.submit_costing(:'submitted'::uuid);

select test.sign_in(:'alice');
select app.return_costing(:'sent_back'::uuid, 'The 400 A feeder is priced twice');

-- === What comes back to the person who sent it up ==========================
select test.sign_in(:'carol');
select kind as k_back, detail as d_back, reference as r_back
  from public.v_my_desk where entity_id = :'sent_back'::uuid \gset
select test.eq(:'k_back'::text, 'returned_to_you',
  'a costing sent back to you is on your desk');
select test.eq(:'d_back'::text, 'The 400 A feeder is priced twice',
  'carrying the comment it was sent back with, which is the whole reason it is there');
select test.ok(:'r_back'::text like 'CM-%',
  'and its number, so it can be found without opening it');

select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'untouched'::uuid), 0,
  'a draft nobody has sent back is not on it: this is work waiting, not a list of costings');

-- === Only somebody who can act on it is shown it ============================
select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'submitted'::uuid), 0,
  'a costing engineer is not shown a queue she cannot clear');

select test.sign_in(:'alice');
select test.eq((select kind from public.v_my_desk where entity_id = :'submitted'::uuid),
  'waiting_for_you', 'the approver is');
select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'sent_back'::uuid), 0,
  'and the job she sent back is on the engineer''s desk, not on hers');

-- === A quotation released and never sent ====================================
select app.approve_costing(:'submitted'::uuid);
select id as quote from public.release_quotation(:'submitted'::uuid,
  format('%s/desk-test.pdf', :'alpha'),
  '{"customer_name": "TRICLOVER LIMITED"}'::jsonb) \gset

select kind as k_rel, title as t_rel from public.v_my_desk where entity_id = :'quote'::uuid \gset
select test.eq(:'k_rel'::text, 'released_not_sent',
  'a quotation whose PDF exists and whom nobody has told the customer about is on the desk');
select test.eq(:'t_rel'::text, 'TRICLOVER LIMITED',
  'named by its customer, because that is what a person remembers it by');

-- Approving it took it off the approver's desk in the same breath.
select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'submitted'::uuid), 0,
  'and approving the costing cleared it from the desk, without anybody ticking anything');

-- === Sent, and then answered ================================================
select app.set_quotation_status(:'quote'::uuid, 'sent');
select test.eq((select kind from public.v_my_desk where entity_id = :'quote'::uuid),
  'sent_unanswered', 'once sent it is still on the desk, under a different heading');
select test.eq((select detail from public.v_my_desk where entity_id = :'quote'::uuid),
  'Sent, and neither won nor lost since',
  'and says why it is there rather than implying something is wrong');

select app.set_quotation_status(:'quote'::uuid, 'won');
select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'quote'::uuid), 0,
  'and an answer takes it off, whichever way the answer went');

-- === How long it has been sitting ===========================================
reset role;
update public.costings set returned_at = now() - interval '9 days' where id = :'sent_back'::uuid;
set local role authenticated;
select test.sign_in(:'carol');
select test.eq((select days::int from public.v_my_desk where entity_id = :'sent_back'::uuid), 9,
  'each line says how many days it has sat there, counted by the database''s own clock');

-- === One company's desk is its own ==========================================
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_my_desk where entity_id = :'sent_back'::uuid), 0,
  'another company sees none of it');
select test.eq((select count(*)::int from public.v_my_desk
                 where entity_id in (:'submitted'::uuid, :'quote'::uuid)), 0,
  'not the costings, and not the quotations');

rollback;

-- === Nothing that was already true stopped being true =======================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
