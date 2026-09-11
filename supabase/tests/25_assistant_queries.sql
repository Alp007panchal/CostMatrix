-- Migration 0103: what the assistant may ask the database (AI spec §5, §9).
-- Runs after 14 (the owner's seed is in), 15 (Alpha has no margins, no discount,
-- no uplift, rounds to 100) and 24 (Alpha has a costing with a kit line and a
-- placeholder line).
--
-- Acceptance test 3 lives here: a user of company B asking about a company A
-- costing gets null, which the tool reports as "not found". Test 6's database
-- half too: the allowance says "off" by default and "exhausted" once the month's
-- messages pass the budget.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === A costing as one document ==============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as kit_id from public.v_kits where has_unpriced_part = false and line_count >= 2 order by code limit 1 \gset
select id as costing_id from app.create_costing('Assistant: a costing to read') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, parameters)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC', '{"incomer_a": 1600, "form": "3B"}'::jsonb)
returning id as panel_id \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, :'kit_id'::uuid, 2, 'Incomer') as kit_line \gset
select public.costing_snapshot(:'costing_id'::uuid) as snap \gset
commit;

select test.eq(:'snap'::jsonb ->> 'id', :'costing_id', 'the snapshot is of the costing asked for');
select test.eq(jsonb_array_length(:'snap'::jsonb -> 'panels'), 1, 'with its one panel');
select test.eq(:'snap'::jsonb -> 'panels' -> 0 -> 'parameters' ->> 'form', '3B', 'the panel''s parameters');
select test.eq(:'snap'::jsonb -> 'panels' -> 0 -> 'lines' -> 0 ->> 'origin', 'kit', 'every line''s origin');
select test.eq((:'snap'::jsonb -> 'panels' -> 0 -> 'lines' -> 0 ->> 'quantity')::numeric, 2::numeric, 'and quantity');
select test.ok(jsonb_array_length(:'snap'::jsonb -> 'panels' -> 0 -> 'lines' -> 0 -> 'items') >= 2, 'with the frozen items under it');
select test.ok((:'snap'::jsonb -> 'totals' ->> 'material_cost')::numeric > 0, 'and the totals the screen shows');
select test.eq((:'snap'::jsonb -> 'totals' ->> 'material_cost')::numeric,
               (select material_cost from public.v_costing_totals where costing_id = :'costing_id'::uuid),
  'to the cent');
select test.eq(:'snap'::jsonb -> 'settings' ->> 'currency', 'KES', 'in the costing''s own currency');

-- === Test 3: another company''s user gets nothing =============================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.ok(public.costing_snapshot(:'costing_id'::uuid) is null,
  'a user of company B asking about a company A costing gets null — "not found" (test 3)');
select test.ok(public.kit_detail(:'kit_id'::uuid) is not null,
  'but sees a master-library kit, as on the screen');
select test.eq(public.company_policy() -> 'company' ->> 'name', (select name from public.companies where id = :'beta'::uuid),
  'and reads only their own company''s policy');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
select test.ok(public.costing_snapshot(:'costing_id'::uuid) is not null,
  'the master administrator, who may read everywhere, sees it');
rollback;

-- === Searching the library ===================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select public.search_kits('630A outgoer', '{}'::jsonb, 20) as hits \gset
select test.ok(jsonb_array_length(:'hits'::jsonb) between 1 and 20, 'a free-text search finds a shortlist, never the catalogue');
select test.ok((select bool_and(h ->> 'name' ilike '%630A%') from jsonb_array_elements(:'hits'::jsonb) h),
  'every hit says 630A');
select test.ok((select bool_and((h -> 'price') is not null) from jsonb_array_elements(:'hits'::jsonb) h
                where (h ->> 'has_unpriced_part')::boolean = false),
  'and every fully priced hit carries today''s price');
select test.ok((:'hits'::jsonb -> 0 -> 'main_device' ->> 'name') is not null, 'with its main device');

select public.search_kits('', '{"category": "APFC", "rating_a": 50}'::jsonb, 20) as apfc \gset
select test.ok(jsonb_array_length(:'apfc'::jsonb) >= 1, 'filters alone find the 50 kVAr APFC kits');
select test.ok((select bool_and((h ->> 'rating')::numeric = 50) from jsonb_array_elements(:'apfc'::jsonb) h),
  'all rated 50');

select public.search_kits('no such kit anywhere zzz', '{}'::jsonb, 20) as none \gset
select test.eq(:'none'::jsonb, '[]'::jsonb, 'nothing matching is an empty list, not an error');

select test.eq(jsonb_array_length(public.search_kits('KIT', '{}'::jsonb, 200)), 50,
  'the shortlist is capped at 50 whatever is asked');

select public.search_components('LOGO', '{}'::jsonb, 20) as parts \gset
select test.ok(jsonb_array_length(:'parts'::jsonb) >= 1, 'components are found by code');
select test.ok((:'parts'::jsonb -> 0 ->> 'price') is not null, 'with a price');
select test.ok((:'parts'::jsonb -> 0 ->> 'status') in ('active', 'obsolete', 'placeholder'), 'and a status');

select public.search_components('', '{"category": "switchgear"}'::jsonb, 5) as sg \gset
select test.eq(jsonb_array_length(:'sg'::jsonb), 5, 'the limit is honoured');
select test.ok((select bool_and(h ->> 'category' = 'switchgear') from jsonb_array_elements(:'sg'::jsonb) h),
  'and so is the category filter');

select public.kit_detail(:'kit_id'::uuid) as kit \gset
select test.ok(jsonb_array_length(:'kit'::jsonb -> 'lines') >= 2, 'one kit in full lists its lines');
select test.eq((select count(*)::int from jsonb_array_elements(:'kit'::jsonb -> 'lines') l where (l ->> 'is_main_device')::boolean), 1,
  'exactly one of them the main device');
rollback;

-- === The company''s policy ===================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select public.company_policy() as pol \gset
rollback;
select test.eq(:'pol'::jsonb -> 'company' ->> 'id', :'alpha', 'the policy names the company');
select test.eq(:'pol'::jsonb -> 'assistant' -> 'enabled', 'false'::jsonb, 'and says the assistant is off');
select test.eq(:'pol'::jsonb -> 'assistant' -> 'price_age_warning_days', '90'::jsonb, 'with the 90-day warning');
select test.ok(jsonb_array_length(:'pol'::jsonb -> 'approval_rules') >= 1, 'the approval rules');
select test.ok(jsonb_array_length(:'pol'::jsonb -> 'kit_groups') >= 17, 'and the kit groups');
select test.ok(not (:'pol'::jsonb::text ilike '%purchase_price%'), 'and never a purchase price (spec §8)');

-- === price_preview: the same arithmetic as a costed panel ===================
-- Alpha has no margins since test 15; give it margins for this block only so
-- the divisor arithmetic is actually exercised.
begin;
update public.companies set material_margin_pct = 20, labour_margin_pct = 10 where id = :'alpha'::uuid;
set local role authenticated;
select test.sign_in(:'carol');
select id as priced_costing from app.create_costing('Assistant: preview parity') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'priced_costing'::uuid, :'alpha'::uuid, 'PARITY', 1, 'PC') returning id as priced_panel \gset
select app.add_assembly_to_costing(:'priced_panel'::uuid, :'kit_id'::uuid, 3, 'Incomer');
select public.price_preview(jsonb_build_array(jsonb_build_object('kit_id', :'kit_id', 'qty', 3))) as preview \gset
select unit_price as real_price, material_cost as real_material, labour_cost as real_labour
  from public.v_costing_panel_prices where panel_id = :'priced_panel'::uuid \gset
rollback;

select test.eq((:'preview'::jsonb ->> 'material_cost')::numeric, round(:'real_material'::numeric, 2),
  'the preview''s material cost equals the costed panel''s');
select test.eq((:'preview'::jsonb ->> 'labour_cost')::numeric, round(:'real_labour'::numeric, 2),
  'and its labour cost');
select test.eq((:'preview'::jsonb ->> 'selling_price')::numeric, :'real_price'::numeric,
  'and its selling price, margins and rounding included');
select test.eq((:'preview'::jsonb ->> 'complete')::boolean, true, 'everything was priced');
select test.eq(:'preview'::jsonb -> 'unpriced', '[]'::jsonb, 'so nothing is listed as unpriced');
select test.ok(:'preview'::jsonb ->> 'note' ilike '%nothing saved%', 'and it says it saved nothing');
select test.eq((select count(*)::int from public.costings where title = 'Assistant: preview parity'), 0,
  'which is true: the block above rolled back and the preview wrote nothing anyway');

-- An unpriced part is named, never guessed (A4).
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as placeholder_id from public.v_component_prices where is_placeholder and unit_price is null order by code limit 1 \gset
select public.price_preview(jsonb_build_array(
  jsonb_build_object('component_id', :'placeholder_id', 'qty', 1),
  jsonb_build_object('component_id', gen_random_uuid(), 'qty', 1))) as p2 \gset
rollback;
select test.eq((:'p2'::jsonb ->> 'complete')::boolean, false, 'a placeholder makes the preview incomplete');
select test.eq(jsonb_array_length(:'p2'::jsonb -> 'unpriced'), 2, 'both the unpriced part and the unknown id are named');
select test.eq((:'p2'::jsonb ->> 'material_cost')::numeric, 0::numeric, 'and nothing is invented for them');

-- === The allowance: off by default, then on with a budget (test 6) ==========
begin;
set local role authenticated;
select test.sign_in(:'carol');
select public.assistant_allowance() as allow0 \gset
rollback;
select test.eq(:'allow0'::jsonb -> 'enabled', 'false'::jsonb, 'the assistant is off for Alpha until the master administrator says otherwise');
select test.eq((:'allow0'::jsonb ->> 'used_this_month')::numeric, 0::numeric, 'nothing used');
select test.eq((:'allow0'::jsonb ->> 'rate_limit_per_minute')::int, 20, 'twenty requests a minute per person');

begin;
set local role authenticated;
select test.sign_in(:'master');
update public.company_options set value = 'true'::jsonb where company_id = :'alpha'::uuid and key = 'ai_enabled';
update public.company_options set value = '1000'::jsonb where company_id = :'alpha'::uuid and key = 'ai_monthly_token_budget';

select test.sign_in(:'carol');
select public.assistant_allowance() as allow1 \gset
select test.eq(:'allow1'::jsonb -> 'enabled', 'true'::jsonb, 'switched on, it says so');
select test.eq((:'allow1'::jsonb ->> 'monthly_token_budget')::numeric, 1000::numeric, 'with the 1,000-token budget of test 6');

-- A conversation with one turn that used 600 + 500 tokens: over the budget.
insert into public.assistant_conversations (company_id, user_id, entity_type, entity_id, title)
values (:'alpha'::uuid, :'carol'::uuid, 'costing', :'costing_id'::uuid, 'Budget test') returning id as conv \gset
insert into public.assistant_messages (conversation_id, role, content) values (:'conv'::uuid, 'user', 'Review this');
insert into public.assistant_messages (conversation_id, role, content, tokens_in, tokens_out, model)
values (:'conv'::uuid, 'assistant', 'Done.', 600, 500, 'fake-model');
select public.assistant_record_usage(:'conv'::uuid, 600, 500, 0.0155);

select public.assistant_allowance() as allow2 \gset
select test.eq((:'allow2'::jsonb ->> 'used_this_month')::numeric, 1100::numeric, 'the month''s usage is the sum of the messages'' tokens');
select test.ok((:'allow2'::jsonb ->> 'used_this_month')::numeric > (:'allow2'::jsonb ->> 'monthly_token_budget')::numeric,
  'so the budget is exhausted, and the function will refuse the next request before calling any provider (test 6)');
select test.eq((:'allow2'::jsonb ->> 'recent_requests')::int, 1, 'one request by this person in the last minute');
select test.eq((select tokens_in from public.assistant_conversations where id = :'conv'::uuid), 600::bigint, 'the conversation keeps its token total');
select test.eq((select cost_usd from public.assistant_conversations where id = :'conv'::uuid), 0.0155::numeric, 'and its cost');

-- Another person in the same company shares the budget but not the rate count.
select test.sign_in(:'alice');
select public.assistant_allowance() as allow3 \gset
select test.eq((:'allow3'::jsonb ->> 'used_this_month')::numeric, 1100::numeric, 'the budget is the company''s');
select test.eq((:'allow3'::jsonb ->> 'recent_requests')::int, 0, 'the rate limit is the person''s');

-- Another company is untouched.
select test.sign_in(:'bob');
select public.assistant_allowance() as allow4 \gset
select test.eq(:'allow4'::jsonb -> 'enabled', 'false'::jsonb, 'Beta is still off');
select test.eq((:'allow4'::jsonb ->> 'used_this_month')::numeric, 0::numeric, 'and has used nothing');
rollback;

-- === Read-only: none of this changed a price =================================
select test.eq((select count(*)::int from public.assistant_conversations), 0, 'no conversation survives: every block rolled back');
select test.eq((select value from public.company_options where company_id = :'alpha'::uuid and key = 'ai_enabled'), 'false'::jsonb,
  'and the assistant is off again');

-- Leave things as found.
delete from public.costings where id = :'costing_id'::uuid;
