-- Everything the advanced app's screens call must exist. The list is
-- `supabase/checks/deployed-features.sql`, which the owner can paste into the
-- Supabase SQL editor to check a deploy actually landed; here it guards the same
-- list in CI, so the two cannot drift.

-- The file creates a temporary view of the same name and prints it.
\i supabase/checks/deployed-features.sql

select test.ok((select count(*) from deployed_features) >= 35,
  'the deployed-features list still covers every feature of the advanced app');
select test.eq((select count(*)::int from deployed_features where not present), 0,
  format('every object the app calls exists (%s)',
         coalesce((select string_agg(name, ', ') from deployed_features where not present), 'none missing')));
