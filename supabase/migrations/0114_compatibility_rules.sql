-- 0114  Compatibility checks (roadmap 3.4, advanced track)
--
-- Three questions an experienced engineer asks while reading a panel, and which
-- nothing in the app has asked so far:
--
--   * will that device physically go into that cubicle?
--   * does that accessory belong to that device?
--   * do the outgoing ways make sense against the incomer?
--
-- They are written as **rows, not as SQL**: one `compatibility_rules` row per
-- check, with its parameters, its severity and the sentence to show. A person
-- can read a rule, the owner can switch one off or add their own, and the
-- assistant can quote it. The three that ship are master rows, as warnings.
--
-- Advisory, and only that. Nothing here moves a price, an hour or a total; a
-- panel nobody has measured stays silent, exactly as `app.panel_fit` does. The
-- only thing a warning can ever do on its own is answer an approval rule, and
-- only because 0108's engine is given two new facts to test.

-- ===========================================================================
-- 1. The rules themselves
-- ===========================================================================
create table if not exists public.compatibility_rules (
  id          uuid primary key default gen_random_uuid(),
  -- Null = a master rule, visible to every company. The library pattern.
  company_id  uuid references public.companies(id) on delete cascade,
  rule_kind   text not null
    constraint compatibility_rules_kind_known
    check (rule_kind in ('device_depth_vs_cubicle', 'accessory_fits_device', 'feeders_vs_incomer')),
  name        text not null,
  -- What the rule measures against, by kind. Validated on write, so a rule that
  -- could never fire is refused at the point somebody writes it.
  params      jsonb not null default '{}'::jsonb,
  severity    text not null default 'warning'
    constraint compatibility_rules_severity_known check (severity in ('warning', 'blocker')),
  -- The sentence the engineer reads, with {placeholders} the check fills in.
  message     text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

create unique index if not exists compatibility_rules_unique
  on public.compatibility_rules (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_kind, name);
create index if not exists compatibility_rules_company_idx
  on public.compatibility_rules (company_id, sort_order);

select app.add_audit_triggers('public.compatibility_rules');

comment on table public.compatibility_rules is
  'One row per compatibility check: its kind, its parameters, how loud it is and
   the sentence it shows. Master rows (company_id null) apply to everybody; a
   company may switch one off for itself by adding its own row of the same kind,
   or add a rule of its own. Advisory: no rule changes a price or a total.';
comment on column public.compatibility_rules.params is
  'By kind. device_depth_vs_cubicle: {"clearance_mm": 100} — the room to leave
   behind the device. accessory_fits_device: {"attribute": "fits_frames",
   "device_field": "frame_size"} — the list an accessory carries in its
   attributes, and the field of the main device it must name.
   feeders_vs_incomer: {"max_ratio": 4, "incomer_sections": [...],
   "feeder_sections": [...], "incomer_tags": [...], "feeder_tags": [...]}.';
comment on column public.compatibility_rules.severity is
  'warning = say so; blocker = say so, and let an approval rule (0108) require an
   approver or refuse the submission. Nothing else treats a blocker differently.';

-- The fields of a component a rule may match an accessory against. An allowlist,
-- not dynamic SQL: a rule is data somebody types, and data never names a column.
create or replace function app.component_field(target public.components, field text)
returns text
language sql
immutable
as $$
  select case field
    when 'frame_size'   then target.frame_size
    when 'code'         then target.code
    when 'manufacturer' then target.manufacturer
    when 'rating'       then target.rating
    when 'poles'        then target.poles
  end
$$;

comment on function app.component_field(public.components, text) is
  'The five fields an accessory_fits_device rule may name. Anything else is
   refused when the rule is written, so a rule can never reach a column by name.';

-- A rule whose parameters make no sense would fail silently for ever, which is
-- the worst way for a check to fail. Refuse it where it is written instead.
create or replace function app.check_compatibility_rule()
returns trigger
language plpgsql
as $$
declare
  field text;
begin
  if new.rule_kind = 'accessory_fits_device' then
    if coalesce(new.params ->> 'attribute', '') = '' then
      raise exception 'this rule must say which attribute the accessory carries, for example {"attribute": "fits_frames"}';
    end if;
    field := coalesce(new.params ->> 'device_field', 'frame_size');
    if field not in ('frame_size', 'code', 'manufacturer', 'rating', 'poles') then
      raise exception 'a rule may match on frame_size, code, manufacturer, rating or poles, not on %', field;
    end if;
  elsif new.rule_kind = 'feeders_vs_incomer' then
    if coalesce((new.params ->> 'max_ratio')::numeric, 0) <= 0 then
      raise exception 'this rule must say how many times the incomer the outgoing ways may come to, for example {"max_ratio": 4}';
    end if;
  elsif new.rule_kind = 'device_depth_vs_cubicle' then
    if coalesce((new.params ->> 'clearance_mm')::numeric, 0) < 0 then
      raise exception 'the room behind a device cannot be a negative number of millimetres';
    end if;
  end if;
  if position('{' in new.message) = 0 then
    -- Not fatal, but a message with no placeholder says the same thing on every
    -- panel, and an engineer cannot act on it. Refused, so it is noticed.
    raise exception 'the message should name what it found, with a placeholder such as {kit} or {device}';
  end if;
  return new;
end;
$$;

drop trigger if exists compatibility_rules_check on public.compatibility_rules;
create trigger compatibility_rules_check
  before insert or update on public.compatibility_rules
  for each row execute function app.check_compatibility_rule();

alter table public.compatibility_rules enable row level security;

create policy compatibility_rules_read on public.compatibility_rules
  for select to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
create policy compatibility_rules_write_master on public.compatibility_rules
  for all to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
create policy compatibility_rules_write_own on public.compatibility_rules
  for all to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));

grant select, insert, update, delete on public.compatibility_rules to authenticated;

-- The three the roadmap asks for, as master rows, as warnings.
insert into public.compatibility_rules (company_id, rule_kind, name, params, severity, message, sort_order)
values
  (null, 'device_depth_vs_cubicle', 'Device deeper than the cubicle',
   '{"clearance_mm": 100}'::jsonb, 'warning',
   '{kit}: {device} is {device_depth} mm deep and {cubicle} gives {usable_depth} mm of usable depth — {needed} mm is wanted with the room behind it.',
   1),
  (null, 'accessory_fits_device', 'Accessory not listed for this device',
   '{"attribute": "fits_frames", "device_field": "frame_size"}'::jsonb, 'warning',
   '{kit}: {accessory} is listed for {fits} and this kit''s device {device} is {actual}.',
   2),
  (null, 'feeders_vs_incomer', 'Outgoing ways far above the incomer',
   '{"max_ratio": 4, "incomer_sections": ["Incomer", "2nd incomer", "ATS"], "feeder_sections": ["Outgoers"], "incomer_tags": ["incomer"], "feeder_tags": ["outgoer"]}'::jsonb,
   'warning',
   'The outgoing ways come to {feeder_a} A against a {incomer_a} A incomer, more than {max_ratio} times it — check the diversity assumed.',
   3)
on conflict do nothing;

-- ===========================================================================
-- 2. Filling a rule's sentence in
-- ===========================================================================
create or replace function app.fill_message(template text, vars jsonb)
returns text
language plpgsql
immutable
as $$
declare
  out_text text := template;
  k text;
begin
  for k in select jsonb_object_keys(vars) loop
    out_text := replace(out_text, '{' || k || '}', coalesce(vars ->> k, 'not known'));
  end loop;
  return out_text;
end;
$$;

comment on function app.fill_message(text, jsonb) is
  'Puts a check''s findings into the rule''s own sentence: every {key} becomes the
   value of that key. The wording stays in the rule row, where a person edits it.';

-- Millimetres read as a person writes them: 300, not 300.0.
create or replace function app.tidy_number(x numeric)
returns text
language sql
immutable
as $$
  select case
    when x is null then null
    when position('.' in x::text) > 0 then rtrim(rtrim(x::text, '0'), '.')
    else x::text
  end
$$;

-- ===========================================================================
-- 3. What one panel fails, rule by rule
-- ===========================================================================
-- Read-only and silent about what nobody has measured. Security invoker, so a
-- panel a person may not read produces nothing rather than an answer.
create or replace function app.panel_warnings(target uuid)
returns table (
  rule_id uuid, rule_kind text, rule_name text, severity text,
  subject text, message text, detail jsonb)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  p public.costing_panels;
  r record;
  line record;
  acc record;
  vars jsonb;
  usable_depth numeric;
  cubicle_code text;
  clearance numeric;
  needed numeric;
  attribute text;
  field text;
  actual text;
  device_values text[];
  incomer_a numeric;
  feeder_a numeric;
  ratio numeric;
begin
  select * into p from public.costing_panels where id = target;
  if p.id is null then return; end if;

  for r in
    select * from public.compatibility_rules
     where is_active and (company_id is null or company_id = p.company_id)
     order by sort_order, name
  loop
    -- --- Will it go in? -----------------------------------------------------
    if r.rule_kind = 'device_depth_vs_cubicle' then
      clearance := coalesce((r.params ->> 'clearance_mm')::numeric, 0);
      -- The shallowest cubicle on the panel is the one that has to take it.
      select c.code, (c.enclosure_layout ->> 'usable_d_mm')::numeric
        into cubicle_code, usable_depth
        from public.costing_items i
        join public.costing_assemblies ca on ca.id = i.costing_assembly_id
        join public.components c on c.id = i.source_component_id
       where ca.panel_id = target and c.is_enclosure_cubicle
         and (c.enclosure_layout ->> 'usable_d_mm') is not null
       order by (c.enclosure_layout ->> 'usable_d_mm')::numeric
       limit 1;
      if usable_depth is null then continue; end if;

      for line in
        select ca.name as kit_name, md.code as device_code, md.depth_mm
          from public.costing_assemblies ca
          join public.assembly_components x
            on x.assembly_id = ca.source_assembly_id and x.is_main_device
          join public.components md on md.id = x.component_id
         where ca.panel_id = target and ca.kind = 'kit'
           and ca.source_assembly_id is not null and md.depth_mm is not null
         order by ca.sort_order, ca.name
      loop
        needed := line.depth_mm + clearance;
        if needed <= usable_depth then continue; end if;
        vars := jsonb_build_object(
          'kit', line.kit_name, 'device', line.device_code,
          'device_depth', app.tidy_number(line.depth_mm), 'cubicle', cubicle_code,
          'usable_depth', app.tidy_number(usable_depth), 'needed', app.tidy_number(needed));
        rule_id := r.id; rule_kind := r.rule_kind; rule_name := r.name; severity := r.severity;
        subject := line.kit_name;
        message := app.fill_message(r.message, vars);
        detail := vars;
        return next;
      end loop;

    -- --- Does that accessory belong to that device? -------------------------
    elsif r.rule_kind = 'accessory_fits_device' then
      attribute := r.params ->> 'attribute';
      field := coalesce(r.params ->> 'device_field', 'frame_size');

      -- Inside a kit: every line but the main device is checked against it.
      for line in
        select ca.name as kit_name, ca.source_assembly_id, md as device
          from public.costing_assemblies ca
          join public.assembly_components x
            on x.assembly_id = ca.source_assembly_id and x.is_main_device
          join public.components md on md.id = x.component_id
         where ca.panel_id = target and ca.kind = 'kit' and ca.source_assembly_id is not null
         order by ca.sort_order, ca.name
      loop
        actual := app.component_field(line.device, field);
        if actual is null then continue; end if;   -- nothing recorded to check against
        for acc in
          select c.code, c.attributes -> attribute as fits
            from public.assembly_components x
            join public.components c on c.id = x.component_id
           where x.assembly_id = line.source_assembly_id and not x.is_main_device
             and jsonb_typeof(c.attributes -> attribute) = 'array'
             and jsonb_array_length(c.attributes -> attribute) > 0
           order by c.code
        loop
          if acc.fits ? actual then continue; end if;
          vars := jsonb_build_object(
            'kit', line.kit_name, 'accessory', acc.code,
            'device', (line.device).code, 'actual', actual,
            'fits', array_to_string(array(select jsonb_array_elements_text(acc.fits)), ', '),
            'field', field);
          rule_id := r.id; rule_kind := r.rule_kind; rule_name := r.name; severity := r.severity;
          subject := line.kit_name;
          message := app.fill_message(r.message, vars);
          detail := vars;
          return next;
        end loop;
      end loop;

      -- Loose on the panel: checked against every main device the panel holds,
      -- because an accessory added by hand belongs to one of them or to none.
      select array_agg(distinct v) into device_values from (
        select app.component_field(md, field) as v
          from public.costing_assemblies ca
          join public.assembly_components x
            on x.assembly_id = ca.source_assembly_id and x.is_main_device
          join public.components md on md.id = x.component_id
         where ca.panel_id = target and ca.kind = 'kit') d
       where v is not null;
      if device_values is null or array_length(device_values, 1) is null then continue; end if;

      for acc in
        select c.code, c.attributes -> attribute as fits
          from public.costing_items i
          join public.costing_assemblies ca on ca.id = i.costing_assembly_id
          join public.components c on c.id = i.source_component_id
         where ca.panel_id = target and ca.kind = 'free'
           and jsonb_typeof(c.attributes -> attribute) = 'array'
           and jsonb_array_length(c.attributes -> attribute) > 0
         order by c.code
      loop
        if exists (select 1 from unnest(device_values) v where acc.fits ? v) then continue; end if;
        vars := jsonb_build_object(
          'kit', p.name, 'accessory', acc.code,
          'device', array_to_string(device_values, ', '), 'actual', array_to_string(device_values, ', '),
          'fits', array_to_string(array(select jsonb_array_elements_text(acc.fits)), ', '),
          'field', field);
        rule_id := r.id; rule_kind := r.rule_kind; rule_name := r.name; severity := r.severity;
        subject := p.name;
        message := app.fill_message(r.message, vars);
        detail := vars;
        return next;
      end loop;

    -- --- Do the outgoing ways make sense against the incomer? ---------------
    elsif r.rule_kind = 'feeders_vs_incomer' then
      ratio := (r.params ->> 'max_ratio')::numeric;

      select max(a.rating) into incomer_a
        from public.costing_assemblies ca
        join public.assemblies a on a.id = ca.source_assembly_id
       where ca.panel_id = target and ca.kind = 'kit' and a.rating_unit = 'A' and a.rating is not null
         and (coalesce(ca.section, '') in (select jsonb_array_elements_text(coalesce(r.params -> 'incomer_sections', '[]'::jsonb)))
              or a.tags && array(select jsonb_array_elements_text(coalesce(r.params -> 'incomer_tags', '[]'::jsonb))));

      select sum(a.rating * ca.quantity) into feeder_a
        from public.costing_assemblies ca
        join public.assemblies a on a.id = ca.source_assembly_id
       where ca.panel_id = target and ca.kind = 'kit' and a.rating_unit = 'A' and a.rating is not null
         and (coalesce(ca.section, '') in (select jsonb_array_elements_text(coalesce(r.params -> 'feeder_sections', '[]'::jsonb)))
              or a.tags && array(select jsonb_array_elements_text(coalesce(r.params -> 'feeder_tags', '[]'::jsonb))));

      if incomer_a is null or feeder_a is null then continue; end if;
      if feeder_a <= incomer_a * ratio then continue; end if;
      vars := jsonb_build_object(
        'panel', p.name,
        'feeder_a', app.tidy_number(feeder_a), 'incomer_a', app.tidy_number(incomer_a),
        'max_ratio', app.tidy_number(ratio),
        'ratio', app.tidy_number(round(feeder_a / incomer_a, 2)));
      rule_id := r.id; rule_kind := r.rule_kind; rule_name := r.name; severity := r.severity;
      subject := p.name;
      message := app.fill_message(r.message, vars);
      detail := vars;
      return next;
    end if;
  end loop;
end;
$$;

comment on function app.panel_warnings(uuid) is
  'Every active compatibility rule the panel''s company can see, run against one
   panel. Read-only and advisory: it moves no figure, and says nothing about a
   device, cubicle or accessory nobody has described yet.';

create or replace view public.v_panel_warnings
with (security_invoker = true)
as
select
  p.company_id, p.costing_id, p.id as panel_id, p.name as panel_name,
  w.rule_id, w.rule_kind, w.rule_name, w.severity, w.subject, w.message, w.detail
from public.costing_panels p
cross join lateral app.panel_warnings(p.id) w;

comment on view public.v_panel_warnings is
  'What each panel fails, one row per finding. Advisory: nothing reads it to
   change a price, and an approval rule is the only thing that can act on one.';

-- ===========================================================================
-- 4. The one thing a warning may do on its own: answer an approval rule
-- ===========================================================================
-- Derived from the 0102 text by insertion: two facts added, nothing else moved.
-- A company that wants a blocker to stop a submission writes an ordinary
-- approval rule — "Compatibility blockers is over 0 → it cannot be submitted" —
-- and needs no new machinery for it. Until somebody writes such a rule, a
-- blocker is a sentence on a screen and nothing more.
create or replace function app.costing_facts(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.costings;
  total numeric;
  placeholder_count integer;
  blockers integer;
  warnings integer;
begin
  select * into c from public.costings
   where id = target and (company_id = app.current_company_id() or app.is_master_admin());
  if c.id is null then raise exception 'no such costing'; end if;

  select coalesce(subtotal, 0) into total from public.v_costing_totals where costing_id = target;

  select count(*) into placeholder_count
    from public.costing_items i
    join public.components comp on comp.id = i.source_component_id
   where i.costing_id = target and comp.is_placeholder;

  select count(*) filter (where severity = 'blocker'), count(*) filter (where severity = 'warning')
    into blockers, warnings
    from public.v_panel_warnings where costing_id = target;

  return jsonb_build_object(
    'total_ex_vat',         coalesce(total, 0),
    'material_margin_pct',  c.material_margin_pct,
    'labour_margin_pct',    c.labour_margin_pct,
    'negotiation_margin_pct', c.negotiation_margin_pct,
    -- The lower of the two is the margin an approver would worry about.
    'profit_margin_pct',    least(c.material_margin_pct, c.labour_margin_pct),
    'uses_placeholder_part', placeholder_count > 0,
    'placeholder_parts',    placeholder_count,
    'compatibility_blockers', coalesce(blockers, 0),
    'compatibility_warnings', coalesce(warnings, 0),
    'price_age_days',       case when c.price_snapshot_at is null then null
                                 else extract(day from now() - c.price_snapshot_at)::integer end,
    'status',               c.status::text,
    'revision_no',          c.revision_no);
end;
$$;

-- ===========================================================================
-- 5. Wrappers and grants (the 0005 pattern)
-- ===========================================================================
create or replace function public.panel_warnings(target uuid)
returns table (
  rule_id uuid, rule_kind text, rule_name text, severity text,
  subject text, message text, detail jsonb)
language sql
stable
security invoker
as $$ select * from app.panel_warnings(target) $$;

grant select on public.v_panel_warnings to authenticated;

grant execute on function
  app.panel_warnings(uuid), public.panel_warnings(uuid),
  app.component_field(public.components, text),
  app.fill_message(text, jsonb), app.tidy_number(numeric)
to authenticated;
