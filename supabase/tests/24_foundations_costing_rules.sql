-- Foundations F4 and F7–F11 (migrations 0101 and 0102). Runs after 14, which
-- leaves the owner's seed, and after 15, which sets Alpha to no discount, no
-- margins and no uplift. F5 and F6 are in 22_documents.sql.
--
-- The block to read first is "provenance survives": origin, origin_ref,
-- parameters and the price snapshot through a revision and a copy — the fourth
-- and fifth time the hand-written column lists have grown, and the reason each
-- growth now comes with a test.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- The rules engine is behind a switch since 0116, off for every company. This
-- file is what tests it, so it switches it on for Alpha and off again at the end.
select test.feature(:'alpha'::uuid, 'approval_rules', true);

-- === F4. Every line says where it came from ================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as kit_id from public.v_kits where has_unpriced_part = false and line_count >= 2 order by code limit 1 \gset
select id as part_id from public.v_component_prices
 where company_id is null and unit_price is not null and pricing_mode = 'fixed' order by code limit 1 \gset

select id as costing_id from app.create_costing('Foundations: provenance') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom, parameters, is_option)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC',
        '{"incomer_a": 1600, "form": "3B", "ip": "IP31", "sources": ["mains", "gen"]}'::jsonb, false)
returning id as panel_id \gset

select app.add_assembly_to_costing(:'panel_id'::uuid, :'kit_id'::uuid, 1, 'Incomer') as kit_line \gset
select app.add_component_to_costing(:'panel_id'::uuid, :'part_id'::uuid, 3, 'Accessories') as loose_item \gset
select app.add_manual_item(:'panel_id'::uuid, 'SYNCHRO CHECK RELAY', 'switchgear', 35000, 2, 'pcs', null, null, 'Accessories') as typed_item \gset
commit;

select test.eq((select origin from public.costing_assemblies where id = :'kit_line'::uuid), 'kit',
  'a kit added to a panel says it came from a kit');
select test.eq((select count(*)::int from public.costing_items where costing_assembly_id = :'kit_line'::uuid and origin <> 'kit'), 0,
  'and so does every line copied from it');
select test.eq((select origin from public.costing_items where id = :'loose_item'::uuid), 'manual',
  'a component picked on its own was picked by a person');
select test.eq((select origin from public.costing_items where id = :'typed_item'::uuid), 'manual',
  'and so was a typed line');
select test.eq((select origin from public.costing_assemblies where id = (select costing_assembly_id from public.costing_items where id = :'loose_item'::uuid)), 'manual',
  'the loose-parts holder itself is manual');
select test.ok((select origin_ref is null from public.costing_items where id = :'loose_item'::uuid),
  'nothing points at a proposal or an import yet');
select test.eq((select parameters ->> 'form' from public.costing_panels where id = :'panel_id'::uuid), '3B',
  'the board''s defining answers are kept as fields');
select test.eq((select price_snapshot_at is not null from public.costings where id = :'costing_id'::uuid), true,
  'a new costing knows when its prices were taken');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$update public.costing_items set origin = 'guesswork' where id = %L$$, :'loose_item'),
  'an origin is one of the five known kinds, nothing else', 'costing_items_origin_known');
rollback;

-- A line an assistant proposal would create, set the way the apply step will
-- set it: through freeze_component with its origin named.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select gen_random_uuid() as fake_proposal \gset
select app.freeze_component(:'costing_id'::uuid,
  (select costing_assembly_id from public.costing_items where id = :'loose_item'::uuid),
  :'alpha'::uuid, :'part_id'::uuid, 1, 99, 'ai_proposal', :'fake_proposal'::uuid) as ai_item \gset
commit;
select test.eq((select origin from public.costing_items where id = :'ai_item'::uuid), 'ai_proposal',
  'a line the assistant proposed says so');
select test.eq((select origin_ref from public.costing_items where id = :'ai_item'::uuid), :'fake_proposal'::uuid,
  'and names the proposal');
select test.eq((select unit_price from public.costing_items where id = :'ai_item'::uuid),
               (select unit_price from public.costing_items where id = :'loose_item'::uuid),
  'at exactly the price a person would have got: provenance changes nothing about pricing');

-- === Provenance survives a revision and a copy ==============================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'costing_id'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'costing_id'::uuid);
select test.sign_in(:'carol');
select (app.create_costing_revision(:'costing_id'::uuid)).id as rev_id \gset
commit;

select test.eq((select parameters ->> 'incomer_a' from public.costing_panels where costing_id = :'rev_id'::uuid), '1600',
  'a revision carries the panel parameters');
select test.eq((select count(*)::int from public.costing_items where costing_id = :'rev_id'::uuid and origin = 'ai_proposal' and origin_ref = :'fake_proposal'::uuid), 1,
  'and every line''s origin and reference');
select test.eq((select count(*)::int from public.costing_assemblies where costing_id = :'rev_id'::uuid and kind = 'kit' and origin = 'kit'), 1,
  'the kit line included');
select test.eq((select price_snapshot_at from public.costings where id = :'rev_id'::uuid),
               (select price_snapshot_at from public.costings where id = :'costing_id'::uuid),
  'and the price snapshot, because a revision keeps the same prices');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as copy_id from app.create_costing('Foundations: a copy') \gset
select (app.copy_panel(:'panel_id'::uuid, :'copy_id'::uuid, 'COPIED') ->> 'panel_id') as copied_panel \gset
commit;

select test.eq((select parameters ->> 'ip' from public.costing_panels where id = :'copied_panel'::uuid), 'IP31',
  'a copied panel carries its parameters');
select test.eq((select count(*)::int from public.costing_items i join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.panel_id = :'copied_panel'::uuid and i.origin = 'ai_proposal'), 1,
  'and the provenance of every line, even though the copy re-priced them');
select test.ok((select price_snapshot_at >= (select price_snapshot_at from public.costings where id = :'costing_id'::uuid)
                from public.costings where id = :'copy_id'::uuid),
  'a copy''s snapshot is fresh: a copy re-prices at today''s rates');

-- === F7. The one default rule ==============================================
select test.eq((select count(*)::int from public.approval_rules where company_id = :'alpha'::uuid), 1,
  'every company has exactly one approval rule to begin with');
select test.eq((select outcome from public.approval_rules where company_id = :'alpha'::uuid), 'require_approver',
  'and it always requires an approver, which is what happened before there were rules');

begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.evaluate_approval_rules(:'costing_id'::uuid) as verdict \gset
rollback;
select test.eq(:'verdict'::jsonb ->> 'outcome', 'require_approver',
  'so the engine''s answer for any costing today is: an approver is required');
select test.eq((:'verdict'::jsonb -> 'facts' ->> 'uses_placeholder_part'), 'false',
  'with the facts it looked at beside it');
select test.ok((:'verdict'::jsonb -> 'facts' ->> 'total_ex_vat')::numeric > 0,
  'including what the costing comes to');

-- A second rule, to show the engine works — added and removed inside one
-- transaction so nothing else sees it.
begin;
set local role authenticated;
select test.sign_in(:'alice');   -- company admin
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -1, 'Small jobs approve themselves',
        '[{"field": "total_ex_vat", "op": "<", "value": 1000000000}]'::jsonb, 'auto_approve');
select test.eq(app.evaluate_approval_rules(:'costing_id'::uuid) ->> 'outcome', 'auto_approve',
  'a rule that holds, placed first, decides');
update public.approval_rules set condition = '[{"field": "total_ex_vat", "op": ">", "value": 1000000000}]'::jsonb
 where name = 'Small jobs approve themselves';
select test.eq(app.evaluate_approval_rules(:'costing_id'::uuid) ->> 'outcome', 'require_approver',
  'one that does not hold is passed over for the next');
update public.approval_rules set condition = '[{"field": "no_such_fact", "op": "=", "value": 1}]'::jsonb,
       outcome = 'auto_approve' where name = 'Small jobs approve themselves';
select test.eq(app.evaluate_approval_rules(:'costing_id'::uuid) ->> 'outcome', 'require_approver',
  'and a rule naming a fact the engine does not know never holds: it cannot approve by accident');
select test.refuses(
  format($$insert into public.approval_rules (company_id, name, outcome) values (%L, 'x', 'maybe')$$, :'alpha'),
  'an outcome is one of the four known ones', 'approval_rules_outcome_known');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'carol');   -- costing engineer, not an admin
select test.refuses(
  format($$insert into public.approval_rules (company_id, name, outcome) values (%L, 'x', 'auto_approve')$$, :'alpha'),
  'an engineer cannot write the rules she is judged by', 'policy');
rollback;

-- The lifecycle has not changed: submit and approve still work exactly as
-- before, without consulting the rules. (The costing above went through both.)
select test.eq((select status::text from public.costings where id = :'costing_id'::uuid), 'approved',
  'and the lifecycle itself is untouched: submit and approve worked as they always did');

-- === F8. Validity ==========================================================
-- The revision made above is now the current one, so it is the one that can be
-- quoted; it goes through submit and approve first, as any costing must.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'rev_id'::uuid);
select test.sign_in(:'alice');
select app.approve_costing(:'rev_id'::uuid);
select (app.release_quotation(:'rev_id'::uuid, format('%s/q.pdf', :'alpha'),
        jsonb_build_object('customer_name', 'Validity Test Ltd'))).id as quote_id \gset
commit;
select test.eq((select valid_until from public.quotations where id = :'quote_id'::uuid),
               (current_date + (select validity_days from public.company_settings where company_id = :'alpha'::uuid))::date,
  'a released quotation is open until today plus the company''s validity days');
select test.ok((select terms ->> 'validity' like '%days from the date hereof%' from public.quotations where id = :'quote_id'::uuid),
  'while the printed wording is unchanged');

-- === F9. Imports are recorded ==============================================
select test.eq((select count(*)::int from public.import_jobs j join public.import_batches b on b.id = j.legacy_batch_id),
               (select count(*)::int from public.import_batches),
  'every import batch that ever ran has a job row beside it');
select test.eq((select type from public.import_jobs where file_name = 'components.csv' order by started_at desc limit 1), 'catalogue',
  'the seed''s component import is a catalogue job');
select test.eq((select (summary ->> 'new')::int from public.import_jobs where file_name = 'components.csv' order by started_at desc limit 1), 735,
  'and its summary is the importer''s own report: 735 new');
select test.eq((select status from public.import_jobs where file_name = 'kits.csv' order by started_at desc limit 1), 'applied',
  'an applied batch is an applied job');

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.import_jobs where company_id = :'alpha'::uuid), 0,
  'another company sees none of Alpha''s import jobs');
select test.ok((select count(*) >= 1 from public.import_jobs where company_id is null),
  'but everybody sees the master library''s, since everybody uses that library');
rollback;

-- === F10. Company options ==================================================
select test.eq((select value from public.company_options where company_id = :'alpha'::uuid and key = 'ai_enabled'), 'false'::jsonb,
  'the assistant is off for every company until somebody turns it on');
select test.eq((select value from public.company_options where company_id = :'alpha'::uuid and key = 'ai_price_age_warning_days'), '90'::jsonb,
  'with a 90-day price-age warning');
select test.eq((select count(*)::int from public.company_options where company_id = :'beta'::uuid
                 and key like 'ai_%'), 4,
  'and every company has all four assistant settings');

begin;
set local role authenticated;
select test.sign_in(:'alice');   -- Alpha's admin
select test.eq(app.company_option('ai_price_age_warning_days'), '90'::jsonb,
  'a company reads its own option through the accessor');
select test.eq(app.company_option('no_such_option', '"fallback"'::jsonb), '"fallback"'::jsonb,
  'and gets the fallback for one it has not set');
update public.company_options set value = '60'::jsonb where company_id = :'alpha'::uuid and key = 'ai_price_age_warning_days';
select test.eq(app.company_option('ai_price_age_warning_days'), '60'::jsonb,
  'a company admin changes a threshold');
select test.refuses(
  format($$update public.company_options set value = 'true'::jsonb where company_id = %L and key = 'ai_enabled'$$, :'alpha'),
  'but cannot switch the assistant on: that is the master administrator''s (A2)', 'only the master administrator');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'master');
update public.company_options set value = 'true'::jsonb where company_id = :'alpha'::uuid and key = 'ai_enabled';
select test.eq((select value from public.company_options where company_id = :'alpha'::uuid and key = 'ai_enabled'), 'true'::jsonb,
  'the master administrator can');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.company_options where company_id = :'alpha'::uuid), 0,
  'another company sees none of Alpha''s settings');
select test.refuses(
  format($$insert into public.company_options (company_id, key, value) values (%L, 'x', '1'::jsonb)$$, :'alpha'),
  'and cannot add to them', 'policy');
rollback;

-- A new company gets its rule and its options at birth.
begin;
insert into public.companies (name, kind) values ('Newborn Ltd', 'external') returning id as newco \gset
select test.eq((select count(*)::int from public.approval_rules where company_id = :'newco'::uuid), 1,
  'a company created today starts with its one rule');
select test.eq((select count(*)::int from public.company_options where company_id = :'newco'::uuid
                 and key like 'ai_%'), 4,
  'and its four assistant settings, off');
rollback;

-- === F11. The assistant's tables exist, are empty, and are isolated ========
select test.eq((select count(*)::int from public.assistant_conversations), 0, 'no conversations yet');
select test.eq((select count(*)::int from public.assistant_proposals), 0, 'and no proposals: the screen is phase 2');

begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.assistant_conversations (company_id, user_id, entity_type, entity_id, title)
values (:'alpha'::uuid, :'carol'::uuid, 'costing', :'costing_id'::uuid, 'Draft this costing')
returning id as conv \gset
insert into public.assistant_messages (conversation_id, role, content) values (:'conv'::uuid, 'user', 'Draft this costing from the spec');
insert into public.assistant_proposals (conversation_id, company_id, entity_type, entity_id, type, payload)
values (:'conv'::uuid, :'alpha'::uuid, 'costing', :'costing_id'::uuid, 'review', '{"summary": "looks fine", "findings": []}'::jsonb)
returning id as prop \gset
commit;

select test.eq((select status from public.assistant_proposals where id = :'prop'::uuid), 'open',
  'a proposal is open until a person decides');

begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.assistant_conversations), 0, 'another company sees no conversation');
select test.eq((select count(*)::int from public.assistant_messages), 0, 'nor its messages');
select test.eq((select count(*)::int from public.assistant_proposals), 0, 'nor its proposals');
rollback;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(
  format($$update public.assistant_proposals set status = 'maybe' where id = %L$$, :'prop'),
  'a proposal''s status is one of the five known ones', 'assistant_proposals_status_known');
rollback;

-- Leave things as found.
select test.feature(:'alpha'::uuid, 'approval_rules', false);
delete from public.assistant_conversations where id = :'conv'::uuid;
