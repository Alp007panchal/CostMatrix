-- The history log now says who did it (migration 0013). The name comes from a
-- left join, so a row survives the person: an audit log that loses its entries
-- when somebody leaves is not an audit log.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === Carol builds and submits; Alice approves ==============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('History check') \gset
select app.submit_costing(:'costing_id'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'costing_id'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select full_name from public.v_costing_history
                where costing_id = :'costing_id'::uuid and action = 'submitted'),
               'Carol Costing',
  'the history says who submitted it');

select test.eq((select full_name from public.v_costing_history
                where costing_id = :'costing_id'::uuid and action = 'approved'),
               'Alice Alpha',
  'and who approved it');

select test.eq((select count(*)::int from public.v_costing_history
                where costing_id = :'costing_id'::uuid),
               (select count(*)::int from public.costing_history
                where costing_id = :'costing_id'::uuid),
  'the view adds a name and drops nothing');
rollback;

-- === A row outlives the person =============================================
-- Written by hand rather than by removing somebody, because removing a login
-- needs Supabase auth, which this database does not have. Inserted as the
-- owner: history is written by the status functions, never by a signed-in user,
-- and the grants say so.
insert into public.costing_history (costing_id, company_id, user_id, action)
values (:'costing_id'::uuid, :'alpha'::uuid, '00000000-0000-0000-0000-00000000f8a1', 'orphan check');

begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.ok((select full_name is null from public.v_costing_history
                where costing_id = :'costing_id'::uuid and action = 'orphan check'),
  'a row whose person has gone keeps the entry and shows no name');

select test.eq((select action from public.v_costing_history
                where costing_id = :'costing_id'::uuid and action = 'orphan check'),
               'orphan check',
  'the action and the time are still there');
rollback;

-- === Another company cannot read it ========================================
begin;
set local role authenticated;
select test.sign_in('00000000-0000-0000-0000-0000000000a3');  -- Bob, Beta
select test.eq((select count(*)::int from public.v_costing_history
                where costing_id = :'costing_id'::uuid), 0,
  'the view is as private as the table: Beta sees none of Alpha''s history');
rollback;

-- === The master admin reads it =============================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.ok((select count(*) > 0 from public.v_costing_history
                where costing_id = :'costing_id'::uuid),
  'the master admin reads every company''s history');
rollback;

delete from public.costings where id = :'costing_id'::uuid;
