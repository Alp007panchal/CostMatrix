-- The assistant drafts the quotation's cover letter (migration 0133, roadmap
-- 3.7). The model is not called here — there is no provider in a database test
-- — so what is proved is everything either side of it: the new proposal type is
-- storable, it cannot be applied to the costing by mistake, and taking the words
-- is recorded as a person's act.
--
-- The one assertion worth the file on its own is the third: `app.apply_proposal`
-- (0104) has a branch per type and none for this one, so a wording proposal
-- would fall through every branch and fail on a null status — a refusal, but
-- spelled as a database error rather than a sentence anybody could act on.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- ===========================================================================
-- A costing, a conversation, and a drafted letter
-- ===========================================================================
-- `test.sign_in` sets its configuration transaction-locally, so every signed-in
-- stretch below opens its own transaction.
begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from public.create_costing('Letter wording, test 54') \gset

insert into public.assistant_conversations (company_id, user_id, entity_type, entity_id, title)
values (:'alpha'::uuid, :'carol'::uuid, 'costing', :'job'::uuid, 'Draft the letter')
returning id as conv \gset

insert into public.assistant_proposals (conversation_id, company_id, entity_type, entity_id, type, payload)
values (:'conv'::uuid, :'alpha'::uuid, 'costing', :'job'::uuid, 'quotation_wording', jsonb_build_object(
  'subject', 'QUOTATION FOR ONE MAIN LV BOARD',
  'opening', 'Thank you for your enquiry. We are pleased to offer the following.',
  'closing', 'We look forward to your instructions.',
  'notes',   'Form 3B enclosure, IP31, Siemens switchgear.'))
returning id as wording \gset

-- A review proposal on the same costing, to prove `use_quotation_wording`
-- refuses anything that is not a drafted letter.
insert into public.assistant_proposals (conversation_id, company_id, entity_type, entity_id, type, payload)
values (:'conv'::uuid, :'alpha'::uuid, 'costing', :'job'::uuid, 'review',
        jsonb_build_object('summary', 'Nothing to say', 'findings', '[]'::jsonb))
returning id as review \gset
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select type from public.assistant_proposals where id = :'wording'::uuid),
  'quotation_wording', 'a drafted letter can be stored: the type constraint was relaxed, not replaced');
select test.eq((select status from public.assistant_proposals where id = :'wording'::uuid),
  'open', 'and it starts open, like every other proposal');

-- The relaxation is a fourth value, not an open door.
select test.refuses(
  format($$insert into public.assistant_proposals (conversation_id, company_id, entity_type, entity_id, type, payload)
           values (%L::uuid, %L::uuid, 'costing', %L::uuid, 'quotation_price', '{}'::jsonb)$$,
         :'conv', :'alpha', :'job'),
  'a type nobody has defined is still refused', 'assistant_proposals_type_known');
commit;

-- ===========================================================================
-- It is never applied to the costing
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.refuses(
  format($$select public.apply_proposal(%L::uuid, '{}'::jsonb)$$, :'wording'),
  'a drafted letter cannot be applied to the costing',
  'open the Release page');

select test.eq((select status from public.assistant_proposals where id = :'wording'::uuid),
  'open', 'and the refusal left it exactly as it was');
select test.eq((select count(*)::int from public.costing_panels where costing_id = :'job'::uuid), 0,
  'nothing was added to the costing by trying');

-- ===========================================================================
-- Taking the words is a person's act, and it is recorded
-- ===========================================================================
select public.use_quotation_wording(:'wording'::uuid);

select test.eq((select status from public.assistant_proposals where id = :'wording'::uuid),
  'applied', 'using the wording closes the proposal');
select test.eq((select applied_by from public.assistant_proposals where id = :'wording'::uuid),
  :'alice'::uuid, 'and records who took it');
select test.eq((select count(*)::int from public.activity_log
                 where entity_id = :'job'::uuid and action = 'quotation.wording_used'), 1,
  'the activity log says the wording came from the assistant');

select test.refuses(
  format($$select public.use_quotation_wording(%L::uuid)$$, :'wording'),
  'the same draft cannot be taken twice', 'already applied');
select test.refuses(
  format($$select public.use_quotation_wording(%L::uuid)$$, :'review'),
  'and a review is not drafted wording', 'not drafted wording');

-- Nothing here releases a quotation: that is still the Release button.
select test.eq((select count(*)::int from public.quotations q
                 join public.costings c on c.id = q.costing_id where c.id = :'job'::uuid), 0,
  'and no quotation was released by any of it');
commit;

-- ===========================================================================
-- Another company sees none of it
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.assistant_proposals where id = :'wording'::uuid), 0,
  'Beta cannot see Alpha''s drafted letter');
select test.refuses(
  format($$select public.use_quotation_wording(%L::uuid)$$, :'wording'),
  'nor use it', 'no such proposal');
commit;

-- === Nothing that was already true stopped being true =======================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
