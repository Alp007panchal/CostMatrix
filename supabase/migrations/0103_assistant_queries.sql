-- 0103  What the assistant may ask the database (AI spec §5, step 3 PR A)
--
-- Read-only functions behind the assistant's tools, plus two bookkeeping ones.
-- No table changes, no column lists touched: nothing here can drop a frozen
-- column, and nothing here changes a price.
--
-- Every function is SECURITY INVOKER. The assistant acts as the signed-in user
-- (spec §4): whatever row-level security hides from that person on screen, it
-- hides from these functions too. A costing of another company comes back as
-- null, which the tool reports as "not found" (acceptance test 3).
--
-- Prices in every result are the company's own unit prices — what the screen
-- shows — never the EUR purchase price or the landed figure (spec §8).

-- ===========================================================================
-- 1. A costing, as one document
-- ===========================================================================
create or replace function app.costing_snapshot(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'costing_no', c.costing_no,
    'revision_no', c.revision_no,
    'status', c.status,
    'title', c.title,
    'notes', c.notes,
    'enquiry_id', c.enquiry_id,
    'price_snapshot_at', c.price_snapshot_at,
    'settings', jsonb_build_object(
      'currency', c.currency_label,
      'material_margin_pct', c.material_margin_pct,
      'labour_margin_pct', c.labour_margin_pct,
      'negotiation_margin_pct', c.negotiation_margin_pct,
      'price_rounding_step', c.price_rounding_step,
      'tax_pct', c.tax_pct,
      'enclosure_uplift_pct', c.enclosure_uplift_pct),
    'panels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'tag', p.tag,
        'quantity', p.quantity,
        'uom', p.uom,
        'option_label', p.option_label,
        'is_option', p.is_option,
        'parameters', p.parameters,
        'productivity_factor', p.productivity_factor,
        'enclosure_dimensions', p.enclosure_dimensions,
        'costs', (select jsonb_build_object(
                    'material_cost', pc.material_cost,
                    'labour_cost', pc.labour_cost,
                    'hours', pc.hours)
                  from public.v_costing_panel_costs pc where pc.panel_id = p.id),
        'price', (select jsonb_build_object(
                    'unit_price', pp.unit_price,
                    'line_total', pp.line_total)
                  from public.v_costing_panel_prices pp where pp.panel_id = p.id),
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ca.id,
            'kind', ca.kind,
            'section', ca.section,
            'name', ca.name,
            'code', ca.code,
            'quantity', ca.quantity,
            'origin', ca.origin,
            'origin_ref', ca.origin_ref,
            'source_kit_id', ca.source_assembly_id,
            'source_version', ca.source_version,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'code', i.code, 'name', i.name, 'part_number', i.part_number,
                'category', i.category_code, 'unit', i.unit, 'quantity', i.quantity,
                'unit_price', i.unit_price, 'is_manual', i.is_manual,
                'origin', i.origin) order by i.sort_order)
              from public.costing_items i where i.costing_assembly_id = ca.id), '[]'::jsonb),
            'labour', coalesce((
              select jsonb_agg(jsonb_build_object(
                'process_type', l.process_type, 'hours', l.hours, 'hourly_rate', l.hourly_rate))
              from public.costing_labour l where l.costing_assembly_id = ca.id), '[]'::jsonb)
          ) order by ca.sort_order)
          from public.costing_assemblies ca where ca.panel_id = p.id), '[]'::jsonb)
      ) order by p.sort_order)
      from public.costing_panels p where p.costing_id = c.id), '[]'::jsonb),
    'totals', (select to_jsonb(t) - 'costing_id' from public.v_costing_totals t where t.costing_id = c.id limit 1),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'file_name', d.file_name, 'mime_type', d.mime_type,
        'extraction_status', d.extraction_status) order by d.created_at)
      from public.documents d where d.entity_type = 'costing' and d.entity_id = c.id), '[]'::jsonb)
  )
  from public.costings c
  where c.id = target
$$;

comment on function app.costing_snapshot(uuid) is
  'The costing as the assistant sees it: header, frozen settings, every panel with
   its parameters and lines, totals, documents. Null when the caller may not see it.';

-- ===========================================================================
-- 2. An enquiry, as one document
-- ===========================================================================
create or replace function app.enquiry_snapshot(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', e.id,
    'enquiry_no', e.enquiry_no,
    'title', e.title,
    'description', e.description,
    'status', e.status,
    'received_on', e.received_on,
    'customer', (select jsonb_build_object('id', cu.id, 'name', cu.name, 'city', cu.city, 'country', cu.country)
                 from public.customers cu where cu.id = e.customer_id),
    'contact', (select jsonb_build_object('name', ct.name, 'email', ct.email, 'phone', ct.phone)
                from public.contacts ct where ct.id = e.contact_id),
    'project', (select jsonb_build_object('name', pr.name, 'site_location', pr.site_location)
                from public.projects pr where pr.id = e.project_id),
    'costings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'costing_no', c.costing_no, 'revision_no', c.revision_no,
        'status', c.status, 'title', c.title, 'is_current', c.is_current) order by c.created_at)
      from public.costings c where c.enquiry_id = e.id), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'file_name', d.file_name, 'mime_type', d.mime_type,
        'extraction_status', d.extraction_status) order by d.created_at)
      from public.documents d where d.entity_type = 'enquiry' and d.entity_id = e.id), '[]'::jsonb)
  )
  from public.enquiries e
  where e.id = target
$$;

-- ===========================================================================
-- 3. The text of a document
-- ===========================================================================
-- The extract-document function already filled `extracted_text`; this hands it
-- over with the status, cut to a ceiling so one enormous file cannot swallow the
-- whole context window. The assistant is told when it was cut.
create or replace function app.document_text(target uuid, max_chars integer default 200000)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', d.id,
    'file_name', d.file_name,
    'mime_type', d.mime_type,
    'extraction_status', d.extraction_status,
    'extraction_error', d.extraction_error,
    'truncated', length(coalesce(d.extracted_text, '')) > greatest(max_chars, 1000),
    'chars', length(coalesce(d.extracted_text, '')),
    'text', left(coalesce(d.extracted_text, ''), greatest(max_chars, 1000)))
  from public.documents d
  where d.id = target
$$;

-- ===========================================================================
-- 4. Finding kits and components (spec §4: Postgres full-text search plus
--    tags and structured attributes; the model is handed a shortlist, never
--    the catalogue)
-- ===========================================================================
create or replace function app.search_kits(q text, filters jsonb default '{}'::jsonb, lim integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with wanted as (
    select nullif(btrim(coalesce(q, '')), '') as q,
           nullif(filters ->> 'rating_a', '')::numeric  as rating_a,
           nullif(filters ->> 'poles', '')::integer     as poles,
           nullif(filters ->> 'category', '')           as category,
           nullif(filters ->> 'tag', '')                as tag,
           nullif(filters ->> 'brand', '')              as brand,
           nullif(filters ->> 'frame', '')              as frame
  ),
  hits as (
    select k.id, k.code, k.name, k.group_name, k.rating, k.poles,
           k.main_device_code, k.main_device_name, k.has_unpriced_part, k.line_count,
           a.tags, a.customer_wording, a.version, a.status,
           md.manufacturer as brand, md.frame_size as frame,
           case when w.q is null then 0
                else ts_rank(to_tsvector('simple', coalesce(k.name, '') || ' ' || coalesce(k.code, '') || ' '
                               || coalesce(a.customer_wording, '') || ' ' || array_to_string(a.tags, ' ')),
                             plainto_tsquery('simple', w.q)) end as rank
    from public.v_kits k
    join public.assemblies a on a.id = k.id
    left join public.assembly_components mc on mc.assembly_id = a.id and mc.is_main_device
    left join public.components md on md.id = mc.component_id
    cross join wanted w
    where a.is_active
      and (w.q is null
           or to_tsvector('simple', coalesce(k.name, '') || ' ' || coalesce(k.code, '') || ' '
                 || coalesce(a.customer_wording, '') || ' ' || array_to_string(a.tags, ' '))
              @@ plainto_tsquery('simple', w.q)
           or k.name ilike '%' || w.q || '%')
      and (w.rating_a is null or k.rating = w.rating_a)
      and (w.poles is null or k.poles = w.poles)
      and (w.category is null or k.group_name ilike '%' || w.category || '%')
      and (w.tag is null or a.tags @> array[lower(w.tag)])
      and (w.brand is null or md.manufacturer ilike '%' || w.brand || '%')
      and (w.frame is null or md.frame_size ilike '%' || w.frame || '%')
    order by rank desc, k.name
    limit greatest(least(coalesce(lim, 20), 50), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'code', h.code, 'name', h.name, 'group', h.group_name,
    'rating', h.rating, 'poles', h.poles, 'tags', h.tags, 'version', h.version,
    'status', h.status, 'customer_wording', h.customer_wording,
    'main_device', jsonb_build_object('code', h.main_device_code, 'name', h.main_device_name,
                                      'brand', h.brand, 'frame', h.frame),
    'line_count', h.line_count,
    'has_unpriced_part', h.has_unpriced_part,
    'price', (select round(sum(p.unit_price * ac.quantity), 2)
              from public.assembly_components ac
              join public.v_component_prices p on p.id = ac.component_id
              where ac.assembly_id = h.id),
    'hours', (select jsonb_object_agg(vh.process_type, vh.effective_hours)
              from public.v_assembly_hours vh where vh.assembly_id = h.id)
  )), '[]'::jsonb)
  from hits h
$$;

create or replace function app.search_components(q text, filters jsonb default '{}'::jsonb, lim integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with wanted as (
    select nullif(btrim(coalesce(q, '')), '') as q,
           nullif(filters ->> 'category', '')     as category,
           nullif(filters ->> 'bom_category', '') as bom_category,
           nullif(filters ->> 'brand', '')        as brand,
           nullif(filters ->> 'rating_a', '')     as rating_a,
           nullif(filters ->> 'poles', '')        as poles,
           nullif(filters ->> 'unit', '')         as unit
  ),
  hits as (
    select p.*,
           case when w.q is null then 0
                else ts_rank(to_tsvector('simple', coalesce(p.name, '') || ' ' || coalesce(p.code, '') || ' '
                               || coalesce(p.part_number, '') || ' ' || coalesce(p.description, '')),
                             plainto_tsquery('simple', w.q)) end as rank
    from public.v_component_prices p
    cross join wanted w
    where p.is_active
      and (w.q is null
           or to_tsvector('simple', coalesce(p.name, '') || ' ' || coalesce(p.code, '') || ' '
                 || coalesce(p.part_number, '') || ' ' || coalesce(p.description, ''))
              @@ plainto_tsquery('simple', w.q)
           or p.name ilike '%' || w.q || '%' or p.code ilike '%' || w.q || '%')
      and (w.category is null or p.category_name ilike '%' || w.category || '%'
                               or p.category_code ilike '%' || w.category || '%')
      and (w.bom_category is null or p.category_code = w.bom_category)
      and (w.brand is null or p.manufacturer ilike '%' || w.brand || '%')
      and (w.rating_a is null or p.rating ilike '%' || w.rating_a || '%')
      and (w.poles is null or p.poles ilike '%' || w.poles || '%')
      and (w.unit is null or p.unit = w.unit)
    order by rank desc, p.code
    limit greatest(least(coalesce(lim, 20), 50), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'code', h.code, 'part_number', h.part_number, 'name', h.name,
    'description', h.description, 'category', h.category_code, 'unit', h.unit,
    'brand', h.manufacturer, 'supplier', h.supplier, 'rating', h.rating, 'poles', h.poles,
    'attributes', h.attributes, 'status', h.status,
    'price', h.unit_price, 'currency', h.currency_label
  )), '[]'::jsonb)
  from hits h
$$;

-- ===========================================================================
-- 5. One kit in full
-- ===========================================================================
create or replace function app.kit_detail(target uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', a.id, 'code', a.code, 'name', a.name, 'description', a.description,
    'version', a.version, 'status', a.status, 'tags', a.tags,
    'customer_wording', a.customer_wording, 'compatibility_rules', a.compatibility_rules,
    'rating', a.rating, 'rating_unit', a.rating_unit, 'poles', a.poles,
    'group', (select g.name from public.kit_groups g where g.id = a.kit_group_id),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'component_id', ac.component_id, 'code', p.code, 'part_number', p.part_number,
        'name', p.name, 'quantity', ac.quantity, 'qty_expression', ac.qty_expression,
        'is_main_device', ac.is_main_device, 'customer_wording', ac.customer_wording,
        'unit', p.unit, 'price', p.unit_price, 'status', p.status) order by ac.sort_order)
      from public.assembly_components ac
      join public.v_component_prices p on p.id = ac.component_id
      where ac.assembly_id = a.id), '[]'::jsonb),
    'parameters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', kp.name, 'type', kp.value_type, 'unit', kp.unit, 'default', kp.default_value,
        'min', kp.min_value, 'max', kp.max_value) order by kp.sort_order)
      from public.kit_parameters kp where kp.assembly_id = a.id), '[]'::jsonb),
    'hours', (select jsonb_object_agg(vh.process_type, vh.effective_hours)
              from public.v_assembly_hours vh where vh.assembly_id = a.id)
  )
  from public.assemblies a
  where a.id = target
$$;

-- ===========================================================================
-- 6. The company's policy, in one piece
-- ===========================================================================
create or replace function app.company_policy()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', c.id, 'name', c.name, 'currency', c.currency_label,
      'material_margin_pct', c.material_margin_pct, 'labour_margin_pct', c.labour_margin_pct,
      'price_rounding_step', c.price_rounding_step, 'tax_pct', c.tax_pct,
      'enclosure_uplift_pct', c.enclosure_uplift_pct),
    'terms', (select jsonb_build_object(
                'validity_days', s.validity_days, 'payment_terms', s.payment_terms,
                'delivery_terms', s.delivery_terms, 'delivery_timelines', s.delivery_timelines,
                'scope_of_supply', s.scope_of_supply)
              from public.company_settings s where s.company_id = c.id),
    'assistant', jsonb_build_object(
      'enabled', app.company_option('ai_enabled', 'false'::jsonb),
      'monthly_token_budget', app.company_option('ai_monthly_token_budget', '0'::jsonb),
      'price_age_warning_days', app.company_option('ai_price_age_warning_days', '90'::jsonb),
      'min_margin_pct', app.company_option('ai_min_margin_pct', '0'::jsonb)),
    'approval_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', r.name, 'condition', r.condition, 'outcome', r.outcome) order by r.sort_order)
      from public.approval_rules r where r.company_id = c.id and r.is_active), '[]'::jsonb),
    'kit_groups', coalesce((
      select jsonb_agg(jsonb_build_object('name', g.name, 'kits', (
        select count(*) from public.assemblies a where a.kit_group_id = g.id and a.is_active)) order by g.sort_order)
      from public.kit_groups g where g.company_id is null or g.company_id = c.id), '[]'::jsonb),
    'categories', (select jsonb_agg(jsonb_build_object('code', cc.code, 'name', cc.name) order by cc.sort_order)
                   from public.component_categories cc)
  )
  from public.companies c
  where c.id = app.current_company_id()
$$;

-- ===========================================================================
-- 7. An indicative price for a list of kits and components, without saving
-- ===========================================================================
-- The same arithmetic as v_costing_panel_prices — material ÷ (1 − margin),
-- labour ÷ (1 − margin), rounded UP to the company step — applied to a list that
-- is never written anywhere. Prices come from v_component_prices, hours from
-- v_assembly_hours and the company's rates, exactly as add_assembly_to_costing
-- would freeze them. A part without a price is named, not guessed (decision A4).
create or replace function app.price_preview(lines jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  co public.companies;
  ln jsonb;
  kit_id uuid;
  comp_id uuid;
  qty numeric;
  line_material numeric;
  line_labour numeric;
  line_hours numeric;
  material numeric := 0;
  labour numeric := 0;
  hours numeric := 0;
  unpriced jsonb := '[]'::jsonb;
  out_lines jsonb := '[]'::jsonb;
  missing text;
  sell numeric;
begin
  select * into co from public.companies where id = app.current_company_id();
  if co.id is null then raise exception 'you do not belong to a company'; end if;
  if lines is null or jsonb_typeof(lines) <> 'array' then
    raise exception 'price_preview wants a list of {kit_id | component_id, qty}';
  end if;

  for ln in select * from jsonb_array_elements(lines) loop
    kit_id  := nullif(ln ->> 'kit_id', '')::uuid;
    comp_id := nullif(ln ->> 'component_id', '')::uuid;
    qty     := coalesce(nullif(ln ->> 'qty', '')::numeric, 1);
    line_material := null; line_labour := 0; line_hours := 0;

    if kit_id is not null then
      -- Name every unpriced part of the kit, as add_assembly_to_costing does.
      select string_agg(p.code, ', ' order by p.code) into missing
      from public.assembly_components x join public.v_component_prices p on p.id = x.component_id
      where x.assembly_id = kit_id and p.unit_price is null;
      if not exists (select 1 from public.assemblies where id = kit_id) then
        unpriced := unpriced || jsonb_build_object('kit_id', kit_id, 'reason', 'no such kit, or not visible to you');
        continue;
      end if;
      if missing is not null then
        unpriced := unpriced || jsonb_build_object('kit_id', kit_id, 'reason', missing || ' has no price yet');
        continue;
      end if;
      select sum(p.unit_price * x.quantity) into line_material
      from public.assembly_components x join public.v_component_prices p on p.id = x.component_id
      where x.assembly_id = kit_id;
      select coalesce(sum(vh.effective_hours), 0),
             coalesce(sum(vh.effective_hours * coalesce(own.hourly_rate, master.hourly_rate, 0)), 0)
        into line_hours, line_labour
      from public.v_assembly_hours vh
      left join public.labour_rates own    on own.company_id = co.id and own.process_type = vh.process_type
      left join public.labour_rates master on master.company_id is null and master.process_type = vh.process_type
      where vh.assembly_id = kit_id;
    elsif comp_id is not null then
      select p.unit_price into line_material from public.v_component_prices p where p.id = comp_id;
      if not found then
        unpriced := unpriced || jsonb_build_object('component_id', comp_id, 'reason', 'no such component, or not visible to you');
        continue;
      end if;
      if line_material is null then
        unpriced := unpriced || jsonb_build_object('component_id', comp_id, 'reason', 'has no price yet');
        continue;
      end if;
    else
      continue;
    end if;

    material := material + line_material * qty;
    labour   := labour   + line_labour   * qty;
    hours    := hours    + line_hours    * qty;
    out_lines := out_lines || jsonb_build_object(
      'kit_id', kit_id, 'component_id', comp_id, 'qty', qty,
      'material_each', round(line_material, 2), 'labour_each', round(line_labour, 2),
      'hours_each', line_hours);
  end loop;

  sell := ceil((material / (1 - co.material_margin_pct / 100) + labour / (1 - co.labour_margin_pct / 100))
               / co.price_rounding_step) * co.price_rounding_step;

  return jsonb_build_object(
    'currency', co.currency_label,
    'lines', out_lines,
    'material_cost', round(material, 2),
    'labour_cost', round(labour, 2),
    'hours', hours,
    'material_sell', round(material / (1 - co.material_margin_pct / 100), 2),
    'labour_sell', round(labour / (1 - co.labour_margin_pct / 100), 2),
    'selling_price', sell,
    'vat', round(sell * co.tax_pct / 100, 2),
    'total_incl_vat', round(sell * (1 + co.tax_pct / 100), 2),
    'unpriced', unpriced,
    'complete', jsonb_array_length(unpriced) = 0,
    'note', 'Indicative: today''s prices and the company''s margins, no negotiation margin, nothing saved.');
end;
$$;

comment on function app.price_preview(jsonb) is
  'Indicative material, labour and selling figures for a list of kits and
   components, by the same arithmetic as v_costing_panel_prices. Nothing is written.';

-- ===========================================================================
-- 8. May the assistant run, and how much is left (spec §4: budget stop, rate limit)
-- ===========================================================================
create or replace function app.assistant_allowance()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with usage as (
    select coalesce(sum(coalesce(m.tokens_in, 0) + coalesce(m.tokens_out, 0)), 0)::bigint as used
    from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where c.company_id = app.current_company_id()
      and m.created_at >= date_trunc('month', now())
  ),
  recent as (
    select count(*)::integer as n
    from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where c.user_id = auth.uid()
      and m.role = 'user'
      and m.created_at >= now() - interval '60 seconds'
  )
  select jsonb_build_object(
    'enabled', coalesce((app.company_option('ai_enabled', 'false'::jsonb))::text::boolean, false),
    'monthly_token_budget', coalesce((app.company_option('ai_monthly_token_budget', '0'::jsonb))::text::numeric, 0),
    'used_this_month', u.used,
    'recent_requests', r.n,
    'rate_limit_per_minute', 20)
  from usage u, recent r
$$;

comment on function app.assistant_allowance() is
  'Whether the caller''s company has the assistant switched on, the month''s
   budget and what has been spent of it, and how many requests this user made in
   the last minute. The Edge Function reads this before it calls any provider.';

-- Token totals on a conversation, added atomically after each turn.
create or replace function app.assistant_record_usage(
  conversation uuid, add_in integer, add_out integer, add_cost numeric)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.assistant_conversations
     set tokens_in = tokens_in + coalesce(add_in, 0),
         tokens_out = tokens_out + coalesce(add_out, 0),
         cost_usd = cost_usd + coalesce(add_cost, 0),
         updated_at = now()
   where id = conversation
$$;

-- ===========================================================================
-- Public wrappers and grants
-- ===========================================================================
create or replace function public.costing_snapshot(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.costing_snapshot(target) $$;
create or replace function public.enquiry_snapshot(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.enquiry_snapshot(target) $$;
create or replace function public.document_text(target uuid, max_chars integer default 200000) returns jsonb
  language sql stable security invoker as $$ select app.document_text(target, max_chars) $$;
create or replace function public.search_kits(q text, filters jsonb default '{}'::jsonb, lim integer default 20) returns jsonb
  language sql stable security invoker as $$ select app.search_kits(q, filters, lim) $$;
create or replace function public.search_components(q text, filters jsonb default '{}'::jsonb, lim integer default 20) returns jsonb
  language sql stable security invoker as $$ select app.search_components(q, filters, lim) $$;
create or replace function public.kit_detail(target uuid) returns jsonb
  language sql stable security invoker as $$ select app.kit_detail(target) $$;
create or replace function public.company_policy() returns jsonb
  language sql stable security invoker as $$ select app.company_policy() $$;
create or replace function public.price_preview(lines jsonb) returns jsonb
  language plpgsql stable security invoker as $$ begin return app.price_preview(lines); end $$;
create or replace function public.assistant_allowance() returns jsonb
  language sql stable security invoker as $$ select app.assistant_allowance() $$;
create or replace function public.assistant_record_usage(conversation uuid, add_in integer, add_out integer, add_cost numeric) returns void
  language sql security invoker as $$ select app.assistant_record_usage(conversation, add_in, add_out, add_cost) $$;

grant execute on function
  app.costing_snapshot(uuid), public.costing_snapshot(uuid),
  app.enquiry_snapshot(uuid), public.enquiry_snapshot(uuid),
  app.document_text(uuid, integer), public.document_text(uuid, integer),
  app.search_kits(text, jsonb, integer), public.search_kits(text, jsonb, integer),
  app.search_components(text, jsonb, integer), public.search_components(text, jsonb, integer),
  app.kit_detail(uuid), public.kit_detail(uuid),
  app.company_policy(), public.company_policy(),
  app.price_preview(jsonb), public.price_preview(jsonb),
  app.assistant_allowance(), public.assistant_allowance(),
  app.assistant_record_usage(uuid, integer, integer, numeric),
  public.assistant_record_usage(uuid, integer, integer, numeric)
to authenticated;
