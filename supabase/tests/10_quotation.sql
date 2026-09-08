-- Releasing a quotation: who may, from what, numbered how, and what freezes.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

update public.companies set quotation_prefix = 'NPP', quotation_no_includes_year = false
 where id = :'alpha'::uuid;
update public.company_settings set signatory_name = 'Karen Jillo', payment_terms = '50% with order.'
 where company_id = :'alpha'::uuid;

-- Build and approve a costing as the cast would.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('LV switchboards for Triclover') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, '1600A MAIN LV BOARD', 1) returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 1);

select app.submit_costing(:'costing_id'::uuid);
select test.sign_in(:'alice');

-- The role is checked before the status, so this is asked as the approver.
select test.refuses(
  format('select public.release_quotation(%L, ''x.pdf'', ''{"customer_name":"T"}'')', :'costing_id'),
  'an unapproved costing cannot be quoted, even by an approver',
  'only an approved costing can be quoted');

select app.approve_costing(:'costing_id'::uuid);

-- Carol is a costing engineer; releasing is the approver's act.
select test.sign_in(:'carol');
select test.refuses(
  format('select public.release_quotation(%L, ''x.pdf'', ''{"customer_name":"T"}'')', :'costing_id'),
  'a costing engineer cannot release a quotation',
  'only an approver may release');

select test.sign_in(:'alice');
select test.refuses(
  format('select public.release_quotation(%L, '''', ''{"customer_name":"T"}'')', :'costing_id'),
  'no PDF, no release',
  'no PDF was stored');
select test.refuses(
  format('select public.release_quotation(%L, ''x.pdf'', ''{}'')', :'costing_id'),
  'a quotation needs a customer',
  'needs a customer name');

select id as q1, reference_no as ref1, subject as subj1, signatory_name as sig1, terms as terms1
from public.release_quotation(
  :'costing_id'::uuid,
  format('%s/whatever.pdf', :'alpha'),
  '{"customer_name": "TRICLOVER LIMITED", "notes_on_offer": "Siemens switchgear offered."}'::jsonb) \gset

select test.eq(:'ref1'::text, 'NPP-0001-REV0',
  'the reference is the company prefix, the sequence and the revision');
select test.eq(:'subj1'::text, 'QUOTATION FOR LV SWITCHBOARDS FOR TRICLOVER',
  'the subject defaults from the costing title');
select test.eq(:'sig1'::text, 'Karen Jillo',
  'the signatory defaults from the company settings');
select test.eq(((:'terms1'::jsonb)->>'payment')::text, '50% with order.'::text,
  'the terms default from the company settings and are frozen on the quotation');

select test.refuses(
  format('select public.release_quotation(%L, ''y.pdf'', ''{"customer_name":"T"}'')', :'costing_id'),
  'a revision cannot be quoted twice',
  'already been quoted');

select test.eq((select count(*) from public.costing_history
                where costing_id = :'costing_id' and action = 'quotation released')::int, 1,
  'the release is in the costing history');

-- Revise, approve again, release again: same sequence, next REV.
select id as rev_id from app.create_costing_revision(:'costing_id'::uuid) \gset
select app.submit_costing(:'rev_id'::uuid);
select app.approve_costing(:'rev_id'::uuid);
select reference_no as ref2 from public.release_quotation(
  :'rev_id'::uuid, format('%s/rev1.pdf', :'alpha'), '{"customer_name": "TRICLOVER LIMITED"}'::jsonb) \gset
select test.eq(:'ref2'::text, 'NPP-0001-REV1',
  'a revision keeps the customer-facing number and bumps only the REV');

-- Status.
select public.set_quotation_status(:'q1'::uuid, 'sent', null);
select test.eq((select status::text from public.quotations where id = :'q1'), 'sent',
  'a released quotation can be marked sent');
select test.refuses(format('select public.set_quotation_status(%L, ''lost'', ''  '')', :'q1'),
  'losing needs a reason',
  'say why it was lost');
select public.set_quotation_status(:'q1'::uuid, 'lost', 'Price too high against a local fabricator');
select test.eq((select lost_reason from public.quotations where id = :'q1'),
               'Price too high against a local fabricator',
  'and the reason is kept');
select test.refuses(format('select public.set_quotation_status(%L, ''won'', null)', :'q1'),
  'a decided quotation cannot be changed',
  'already been decided');
commit;

-- Another company sees nothing.
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.quotations)::int, 0,
  'Beta cannot see Alpha''s quotations');
rollback;

-- Nobody writes the table directly.
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  format('update public.quotations set status = ''won'' where id = %L', :'q1'),
  'even an approver cannot edit a quotation row by hand',
  'permission denied');
rollback;

-- With the year on, the reference carries it.
update public.companies set quotation_no_includes_year = true where id = :'alpha'::uuid;
begin;
set local role authenticated;
select test.sign_in(:'alice');
select id as c3 from app.create_costing('Year test') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'c3'::uuid, :'alpha'::uuid, 'P', 1);
select app.submit_costing(:'c3'::uuid);
select app.approve_costing(:'c3'::uuid);
select reference_no as ref3 from public.release_quotation(
  :'c3'::uuid, format('%s/c3.pdf', :'alpha'), '{"customer_name": "X"}'::jsonb) \gset
select test.eq(:'ref3'::text, format('NPP-%s-0001-REV0', extract(year from now())::int),
  'with the year switched on, the reference carries it and starts its own sequence');
rollback;

delete from public.quotations where company_id = :'alpha'::uuid;
update public.costings set quotation_seq = null, quotation_seq_year = null where company_id = :'alpha'::uuid;
delete from public.costings where company_id = :'alpha'::uuid;
update public.companies set quotation_prefix = 'QT', quotation_no_includes_year = false where id = :'alpha'::uuid;
