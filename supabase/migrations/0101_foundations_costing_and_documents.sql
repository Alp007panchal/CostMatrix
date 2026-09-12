-- 0101  Foundations F4–F6: where a line came from, the documents behind it,
--       and a log of what everybody did
--
-- F4 costing parameters and provenance: the board's defining answers as fields
--    rather than notes, and `origin` on every costing line.
-- F5 one generic `documents` table, replacing `enquiry_attachments`, with the
--    extracted text a background job fills in.
-- F6 `activity_log`: the audit trail, the CRM activity feed and the record of
--    what the assistant proposed, in one place.
--
-- Nothing here changes a price. `supabase/tests/15_acceptance_npp192.sql` is
-- unchanged and must stay green.
--
-- The engine functions at the end are **derived from their existing text** by
-- insertion rather than retyped, for the same reason as in 0100: the arithmetic
-- in them is trusted, and retyping it is how a digit gets lost.

-- ===========================================================================
-- F4. The board's defining answers, and where every line came from
-- ===========================================================================

alter table public.costing_panels
  -- Incomer rating and type, supply sources, feeder schedule, form of
  -- separation, IP, access, cable entry, APFC kVAr, enclosure dimensions.
  -- Typed into notes today; as a field they generate Annexure I and IV text,
  -- drive the configurator, and give the assistant something to check against.
  add column if not exists parameters jsonb not null default '{}'::jsonb,
  -- Shown on the quotation but excluded from the total (roadmap 2.7). The
  -- existing `option_label` stays the grouping, so there is one way to group
  -- options rather than two (D-179).
  add column if not exists is_option boolean not null default false;

comment on column public.costing_panels.parameters is
  'The board''s defining answers. Empty today; the configurator and the assistant
   fill it. Frozen with the rest of the panel: a revision copies it.';
comment on column public.costing_panels.is_option is
  'Priced and printed, but left out of the total. `option_label` groups options.';

-- Provenance. `origin_ref` is a bare uuid on purpose: it points at an
-- assistant proposal (0102), an import job (0102), or nothing, and a foreign key
-- could only ever name one of them.
alter table public.costing_assemblies
  add column if not exists origin text not null default 'manual'
    constraint costing_assemblies_origin_known
    check (origin in ('manual', 'kit', 'configurator', 'import', 'ai_proposal')),
  add column if not exists origin_ref uuid;

alter table public.costing_items
  add column if not exists origin text not null default 'manual'
    constraint costing_items_origin_known
    check (origin in ('manual', 'kit', 'configurator', 'import', 'ai_proposal')),
  add column if not exists origin_ref uuid;

-- Back-fill what is already there: a kit line came from a kit, everything else
-- was typed or picked by a person.
update public.costing_assemblies set origin = 'kit' where kind = 'kit' and origin = 'manual';
update public.costing_items i set origin = 'kit'
  where not i.is_manual
    and i.origin = 'manual'
    and exists (select 1 from public.costing_assemblies ca
                 where ca.id = i.costing_assembly_id and ca.kind = 'kit');

create index if not exists costing_items_origin_ref_idx
  on public.costing_items (origin_ref) where origin_ref is not null;

comment on column public.costing_items.origin is
  'manual / kit / configurator / import / ai_proposal. Required for the
   assistant''s audit trail and for BOM import.';
comment on column public.costing_items.origin_ref is
  'The proposal or import job that produced this line. Deliberately not a
   foreign key: it names one of several tables.';

-- ===========================================================================
-- F5. Documents
-- ===========================================================================
-- One table for every file the app keeps: the customer's specification and
-- single-line diagram on an enquiry, a supplier price list, a datasheet, a
-- released quotation, and everything the assistant reads. It replaces
-- `enquiry_attachments`, whose rows are copied across below — one table rather
-- than two that drift.

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  entity_type      text not null
    constraint documents_entity_type_known
    check (entity_type in ('enquiry', 'costing', 'quotation', 'component', 'supplier_price_list')),
  -- Null for a document that hangs off nothing in particular, such as a supplier
  -- price list that arrived before anybody decided what it was for.
  entity_id        uuid,
  file_name        text not null,
  path             text not null unique,
  mime_type        text,
  size_bytes       bigint,
  note             text,
  -- Filled by the extract-document Edge Function, not by the uploader.
  extracted_text   text,
  extraction_status text not null default 'pending'
    constraint documents_extraction_status_known
    check (extraction_status in ('pending', 'done', 'failed', 'unsupported')),
  extraction_error text,
  extracted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

create index if not exists documents_entity_idx on public.documents (entity_type, entity_id);
create index if not exists documents_company_idx on public.documents (company_id);
create index if not exists documents_pending_idx on public.documents (extraction_status)
  where extraction_status = 'pending';

select app.add_audit_triggers('public.documents');

-- `enquiry_attachments` used a composite foreign key so a file could never hang
-- off another company's enquiry. A generic table cannot do that — it would need
-- one foreign key per entity type — so the same guarantee is a trigger. The
-- three company-owned types are checked; a component belongs to the master
-- library and a price list belongs to nothing, so those are not.
create or replace function app.documents_check_entity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  belongs boolean;
begin
  if new.entity_id is null then
    if new.entity_type in ('enquiry', 'costing', 'quotation') then
      raise exception 'a % document must name the % it belongs to', new.entity_type, new.entity_type;
    end if;
    return new;
  end if;

  belongs := case new.entity_type
    when 'enquiry'   then exists (select 1 from public.enquiries  e where e.id = new.entity_id and e.company_id = new.company_id)
    when 'costing'   then exists (select 1 from public.costings   c where c.id = new.entity_id and c.company_id = new.company_id)
    when 'quotation' then exists (select 1 from public.quotations q where q.id = new.entity_id and q.company_id = new.company_id)
    else true
  end;

  if not belongs then
    raise exception 'no such % in this company', new.entity_type;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_check_entity on public.documents;
create trigger documents_check_entity
  before insert or update of entity_type, entity_id, company_id on public.documents
  for each row execute function app.documents_check_entity();

-- The composite foreign key also cascaded: deleting the enquiry took its file
-- records with it. Kept, as one trigger on each of the three company-owned
-- record types. Objects in storage are untouched either way, as before.
create or replace function app.documents_follow_entity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.documents
   where entity_type = tg_argv[0] and entity_id = old.id and company_id = old.company_id;
  return old;
end;
$$;

drop trigger if exists documents_follow_enquiry on public.enquiries;
create trigger documents_follow_enquiry after delete on public.enquiries
  for each row execute function app.documents_follow_entity('enquiry');
drop trigger if exists documents_follow_costing on public.costings;
create trigger documents_follow_costing after delete on public.costings
  for each row execute function app.documents_follow_entity('costing');
drop trigger if exists documents_follow_quotation on public.quotations;
create trigger documents_follow_quotation after delete on public.quotations
  for each row execute function app.documents_follow_entity('quotation');

comment on table public.documents is
  'Every file the app keeps, against the record it belongs to. Objects live in
   the private `attachments` bucket under {company_id}/…, which is what the
   storage policy checks. Deleting a row does not delete the object.';

-- --- the rows enquiry_attachments already held ------------------------------
-- Paths are copied as they are, so the objects in storage do not move. New
-- uploads use {company_id}/{entity_type}/{entity_id}/… ; both keep the company
-- first, which is all the storage policy reads.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'enquiry_attachments') then
    insert into public.documents
      (company_id, entity_type, entity_id, file_name, path, mime_type, size_bytes, note,
       extraction_status, created_at, updated_at, created_by)
    select company_id, 'enquiry', enquiry_id, file_name, path, mime_type, size_bytes, note,
           'pending', created_at, updated_at, created_by
    from public.enquiry_attachments
    on conflict (path) do nothing;

    raise notice 'documents: carried % enquiry attachment(s) across',
      (select count(*) from public.enquiry_attachments);

    drop table public.enquiry_attachments;
  end if;
end;
$$;

-- ===========================================================================
-- F6. Activity log
-- ===========================================================================
-- `costing_history` stays exactly as it is: its `costing_id` is not null, so it
-- cannot carry an enquiry, a component or an assistant proposal, and the costing
-- screen reads it through `v_costing_history` (D-178). This is the wider log,
-- beside it.

create table if not exists public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  -- Null when the actor is not a person: the assistant, or a nightly job.
  actor_user_id uuid,
  actor_kind    text not null default 'user'
    constraint activity_log_actor_kind_known check (actor_kind in ('user', 'assistant', 'system')),
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  before        jsonb,
  after         jsonb,
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index if not exists activity_log_company_idx on public.activity_log (company_id, created_at desc);

comment on table public.activity_log is
  'Append-only. The approval audit trail, the CRM activity feed, and what the
   assistant proposed and who applied it. Written only through
   app.write_activity, which is what makes it a log rather than a table.';

-- The one way to write it, like app.write_history for costing_history: a
-- signed-in user has no insert of their own.
create or replace function app.write_activity(
  entity_type text,
  entity_id uuid,
  action text,
  before jsonb default null,
  after jsonb default null,
  note text default null,
  actor_kind text default 'user')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company uuid := app.current_company_id();
  new_row uuid;
begin
  if target_company is null then raise exception 'you do not belong to a company'; end if;
  if actor_kind not in ('user', 'assistant', 'system') then
    raise exception 'unknown actor kind %', actor_kind;
  end if;

  insert into public.activity_log
    (company_id, actor_user_id, actor_kind, entity_type, entity_id, action, before, after, note)
  values (target_company, auth.uid(), actor_kind, entity_type, entity_id, action, before, after, note)
  returning id into new_row;
  return new_row;
end;
$$;

create or replace function public.write_activity(
  entity_type text, entity_id uuid, action text, before jsonb default null,
  after jsonb default null, note text default null, actor_kind text default 'user')
returns uuid language sql security invoker
as $$ select app.write_activity(entity_type, entity_id, action, before, after, note, actor_kind) $$;

-- ===========================================================================
-- Row-level security and grants
-- ===========================================================================

alter table public.documents    enable row level security;
alter table public.activity_log enable row level security;

-- Tenant-owned, as enquiry_attachments was: read for the company and the master
-- admin, write for whoever may edit costings.
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select
  using (company_id = app.current_company_id() or app.is_master_admin());

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents for all
  using (company_id = app.current_company_id() and app.can_edit_costings())
  with check (company_id = app.current_company_id() and app.can_edit_costings());

-- Read-only to everyone: rows arrive through app.write_activity.
drop policy if exists activity_log_read on public.activity_log;
create policy activity_log_read on public.activity_log for select
  using (company_id = app.current_company_id() or app.is_master_admin());

grant select, insert, update, delete on public.documents to authenticated;
grant select on public.activity_log to authenticated;
grant execute on function app.write_activity(text, uuid, text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.write_activity(text, uuid, text, jsonb, jsonb, text, text) to authenticated;

-- ===========================================================================
-- The engine: every line says where it came from
-- ===========================================================================
-- Derived from the existing function text by insertion, not retyped.

-- freeze_component is the one place a catalogue component is priced into a
-- costing. It gains two trailing parameters with defaults, so the three callers
-- that do not care (a loose component is 'manual' by definition) need no change.
-- The old signature is dropped first: two functions of one name where the extra
-- arguments have defaults cannot be told apart (the lesson of 0014).
drop function if exists app.freeze_component(uuid, uuid, uuid, uuid, numeric, integer);

create function app.freeze_component(
  target_costing uuid, holder uuid, target_company uuid, component uuid, qty numeric, sort integer,
  line_origin text default 'manual', line_origin_ref uuid default null)
returns uuid
language plpgsql
as $$
declare
  p public.v_component_prices;
  c public.costings;
  new_item uuid;
begin
  select * into p from public.v_component_prices where id = component;
  if p.id is null then raise exception 'no such component'; end if;
  if p.unit_price is null then
    raise exception '% has no price yet — set the purchase price before costing it', p.code;
  end if;
  select * into c from public.costings where id = target_costing;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
     category_code, unit, manufacturer, part_number, quantity, pricing_mode,
     purchase_price, purchase_currency, landed_factor,
     master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
     uplift_pct, unit_price, sort_order, created_by, origin, origin_ref)
  values
    (target_costing, holder, target_company, p.id, p.code, p.name,
     p.category_code, p.unit, p.manufacturer, p.part_number, qty, p.pricing_mode,
     case when p.pricing_mode = 'fixed' then p.raw_price end,
     case when p.pricing_mode = 'fixed' then p.purchase_currency end,
     case when p.pricing_mode = 'fixed' then p.landed_factor end,
     case when p.company_id is null and p.pricing_mode = 'fixed' then p.landed_price_kes end,
     case when p.company_id is null and p.pricing_mode = 'fixed' then c.discount_pct end,
     case when p.pricing_mode = 'fixed' then c.exchange_rate end,
     p.weight_per_unit,
     case when p.pricing_mode = 'weight_rate'
          then round(p.unit_price / nullif(p.weight_per_unit, 0), 2) end,
     case when p.is_enclosure_cubicle then c.enclosure_uplift_pct end,
     case when p.is_enclosure_cubicle
          then round(p.unit_price * (1 + c.enclosure_uplift_pct / 100), 2)
          else p.unit_price end,
     sort, auth.uid(), line_origin, line_origin_ref)
  returning id into new_item;
  return new_item;
end;
$$;

comment on function app.freeze_component(uuid, uuid, uuid, uuid, numeric, integer, text, uuid) is
  'The one place a catalogue component is priced into a costing: every frozen
   column, the cubicle uplift, the refusal of an unpriced part — and, since 0101,
   where the line came from.';


-- A kit and every line copied from it came from that kit.

create or replace function app.add_assembly_to_costing(
  target_panel_id uuid,
  source_assembly uuid,
  qty numeric default 1,
  section text default null)
returns uuid
language plpgsql
as $$
declare
  target_costing uuid;
  target_company uuid;
  new_line uuid;
  a public.assemblies;
  ac record;
  unpriced text;
begin
  select costing_id, company_id into target_costing, target_company
  from public.costing_panels where id = target_panel_id;
  if target_costing is null then raise exception 'no such panel'; end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'this costing is not open for editing';
  end if;

  select * into a from public.assemblies where id = source_assembly;
  if a is null then raise exception 'no such kit'; end if;

  -- Name every unpriced part at once rather than the first one found.
  select string_agg(p.code, ', ' order by p.code) into unpriced
  from public.assembly_components x
  join public.v_component_prices p on p.id = x.component_id
  where x.assembly_id = source_assembly and p.unit_price is null;
  if unpriced is not null then
    raise exception '% has no price yet — set the purchase price before costing this kit', unpriced;
  end if;

  insert into public.costing_assemblies
    (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
     code, name, quantity, created_by, sort_order, origin)
  values (target_costing, target_panel_id, target_company, 'kit', app.clean_section(section),
          a.id, a.version, a.code, a.name, qty, auth.uid(),
          coalesce((select max(sort_order) + 1 from public.costing_assemblies
                    where panel_id = target_panel_id), 0),
          'kit')
  returning id into new_line;

  for ac in
    select component_id, quantity, sort_order from public.assembly_components
    where assembly_id = source_assembly order by sort_order
  loop
    perform app.freeze_component(target_costing, new_line, target_company, ac.component_id,
                                 ac.quantity, ac.sort_order, 'kit');
  end loop;

  -- Labour, at the hours this company plans and the rates this costing froze.
  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
     source, hourly_rate, created_by)
  select target_costing, new_line, target_company, h.process_type, h.effective_hours,
         h.effective_hours, h.source, coalesce(r.hourly_rate, 0), auth.uid()
  from public.v_assembly_hours h
  left join public.costing_labour_rates r
         on r.costing_id = target_costing and r.process_type = h.process_type
  where h.assembly_id = source_assembly
    and h.effective_hours > 0;

  return new_line;
end;
$$;

-- A copied panel keeps its parameters and the provenance of every line.

create or replace function app.copy_panel(
  source_panel uuid, target_costing uuid, new_name text default null)
returns jsonb
language plpgsql
as $$
declare
  src public.costing_panels;
  dst public.costings;
  new_panel uuid;
  new_line uuid;
  ca record;
  it record;
  p public.v_component_prices;
  repriced integer := 0;
  kept jsonb := '[]'::jsonb;
begin
  select * into src from public.costing_panels where id = source_panel;
  if src.id is null then raise exception 'no such panel'; end if;
  select * into dst from public.costings where id = target_costing;
  if dst.id is null then raise exception 'no such costing'; end if;
  if dst.company_id <> src.company_id then
    raise exception 'a panel can only be copied inside the company that owns it';
  end if;
  if not app.costing_is_editable(target_costing) then
    raise exception 'the costing being copied into is not open for editing';
  end if;

  insert into public.costing_panels
    (costing_id, company_id, name, tag, option_label, uom, quantity,
     technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
     sort_order, created_by)
  values
    (target_costing, dst.company_id,
     coalesce(nullif(btrim(coalesce(new_name, '')), ''), src.name),
     src.tag, src.option_label, src.uom, src.quantity,
     src.technical_description, src.enclosure_dimensions, src.productivity_factor,
     src.parameters, src.is_option,
     coalesce((select max(sort_order) + 1 from public.costing_panels where costing_id = target_costing), 0),
     auth.uid())
  returning id into new_panel;

  for ca in
    select * from public.costing_assemblies where panel_id = source_panel order by sort_order
  loop
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, sort_order, created_by, origin, origin_ref)
    values (target_costing, new_panel, dst.company_id, ca.kind, ca.section, ca.source_assembly_id,
            ca.source_version, ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid(),
            ca.origin, ca.origin_ref)
    returning id into new_line;

    for it in
      select * from public.costing_items where costing_assembly_id = ca.id order by sort_order
    loop
      p := null;
      if it.source_component_id is not null then
        select * into p from public.v_component_prices where id = it.source_component_id;
      end if;

      if p.id is not null and p.unit_price is not null then
        perform app.freeze_component(target_costing, new_line, dst.company_id,
                                     it.source_component_id, it.quantity, it.sort_order,
                                     it.origin, it.origin_ref);
        repriced := repriced + 1;
      else
        insert into public.costing_items
          (costing_id, costing_assembly_id, company_id, source_component_id, code, name,
           category_code, unit, manufacturer, part_number, quantity, pricing_mode,
           purchase_price, purchase_currency, landed_factor,
           master_price_kes, discount_pct, exchange_rate, weight_per_unit, material_rate,
           uplift_pct, unit_price, is_manual, sort_order, created_by, origin, origin_ref)
        values
          (target_costing, new_line, dst.company_id, it.source_component_id, it.code, it.name,
           it.category_code, it.unit, it.manufacturer, it.part_number, it.quantity, it.pricing_mode,
           it.purchase_price, it.purchase_currency, it.landed_factor,
           it.master_price_kes, it.discount_pct, it.exchange_rate, it.weight_per_unit, it.material_rate,
           it.uplift_pct, it.unit_price, it.is_manual, it.sort_order, auth.uid(),
           it.origin, it.origin_ref);

        -- A typed line is not a problem: nothing but the person who typed it
        -- ever knew its price. A catalogue part that cannot be re-priced is.
        if not it.is_manual then
          kept := kept || jsonb_build_object(
            'code', it.code, 'name', it.name, 'unit_price', it.unit_price,
            'reason', case when p.id is null then 'no longer in the catalogue'
                           else 'has no price today' end);
        end if;
      end if;
    end loop;

    insert into public.costing_labour
      (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours,
       source, hourly_rate, created_by)
    select target_costing, new_line, dst.company_id, l.process_type, l.hours, l.source_hours,
           l.source, coalesce(r.hourly_rate, l.hourly_rate), auth.uid()
    from public.costing_labour l
    left join public.costing_labour_rates r
           on r.costing_id = target_costing and r.process_type = l.process_type
    where l.costing_assembly_id = ca.id;
  end loop;

  return jsonb_build_object('panel_id', new_panel, 'repriced', repriced, 'kept', kept);
end;
$$;

-- A revision keeps parameters and provenance: the fourth time this function's
-- hand-written lists have had columns added, and each time a test now checks them.

create or replace function app.create_costing_revision(target uuid)
returns public.costings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_costing public.costings;
  new_costing public.costings;
begin
  select * into old_costing from public.costings
   where id = target and company_id = app.current_company_id();

  if old_costing is null then raise exception 'no such costing'; end if;
  if old_costing.status <> 'approved' then
    raise exception 'only an approved costing needs a revision; this one can still be edited';
  end if;
  if not old_costing.is_current then
    raise exception 'revise the current revision, not an older one';
  end if;
  if not app.can_edit_costings() then raise exception 'you may not revise costings'; end if;

  update public.costings set is_current = false where id = target;

  insert into public.costings (
    company_id, enquiry_id, costing_no, revision_no, family_id, previous_revision_id, is_current,
    title, notes, status, currency_code, currency_label, exchange_rate, discount_pct,
    material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
    tax_pct, enclosure_uplift_pct, created_by)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid()
  from public.costings where id = target
  returning * into new_costing;

  insert into public.costing_labour_rates (costing_id, company_id, process_type, hourly_rate)
  select new_costing.id, company_id, process_type, hourly_rate
  from public.costing_labour_rates where costing_id = target;

  create temporary table copied_panels (old_id uuid, new_id uuid) on commit drop;
  create temporary table copied_assemblies (old_id uuid, new_id uuid) on commit drop;

  with inserted as (
    insert into public.costing_panels
      (costing_id, company_id, name, tag, option_label, uom, quantity,
       technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
       sort_order, created_by)
    select new_costing.id, company_id, name, tag, option_label, uom, quantity,
           technical_description, enclosure_dimensions, productivity_factor, parameters, is_option,
           sort_order, auth.uid()
    from public.costing_panels where costing_id = target
    returning id, sort_order, name
  )
  insert into copied_panels (old_id, new_id)
  select o.id, i.id
  from inserted i
  join public.costing_panels o
    on o.costing_id = target and o.sort_order = i.sort_order and o.name = i.name;

  with inserted as (
    insert into public.costing_assemblies
      (costing_id, panel_id, company_id, kind, section, source_assembly_id, source_version,
       code, name, quantity, sort_order, created_by, origin, origin_ref)
    select new_costing.id, cp.new_id, ca.company_id, ca.kind, ca.section, ca.source_assembly_id,
           ca.source_version, ca.code, ca.name, ca.quantity, ca.sort_order, auth.uid(),
           ca.origin, ca.origin_ref
    from public.costing_assemblies ca
    join copied_panels cp on cp.old_id = ca.panel_id
    where ca.costing_id = target
    returning id, panel_id, sort_order, code
  )
  insert into copied_assemblies (old_id, new_id)
  select o.id, i.id
  from inserted i
  join copied_panels cp on cp.new_id = i.panel_id
  join public.costing_assemblies o
    on o.costing_id = target and o.panel_id = cp.old_id
   and o.sort_order = i.sort_order and o.code = i.code;

  insert into public.costing_items
    (costing_id, costing_assembly_id, company_id, source_component_id, code, name, category_code,
     unit, manufacturer, part_number, quantity, pricing_mode, master_price_kes, discount_pct,
     exchange_rate, weight_per_unit, material_rate, unit_price, purchase_price, purchase_currency,
     landed_factor, uplift_pct, is_manual, sort_order, created_by, origin, origin_ref)
  select new_costing.id, cas.new_id, i.company_id, i.source_component_id, i.code, i.name,
         i.category_code, i.unit, i.manufacturer, i.part_number, i.quantity, i.pricing_mode,
         i.master_price_kes, i.discount_pct, i.exchange_rate, i.weight_per_unit, i.material_rate,
         i.unit_price, i.purchase_price, i.purchase_currency, i.landed_factor, i.uplift_pct,
         i.is_manual, i.sort_order, auth.uid(), i.origin, i.origin_ref
  from public.costing_items i
  join copied_assemblies cas on cas.old_id = i.costing_assembly_id
  where i.costing_id = target;

  insert into public.costing_labour
    (costing_id, costing_assembly_id, company_id, process_type, hours, source_hours, source,
     hourly_rate, created_by)
  select new_costing.id, cas.new_id, cl.company_id, cl.process_type, cl.hours, cl.source_hours,
         cl.source, cl.hourly_rate, auth.uid()
  from public.costing_labour cl
  join copied_assemblies cas on cas.old_id = cl.costing_assembly_id
  where cl.costing_id = target;

  perform app.write_history(new_costing.id, 'revised',
    jsonb_build_object('from_revision', old_costing.revision_no, 'to_revision', new_costing.revision_no));

  return new_costing;
end;
$$;
