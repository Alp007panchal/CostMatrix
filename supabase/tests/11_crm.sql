-- Customers are typed once and chosen everywhere; enquiries are numbered;
-- the enquiry follows the quotation's fate; none of it crosses companies.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
set local role authenticated;
select test.sign_in(:'carol');

insert into public.customers (company_id, name, city) values (:'alpha'::uuid, 'Triclover Limited', 'Nairobi')
returning id as cust \gset
insert into public.contacts (company_id, customer_id, name, email, is_primary)
values (:'alpha'::uuid, :'cust'::uuid, 'J. Kamau', 'jk@triclover.test', true) returning id as cont \gset
insert into public.projects (company_id, customer_id, name, site_location)
values (:'alpha'::uuid, :'cust'::uuid, 'Plant expansion', 'Athi River') returning id as proj \gset

select test.ok(:'cust' is not null and :'cont' is not null and :'proj' is not null,
  'a costing engineer can create a customer, a contact and a project');

select id as enq, enquiry_no as enq_no from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'contact_id', :'cont', 'project_id', :'proj',
                     'title', 'LV switchboards', 'source', 'email')) \gset
select test.eq(:'enq_no'::text, format('EN-%s-0001', extract(year from now())::int),
  'an enquiry is numbered for the company and the year');
select test.eq((select status::text from public.enquiries where id = :'enq'), 'open',
  'and starts open');

select test.refuses('select public.create_enquiry(''{"title": "no customer"}'')',
  'an enquiry needs a customer of your own company',
  'choose a customer');

-- A costing linked to it, then quoted, then decided: the enquiry follows.
select id as costing_id from public.create_costing('Triclover boards', null, :'enq'::uuid) \gset
select test.eq((select enquiry_id from public.costings where id = :'costing_id'), :'enq'::uuid,
  'a costing can be created against an enquiry');
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'P', 1);
select app.submit_costing(:'costing_id'::uuid);

select test.sign_in(:'alice');
select app.approve_costing(:'costing_id'::uuid);
select id as q from public.release_quotation(:'costing_id'::uuid, format('%s/x.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'TRICLOVER LIMITED', 'customer_id', :'cust', 'contact_id', :'cont')) \gset
select test.eq((select customer_id from public.quotations where id = :'q'), :'cust'::uuid,
  'the quotation records which customer it went to');
select test.eq((select contact_id from public.quotations where id = :'q'), :'cont'::uuid,
  'and which contact');

select public.set_quotation_status(:'q'::uuid, 'sent', null);
select test.eq((select status::text from public.enquiries where id = :'enq'), 'quoted',
  'sending the quotation marks the enquiry quoted');
select public.set_quotation_status(:'q'::uuid, 'won', null);
select test.eq((select status::text from public.enquiries where id = :'enq'), 'won',
  'winning it marks the enquiry won');

-- A revision keeps the enquiry.
select id as rev from app.create_costing_revision(:'costing_id'::uuid) \gset
select test.eq((select enquiry_id from public.costings where id = :'rev'), :'enq'::uuid,
  'a revision inherits the enquiry');

-- Follow-ups.
insert into public.quotation_followups (company_id, quotation_id, due_on, note)
values (:'alpha'::uuid, :'q'::uuid, current_date + 7, 'Call about delivery') returning id as fu \gset
update public.quotation_followups set done_at = now() where id = :'fu'::uuid;
select test.ok((select done_at is not null from public.quotation_followups where id = :'fu'),
  'a follow-up can be logged and marked done');

-- A contact cannot be attached to another company''s customer, whatever the row says.
select test.refuses(
  format('insert into public.contacts (company_id, customer_id, name) values (%L, %L, ''X'')', :'beta'::uuid, :'cust'::uuid),
  'a contact cannot point at a customer of a different company',
  'row-level security');
commit;

begin;
-- Give Bob the engineer role for this block, so the refusal below is about
-- ownership rather than about his role. Rolled back with the transaction.
insert into public.user_roles (user_id, company_id, role) values (:'bob'::uuid, :'beta'::uuid, 'costing_engineer');
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.customers)::int, 0, 'Beta sees no Alpha customers');
select test.eq((select count(*) from public.enquiries)::int, 0, 'nor enquiries');
select test.eq((select count(*) from public.quotation_followups)::int, 0, 'nor follow-ups');
select test.refuses(
  format('select public.create_costing(''x'', null, %L)', :'enq'),
  'Beta cannot create a costing against an Alpha enquiry',
  'not one of yours');
rollback;

-- Clean up so later runs of this file start fresh.
delete from public.quotation_followups where company_id = :'alpha'::uuid;
delete from public.quotations where company_id = :'alpha'::uuid;
update public.costings set quotation_seq = null, quotation_seq_year = null where company_id = :'alpha'::uuid;
delete from public.costings where company_id = :'alpha'::uuid;
delete from public.enquiries where company_id = :'alpha'::uuid;
delete from public.customers where company_id = :'alpha'::uuid;
