-- 0109  Options and alternatives on one quotation (roadmap 2.7, advanced track)
--
-- Two different things the costing team writes into one quotation today, and
-- neither of them adds up properly:
--
-- 1. **Alternatives.** A job offered two ways. `costing_panels.option_label` has
--    grouped them since 0004 and the quotation already prints a price schedule
--    per option — but the costing's own total adds every option together, so the
--    headline figure on a two-option job is the sum of two offers the customer
--    will only ever buy one of. A costing now names which option is the offer:
--    `costings.chosen_option_label`.
--
-- 2. **Optional extras.** A line the customer may take or leave: printed and
--    priced, left out of the total. `costing_panels.is_option` has existed since
--    0101 (foundation F4) and nothing read it. Now the totals leave those panels
--    out, and the quotation prints them under the schedule they belong to.
--
-- **Nothing changes for any costing that exists today.** `is_option` is false
-- everywhere and `chosen_option_label` starts null, and the rule is written so
-- that a null choice means "count everything", exactly as before. The whole
-- existing suite, NPP-192 included, passes unaltered — that is the proof.
--
-- One decision about where the rule lives: *which panels count towards the
-- total* is worked out once, in `v_costing_panel_prices.counts_in_total`, and
-- every view above it sums on that flag. Repeating the condition in three views
-- is how the totals drift apart.

-- ===========================================================================
-- 1. Which option is the offer?
-- ===========================================================================
alter table public.costings
  add column if not exists chosen_option_label text
    check (chosen_option_label is null or length(btrim(chosen_option_label)) > 0);

comment on column public.costings.chosen_option_label is
  'Which of the job''s options the costing''s own total means, matching
   costing_panels.option_label. Null: no choice made, and the total adds every
   panel together as it always has. Panels with no option label (the common
   scope) always count.';

-- The choice as the views should read it: trimmed, and ignored when it matches
-- no panel — a label left behind by a renamed option must not silently drop
-- that option's panels out of the total. Also counts the options on offer, so a
-- screen can say "this job is offered three ways".
create or replace view public.v_costing_option_choice
with (security_invoker = true)
as
select
  c.id                                        as costing_id,
  c.company_id,
  case
    when exists (
      select 1 from public.costing_panels p
       where p.costing_id = c.id
         and coalesce(btrim(p.option_label), '') = btrim(c.chosen_option_label))
    then btrim(c.chosen_option_label)
  end                                         as chosen_option_label,
  btrim(c.chosen_option_label)                as asked_for,
  (select count(distinct coalesce(btrim(p.option_label), ''))
     from public.costing_panels p
    where p.costing_id = c.id
      and coalesce(btrim(p.option_label), '') <> '')::integer as option_count
from public.costings c;

comment on view public.v_costing_option_choice is
  'One row per costing: the option its total means (null when none is chosen, or
   when the label chosen matches no panel), the label as typed, and how many
   options the job is offered as.';

-- ===========================================================================
-- 2. The panel views carry the two flags
-- ===========================================================================
-- Re-derived to append `is_option`. Everything before it is the 0100 text,
-- unchanged: `create or replace view` can only add columns at the end, and every
-- view above this one selects by name.
create or replace view public.v_costing_panel_costs
with (security_invoker = true)
as
select
  p.id                 as panel_id,
  p.costing_id,
  p.company_id,
  p.name,
  p.tag,
  p.option_label,
  p.uom,
  p.quantity,
  p.sort_order,
  coalesce(sum(t.material_total), 0) as material_cost,
  coalesce(sum(t.labour_total), 0) * p.productivity_factor as labour_cost,
  coalesce(sum(t.hours_total), 0)  * p.productivity_factor as hours,
  p.productivity_factor,
  coalesce(sum(t.labour_total), 0) as labour_cost_standard,
  coalesce(sum(t.hours_total), 0)  as hours_standard,
  -- Appended (2.7): an optional extra is priced like any other panel.
  p.is_option
from public.costing_panels p
left join public.v_costing_assembly_totals t on t.panel_id = p.id
group by p.id, p.costing_id, p.company_id, p.name, p.tag, p.option_label,
         p.uom, p.quantity, p.sort_order, p.productivity_factor, p.is_option;

comment on view public.v_costing_panel_costs is
  'What one of this panel costs to build, before any margin. labour_cost and
   hours carry the panel''s productivity factor; *_standard are the figures the
   labour standards gave, so the difference can be explained.';

-- Re-derived to append the three columns that say how a panel is offered. The
-- pricing arithmetic above them is the 0004 text, untouched.
create or replace view public.v_costing_panel_prices
with (security_invoker = true)
as
select
  pc.panel_id,
  pc.costing_id,
  pc.company_id,
  pc.name,
  pc.tag,
  pc.option_label,
  pc.uom,
  pc.quantity,
  pc.sort_order,
  pc.material_cost,
  pc.labour_cost,
  pc.hours,
  round(pc.material_cost / (1 - c.material_margin_pct / 100), 2) as material_sell,
  round(pc.labour_cost   / (1 - c.labour_margin_pct   / 100), 2) as labour_sell,
  ceil(
    ( pc.material_cost / (1 - c.material_margin_pct / 100)
    + pc.labour_cost   / (1 - c.labour_margin_pct   / 100)
    ) / (1 - c.negotiation_margin_pct / 100)
    / c.price_rounding_step
  ) * c.price_rounding_step                                      as unit_price,
  ceil(
    ( pc.material_cost / (1 - c.material_margin_pct / 100)
    + pc.labour_cost   / (1 - c.labour_margin_pct   / 100)
    ) / (1 - c.negotiation_margin_pct / 100)
    / c.price_rounding_step
  ) * c.price_rounding_step * pc.quantity                        as line_total,
  -- Appended (2.7), and the only place the two rules are written down:
  pc.is_option,
  -- Is this panel part of the offer the costing's total means? A panel with no
  -- option label is common to every option and always is; once an option is
  -- chosen, the other options' panels are not.
  (ch.chosen_option_label is null
   or coalesce(btrim(pc.option_label), '') in ('', ch.chosen_option_label)) as in_chosen_offer,
  -- …and does it add to that total? An optional extra never does.
  (not pc.is_option
   and (ch.chosen_option_label is null
        or coalesce(btrim(pc.option_label), '') in ('', ch.chosen_option_label))) as counts_in_total
from public.v_costing_panel_costs pc
join public.costings c on c.id = pc.costing_id
join public.v_costing_option_choice ch on ch.costing_id = pc.costing_id;

comment on view public.v_costing_panel_prices is
  'One row per panel, priced. This is what the quotation price schedule prints.
   counts_in_total is the one place that decides whether a panel adds to the
   costing''s total: optional extras and the options not chosen do not.';

-- ===========================================================================
-- 3. The totals sum the offer, and report the extras beside it
-- ===========================================================================
-- The first ten columns keep their names and meaning; what changes is that they
-- now count the offer rather than every row. With no optional extras and no
-- option chosen — every costing that exists today — the figures are identical.
create or replace view public.v_costing_totals
with (security_invoker = true)
as
select
  c.id                                  as costing_id,
  c.company_id,
  c.currency_code,
  c.currency_label,
  coalesce(sum(pp.material_cost * pp.quantity) filter (where pp.counts_in_total), 0) as material_cost,
  coalesce(sum(pp.labour_cost   * pp.quantity) filter (where pp.counts_in_total), 0) as labour_cost,
  coalesce(sum(pp.hours         * pp.quantity) filter (where pp.counts_in_total), 0) as hours,
  coalesce(sum(pp.line_total) filter (where pp.counts_in_total), 0)                  as subtotal,
  round(coalesce(sum(pp.line_total) filter (where pp.counts_in_total), 0)
        * c.tax_pct / 100, 2)                                                       as tax,
  coalesce(sum(pp.line_total) filter (where pp.counts_in_total), 0)
    + round(coalesce(sum(pp.line_total) filter (where pp.counts_in_total), 0)
            * c.tax_pct / 100, 2)                                                   as grand_total,
  -- Appended (2.7): the optional extras of the offer being totalled, priced but
  -- deliberately not added in, and what the choice was.
  coalesce(sum(pp.line_total) filter (where pp.is_option and pp.in_chosen_offer), 0) as optional_subtotal,
  round(coalesce(sum(pp.line_total) filter (where pp.is_option and pp.in_chosen_offer), 0)
        * c.tax_pct / 100, 2)                                                       as optional_tax,
  coalesce(sum(pp.line_total) filter (where pp.is_option and pp.in_chosen_offer), 0)
    + round(coalesce(sum(pp.line_total) filter (where pp.is_option and pp.in_chosen_offer), 0)
            * c.tax_pct / 100, 2)                                                   as optional_total,
  ch.chosen_option_label,
  ch.option_count
from public.costings c
left join public.v_costing_panel_prices pp on pp.costing_id = c.id
left join public.v_costing_option_choice ch on ch.costing_id = c.id
group by c.id, c.company_id, c.currency_code, c.currency_label, c.tax_pct,
         ch.chosen_option_label, ch.option_count;

comment on view public.v_costing_totals is
  'The costing''s own figures: the offer it means, excluding optional extras and
   the options not chosen. optional_* is what the extras of that offer would add
   if the customer took them all.';

-- Every option's figures, whichever one is chosen: this is the comparison table.
create or replace view public.v_costing_option_totals
with (security_invoker = true)
as
select
  pp.costing_id,
  pp.company_id,
  coalesce(btrim(pp.option_label), '')                                     as option_label,
  coalesce(sum(pp.line_total) filter (where not pp.is_option), 0)          as subtotal,
  round(coalesce(sum(pp.line_total) filter (where not pp.is_option), 0)
        * c.tax_pct / 100, 2)                                              as tax,
  coalesce(sum(pp.line_total) filter (where not pp.is_option), 0)
    + round(coalesce(sum(pp.line_total) filter (where not pp.is_option), 0)
            * c.tax_pct / 100, 2)                                          as grand_total,
  -- Appended (2.7): the extras offered with this option, and whether this is the
  -- option the costing's total means.
  coalesce(sum(pp.line_total) filter (where pp.is_option), 0)              as optional_subtotal,
  round(coalesce(sum(pp.line_total) filter (where pp.is_option), 0)
        * c.tax_pct / 100, 2)                                              as optional_tax,
  coalesce(sum(pp.line_total) filter (where pp.is_option), 0)
    + round(coalesce(sum(pp.line_total) filter (where pp.is_option), 0)
            * c.tax_pct / 100, 2)                                          as optional_total,
  (ch.chosen_option_label is not null
   and coalesce(btrim(pp.option_label), '') = ch.chosen_option_label)      as is_chosen
from public.v_costing_panel_prices pp
join public.costings c on c.id = pp.costing_id
join public.v_costing_option_choice ch on ch.costing_id = pp.costing_id
group by pp.costing_id, pp.company_id, coalesce(btrim(pp.option_label), ''), c.tax_pct,
         ch.chosen_option_label;

comment on view public.v_costing_option_totals is
  'A subtotal, VAT and total for each option the customer is offered, excluding
   that option''s optional extras, which are reported beside it.';

-- The BOM keeps every row — a bill of materials that quietly drops lines is
-- worse than one that marks them — and says which are extras and which belong to
-- the option being built.
create or replace view public.v_costing_items_by_category
with (security_invoker = true)
as
select
  i.costing_id,
  i.company_id,
  i.category_code,
  cat.name                            as category_name,
  i.code,
  i.name,
  i.manufacturer,
  i.part_number,
  i.unit,
  i.unit_price,
  p.option_label,
  sum(i.quantity * ca.quantity * p.quantity) as quantity,
  sum(i.quantity * ca.quantity * p.quantity * i.unit_price) as line_total,
  -- Appended (2.7).
  p.is_option,
  (ch.chosen_option_label is null
   or coalesce(btrim(p.option_label), '') in ('', ch.chosen_option_label)) as in_chosen_offer
from public.costing_items i
join public.costing_assemblies ca on ca.id = i.costing_assembly_id
join public.costing_panels p on p.id = ca.panel_id
join public.component_categories cat on cat.code = i.category_code
join public.v_costing_option_choice ch on ch.costing_id = i.costing_id
group by i.costing_id, i.company_id, i.category_code, cat.name, i.code, i.name,
         i.manufacturer, i.part_number, i.unit, i.unit_price, p.option_label,
         p.is_option,
         (ch.chosen_option_label is null
          or coalesce(btrim(p.option_label), '') in ('', ch.chosen_option_label));

comment on view public.v_costing_items_by_category is
  'One row per distinct component in a costing, quantities multiplied through
   assembly and panel quantities. The four BOM exports filter this by category;
   is_option and in_chosen_offer say which rows are only bought if the customer
   takes that extra or that option.';

-- ===========================================================================
-- 4. A revision and a copy keep the choice
-- ===========================================================================
-- `create_costing_revision` lists the frozen columns by hand — the trap 0011
-- fixed once already — so a new one has to be added here or a revision silently
-- forgets which option the job was offered as. The rest is the 0102 text.
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
    tax_pct, enclosure_uplift_pct, created_by, price_snapshot_at, chosen_option_label)
  select company_id, enquiry_id, costing_no, revision_no + 1, family_id, id, true,
         title, notes, 'draft', currency_code, currency_label, exchange_rate, discount_pct,
         material_margin_pct, labour_margin_pct, negotiation_margin_pct, price_rounding_step,
         tax_pct, enclosure_uplift_pct, auth.uid(), price_snapshot_at, chosen_option_label
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

comment on function app.create_costing_revision(uuid) is
  'The next revision of an approved costing: same number, revision + 1, a copy of
   every panel, kit, line, labour row and frozen setting, including which option
   the job is offered as. The approved one stops being current.';

-- A copy is a new job that starts from `create_costing`, so the choice has to be
-- carried across afterwards. The rest is the 0015 text.
create or replace function app.copy_costing(
  source uuid, new_title text default null, enquiry uuid default null)
returns jsonb
language plpgsql
as $$
declare
  src public.costings;
  fresh public.costings;
  pan record;
  report jsonb;
  repriced integer := 0;
  kept jsonb := '[]'::jsonb;
begin
  select * into src from public.costings
   where id = source and company_id = app.current_company_id();
  if src.id is null then raise exception 'no such costing'; end if;

  -- create_costing freezes today's company settings, issues the next number and
  -- writes the "created" line of the history. A copy is a new job, so it starts
  -- there rather than inheriting anything of the source's.
  fresh := app.create_costing(
    coalesce(nullif(btrim(coalesce(new_title, '')), ''), src.title || ' (copy)'),
    src.notes, enquiry);

  for pan in select id from public.costing_panels where costing_id = source order by sort_order
  loop
    report := app.copy_panel(pan.id, fresh.id, null);
    repriced := repriced + (report->>'repriced')::integer;
    kept := kept || (report->'kept');
  end loop;

  -- A copy is the same job offered the same ways, so it is offered as the same
  -- one of them; its prices and number are its own.
  if src.chosen_option_label is not null then
    update public.costings set chosen_option_label = src.chosen_option_label where id = fresh.id;
  end if;

  perform app.write_history(fresh.id, 'copied', jsonb_build_object(
    'from_costing_id', src.id, 'from_costing_no', src.costing_no,
    'from_revision_no', src.revision_no,
    'lines_repriced', repriced, 'lines_kept_at_the_old_price', jsonb_array_length(kept)));

  return jsonb_build_object(
    'costing_id', fresh.id, 'costing_no', fresh.costing_no, 'title', fresh.title,
    'from_costing_no', src.costing_no, 'repriced', repriced, 'kept', kept);
end;
$$;

comment on function app.copy_costing(uuid, text, uuid) is
  'Copies a costing as a new job: its own number and family, revision 0, today''s
   company settings and today''s prices, offered as the same option; the source is
   untouched. Returns {costing_id, costing_no, title, from_costing_no, repriced, kept}.';

-- ===========================================================================
-- 5. Grants
-- ===========================================================================
grant select on public.v_costing_option_choice to authenticated;
