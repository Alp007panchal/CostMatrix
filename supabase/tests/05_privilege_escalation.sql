-- Attempts to climb out of one's own company. Each of these was possible at
-- some point during development; they stay here so it cannot happen again.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set carol  '00000000-0000-0000-0000-0000000000a4'

-- The self-service clause on profiles_update exists so people can correct their
-- own name. It must not be a way to become the master admin.
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.refuses(
  format('update public.profiles set is_master_admin = true where id = %L', :'carol'::uuid),
  'a costing engineer cannot make herself the master admin',
  'only the master admin may grant master admin');

select test.refuses(
  format('update public.profiles set company_id = %L where id = %L', :'beta'::uuid, :'carol'::uuid),
  'and cannot move herself into another company',
  'only the master admin may move a person between companies');

with attempted as (
  update public.profiles set full_name = 'Carol Costing-Smith' where id = :'carol'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 1,
  'but she can still correct her own name');
rollback;

-- A company admin has real power inside their company and none outside it.
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.refuses(
  format('update public.profiles set is_master_admin = true where id = %L', :'alice'::uuid),
  'a company admin cannot make herself the master admin',
  'only the master admin may grant master admin');

select test.refuses(
  format('insert into public.user_roles (user_id, company_id, role) values (%L, %L, %L)',
         :'bob'::uuid, :'alpha'::uuid, 'approver'),
  'a company admin cannot give a role to somebody from another company',
  'violates foreign key constraint');

with attempted as (
  update public.profiles set is_active = false where id = :'carol'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 1,
  'but she can deactivate somebody in her own company');
rollback;

-- A costing engineer cannot deactivate colleagues.
begin;
set local role authenticated;
select test.sign_in(:'carol');
-- Filtered out by the policy rather than refused by the trigger: the row is
-- simply not one Carol may write, so the statement touches nothing.
with attempted as (
  update public.profiles set is_active = false where id = :'alice'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'a costing engineer cannot deactivate a colleague');
rollback;

-- Nobody is signed in: the role the public API uses before login.
begin;
set local role anon;
select test.refuses(
  'select count(*) from public.companies',
  'the anonymous role cannot read companies at all',
  'permission denied');
rollback;
