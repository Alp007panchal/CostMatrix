-- Switching the assistant on for another company (migration 0134, roadmap 3.7's
-- last third). Runs after 26, which leaves Alpha with assistant conversations.
--
-- The permission has existed since 0102; what this proves is that the two
-- functions the screen shows beside the switch now answer about the company
-- being looked at, and that nobody but the master administrator can look.
--
-- The assertion the whole slice rests on is the third block: Alpha's own
-- administrator is refused Beta's figures. Without it, "may name a company"
-- would be a hole in the tenancy rather than a feature.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set master '00000000-0000-0000-0000-0000000000a1'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- ===========================================================================
-- With no argument, nothing has changed
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.eq((public.assistant_allowance() ->> 'company_id')::uuid, :'alpha'::uuid,
  'with no argument the allowance is about your own company, exactly as before');
select test.eq((public.assistant_usage() ->> 'company_id')::uuid, :'alpha'::uuid,
  'and so is the usage');
select test.eq(public.assistant_allowance(:'alpha'::uuid), public.assistant_allowance(),
  'naming your own company gives the same answer as naming none');
commit;

-- ===========================================================================
-- The master administrator switches Beta on, and sees Beta while doing it
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'master');

select test.eq((public.assistant_usage(:'beta'::uuid) ->> 'company_id')::uuid, :'beta'::uuid,
  'the master administrator may read another company''s usage');
select test.eq(((public.assistant_allowance(:'beta'::uuid)) ->> 'enabled')::boolean, false,
  'and Beta starts with the assistant off, like every company');

update public.company_options set value = 'true'::jsonb
 where company_id = :'beta'::uuid and key = 'ai_enabled';

select test.eq(((public.assistant_allowance(:'beta'::uuid)) ->> 'enabled')::boolean, true,
  'switching it on for Beta is read back as on for Beta');
select test.eq(((public.assistant_allowance(:'alpha'::uuid)) ->> 'enabled')::boolean, false,
  'and Alpha is untouched by it — the point of doing this per company');

-- The figures beside the switch are Beta's, not the master administrator's own.
select test.eq((public.assistant_usage(:'beta'::uuid) -> 'allowance' ->> 'company_id')::uuid,
  :'beta'::uuid, 'the allowance inside the usage is about the same company as the usage');
commit;

-- ===========================================================================
-- Nobody else may look, and nobody else may switch
-- ===========================================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.refuses(
  format($$select public.assistant_usage(%L::uuid)$$, :'beta'),
  'a company administrator cannot read another company''s usage',
  'only the master administrator');
select test.refuses(
  format($$select public.assistant_allowance(%L::uuid)$$, :'beta'),
  'nor its allowance', 'only the master administrator');

-- The 0102 trigger already refused this; asserted here because the screen now
-- offers the switch to somebody who might try it against another company.
select test.refuses(
  format($$update public.company_options set value = 'true'::jsonb
            where company_id = %L::uuid and key = 'ai_enabled'$$, :'alpha'),
  'and cannot switch the assistant on even for their own company',
  'master administrator');
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.refuses(
  format($$select public.assistant_usage(%L::uuid)$$, :'alpha'),
  'Beta cannot read Alpha''s usage either', 'only the master administrator');
select test.eq((public.assistant_usage() ->> 'company_id')::uuid, :'beta'::uuid,
  'though Beta reads its own, now that it has the assistant');
commit;

-- ===========================================================================
-- Put back what this file changed
-- ===========================================================================
update public.company_options set value = 'false'::jsonb
 where company_id = :'beta'::uuid and key = 'ai_enabled';

select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
