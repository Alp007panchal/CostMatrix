-- Supplier price lists (migration 0105, roadmap 2.2). Runs after 14, which
-- leaves the owner's real seed in the database, so the matching is tried against
-- 735 real parts rather than fixtures.
--
-- What matters here: nothing in the catalogue moves until somebody accepts a
-- row, the four matching attempts are told apart, and a price that is accepted
-- lands with its date, its source and a history entry.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- A real seeded part to re-price, and a busbar one priced by weight.
-- A priced part whose code carries punctuation, so a supplier who writes the same
-- reference without the dashes is the loose match below, and whose key is unique
-- in the library: the seed does hold parts that collide once punctuation is
-- stripped, and those are a warning, tested further down.
select id as part_id, code as part_code, part_number as part_ref, manufacturer as part_make,
       purchase_price as part_was, purchase_currency as part_cur,
       app.normalise_part_key(code) as part_loose
  from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null and purchase_price > 0
   and code ~ '[^A-Za-z0-9]'
   and (select count(*) from public.components other
         where other.company_id is null
           and (app.normalise_part_key(other.code) = app.normalise_part_key(components.code)
                or app.normalise_part_key(other.part_number) = app.normalise_part_key(components.code))) = 1
 order by code limit 1 \gset
select id as busbar_id, code as busbar_code from public.components
 where company_id is null and pricing_mode = 'weight_rate' order by code limit 1 \gset
select id as placeholder_id, code as placeholder_code from public.components
 where company_id is null and is_placeholder and purchase_price is null order by code limit 1 \gset

-- === Who may upload one ======================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');   -- costing engineer, not an administrator
select test.refuses(
  format($$select app.start_price_list(null, 'list.csv', '[{"key": "X", "price": "1"}]'::jsonb)$$),
  'a costing engineer cannot upload a price list for the master catalogue',
  'only the master admin may import into the master library');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');   -- company admin of Alpha
select test.refuses(
  format($$select app.start_price_list(null, 'list.csv', '[{"key": "X", "price": "1"}]'::jsonb)$$),
  'nor can a company administrator: the master catalogue is the master admin''s',
  'only the master admin may import into the master library');
select test.refuses(
  format($$select app.start_price_list(%L, 'list.csv', '[{"key": "X", "price": "1"}]'::jsonb)$$, :'beta'),
  'and not for another company''s library either',
  'you may only import into your own company');
rollback;

-- === The preview: four ways to find a part, and nothing written ==============
begin;
set local role authenticated;
select test.sign_in(:'master');

select app.start_price_list(null, 'Power Controls September 2026.csv',
  jsonb_build_array(
    -- 1. by the app's own code
    jsonb_build_object('row', 2, 'key', :'part_code', 'price', '999999', 'currency', :'part_cur',
                       'supplier', 'Power Controls Ltd', 'valid_from', '2026-09-01'),
    -- 2. by the same reference with the punctuation left out, as suppliers write it
    jsonb_build_object('row', 3, 'key', :'part_loose', 'price', :'part_was', 'currency', :'part_cur'),
    -- 3. a part number nobody in the library has
    jsonb_build_object('row', 4, 'key', 'NO-SUCH-PART-9999', 'price', '500'),
    -- 4. no key at all
    jsonb_build_object('row', 5, 'key', '', 'price', '500'),
    -- 5. a price that is not a number
    jsonb_build_object('row', 6, 'key', :'part_code', 'price', 'on request'),
    -- 6. a currency nobody has a landed factor for
    jsonb_build_object('row', 7, 'key', :'part_code', 'price', '700', 'currency', 'ZWL'),
    -- 7. a busbar size, which is priced by weight
    jsonb_build_object('row', 8, 'key', :'busbar_code', 'price', '800'),
    -- 8. the same price it already has
    jsonb_build_object('row', 9, 'key', :'part_code', 'price', :'part_was', 'currency', :'part_cur'),
    -- 9. one of the seven unpriced placeholders, priced at last
    jsonb_build_object('row', 10, 'key', :'placeholder_code', 'price', '4500', 'currency', 'KES')),
  jsonb_build_object('key', 'Part No', 'price', 'Net price')) as job \gset
commit;

select test.eq((select type from public.import_jobs where id = :'job'::uuid), 'price_list',
  'the upload is one import job of its own kind');
select test.eq((select status from public.import_jobs where id = :'job'::uuid), 'preview',
  'waiting for a person, not applied');
select test.eq((select rows_total from public.import_jobs where id = :'job'::uuid), 9,
  'with every line of the file counted');
select test.eq((select column_mapping ->> 'price' from public.import_jobs where id = :'job'::uuid), 'Net price',
  'and the columns the person mapped kept with it');
select test.eq((select count(*)::int from public.import_rows where job_id = :'job'::uuid), 9,
  'and one row each');

select test.eq((select match_method from public.import_rows where job_id = :'job'::uuid and row_number = 2), 'code',
  'a row keyed by the app''s own code is found by code');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 2), 'changed',
  'and is a price change');
select test.eq((select (raw ->> 'old_price')::numeric from public.import_rows where job_id = :'job'::uuid and row_number = 2),
               :part_was::numeric,
  'the preview shows the price it has now');
select test.eq((select (raw ->> 'new_price')::numeric from public.import_rows where job_id = :'job'::uuid and row_number = 2),
               999999::numeric,
  'beside the price the supplier asks');
select test.ok((select (raw ->> 'change_pct')::numeric > 0 from public.import_rows where job_id = :'job'::uuid and row_number = 2),
  'and by what percentage it moved');

select test.eq((select match_method from public.import_rows where job_id = :'job'::uuid and row_number = 3), 'part_number_loose',
  'a reference written without its dashes is still found');
select test.eq((select matched_entity_id from public.import_rows where job_id = :'job'::uuid and row_number = 3), :'part_id'::uuid,
  'and found as the same part');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 3), 'unchanged',
  'at the price it already has, so there is nothing to accept on that line');

select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 4), 'new',
  'a part number the library does not have is not invented');
select test.ok((select message like '%not in this library yet%' from public.import_rows where job_id = :'job'::uuid and row_number = 4),
  'and says to add the part first');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 5), 'rejected',
  'a row with no part number is rejected');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 6), 'rejected',
  '"on request" is not a price');
select test.ok((select message like '%is not a price%' from public.import_rows where job_id = :'job'::uuid and row_number = 6),
  'and the row says so in words');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 7), 'rejected',
  'a currency with no landed factor is refused at the preview, not at the save');
select test.ok((select message like '%landed factor for currency ZWL%' from public.import_rows where job_id = :'job'::uuid and row_number = 7),
  'naming the currency and who can add it');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 8), 'warning',
  'a busbar size is priced by weight, so a list price is only a warning');
select test.ok((select message like '%copper rate%' from public.import_rows where job_id = :'job'::uuid and row_number = 8),
  'and points at the copper rate instead');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 9), 'unchanged',
  'the same price as now is not a change');
select test.eq((select status from public.import_rows where job_id = :'job'::uuid and row_number = 10), 'changed',
  'an unpriced placeholder is a change waiting to happen');

select test.eq((select summary ->> 'rejected' from public.import_jobs where id = :'job'::uuid), '3',
  'the job''s summary counts them by outcome');

-- Nothing has moved yet. This is the assertion the whole feature exists for.
select test.eq((select purchase_price from public.components where id = :'part_id'::uuid), :part_was::numeric,
  'after a preview the catalogue price is exactly what it was');
select test.ok((select purchase_price is null from public.components where id = :'placeholder_id'::uuid),
  'and the placeholder still has no price');
select test.eq((select count(*)::int from public.component_price_history where component_id = :'part_id'::uuid
                and new_price = 999999), 0,
  'and no price history was written');

-- === Another company may read the master upload but not act on it ============
-- The master catalogue is everybody's library, so its import history is readable
-- (the same rule test 24 asserts for the seed importers). Accepting it is not.
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.import_rows where job_id = :'job'::uuid), 9,
  'a company admin elsewhere can read the master library''s upload, which they share');
select test.refuses(
  format($$select app.accept_price_rows(%L)$$, :'job'),
  'but cannot accept a single row of it', 'only the master admin');
select test.refuses(
  format($$select app.discard_import_job(%L)$$, :'job'),
  'nor throw it away', 'only the master admin');
rollback;

-- === Accept one row =========================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select id as row2 from public.import_rows where job_id = :'job'::uuid and row_number = 2 \gset
select app.accept_price_rows(:'job'::uuid, array[:'row2'::uuid]) as outcome \gset
commit;

select test.eq(:'outcome'::jsonb ->> 'applied', '1', 'one row applied');
select test.eq(:'outcome'::jsonb ->> 'status', 'preview',
  'and the job stays open, because another change is still waiting');
select test.eq((select purchase_price from public.components where id = :'part_id'::uuid), 999999::numeric,
  'the part now costs what the supplier asked');
select test.eq((select price_valid_from from public.components where id = :'part_id'::uuid), '2026-09-01'::date,
  'from the date on the list');
select test.ok((select price_source like 'Power Controls Ltd%' from public.components where id = :'part_id'::uuid),
  'and the part says where the price came from');
select test.eq((select status from public.import_rows where id = :'row2'::uuid), 'accepted',
  'the row is marked accepted');
select test.eq((select count(*)::int from public.component_price_history
                where component_id = :'part_id'::uuid and new_price = 999999), 1,
  'and the price change is in the history, as for any other change');
select test.eq((select old_price from public.component_price_history
                where component_id = :'part_id'::uuid and new_price = 999999), :part_was::numeric,
  'with the price it replaced');
select test.ok((select source like 'Power Controls Ltd%' from public.component_price_history
                where component_id = :'part_id'::uuid and new_price = 999999),
  'and the supplier list named as the source');

-- === Accept the rest: the placeholder gets its first price ==================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.accept_price_rows(:'job'::uuid) as rest \gset
commit;

select test.eq(:'rest'::jsonb ->> 'applied', '1', 'accepting all applies what is left');
select test.eq(:'rest'::jsonb ->> 'status', 'applied', 'and closes the job');
select test.eq((select status from public.import_jobs where id = :'job'::uuid), 'applied',
  'which the job row says too');
select test.eq((select purchase_price from public.components where id = :'placeholder_id'::uuid), 4500::numeric,
  'the placeholder has a price at last');
select test.eq((select is_placeholder from public.components where id = :'placeholder_id'::uuid), false,
  'and is no longer a placeholder, so a costing will accept it');
select test.eq((select status from public.components where id = :'placeholder_id'::uuid), 'active',
  'its status follows, being generated from the two booleans');

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses(format($$select app.accept_price_rows(%L)$$, :'job'),
  'an applied job cannot be accepted twice', 'already applied');
rollback;

-- === Discarding one ==========================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
select app.start_price_list(null, 'wrong-file.csv',
  jsonb_build_array(jsonb_build_object('row', 2, 'key', :'part_code', 'price', '1'))) as job2 \gset
select app.discard_import_job(:'job2'::uuid, 'wrong supplier');
commit;

select test.eq((select status from public.import_jobs where id = :'job2'::uuid), 'discarded',
  'a job nobody wants is discarded, not deleted');
select test.eq((select summary ->> 'discarded_reason' from public.import_jobs where id = :'job2'::uuid), 'wrong supplier',
  'with the reason kept');
select test.eq((select purchase_price from public.components where id = :'part_id'::uuid), 999999::numeric,
  'and discarding changes no price');

-- === A company's own part, by its own administrator ==========================
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.components (company_id, category_code, code, name, unit, manufacturer, part_number,
                              pricing_mode, purchase_price, purchase_currency)
values (:'alpha'::uuid, 'switchgear', 'ALPHA-RELAY-1', 'Alpha private relay', 'pcs', 'ACME', 'AC-77/9',
        'fixed', 1000, 'KES')
returning id as own_part \gset
select app.start_price_list(:'alpha'::uuid, 'acme.csv',
  jsonb_build_array(
    jsonb_build_object('row', 2, 'key', 'AC 77 9', 'maker', 'ACME', 'price', '1250', 'currency', 'KES'),
    jsonb_build_object('row', 3, 'key', :'part_code', 'price', '5'))) as job3 \gset
commit;

select test.eq((select match_method from public.import_rows where job_id = :'job3'::uuid and row_number = 2),
               'manufacturer_part_number',
  'the make plus a loosely written reference finds a private part');
select test.eq((select (raw ->> 'change_pct')::numeric from public.import_rows where job_id = :'job3'::uuid and row_number = 2),
               25::numeric,
  'and 1,000 → 1,250 reads as 25 per cent');
select test.eq((select status from public.import_rows where job_id = :'job3'::uuid and row_number = 3), 'new',
  'and a master-catalogue code is "not in this library": a company list prices that company''s parts');

-- Two of a company's own parts whose references differ only in punctuation: the
-- upload must say so rather than pick one.
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.components (company_id, category_code, code, name, unit, manufacturer, part_number,
                              pricing_mode, purchase_price, purchase_currency)
values (:'alpha'::uuid, 'switchgear', 'ALPHA-RELAY-2', 'Alpha private relay, later model', 'pcs', 'ACME', 'AC779',
        'fixed', 1100, 'KES')
returning id as twin_part \gset
select app.start_price_list(:'alpha'::uuid, 'acme-again.csv',
  jsonb_build_array(jsonb_build_object('row', 2, 'key', 'AC-779', 'price', '1400'))) as job4 \gset
commit;

select test.eq((select status from public.import_rows where job_id = :'job4'::uuid and row_number = 2), 'warning',
  'a reference that answers to two parts is a warning, not a guess');
select test.ok((select message like '%2 parts answer%' from public.import_rows where job_id = :'job4'::uuid and row_number = 2),
  'saying how many and where to settle it');
select test.ok((select matched_entity_id is null from public.import_rows where job_id = :'job4'::uuid and row_number = 2),
  'and naming none of them');

begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(format($$select app.accept_price_rows(%L)$$, :'job4'),
  'so there is nothing to accept on that upload',
  'none of those rows is a price change');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.accept_price_rows(:'job3'::uuid);
commit;
select test.eq((select purchase_price from public.components where id = :'own_part'::uuid), 1250::numeric,
  'a company administrator re-prices their own part');
select test.eq((select purchase_price from public.components where id = :'part_id'::uuid), 999999::numeric,
  'and the master catalogue is untouched by it');

-- Leave things as found: the seed is other tests' data.
update public.components set purchase_price = :part_was::numeric, price_valid_from = null, price_source = null
 where id = :'part_id'::uuid;
update public.components set purchase_price = null, is_placeholder = true, price_valid_from = null, price_source = null
 where id = :'placeholder_id'::uuid;
delete from public.components where id in (:'own_part'::uuid, :'twin_part'::uuid);
delete from public.import_jobs where id in (:'job'::uuid, :'job2'::uuid, :'job3'::uuid, :'job4'::uuid);
