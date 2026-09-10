-- One enquiry, one decision (migration 0016). Two offers against one enquiry:
-- winning one does not lose the other, it takes it off the table.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
set local role authenticated;
select test.sign_in(:'carol');

insert into public.customers (company_id, name, city)
values (:'alpha'::uuid, 'Decision Test Limited', 'Nairobi') returning id as cust \gset

select id as enq from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'Two boards, two offers')) \gset

-- Two offers against the one enquiry.
select id as c1 from public.create_costing('Offer A', null, :'enq'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'c1'::uuid, :'alpha'::uuid, 'A', 1);
select app.submit_costing(:'c1'::uuid);

select id as c2 from public.create_costing('Offer B', null, :'enq'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'c2'::uuid, :'alpha'::uuid, 'B', 1);
select app.submit_costing(:'c2'::uuid);

select test.sign_in(:'alice');
select app.approve_costing(:'c1'::uuid);
select app.approve_costing(:'c2'::uuid);
select id as q1 from public.release_quotation(:'c1'::uuid, format('%s/a.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'DECISION TEST LIMITED', 'customer_id', :'cust')) \gset
select id as q2 from public.release_quotation(:'c2'::uuid, format('%s/b.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'DECISION TEST LIMITED', 'customer_id', :'cust')) \gset
select public.set_quotation_status(:'q2'::uuid, 'sent', null);

-- === Winning the enquiry ====================================================
select test.refuses(format($$select public.decide_enquiry(%L, 'maybe')$$, :'enq'),
  'an enquiry is won or lost, nothing else', 'won or lost');
select test.refuses(format($$select public.decide_enquiry(%L, 'won')$$, :'enq'),
  'winning needs the quotation that won it named', 'which quotation');

select public.decide_enquiry(:'enq'::uuid, 'won', :'q2'::uuid) as report \gset

select test.eq((select status::text from public.quotations where id = :'q2'), 'won',
  'the quotation named is the one that won');
select test.eq((select status::text from public.quotations where id = :'q1'), 'superseded',
  'the other offer is superseded, not lost: it was never turned down');
select test.eq((select status::text from public.enquiries where id = :'enq'), 'won',
  'and the enquiry itself is won');
select test.eq((select won_quotation_id from public.enquiries where id = :'enq'), :'q2'::uuid,
  'the enquiry names the quotation that won it');
select test.eq((:'report'::jsonb->>'superseded')::int, 1, 'one offer was taken off the table');
select test.ok((select count(*) = 2 from public.v_costing_history
                where action = 'enquiry won'
                  and costing_id in (:'c1'::uuid, :'c2'::uuid)),
  'both costings of the enquiry say in their history that it was won');

-- === Losing an enquiry ======================================================
select test.sign_in(:'carol');
select id as enq2 from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'The one that got away')) \gset
select id as c3 from public.create_costing('Offer C', null, :'enq2'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'c3'::uuid, :'alpha'::uuid, 'C', 1);
select app.submit_costing(:'c3'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'c3'::uuid);
select id as q3 from public.release_quotation(:'c3'::uuid, format('%s/c.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'DECISION TEST LIMITED', 'customer_id', :'cust')) \gset

select test.refuses(format($$select public.decide_enquiry(%L, 'lost', null, '  ')$$, :'enq2'),
  'a lost enquiry needs a reason', 'why it was lost');
select test.refuses(format($$select public.decide_enquiry(%L, 'won', %L)$$, :'enq2', :'q1'),
  'the winning quotation must belong to the enquiry being decided',
  'does not belong to this enquiry');

select public.decide_enquiry(:'enq2'::uuid, 'lost', null, 'Price too high against a local fabricator');
select test.eq((select status::text from public.quotations where id = :'q3'), 'lost',
  'losing the enquiry loses the offer that was on the table');
select test.eq((select lost_reason from public.quotations where id = :'q3'),
               'Price too high against a local fabricator', 'with the reason on the quotation');
select test.eq((select lost_reason from public.enquiries where id = :'enq2'),
               'Price too high against a local fabricator', 'and on the enquiry, where the reports read it');
select test.eq((select status::text from public.enquiries where id = :'enq2'), 'lost',
  'the enquiry is lost');
select test.ok((select won_quotation_id is null from public.enquiries where id = :'enq2'),
  'and names no winner');
rollback;

-- === Somebody else's enquiry ================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.customers (company_id, name) values (:'alpha'::uuid, 'Reachable') returning id as cu \gset
select id as enq3 from public.create_enquiry(jsonb_build_object('customer_id', :'cu', 'title', 'Alpha only')) \gset
commit;

begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.refuses(format($$select public.decide_enquiry(%L, 'lost', null, 'nope')$$, :'enq3'),
  'another company cannot decide an enquiry it cannot see', 'no such enquiry');
rollback;

delete from public.enquiries where id = :'enq3'::uuid;
delete from public.customers where id = :'cu'::uuid;
