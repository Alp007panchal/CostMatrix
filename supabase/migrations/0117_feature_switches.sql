-- 0117  A switch per advanced feature, off by default (the road to production)
--
-- `advanced` is fifteen migrations ahead of `main` and none of that work can
-- reach the app the owner quotes from, because their own two-track rule
-- (docs/reference/two-track-setup.md) says an advanced feature merges into
-- `main` only when it is **behind a per-company switch that is off by default**.
-- Only the assistant has ever had one. This builds the switch and puts every
-- feature behind it.
--
-- Most of the advanced work is inert until somebody uses it — a new screen, an
-- advisory note, a nullable column — so its switch only decides whether the way
-- in is shown. **Three things genuinely change what an existing costing does**,
-- and those get a real gate here, written so that *off* reproduces the older
-- text exactly:
--
--   1. approval rules in force (0108) → off = ignore every rule, require an
--      approver, which is what 0004 did;
--   2. the nightly quotation expiry sweep (0108) → off = the sweep passes that
--      company by. It is the only thing in the app that writes by itself;
--   3. which panels count towards the total (0109) → off = every panel counts.
--
-- Nothing here changes a price. With every feature off — which is how every
-- company starts — the app behaves exactly as it did before 0100. Test 38 is
-- that assertion, and NPP-192 is unmoved.

-- ===========================================================================
-- 1. The registry: what features exist, and what each one means
-- ===========================================================================
create table if not exists public.features (
  code        text primary key,
  name        text not null,
  -- What it does, in the words the owner would use. The Features screen prints
  -- this, so it is the feature's own explanation of itself.
  blurb       text not null,
  -- Does switching this on change what an existing costing does? Three do; the
  -- rest only add a screen. The screen marks these, because they are the ones
  -- worth trying on staging before they are switched on for real work.
  changes_costings boolean not null default false,
  -- Where the per-company answer lives in company_options. Defaults to
  -- 'feature.<code>'; the assistant names its own older key so there is one
  -- switch for one thing rather than two that can disagree.
  option_key  text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid
);

select app.add_audit_triggers('public.features');

comment on table public.features is
  'One row per advanced feature: what it is, what it does, whether switching it
   on changes what an existing costing does, and which company_options key holds
   the per-company answer. Master rows; the answer itself is per company.';

alter table public.features enable row level security;

-- Everybody reads the registry — a person must be able to see what exists even
-- where it is switched off — and only the master administrator writes it.
drop policy if exists features_read on public.features;
create policy features_read on public.features for select to authenticated using (true);
drop policy if exists features_write_master on public.features;
create policy features_write_master on public.features for all to authenticated
  using (app.is_master_admin()) with check (app.is_master_admin());

grant select on public.features to authenticated;

insert into public.features (code, name, blurb, changes_costings, option_key, sort_order) values
  ('documents', 'Files on enquiries and costings',
   'Attach a drawing, a schedule or an email to an enquiry or a costing, and have the app read the text out of it so it can be searched.',
   false, 'feature.documents', 10),
  ('price_lists', 'Supplier price lists',
   'Upload a supplier''s list and see what it would change, old price against new, before accepting the rows you believe.',
   false, 'feature.price_lists', 20),
  ('bom_import', 'Import somebody else''s parts list',
   'Read a consultant''s schedule or an EPLAN export into a costing: each row matched to a part, and a kit proposed where the part is a kit''s main device.',
   false, 'feature.bom_import', 30),
  ('assistant', 'The assistant',
   'Ask questions about the company''s own data and have it draft wording. Off everywhere until the master administrator turns it on, and it never changes a figure by itself.',
   false, 'ai_enabled', 40),
  ('approval_rules', 'Approval rules in force',
   'Rules decide what happens when a costing is submitted — approve it, require an approver, reserve it for the master administrator, or refuse it. **Switching this on changes what submitting a costing does.** Off, every costing needs an approver, as it does today.',
   true, 'feature.approval_rules', 50),
  ('quotation_validity', 'Validity and the nightly sweep',
   'A quotation that has run out is marked so, a chase is raised on the ones that were sent, and a costing can be re-issued at today''s prices. **The sweep writes by itself, overnight, with nobody watching.**',
   true, 'feature.quotation_validity', 60),
  ('options_and_extras', 'Chosen option and optional extras',
   'A two-option job counts only the option you are offering, and a line marked an optional extra is printed but left out of the total. **Switching this on changes the headline figure of any job that uses it.**',
   true, 'feature.options_and_extras', 70),
  ('labour_actuals', 'Hours actually worked',
   'Record what a board really took, against the estimate, and read a variance report by kit group with a suggested new standard that only a person applies.',
   false, 'feature.labour_actuals', 80),
  ('dimensions', 'Sizes and the space check',
   'Record how big a device is and how much room a cubicle has inside, and the panel says whether what is on it will fit. Silent until somebody measures something.',
   false, 'feature.dimensions', 90),
  ('costing_grid', 'The costing grid',
   'The whole costing as one grid — panels across, kits and components down — for a board of many near-identical panels. The same edits as the panel cards, through the same functions.',
   false, 'feature.costing_grid', 100),
  ('kit_parameters', 'Kits that work out their own quantities',
   'A kit can ask for its busbar metres or its number of steps and work its line quantities out from the answers. A kit with no parameters is unchanged.',
   false, 'feature.kit_parameters', 110),
  ('apfc_configurator', 'The APFC configurator',
   'Type a target in kVAr and the app proposes how many of each step kit reach it, graded the way your own NPP-192 bank was built. You edit the quantities before anything is added.',
   false, 'feature.apfc_configurator', 120),
  ('compatibility_checks', 'Compatibility checks',
   'Three questions asked of every panel: will that device go into that cubicle, does that part belong to that device, do the outgoing ways add up. Advisory, and silent until the library holds what they read.',
   false, 'feature.compatibility_checks', 130),
  ('board_configurator', 'The guided board configurator',
   'Answer what the board is — supply, incomer rating, changeover, the feeder schedule, kVAr — and the kits come back with their quantities for you to edit before anything is added.',
   false, 'feature.board_configurator', 140),
  ('sales_analytics', 'Sales analytics',
   'Win and loss by customer, product group, value band and reason; hit rate; the margin quoted against the margin achieved. Read-only: it writes nothing anywhere.',
   false, 'feature.sales_analytics', 150)
on conflict (code) do nothing;

-- ===========================================================================
-- 2. Is it on for a company?
-- ===========================================================================
-- SECURITY DEFINER on purpose, and for two reasons that are not about secrecy:
-- the nightly sweep runs with no signed-in user at all, and the pricing view is
-- read by a master administrator looking at somebody else's costing. Both need
-- the true answer for a named company. What it discloses is one boolean about
-- one switch, which the Features screen shows anybody in that company anyway.
create or replace function app.feature_on(code text, company uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select (o.value #>> '{}')::boolean
      from public.features f
      join public.company_options o
        on o.key = f.option_key
       and o.company_id = coalesce(feature_on.company, app.current_company_id())
     where f.code = feature_on.code
  ), false)
$$;

comment on function app.feature_on(text, uuid) is
  'Whether one advanced feature is switched on for a company — the caller''s own
   unless another is named. Absent means off, which is how every company starts.';

-- What the Features screen lists: every feature, and whether it is on here.
create or replace view public.v_company_features
with (security_invoker = true)
as
select
  f.code, f.name, f.blurb, f.changes_costings, f.option_key, f.sort_order,
  app.feature_on(f.code) as is_on
from public.features f;

comment on view public.v_company_features is
  'The registry with the caller''s own answer beside each row. One query for the
   whole app: the navigation, the costing screen and the Features page.';

grant select on public.v_company_features to authenticated;

-- ===========================================================================
-- 3. Who may switch one on
-- ===========================================================================
-- The same rule the assistant has had since 0102, widened to every feature:
-- **only the master administrator**. A company cannot switch advanced behaviour
-- on for itself, which is what makes "off by default" worth anything.
-- Re-derived from the 0102 text by insertion; the ai_enabled clause is kept as
-- it was, because the assistant's row names that same key.
create or replace function app.protect_master_options()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No signed-in user means a migration, the fixture, or the company-creation
  -- trigger seeding defaults: not a person flipping a switch.
  if auth.uid() is null then return new; end if;
  if (new.key = 'ai_enabled' or new.key like 'feature.%')
     and not app.is_master_admin()
     and (tg_op = 'INSERT' or new.value is distinct from old.value) then
    raise exception 'only the master administrator switches a feature on or off for a company';
  end if;
  return new;
end;
$$;

-- Every company starts with every feature off. Written as rows rather than left
-- absent so the Features screen has something to show and an audit row exists
-- the first time one is flipped.
create or replace function app.seed_feature_options(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.company_options (company_id, key, value, value_type)
  select target_company, f.option_key, 'false'::jsonb, 'boolean'
    from public.features f
   where f.option_key <> 'ai_enabled'   -- 0102 already seeded that one
  on conflict (company_id, key) do nothing;
end;
$$;

select app.seed_feature_options(id) from public.companies;

-- A new company gets them at birth, beside the defaults 0102 already gives it.
create or replace function app.create_company_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
  values (new.id, 0, 'Always require an approver', '[]'::jsonb, 'require_approver');
  perform app.seed_company_options(new.id);
  perform app.seed_feature_options(new.id);
  return new;
end;
$$;

-- ===========================================================================
-- 4. Gate one: approval rules in force
-- ===========================================================================
-- Re-derived from the 0102 text by insertion of the first block. Off, no rule is
-- read at all and the answer is the one `submit_costing` gave before 0108 ever
-- existed: an approver is required. `submit_costing` and `approve_costing` are
-- not touched — one gate, in the one function that decides.
create or replace function app.evaluate_approval_rules(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  facts jsonb := app.costing_facts(target);
  target_company uuid;
  r record;
  cond jsonb;
  holds boolean;
begin
  select company_id into target_company from public.costings where id = target;

  -- Switched off: the rules exist but nothing reads them, and submitting a
  -- costing does what it did before the rules engine was written.
  if not app.feature_on('approval_rules', target_company) then
    return jsonb_build_object('outcome', 'require_approver', 'rule_id', null,
                              'rule_name', 'An approver is required', 'facts', facts);
  end if;

  for r in
    select id, name, condition, outcome from public.approval_rules
     where company_id = target_company and is_active
     order by sort_order, created_at
  loop
    holds := true;
    for cond in select * from jsonb_array_elements(coalesce(r.condition, '[]'::jsonb)) loop
      if not app.approval_condition_holds(facts, cond) then holds := false; exit; end if;
    end loop;
    if holds then
      return jsonb_build_object('outcome', r.outcome, 'rule_id', r.id, 'rule_name', r.name, 'facts', facts);
    end if;
  end loop;

  return jsonb_build_object('outcome', 'require_approver', 'rule_id', null,
                            'rule_name', 'No rule matched; an approver is required', 'facts', facts);
end;
$$;

-- ===========================================================================
-- 5. Gate two: the nightly sweep
-- ===========================================================================
-- Re-derived from the 0108 text by insertion of one condition in the loop's
-- where clause. A company with validity switched off is passed by entirely: no
-- quotation marked, no follow-up raised, nothing in the activity log.
create or replace function app.expire_quotations()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  q record;
  expired integer := 0;
  followups integer := 0;
  skipped integer := 0;
begin
  for q in
    select id, company_id, reference_no, status, valid_until, customer_name
    from public.quotations
    where valid_until is not null
      and valid_until < current_date
      and status in ('released', 'sent')
      and expired_at is null
    order by valid_until
  loop
    if not app.feature_on('quotation_validity', q.company_id) then
      skipped := skipped + 1;
      continue;
    end if;

    update public.quotations set expired_at = now() where id = q.id;
    expired := expired + 1;

    insert into public.activity_log
      (company_id, actor_user_id, actor_kind, entity_type, entity_id, action, after, note)
    values (q.company_id, null, 'system', 'quotation', q.id, 'quotation.expired',
            jsonb_build_object('reference_no', q.reference_no, 'valid_until', q.valid_until,
                               'status', q.status),
            format('%s ran out on %s', q.reference_no, q.valid_until));

    -- Only one that reached the customer earns a chase; a released quotation
    -- nobody sent is the engineer's own business.
    if q.status = 'sent' and not exists (
         select 1 from public.quotation_followups f
          where f.quotation_id = q.id and f.done_at is null) then
      insert into public.quotation_followups (quotation_id, company_id, due_on, note)
      values (q.id, q.company_id, current_date,
              format('%s ran out on %s. Chase %s, or re-issue it at today''s prices.',
                     q.reference_no, q.valid_until, q.customer_name));
      followups := followups + 1;
    end if;
  end loop;

  return jsonb_build_object('expired', expired, 'followups', followups,
                            'skipped', skipped, 'checked_at', now());
end;
$$;

comment on function app.expire_quotations() is
  'The nightly sweep. Skips any company with the validity feature switched off —
   the one place in the app that writes with nobody watching, so it is the one
   that most needs a switch. Reports what it skipped as well as what it did.';

-- ===========================================================================
-- 6. Gate three: which panels count towards the total
-- ===========================================================================
-- Re-derived from the 0109 text; only the last two expressions change. Off, both
-- answer true for every panel, which is the arithmetic the app did before 2.7:
-- every panel counts, an optional extra is just a panel, a two-option job adds
-- both options together. NPP-192 is priced through this view, and test 15 is
-- what proves the figure has not moved.
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
  pc.is_option,
  -- Is this panel part of the offer the costing's total means? A panel with no
  -- option label is common to every option and always is; once an option is
  -- chosen, the other options' panels are not. With the feature off, there is no
  -- such thing as a chosen option and every panel is part of the offer.
  (not app.feature_on('options_and_extras', pc.company_id)
   or ch.chosen_option_label is null
   or coalesce(btrim(pc.option_label), '') in ('', ch.chosen_option_label)) as in_chosen_offer,
  -- …and does it add to that total? An optional extra never does — unless the
  -- feature is off, when an optional extra is simply a panel, as it was.
  (not app.feature_on('options_and_extras', pc.company_id)
   or (not pc.is_option
       and (ch.chosen_option_label is null
            or coalesce(btrim(pc.option_label), '') in ('', ch.chosen_option_label)))) as counts_in_total
from public.v_costing_panel_costs pc
join public.costings c on c.id = pc.costing_id
join public.v_costing_option_choice ch on ch.costing_id = pc.costing_id;

comment on view public.v_costing_panel_prices is
  'One row per panel, priced. This is what the quotation price schedule prints.
   counts_in_total is the one place that decides whether a panel adds to the
   costing''s total: optional extras and the options not chosen do not — and with
   the options feature switched off, every panel does, exactly as before 2.7.';

-- ===========================================================================
-- 7. Wrappers and grants (the 0005 pattern)
-- ===========================================================================
create or replace function public.feature_on(code text, company uuid default null)
returns boolean language sql stable security invoker
as $$ select app.feature_on(code, company) $$;

grant execute on function
  app.feature_on(text, uuid), public.feature_on(text, uuid),
  app.seed_feature_options(uuid)
to authenticated;
