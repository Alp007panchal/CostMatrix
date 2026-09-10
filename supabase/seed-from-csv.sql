-- Loads data/seed/* into a project's master library, as the master administrator.
--
-- Run by .github/workflows/create-staging.yml against the staging project. It is
-- the same three importer functions the Import screen calls, with the same files
-- and the same validation, so staging holds what production holds.
--
-- Needs one variable: the master administrator's auth user id.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v admin_uid=<uuid> -f supabase/seed-from-csv.sql
--
-- Running it twice is harmless: the importers diff against what is there and
-- report the second run as unchanged.
--
-- Run psql from the repository root — the \copy paths inside the loader are
-- relative to the working directory.

\i supabase/seed-csv-load.sql

-- The importers check who is asking through auth.uid(), which reads
-- request.jwt.claims. A superuser connection has no such claim, so we set it
-- ourselves — the same impersonation supabase/tests/01_fixture.sql uses.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_uid')::text, true);

select app.import_components((select j from pg_temp.j_components), (select j from pg_temp.j_catmap),
                             null, true, 'components.csv') as components_report \gset
select app.import_kits((select j from pg_temp.j_kits), (select j from pg_temp.j_kit_tpl),
                       null, true, 'kits.csv') as kits_report \gset
select app.import_kit_group_hours((select j from pg_temp.j_hours), null, true) as hours_report \gset

commit;

\echo ''
\echo 'Components:'
select (:'components_report'::jsonb ->> 'new') as new,
       (:'components_report'::jsonb ->> 'changed') as changed,
       (:'components_report'::jsonb ->> 'unchanged') as unchanged,
       jsonb_array_length(:'components_report'::jsonb -> 'rejected') as rejected;
\echo 'Kits:'
select (:'kits_report'::jsonb ->> 'new') as new,
       (:'kits_report'::jsonb ->> 'changed') as changed,
       (:'kits_report'::jsonb ->> 'unchanged') as unchanged,
       jsonb_array_length(:'kits_report'::jsonb -> 'rejected') as rejected;
\echo 'Kit group hours:'
select (:'hours_report'::jsonb ->> 'new') as new,
       (:'hours_report'::jsonb ->> 'changed') as changed,
       (:'hours_report'::jsonb ->> 'unchanged') as unchanged;

-- A rejected row means the seed and the schema disagree; that is worth failing on
-- rather than leaving a half-loaded library behind.
select case
         when jsonb_array_length(:'components_report'::jsonb -> 'rejected') > 0
           or jsonb_array_length(:'kits_report'::jsonb -> 'rejected') > 0
         then 1 / 0  -- forces an error, so ON_ERROR_STOP fails the step
         else 0
       end as rejected_rows_must_be_zero;
