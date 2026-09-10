-- Loads the owner's cleaned master data from data/seed/*.csv into staging tables
-- and presents each file as the jsonb the importer functions of migration 0010
-- expect. It writes nothing to the library: the caller decides that by passing
-- apply = false (a preview) or true.
--
-- Two callers share this file so there is one copy of it rather than two that
-- drift apart:
--   supabase/tests/14_seed_import.sql  — the test, which asserts against it
--   supabase/seed-from-csv.sql         — the staging seed run from CI
--
-- The \copy paths are relative to the working directory, so run psql from the
-- repository root. supabase/tests/run-local.sh already does.

create table pg_temp.seed_components (partNumber text, description text, category text, priceEur text,
  purchaseCurrency text, listSellingPrice text, unit text, brand text, rating text, poles text,
  breakingCapacity text, frameSize text, notes text);
\copy pg_temp.seed_components from 'data/seed/components.csv' with (format csv, header true)

create table pg_temp.seed_catmap (category text, bomCategory text, count text);
\copy pg_temp.seed_catmap from 'data/seed/category-map.csv' with (format csv, header true)

create table pg_temp.seed_kits (kitName text, linkedCategory text, frameSize text, laborHours text,
  laborRate text, partNumber text, quantity text, kitGroup text, sourceFile text);
\copy pg_temp.seed_kits from 'data/seed/kits.csv' with (format csv, header true)

create table pg_temp.seed_kit_tpl (kitGroup text, labourGroup text, kitName text, mainPart text,
  hoursPanelAssembly text, hoursWiring text, hoursBusbarFabrication text);
\copy pg_temp.seed_kit_tpl from 'data/seed/kit-labour-template.csv' with (format csv, header true)

create table pg_temp.seed_hours (labourGroup text, kits text, example text,
  hoursPanelAssembly text, hoursWiring text, hoursBusbarFabrication text);
\copy pg_temp.seed_hours from 'data/seed/kit-group-labour-template.csv' with (format csv, header true)

-- The importers run as the authenticated role; let it read the staging tables.
grant select on pg_temp.seed_components, pg_temp.seed_catmap, pg_temp.seed_kits, pg_temp.seed_kit_tpl, pg_temp.seed_hours to authenticated;

-- CSV columns come back lower-cased by Postgres; the functions want the file's camelCase keys.
create view pg_temp.j_components as
  select jsonb_agg(jsonb_build_object('partNumber', partnumber, 'description', description, 'category', category,
    'priceEur', priceeur, 'purchaseCurrency', purchasecurrency, 'unit', unit, 'brand', brand, 'rating', rating,
    'poles', poles, 'breakingCapacity', breakingcapacity, 'frameSize', framesize, 'notes', notes)) as j
  from pg_temp.seed_components;
create view pg_temp.j_catmap as
  select jsonb_agg(jsonb_build_object('category', category, 'bomCategory', bomcategory)) as j from pg_temp.seed_catmap;
create view pg_temp.j_kits as
  select jsonb_agg(jsonb_build_object('kitName', kitname, 'linkedCategory', linkedcategory, 'frameSize', framesize,
    'partNumber', partnumber, 'quantity', quantity, 'kitGroup', kitgroup) order by ord) as j
  from (select s.*, row_number() over () as ord from pg_temp.seed_kits s) s;
create view pg_temp.j_kit_tpl as
  select jsonb_agg(jsonb_build_object('kitName', kitname, 'labourGroup', labourgroup, 'mainPart', mainpart,
    'hoursPanelAssembly', hourspanelassembly, 'hoursWiring', hourswiring, 'hoursBusbarFabrication', hoursbusbarfabrication)) as j
  from pg_temp.seed_kit_tpl;
create view pg_temp.j_hours as
  select jsonb_agg(jsonb_build_object('labourGroup', labourgroup, 'hoursPanelAssembly', hourspanelassembly,
    'hoursWiring', hourswiring, 'hoursBusbarFabrication', hoursbusbarfabrication)) as j
  from pg_temp.seed_hours;
grant select on pg_temp.j_components, pg_temp.j_catmap, pg_temp.j_kits, pg_temp.j_kit_tpl, pg_temp.j_hours to authenticated;
