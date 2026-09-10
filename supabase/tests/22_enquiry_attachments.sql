-- Files kept with the enquiry (migration 0017). The files themselves live in
-- Supabase storage, which this harness does not have; what is asserted here is
-- the record of them and who may see it.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set dan    '00000000-0000-0000-0000-0000000000a5'
\set master '00000000-0000-0000-0000-0000000000a1'

begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.customers (company_id, name) values (:'alpha'::uuid, 'Attachment Test Limited')
returning id as cust \gset
select id as enq from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'Single line diagram attached')) \gset

insert into public.enquiry_attachments (enquiry_id, company_id, file_name, path, mime_type, size_bytes, note)
values (:'enq'::uuid, :'alpha'::uuid, 'single-line.pdf',
        format('%s/%s/1700000000-single-line.pdf', :'alpha', :'enq'), 'application/pdf', 84210,
        'As received with the RFQ')
returning id as att \gset

select test.eq((select file_name from public.enquiry_attachments where id = :'att'), 'single-line.pdf',
  'a costing engineer can attach a file to an enquiry of her company');
select test.ok((select created_by = :'carol'::uuid from public.enquiry_attachments where id = :'att'),
  'and the record says who attached it');
commit;

-- === It cannot hang off another company's enquiry ===========================
begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.eq((select count(*)::int from public.enquiry_attachments where enquiry_id = :'enq'::uuid), 0,
  'Beta sees no file of Alpha''s enquiry');
select test.refuses(
  format($$insert into public.enquiry_attachments (enquiry_id, company_id, file_name, path)
           values (%L, %L, 'sneaky.pdf', 'x/sneaky.pdf')$$, :'enq', :'beta'),
  'and cannot file anything against it', 'policy');
rollback;

-- Even inside her own company, a file can only hang off an enquiry that is
-- really there: the foreign key is on the pair, not on the enquiry alone.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.enquiry_attachments (enquiry_id, company_id, file_name, path)
           values (%L, %L, 'nowhere.pdf', 'z/nowhere.pdf')$$,
         '00000000-0000-0000-0000-0000000000ff', :'alpha'),
  'a file cannot hang off an enquiry that is not that company''s',
  'violates foreign key');
rollback;

-- === Who may attach and who may only look ===================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*)::int from public.enquiry_attachments where enquiry_id = :'enq'::uuid), 1,
  'the master admin reads every company''s files');
select test.refuses(
  format($$insert into public.enquiry_attachments (enquiry_id, company_id, file_name, path)
           values (%L, %L, 'mine.pdf', 'y/mine.pdf')$$, :'enq', :'alpha'),
  'and cannot add one: the master admin reads tenant data, never writes it', 'policy');
rollback;

-- === The record follows the enquiry =========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.enquiry_attachments (enquiry_id, company_id, file_name, path)
           values (%L, %L, 'again.pdf', %L)$$, :'enq', :'alpha',
         format('%s/%s/1700000000-single-line.pdf', :'alpha', :'enq')),
  'one row per stored file: the same path cannot be filed twice', 'unique');
rollback;

-- An enquiry is never deleted by a signed-in user — there is no policy for it —
-- so the cascade is checked as the owner, and rolled back.
begin;
delete from public.enquiries where id = :'enq'::uuid;
select test.eq((select count(*)::int from public.enquiry_attachments where enquiry_id = :'enq'::uuid), 0,
  'deleting the enquiry takes its file records with it');
rollback;

delete from public.enquiry_attachments where id = :'att'::uuid;
delete from public.enquiries where id = :'enq'::uuid;
delete from public.customers where id = :'cust'::uuid;
