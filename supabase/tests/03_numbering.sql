-- Numbers are per company, per kind, per year, and never handed out twice.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.eq(app.next_number('costing'),
               format('CM-%s-0001', extract(year from now())::int),
  'the first costing of the year is 0001');
select test.eq(app.next_number('costing'),
               format('CM-%s-0002', extract(year from now())::int),
  'the second is 0002');
select test.eq(app.next_number('enquiry'),
               format('EN-%s-0001', extract(year from now())::int),
  'enquiries count separately from costings');
select test.eq(app.next_number('quotation'),
               format('QT-%s-0001', extract(year from now())::int),
  'quotations use the company prefix, QT by default');
-- Without the year the sequence is a separate, continuous one, which is how
-- the existing quotations are numbered (NPP-192 is the 192nd ever, not of the
-- year). A company picks one style and keeps it.
select test.eq(app.next_number('quotation', false), 'QT-0001',
  'a number without the year runs its own continuous sequence');
rollback;

-- A fresh transaction: the rollback above undid Alpha's counters.
begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.next_number('costing');
select app.next_number('costing');
select test.eq((select last_no from public.company_counters
                where company_id = :'alpha'::uuid and kind = 'costing')::int, 2,
  'the counter remembers the last number it issued');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.next_number('costing');
-- Bob's company starts its own sequence at 1, unaffected by Alpha.
select test.sign_in(:'bob');
select test.eq(app.next_number('costing'),
               format('CM-%s-0001', extract(year from now())::int),
  'another company starts its own sequence at 0001');
rollback;

-- The counter table is readable but not writable from outside the function.
begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.next_number('costing');
select test.refuses(
  format('update public.company_counters set last_no = 0 where company_id = %L', :'alpha'::uuid),
  'nobody can rewind a counter by hand',
  'permission denied');
rollback;
