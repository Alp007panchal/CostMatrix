-- Documents (migration 0101), which replaced enquiry_attachments (0017). The
-- files themselves live in Supabase storage, which this harness does not have;
-- what is asserted here is the record of them, who may see it, and that every
-- guarantee the old composite foreign key gave is kept by the trigger that
-- replaced it. Also the activity log, which arrived in the same migration.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.customers (company_id, name) values (:'alpha'::uuid, 'Attachment Test Limited')
returning id as cust \gset
select id as enq from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'Single line diagram attached')) \gset

insert into public.documents (company_id, entity_type, entity_id, file_name, path, mime_type, size_bytes, note)
values (:'alpha'::uuid, 'enquiry', :'enq'::uuid, 'single-line.pdf',
        format('%s/enquiry/%s/1700000000-single-line.pdf', :'alpha', :'enq'), 'application/pdf', 84210,
        'As received with the RFQ')
returning id as att \gset

select test.eq((select file_name from public.documents where id = :'att'), 'single-line.pdf',
  'a costing engineer can attach a file to an enquiry of her company');
select test.ok((select created_by = :'carol'::uuid from public.documents where id = :'att'),
  'and the record says who attached it');
select test.eq((select extraction_status from public.documents where id = :'att'), 'pending',
  'and it is waiting for its text to be extracted');
commit;

-- === It cannot hang off another company's record ============================
begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.eq((select count(*)::int from public.documents where entity_id = :'enq'::uuid), 0,
  'Beta sees no file of Alpha''s enquiry');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'enquiry', %L, 'sneaky.pdf', 'x/sneaky.pdf')$$, :'beta', :'enq'),
  'and cannot file anything against it', 'no such enquiry');
rollback;

-- Even inside her own company, a file can only hang off a record that is really
-- there. The old table said this with a composite foreign key; a generic table
-- says it with a trigger, and the answer is the same.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'enquiry', %L, 'nowhere.pdf', 'z/nowhere.pdf')$$,
         :'alpha', '00000000-0000-0000-0000-0000000000ff'),
  'a file cannot hang off an enquiry that is not that company''s',
  'no such enquiry');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'costing', null, 'orphan.pdf', 'z/orphan.pdf')$$, :'alpha'),
  'nor off no costing at all',
  'must name the costing');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'tender', %L, 'odd.pdf', 'z/odd.pdf')$$, :'alpha', :'enq'),
  'and only the known kinds of record are accepted',
  'documents_entity_type_known');
rollback;

-- === Who may attach and who may only look ===================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*)::int from public.documents where entity_id = :'enq'::uuid), 1,
  'the master admin reads every company''s files');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'enquiry', %L, 'mine.pdf', 'y/mine.pdf')$$, :'alpha', :'enq'),
  'and cannot add one: the master admin reads tenant data, never writes it', 'policy');
rollback;

-- === One row per stored file ===============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.documents (company_id, entity_type, entity_id, file_name, path)
           values (%L, 'enquiry', %L, 'again.pdf', %L)$$, :'alpha', :'enq',
         format('%s/enquiry/%s/1700000000-single-line.pdf', :'alpha', :'enq')),
  'one row per stored file: the same path cannot be filed twice', 'unique');
rollback;

-- === A document on a costing, too ==========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as cst from app.create_costing('Board with a spec attached', null, :'enq'::uuid) \gset
insert into public.documents (company_id, entity_type, entity_id, file_name, path)
values (:'alpha'::uuid, 'costing', :'cst'::uuid, 'spec.pdf',
        format('%s/costing/%s/1700000001-spec.pdf', :'alpha', :'cst'))
returning id as cdoc \gset
commit;
select test.eq((select entity_type from public.documents where id = :'cdoc'), 'costing',
  'a file can be kept with a costing as well as with an enquiry');

-- === The record follows the record it belongs to ============================
-- An enquiry is never deleted by a signed-in user — there is no policy for it —
-- so the cascade is checked as the owner, and rolled back.
begin;
delete from public.costings where id = :'cst'::uuid;
select test.eq((select count(*)::int from public.documents where id = :'cdoc'::uuid), 0,
  'deleting the costing takes its file records with it');
delete from public.enquiries where id = :'enq'::uuid;
select test.eq((select count(*)::int from public.documents where entity_id = :'enq'::uuid), 0,
  'and deleting the enquiry takes its file records with it, as the old foreign key did');
rollback;

-- === The activity log ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.write_activity('enquiry', :'enq'::uuid, 'note.added', null,
                          jsonb_build_object('text', 'Customer called about delivery'),
                          'Spoke to Mr Patel') as act \gset
commit;

select test.eq((select action from public.activity_log where id = :'act'), 'note.added',
  'a person writes to the activity log through the one function');
select test.eq((select actor_user_id from public.activity_log where id = :'act'), :'carol'::uuid,
  'and it says who');
select test.eq((select company_id from public.activity_log where id = :'act'), :'alpha'::uuid,
  'and for which company, without being told');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$insert into public.activity_log (company_id, entity_type, action) values (%L, 'enquiry', 'x')$$, :'alpha'),
  'nobody writes the log directly: it is a log', 'permission denied');
select test.refuses(
  format($$delete from public.activity_log where id = %L$$, :'act'),
  'and nobody deletes from it', 'permission denied');
select test.refuses(
  $$select app.write_activity('enquiry', null, 'x', null, null, null, 'robot')$$,
  'an actor is a user, the assistant or the system, nothing else', 'unknown actor kind');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.activity_log where id = :'act'::uuid), 0,
  'another company sees none of it');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*)::int from public.activity_log where id = :'act'::uuid), 1,
  'the master admin reads every company''s log');
rollback;

-- Leave things as found. The log is append-only for users; the owner may tidy.
delete from public.activity_log where id = :'act'::uuid;
delete from public.documents where id = :'att'::uuid;
delete from public.costings where id = :'cst'::uuid;
delete from public.enquiries where id = :'enq'::uuid;
delete from public.customers where id = :'cust'::uuid;
