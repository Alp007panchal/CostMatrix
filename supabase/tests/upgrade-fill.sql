-- The rehearsal needs the rows production has, and the tests before it leave no
-- quotation behind — every one of them rolls its own back. 0108 adds columns to
-- `quotations` and a sweep that reads them, so a quotation that exists before
-- the upgrade is exactly the row worth having on the table when it runs.
--
-- So: take the NPP-192 costing the acceptance test built, carry it through to
-- approval and release a quotation from it, and leave both committed.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'

select id as npp from public.costings
 where title = 'NPP-192 Option 1, from the seed' \gset

begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'npp'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'npp'::uuid);
select id as q_id from public.release_quotation(:'npp'::uuid,
  format('%s/rehearsal.pdf', :'alpha'),
  '{"customer_name": "TRICLOVER LIMITED"}'::jsonb) \gset
select app.set_quotation_status(:'q_id'::uuid, 'sent');
commit;

select test.ok((select count(*) from public.quotations) = 1,
  'the rehearsal database holds a released quotation, as production does');
