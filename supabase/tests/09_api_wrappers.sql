-- The public wrappers are what the app actually calls. If a grant is missing
-- or a parameter name drifts, every screen breaks, so they get their own test.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set alice  '00000000-0000-0000-0000-0000000000a2'

begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as costing_id from public.create_costing('Via the API', null) \gset
select test.ok(:'costing_id' is not null, 'public.create_costing works for a signed-in engineer');

insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'costing_id'::uuid, :'alpha'::uuid, 'P', 1) returning id as panel_id \gset

select test.ok(
  public.add_assembly_to_costing(:'panel_id'::uuid, '00000000-0000-0000-0000-00000000bb01', 1) is not null,
  'public.add_assembly_to_costing works');

select public.submit_costing(:'costing_id'::uuid);
select test.sign_in(:'alice');
select public.return_costing(:'costing_id'::uuid, 'checking the wrapper');
select test.eq((select status::text from public.costings where id = :'costing_id'), 'draft',
  'public.return_costing works, with its comment parameter');
select public.submit_costing(:'costing_id'::uuid);
select public.approve_costing(:'costing_id'::uuid);
select test.eq((select status::text from public.costings where id = :'costing_id'), 'approved',
  'public.approve_costing works');
select test.eq((select revision_no from public.create_costing_revision(:'costing_id'::uuid))::int, 1,
  'public.create_costing_revision works');
rollback;

begin;
set local role anon;
select test.refuses('select public.create_costing(''x'', null)',
  'the anonymous role cannot call any of them',
  'permission denied');
rollback;
