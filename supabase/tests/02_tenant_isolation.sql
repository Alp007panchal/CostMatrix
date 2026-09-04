-- The promise CostMatrix makes to every company: nobody else can see your data.
-- These run as ordinary signed-in users, so they exercise the real policies.
--
-- Cast: Alice is a company admin and approver at Alpha; Carol is a costing
-- engineer at Alpha; Bob is a company admin at Beta; Master is the master admin;
-- Dan is a deactivated Alpha admin.

\set alpha    '00000000-0000-0000-0000-0000000000c2'
\set beta     '00000000-0000-0000-0000-0000000000c3'
\set alice    '00000000-0000-0000-0000-0000000000a2'
\set bob      '00000000-0000-0000-0000-0000000000a3'
\set carol    '00000000-0000-0000-0000-0000000000a4'
\set dan      '00000000-0000-0000-0000-0000000000a5'
\set master   '00000000-0000-0000-0000-0000000000a1'

-- === Reading =============================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

select test.eq((select count(*) from public.companies)::int, 1,
  'Alice sees exactly one company');
select test.eq((select name from public.companies), 'Alpha Contractors',
  'and it is her own');
select test.eq(app.current_company_id(), :'alpha'::uuid,
  'current_company_id resolves to Alpha');
select test.ok(app.has_role('company_admin'),
  'Alice holds company_admin');
select test.ok(not app.has_role('costing_engineer'),
  'Alice does not hold a role she was not given');
select test.ok(not app.is_master_admin(),
  'Alice is not the master admin');
select test.eq((select count(*) from public.profiles)::int, 3,
  'Alice sees the three people at Alpha, nobody from Beta');
select test.eq((select count(*) from public.profiles where company_id = :'beta'::uuid)::int, 0,
  'Beta profiles are invisible even when asked for by id');
select test.eq((select count(*) from public.company_settings)::int, 1,
  'Alice sees only her own company settings');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*) from public.companies)::int, 1,
  'Bob sees exactly one company');
select test.eq((select name from public.companies), 'Beta Consultants',
  'and it is Beta, not Alpha');
rollback;

-- Counted as the owner, before dropping to a signed-in user, so the assertion
-- says "sees everything" rather than "sees the number I happened to write here"
-- and does not break when the fixture or the seed grows.
select count(*)::int as total_companies from public.companies \gset
select count(*)::int as total_people    from public.profiles  \gset

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*) from public.companies)::int, :total_companies,
  'the master admin sees every company');
select test.eq((select count(*) from public.profiles)::int, :total_people,
  'and every person');
select test.ok(app.is_master_admin(),
  'is_master_admin is true for the master admin');
rollback;

-- === Writing =============================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');

-- Silently affecting nothing is the correct outcome for an UPDATE the policy
-- filters out: the row is simply not visible to the statement.
with attempted as (
  update public.companies set name = 'Hijacked' where id = :'beta'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'Alice cannot rename Beta');

with attempted as (
  update public.companies set name = 'Alpha Contractors Ltd' where id = :'alpha'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 1,
  'Alice can rename her own company');

select test.refuses(
  format('update public.companies set discount_pct = 0 where id = %L', :'alpha'::uuid),
  'Alice cannot change her own discount',
  'only the master admin may change a company discount');

select test.refuses(
  format('insert into public.profiles (id, company_id, full_name) values (%L, %L, %L)',
         '00000000-0000-0000-0000-0000000000b9', :'beta'::uuid, 'Planted'),
  'Alice cannot add a person to Beta',
  'row-level security');

select test.refuses(
  format('insert into public.user_roles (user_id, company_id, role) values (%L, %L, %L)',
         :'bob'::uuid, :'beta'::uuid, 'approver'),
  'Alice cannot grant a role inside Beta',
  'row-level security');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'carol');
-- Carol is a costing engineer, not an admin.
select test.refuses(
  format('insert into public.user_roles (user_id, company_id, role) values (%L, %L, %L)',
         :'carol'::uuid, :'alpha'::uuid, 'approver'),
  'a costing engineer cannot give herself the approver role',
  'row-level security');

with attempted as (
  update public.companies set labour_margin_pct = 50 where id = :'alpha'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'a costing engineer cannot change the company margin');
rollback;

-- === The master admin looks but does not touch ============================
begin;
set local role authenticated;
select test.sign_in(:'master');

with attempted as (
  update public.company_settings set payment_terms = 'changed by master'
  where company_id = :'alpha'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 0,
  'the master admin cannot edit a company''s own quotation wording');

with attempted as (
  update public.companies set discount_pct = 12.5 where id = :'alpha'::uuid returning 1
)
select test.eq((select count(*) from attempted)::int, 1,
  'but the master admin can set the discount');
rollback;

-- === Deactivated people ===================================================
begin;
set local role authenticated;
select test.sign_in(:'dan');
select test.eq(app.current_company_id(), null::uuid,
  'a deactivated person belongs to no company');
select test.eq((select count(*) from public.companies)::int, 0,
  'and sees nothing at all, despite still holding company_admin');
rollback;

-- === Nobody signed in =====================================================
begin;
set local role authenticated;
select test.eq((select count(*) from public.companies)::int, 0,
  'an unauthenticated session sees nothing');
rollback;
