-- 0105  Supplier price lists (roadmap 2.2, advanced track)
--
-- A supplier sends a list; somebody uploads it; the app says what it would
-- change, old price → new price, and a person accepts the rows they believe.
-- Nothing in the catalogue moves until that click.
--
-- The framework is the one F9 built (0102): one `import_jobs` row per upload,
-- one `import_rows` row per line of the file, with what it matched and what
-- happened to it. This migration adds the matching, the preview and the accept.
-- Every function is SECURITY INVOKER, so the existing library policies decide
-- who may change what: the master administrator for the master catalogue, a
-- company administrator for that company's own parts (app.assert_may_import,
-- unchanged from 0010).
--
-- No table changes. The only new column anywhere is the one 0100 already added
-- to the price history, `source`, which until now nothing filled.

-- ===========================================================================
-- 1. The price history records where the price came from
-- ===========================================================================
-- Derived from the 0008 text by insertion: `source` is the component's own
-- price_source, which the accept step below sets in the same statement. A price
-- typed on the Components screen fills it too, if the person names a source.
create or replace function app.record_component_price_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.purchase_price is distinct from old.purchase_price
      or new.purchase_currency is distinct from old.purchase_currency)
     and new.purchase_price is not null then
    insert into public.component_price_history
      (component_id, old_price, new_price, purchase_currency, changed_by, import_batch_id, source)
    values (new.id, old.purchase_price, new.purchase_price, new.purchase_currency,
            coalesce(auth.uid(), new.created_by), new.import_batch_id, new.price_source);
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. Matching one line of a price list to a part
-- ===========================================================================
-- A supplier writes the part number their own way: with dashes, without them,
-- sometimes with the make in front. Four attempts, most trustworthy first, and
-- the answer says which one found it so a person can judge it.
create or replace function app.normalise_part_key(value text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(value, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

create or replace function app.match_price_list_row(to_company uuid, key text, maker text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  k text := btrim(coalesce(key, ''));
  nk text := app.normalise_part_key(key);
  m text := nullif(btrim(coalesce(maker, '')), '');
  hit uuid;
  n integer;
  method text;
begin
  if k = '' then return jsonb_build_object('method', null, 'matches', 0); end if;

  -- Four attempts against the library this upload is for: the master catalogue,
  -- or one company's own parts. Row-level security hides the rest in any case.
  for method in select unnest(array['code', 'part_number', 'manufacturer_part_number', 'part_number_loose']) loop
    -- (array_agg)[1] rather than min(): uuid has no min aggregate.
    select count(*), (array_agg(c.id))[1] into n, hit
    from public.components c
    where (case when to_company is null then c.company_id is null else c.company_id = to_company end)
      and c.is_active
      and case method
            when 'code'                      then upper(c.code) = upper(k)
            when 'part_number'               then upper(coalesce(c.part_number, '')) = upper(k)
            when 'manufacturer_part_number'  then m is not null
                                                  and upper(coalesce(c.manufacturer, '')) = upper(m)
                                                  and app.normalise_part_key(c.part_number) = nk
            else app.normalise_part_key(c.part_number) = nk
                 or app.normalise_part_key(c.code) = nk
          end;
    if n = 1 then
      return jsonb_build_object('component_id', hit, 'method', method, 'matches', 1);
    elsif n > 1 then
      return jsonb_build_object('method', method, 'matches', n);
    end if;
  end loop;

  return jsonb_build_object('method', null, 'matches', 0);
end;
$$;

-- ===========================================================================
-- 3. The preview: one job, one row per line, nothing else written
-- ===========================================================================
-- rows: [{"row": 2, "key": "3WJ1116-2AE42", "maker": "SIEMENS",
--         "description": "1600A ACB", "price": "412000", "currency": "KES",
--         "supplier": "Power Controls Ltd", "valid_from": "2026-09-01"}]
create or replace function app.start_price_list(
  to_company uuid,
  file_name text,
  rows jsonb,
  mapping jsonb default '{}'::jsonb,
  document uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job uuid;
  r record;
  match jsonb;
  comp public.components;
  new_price numeric;
  new_currency text;
  row_status text;
  row_message text;
  counts jsonb := '{}'::jsonb;
begin
  perform app.assert_may_import(to_company);
  if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then
    raise exception 'the file has no rows to read';
  end if;

  insert into public.import_jobs
    (company_id, user_id, type, document_id, file_name, status, column_mapping, rows_total, created_by)
  values (to_company, auth.uid(), 'price_list', document, file_name, 'preview',
          coalesce(mapping, '{}'::jsonb), jsonb_array_length(rows), auth.uid())
  returning id into job;

  for r in
    select coalesce((e.elem ->> 'row')::integer, e.row_no::integer) as line,
           btrim(coalesce(e.elem ->> 'key', ''))        as key,
           nullif(btrim(coalesce(e.elem ->> 'maker', '')), '')      as maker,
           nullif(btrim(coalesce(e.elem ->> 'description', '')), '') as description,
           e.elem ->> 'price'                           as price,
           upper(nullif(btrim(coalesce(e.elem ->> 'currency', '')), '')) as currency,
           nullif(btrim(coalesce(e.elem ->> 'supplier', '')), '')   as supplier,
           nullif(btrim(coalesce(e.elem ->> 'valid_from', '')), '') as valid_from
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    comp := null;
    row_status := null; row_message := null;
    new_price := app.parse_numeric(r.price);
    match := app.match_price_list_row(to_company, r.key, r.maker);
    if (match ->> 'component_id') is not null then
      select * into comp from public.components where id = (match ->> 'component_id')::uuid;
    end if;
    new_currency := coalesce(r.currency, comp.purchase_currency, 'KES');

    -- What is wrong with the line itself, before what is wrong with the match.
    if r.key = '' then
      row_status := 'rejected'; row_message := 'no part number or code in this row';
    elsif new_price is null then
      row_status := 'rejected'; row_message := format('"%s" is not a price', coalesce(r.price, ''));
    elsif new_price < 0 then
      row_status := 'rejected'; row_message := 'a price cannot be negative';
    elsif not exists (select 1 from public.currency_factors cf
                      where cf.company_id is null and cf.currency_code = new_currency) then
      row_status := 'rejected';
      row_message := format('no exchange rate and landed factor for currency %s; ask the master admin to add it', new_currency);
    elsif (match ->> 'matches')::integer > 1 then
      row_status := 'warning';
      row_message := format('%s parts answer to "%s" — pick one on the Components screen', match ->> 'matches', r.key);
    elsif comp.id is null then
      row_status := 'new';
      row_message := format('"%s" is not in this library yet; add the part first, then re-upload', r.key);
    elsif comp.pricing_mode = 'weight_rate' then
      row_status := 'warning';
      row_message := 'this part is priced by weight (busbar); change the copper rate instead of its price';
    elsif comp.purchase_price is not distinct from new_price
          and comp.purchase_currency = new_currency then
      row_status := 'unchanged'; row_message := 'same price as now';
    else
      row_status := 'changed';
    end if;

    insert into public.import_rows (job_id, row_number, raw, matched_entity_id, match_method, status, message)
    values (job, r.line,
            jsonb_strip_nulls(jsonb_build_object(
              'key', r.key, 'maker', r.maker, 'description', r.description,
              'new_price', new_price, 'new_currency', new_currency,
              'supplier', r.supplier, 'valid_from', r.valid_from,
              'old_price', comp.purchase_price, 'old_currency', comp.purchase_currency,
              'component_code', comp.code, 'component_name', comp.name,
              'pricing_mode', comp.pricing_mode::text,
              'is_placeholder', comp.is_placeholder,
              'change_pct', case when comp.purchase_price is not null and comp.purchase_price > 0
                                      and comp.purchase_currency = new_currency and new_price is not null
                                 then round((new_price - comp.purchase_price) / comp.purchase_price * 100, 2) end)),
            comp.id, match ->> 'method', row_status, row_message);
  end loop;

  select jsonb_object_agg(s.status, s.n) into counts
  from (select ir.status, count(*) as n from public.import_rows ir where ir.job_id = job group by ir.status) s;
  update public.import_jobs set summary = coalesce(counts, '{}'::jsonb) where id = job;

  return job;
end;
$$;

comment on function app.start_price_list(uuid, text, jsonb, jsonb, uuid) is
  'Reads a supplier price list into one import job for review. Matches each row
   to a part, works out old → new and the percentage, and writes nothing else:
   the catalogue changes only when somebody accepts rows.';

-- ===========================================================================
-- 4. Accept: the rows a person believes
-- ===========================================================================
-- row_ids null means every row the preview marked `changed`.
create or replace function app.accept_price_rows(job uuid, row_ids uuid[] default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  j public.import_jobs;
  r public.import_rows;
  comp public.components;
  applied integer := 0;
  skipped integer := 0;
  new_price numeric;
  new_currency text;
  source text;
  valid_from date;
  counts jsonb;
  remaining integer;
begin
  select * into j from public.import_jobs where id = job;
  if j.id is null then raise exception 'no such import, or it is not visible to you'; end if;
  if j.type <> 'price_list' then raise exception 'this is a % import, not a price list', j.type; end if;
  if j.status <> 'preview' then raise exception 'this import is already %', j.status; end if;
  perform app.assert_may_import(j.company_id);

  for r in
    select * from public.import_rows
    where job_id = job and status = 'changed'
      and (row_ids is null or id = any (row_ids))
    order by row_number
  loop
    select * into comp from public.components where id = r.matched_entity_id;
    if comp.id is null then
      update public.import_rows set status = 'skipped', message = 'the part has gone since the preview' where id = r.id;
      skipped := skipped + 1;
      continue;
    end if;

    new_price := (r.raw ->> 'new_price')::numeric;
    new_currency := coalesce(r.raw ->> 'new_currency', comp.purchase_currency);
    valid_from := coalesce(nullif(r.raw ->> 'valid_from', '')::date, current_date);
    source := left(concat_ws(' · ', nullif(r.raw ->> 'supplier', ''), coalesce(j.file_name, 'price list')), 200);

    update public.components
       set purchase_price = new_price,
           purchase_currency = new_currency,
           price_valid_from = valid_from,
           price_source = source,
           -- A placeholder stops being one the moment it has a real price.
           is_placeholder = case when new_price > 0 then false else is_placeholder end
     where id = comp.id;

    update public.import_rows
       set status = 'accepted',
           raw = raw || jsonb_build_object('applied_old_price', comp.purchase_price,
                                           'applied_old_currency', comp.purchase_currency,
                                           'applied_at', now()),
           message = format('%s → %s %s', coalesce(comp.purchase_price::text, 'no price'),
                            new_price, new_currency)
     where id = r.id;
    applied := applied + 1;
  end loop;

  if applied = 0 and skipped = 0 then
    raise exception 'none of those rows is a price change waiting to be accepted';
  end if;

  select count(*) into remaining from public.import_rows where job_id = job and status = 'changed';
  select jsonb_object_agg(s.status, s.n) into counts
  from (select ir.status, count(*) as n from public.import_rows ir where ir.job_id = job group by ir.status) s;
  update public.import_jobs
     set summary = coalesce(counts, '{}'::jsonb),
         status = case when remaining = 0 then 'applied' else 'preview' end,
         finished_at = case when remaining = 0 then now() else null end
   where id = job;

  perform app.write_activity('import', job, 'price_list.accepted', null,
    jsonb_build_object('job_id', job, 'file_name', j.file_name, 'applied', applied, 'skipped', skipped),
    format('Accepted %s price change(s) from %s', applied, coalesce(j.file_name, 'a price list')), 'user');

  return jsonb_build_object('applied', applied, 'skipped', skipped, 'remaining', remaining,
                            'status', case when remaining = 0 then 'applied' else 'preview' end);
end;
$$;

create or replace function app.discard_import_job(job uuid, reason text default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  j public.import_jobs;
begin
  select * into j from public.import_jobs where id = job;
  if j.id is null then raise exception 'no such import, or it is not visible to you'; end if;
  if j.status <> 'preview' then raise exception 'this import is already %', j.status; end if;
  perform app.assert_may_import(j.company_id);
  update public.import_jobs
     set status = 'discarded', finished_at = now(),
         summary = summary || jsonb_build_object('discarded_reason', reason)
   where id = job;
end;
$$;

-- ===========================================================================
-- 5. Public wrappers and grants
-- ===========================================================================
create or replace function public.start_price_list(
  to_company uuid, file_name text, rows jsonb, mapping jsonb default '{}'::jsonb, document uuid default null)
returns uuid language plpgsql security invoker
as $$ begin return app.start_price_list(to_company, file_name, rows, mapping, document); end $$;

create or replace function public.accept_price_rows(job uuid, row_ids uuid[] default null)
returns jsonb language plpgsql security invoker
as $$ begin return app.accept_price_rows(job, row_ids); end $$;

create or replace function public.discard_import_job(job uuid, reason text default null)
returns void language sql security invoker
as $$ select app.discard_import_job(job, reason) $$;

grant execute on function
  app.normalise_part_key(text),
  app.match_price_list_row(uuid, text, text),
  app.start_price_list(uuid, text, jsonb, jsonb, uuid), public.start_price_list(uuid, text, jsonb, jsonb, uuid),
  app.accept_price_rows(uuid, uuid[]), public.accept_price_rows(uuid, uuid[]),
  app.discard_import_job(uuid, text), public.discard_import_job(uuid, text)
to authenticated;
