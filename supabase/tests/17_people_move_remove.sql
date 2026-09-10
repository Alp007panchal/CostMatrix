-- Correcting a person added by mistake (migration 0012). The rule the whole
-- feature rests on: somebody with no records may be moved or removed; somebody
-- with even one record may not, because their name belongs on that work.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'
\set fresh  '00000000-0000-0000-0000-00000000f7a1'

-- A person invited a minute ago: a login, a profile, one role, nothing else.
insert into auth.users (id, email) values (:'fresh', 'fresh@alpha.test');
insert into public.profiles (id, company_id, full_name, email)
values (:'fresh', :'alpha'::uuid, 'Fresh Invitation', 'fresh@alpha.test');
insert into public.user_roles (user_id, company_id, role)
values (:'fresh', :'alpha'::uuid, 'costing_engineer');

-- === What counts as a record ==============================================
begin;
set local role authenticated;
select test.sign_in(:'master');

select test.eq(app.person_footprint(:'fresh'::uuid), 0,
  'somebody just invited has no records at all');
select test.ok(app.person_footprint(:'carol'::uuid) > 0,
  'somebody who has built costings does have records');
select test.eq((select records from app.person_footprints() where user_id = :'fresh'::uuid), 0,
  'and the same count comes back for the whole list at once');
select test.eq((select count(*) from app.person_footprints())::int,
               (select count(*) from public.profiles)::int,
  'the master admin sees a count for everybody');
commit;

-- === Moving somebody who has done nothing =================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.move_person(:'fresh'::uuid, :'beta'::uuid);

select test.eq((select company_id from public.profiles where id = :'fresh'::uuid), :'beta'::uuid,
  'the master admin moves a fresh invitation to another company');
select test.eq((select company_id from public.user_roles where user_id = :'fresh'::uuid), :'beta'::uuid,
  'and their roles move with them');
select test.eq((select role::text from public.user_roles where user_id = :'fresh'::uuid), 'costing_engineer',
  'keeping the roles they were given');

-- Back again, so the rest of the file starts where it began.
select app.move_person(:'fresh'::uuid, :'alpha'::uuid);
select test.eq((select company_id from public.profiles where id = :'fresh'::uuid), :'alpha'::uuid,
  'and can be moved back');
commit;

-- === What is refused =======================================================
begin;
set local role authenticated;
select test.sign_in(:'master');

select test.refuses(
  format('select app.move_person(%L, %L)', :'carol', :'beta'),
  'somebody with records cannot be moved',
  'records already');
select test.refuses(
  format('select app.move_person(%L, %L)', :'master', :'beta'),
  'the master admin cannot be moved',
  'belongs to every company');
select test.refuses(
  format('select app.move_person(%L, ''00000000-0000-0000-0000-0000000000ff'')', :'fresh'),
  'a company that does not exist is refused',
  'no such company');
commit;

-- === Who may ask ===========================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(
  format('select app.move_person(%L, %L)', :'fresh', :'beta'),
  'a company admin cannot move anybody, even inside her own company',
  'only the master admin');
select test.eq((select count(*) from app.person_footprints())::int,
               (select count(*) from public.profiles where company_id = :'alpha'::uuid)::int,
  'a company admin sees counts for her own company only');
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.eq((select count(*) from app.person_footprints())::int, 0,
  'an engineer administers nobody, so the buttons never appear for her');
select test.refuses(
  format('select app.person_footprint(%L)', :'fresh'),
  'and she cannot ask what somebody else has done',
  'only an administrator');
commit;

-- === A new table with created_by is counted without another migration =====
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.ok(
  (select count(*) from app.person_columns() where table_name = 'costings') > 0,
  'the footprint counts costings');
select test.ok(
  (select count(*) from app.person_columns() where table_name = 'quotations') > 0,
  'and quotations');
select test.ok(
  (select count(*) from app.person_columns() where table_name in ('profiles', 'user_roles')) = 0,
  'but not the person themselves');
commit;

delete from public.user_roles where user_id = :'fresh';
delete from public.profiles where id = :'fresh';
delete from auth.users where id = :'fresh';
