-- A switch per advanced feature, off by default (migration 0117). Runs after 14
-- and 15, so the parts and the company settings are the owner's own.
--
-- The assertion the whole migration exists for is the first and the last block:
-- **with every feature off, the app behaves exactly as it did before 0100.**
-- Three things in the middle are the only ones that could have changed what an
-- existing costing does, and each is tested off, then on, then off again.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === Every company starts with everything off ===============================
-- The number moves with every feature built: 0118 added the busbar run calculator.
select test.eq((select count(*)::int from public.features), 17,
  'every advanced feature is on the register');
select test.eq((select count(*)::int from public.features where changes_costings), 3,
  'three of them change what an existing costing does, and say so');
select test.eq((select count(*)::int from public.company_options o
                 join public.features f on f.option_key = o.key
                where o.company_id = :'alpha'::uuid and o.value = 'true'::jsonb), 0,
  'and not one of them is switched on for anybody');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select count(*)::int as listed, count(*) filter (where is_on)::int as on_now
  from public.v_company_features \gset
commit;
select test.eq(:listed, 17, 'a costing engineer can see what exists');
select test.eq(:on_now, 0, 'and that none of it is on for her company');

-- The assistant names the switch it has had since 0102 rather than adding a
-- second one for the same thing: one switch, one answer.
select test.eq((select option_key from public.features where code = 'assistant'), 'ai_enabled',
  'the assistant keeps the switch it already had');

-- === Who may switch one on ==================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses(format($$update public.company_options set value = 'true'::jsonb
   where company_id = %L and key = 'feature.costing_grid'$$, :'alpha'),
  'a company administrator cannot switch a feature on for her own company',
  'only the master administrator switches a feature');
select test.sign_in(:'master');
update public.company_options set value = 'true'::jsonb
 where company_id = :'alpha'::uuid and key = 'feature.costing_grid';
select app.feature_on('costing_grid', :'alpha'::uuid) as grid_on \gset
select app.feature_on('costing_grid', :'beta'::uuid)  as grid_beta \gset
rollback;
select test.ok(:'grid_on'::boolean, 'the master administrator can');
select test.ok(not :'grid_beta'::boolean, 'and it reaches that company only');

-- === Gate one: approval rules in force ======================================
-- A rule that would approve a job on the spot. Off, nothing reads it and an
-- approver is required, which is what submitting did before the rules existed.
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -50, 'Approve anything at all', '[]'::jsonb, 'auto_approve');

select test.sign_in(:'carol');
select id as job_a from app.create_costing('Switches: rules off') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job_a'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC') returning id as panel_a \gset
select app.submit_costing(:'job_a'::uuid);
select status as status_off from public.costings where id = :'job_a'::uuid \gset
select app.approval_review(:'job_a'::uuid) ->> 'rule_name' as rule_off \gset

select test.sign_in(:'master');
select test.feature(:'alpha'::uuid, 'approval_rules', true);
select test.sign_in(:'carol');
select id as job_b from app.create_costing('Switches: rules on') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job_b'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC');
select app.submit_costing(:'job_b'::uuid);
select status as status_on from public.costings where id = :'job_b'::uuid \gset
rollback;

select test.eq(:'status_off'::text, 'submitted',
  'with the rules switched off, a rule that would approve the job is not read at all');
select test.eq(:'rule_off'::text, 'An approver is required',
  'and the screen says so in those words rather than naming a rule');
select test.eq(:'status_on'::text, 'approved',
  'switched on, the same rule approves the same job on the spot');

-- === Gate two: the sweep that runs overnight ================================
-- The only thing in the app that writes with nobody watching, so the one that
-- most needs a switch.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job_q from app.create_costing('Switches: a quotation that ran out') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job_q'::uuid, :'alpha'::uuid, 'BOARD', 1, 'PC');
select app.submit_costing(:'job_q'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'job_q'::uuid);
select id as q_id from public.release_quotation(:'job_q'::uuid,
  format('%s/switches-test.pdf', :'alpha'),
  '{"customer_name": "TRICLOVER LIMITED"}'::jsonb) \gset
select app.set_quotation_status(:'q_id'::uuid, 'sent');
reset role;
update public.quotations set valid_until = current_date - 3 where id = :'q_id'::uuid;

select app.expire_quotations() as swept_off \gset
select (select expired_at is null from public.quotations where id = :'q_id'::uuid) as untouched \gset
select (select count(*)::int from public.quotation_followups where quotation_id = :'q_id'::uuid) as chases_off \gset

-- The role was reset above so the backdating could be written directly; the
-- switch is still the master administrator's, and says so.
select test.sign_in(:'master');
select test.feature(:'alpha'::uuid, 'quotation_validity', true);
select app.expire_quotations() as swept_on \gset
select (select expired_at is not null from public.quotations where id = :'q_id'::uuid) as expired_now \gset
select (select count(*)::int from public.quotation_followups where quotation_id = :'q_id'::uuid) as chases_on \gset
rollback;

select test.eq((:'swept_off'::jsonb ->> 'expired')::int, 0,
  'the nightly sweep expires nothing for a company with validity switched off');
select test.eq((:'swept_off'::jsonb ->> 'skipped')::int, 1,
  'and says how many it passed by, rather than saying nothing at all');
select test.ok(:'untouched'::boolean, 'the quotation is untouched');
select test.eq(:chases_off, 0, 'and nobody is told to chase it');
select test.eq((:'swept_on'::jsonb ->> 'expired')::int, 1, 'switched on, the same sweep expires it');
select test.ok(:'expired_now'::boolean, 'the quotation is marked');
select test.eq(:chases_on, 1, 'and one chase is raised, because it had been sent');

-- === Gate three: which panels count towards the total =======================
-- Two panels, one of them an optional extra. Off, an optional extra is simply a
-- panel, which is the arithmetic the app did before 2.7.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as job_o from app.create_costing('Switches: an optional extra') \gset
select id as part_o from public.v_component_prices
 where company_id is null and unit_price is not null order by code limit 1 \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job_o'::uuid, :'alpha'::uuid, 'MAIN BOARD', 1, 'PC') returning id as panel_main \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, is_option)
values (:'job_o'::uuid, :'alpha'::uuid, 'SPARE FEEDER', 1, 'PC', true) returning id as panel_extra \gset
select app.add_component_to_costing(:'panel_main'::uuid,  :'part_o'::uuid, 10);
select app.add_component_to_costing(:'panel_extra'::uuid, :'part_o'::uuid, 10);

select subtotal as total_off from public.v_costing_totals where costing_id = :'job_o'::uuid \gset
select count(*)::int as counted_off from public.v_costing_panel_prices
 where costing_id = :'job_o'::uuid and counts_in_total \gset

select test.sign_in(:'master');
select test.feature(:'alpha'::uuid, 'options_and_extras', true);
select test.sign_in(:'carol');
select subtotal as total_on from public.v_costing_totals where costing_id = :'job_o'::uuid \gset
select count(*)::int as counted_on from public.v_costing_panel_prices
 where costing_id = :'job_o'::uuid and counts_in_total \gset
rollback;

select test.eq(:counted_off, 2,
  'with the options feature off, both panels count towards the total');
select test.eq(:counted_on, 1, 'switched on, the optional extra does not');
select test.ok(:'total_off'::numeric > :'total_on'::numeric,
  'so the headline figure is the thing this switch changes, which is why it is marked');
select test.eq(:'total_off'::numeric, (:'total_on'::numeric) * 2,
  'by exactly the extra, here priced the same as the board it sits beside');

-- === Nothing that was already true stopped being true =======================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
select test.eq((select count(*)::int from public.company_options o
                 join public.features f on f.option_key = o.key
                where o.value = 'true'::jsonb), 0,
  'and every switch this file flipped is off again, for every company');
