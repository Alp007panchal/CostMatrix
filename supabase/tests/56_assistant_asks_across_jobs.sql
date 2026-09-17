-- Asking the assistant about the company's own jobs (migration 0135, roadmap
-- 3.7's remaining third). Runs after 15 (NPP-192 from the seed is costed), 21
-- (enquiries and their decisions) and 26 (assistant conversations exist).
--
-- The model is not called here — there is no provider in a database test. What
-- is proved is the read it is given: that it ranges over the company's jobs,
-- that it matches the way a person would ask, and above all that it shows one
-- company's work and never another's.
--
-- The assertion the slice rests on is the last block: Beta asks the same
-- question and gets nothing of Alpha's. `search_costings` is security invoker,
-- so that is row-level security doing it rather than a filter somebody wrote —
-- which is the reason it was built that way.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- ===========================================================================
-- A conversation may be about the company itself
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

insert into public.assistant_conversations (company_id, user_id, entity_type, entity_id, title)
values (:'alpha'::uuid, :'carol'::uuid, 'company', :'alpha'::uuid, 'What did we quote Triclover?')
returning id as conv \gset

select test.eq((select entity_type from public.assistant_conversations where id = :'conv'::uuid),
  'company', 'a conversation may be about the company itself');

-- The guard that keeps a question a question: a proposal still may not be.
select test.refuses(
  format($$insert into public.assistant_proposals
             (conversation_id, company_id, entity_type, entity_id, type, payload)
           values (%L::uuid, %L::uuid, 'company', %L::uuid, 'review', '{}'::jsonb)$$,
         :'conv', :'alpha', :'alpha'),
  'and a company-wide conversation still cannot propose anything',
  'assistant_proposals_entity_known');
commit;

-- ===========================================================================
-- What the question can see
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.ok((public.search_costings() -> 'costings') <> '[]'::jsonb,
  'asking with no words at all lists the company''s recent costings');

select test.ok(
  exists (select 1 from jsonb_array_elements(public.search_costings('NPP-192') -> 'costings') c
           where c ->> 'title' ilike '%NPP-192%'),
  'and a job can be found by the words a person would actually use');

select test.eq(
  (select count(*)::int from jsonb_array_elements(
     public.search_costings('no such job anywhere') -> 'costings')), 0,
  'a search that matches nothing says nothing, rather than everything');

-- Each row carries that costing's own frozen figures. The acceptance costing is
-- the one figure in this repository that must never move, so it is the one
-- asserted here too.
select test.eq(
  (select (c ->> 'material_cost')::numeric
     from jsonb_array_elements(public.search_costings('NPP-192 Option 1, from the seed') -> 'costings') c
    limit 1),
  3622781.80,
  'the figures it reports are the costing''s own: NPP-192 at 3,622,781.80');

select test.ok((public.search_costings() ->> 'note') ilike '%not%add them together%',
  'and it tells the reader not to total figures across jobs');

-- Filters, as the model would use them.
select test.ok(
  not exists (select 1 from jsonb_array_elements(
                public.search_costings(null, '{"status": "approved"}'::jsonb) -> 'costings') c
               where c ->> 'status' <> 'approved'),
  'filtering by status returns only that status');

select test.eq(
  (select count(*)::int from jsonb_array_elements(
     public.search_costings(null, '{}'::jsonb, 1) -> 'costings')), 1,
  'and the limit is honoured, so one question cannot drag the whole history in');
commit;

-- ===========================================================================
-- One company's work, never another's
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');

select test.eq(
  (select count(*)::int from jsonb_array_elements(public.search_costings('NPP-192') -> 'costings')), 0,
  'Beta asking the same question sees none of Alpha''s jobs');
-- An unfiltered answer returns Beta's own costings and no others. Compared
-- against `public.costings` read as Beta, which row-level security has already
-- scoped — so this asserts the two agree rather than trusting either alone.
select test.eq(
  (select count(*)::int from jsonb_array_elements(public.search_costings(null, '{}'::jsonb, 50) -> 'costings')),
  (select least(count(*), 50)::int from public.costings),
  'and an unfiltered answer is exactly the costings Beta can see, no more');
commit;

-- ===========================================================================
-- Put back what this file made
-- ===========================================================================
delete from public.assistant_conversations where title = 'What did we quote Triclover?';

select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
