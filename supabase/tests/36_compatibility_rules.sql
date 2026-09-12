-- Compatibility checks (migration 0114, roadmap 3.4). Runs after 14 and 15, so
-- the kits and parts are the owner's own.
--
-- The whole point of the feature is that it is advisory and quiet: a rule is a
-- row somebody can read, it fires on what the library actually says, and a
-- panel nobody has described stays silent rather than guessing. The last block
-- asserts that nothing this file did moved a single figure.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === The three checks arrive as rows anybody can read =======================
select test.eq((select count(*)::int from public.compatibility_rules where company_id is null), 3,
  'the three checks the roadmap asks for arrive as three master rows');
select test.eq((select count(*)::int from public.compatibility_rules
                 where company_id is null and severity = 'warning' and is_active), 3,
  'all of them warnings, all of them on: nothing refuses a costing on day one');
select test.eq((select count(distinct rule_kind)::int from public.compatibility_rules where company_id is null), 3,
  'one of each kind: will it go in, does that accessory belong, do the ways add up');

-- === What the table refuses, so a rule cannot fail silently for ever ========
begin;
set local role authenticated;
select test.sign_in(:'master');
select test.refuses($$insert into public.compatibility_rules (rule_kind, name, params, message)
  values ('accessory_fits_device', 'Bad field', '{"attribute": "fits_frames", "device_field": "colour"}'::jsonb, 'x {kit}')$$,
  'a rule may not name a column of its own choosing', 'not on colour');
select test.refuses($$insert into public.compatibility_rules (rule_kind, name, params, message)
  values ('accessory_fits_device', 'No attribute', '{}'::jsonb, 'x {kit}')$$,
  'an accessory rule must say which list the accessory carries', 'which attribute');
select test.refuses($$insert into public.compatibility_rules (rule_kind, name, params, message)
  values ('feeders_vs_incomer', 'No ratio', '{"max_ratio": 0}'::jsonb, 'x {panel}')$$,
  'and a feeder rule must say how many times the incomer is too many', 'how many times');
select test.refuses($$insert into public.compatibility_rules (rule_kind, name, params, message)
  values ('feeders_vs_incomer', 'Nothing to act on', '{"max_ratio": 4}'::jsonb, 'Something is wrong.')$$,
  'a message that says the same thing on every panel is refused', 'placeholder');
select test.refuses($$insert into public.compatibility_rules (rule_kind, name, params, message)
  values ('vibes', 'Unknown kind', '{}'::jsonb, 'x {kit}')$$,
  'and a check nobody has written cannot be asked for', 'compatibility_rules_kind_known');
rollback;

-- === Who may write a rule ====================================================
begin;
set local role authenticated;
select test.sign_in(:'alice');
select test.refuses($$insert into public.compatibility_rules (company_id, rule_kind, name, params, message)
  values (null, 'feeders_vs_incomer', 'Alice writes a master rule', '{"max_ratio": 2}'::jsonb, 'x {panel}')$$,
  'a company administrator cannot write a rule for everybody');
select test.refuses(format($$insert into public.compatibility_rules (company_id, rule_kind, name, params, message)
  values (%L, 'feeders_vs_incomer', 'Alice writes for Beta', '{"max_ratio": 2}'::jsonb, 'x {panel}')$$, :'beta'),
  'nor one for another company');
select test.sign_in(:'carol');
select test.refuses(format($$insert into public.compatibility_rules (company_id, rule_kind, name, params, message)
  values (%L, 'feeders_vs_incomer', 'Carol writes a rule', '{"max_ratio": 2}'::jsonb, 'x {panel}')$$, :'alpha'),
  'and a costing engineer writes no rules at all');
rollback;

-- === A board to check ========================================================
-- A 250 A incomer and eight 100 A ways, in one cubicle. Nothing is measured and
-- nothing is described, which is how every panel in the app looks today.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select id as costing_id from app.create_costing('3.4: a board to check') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'costing_id'::uuid, :'alpha'::uuid, 'MAIN LV BOARD', 1, 'PC')
returning id as panel_id \gset
select id as incomer_kit from public.v_kits
 where company_id is null and code = '250A-TP-MCCB-ADJUSTABLE-25KA-KIT' \gset
select id as feeder_kit from public.v_kits
 where company_id is null and code = '100A-TP-MCCB-ADJUSTABLE-25KA-KIT' \gset
select component_id as incomer_device from public.assembly_components
 where assembly_id = :'incomer_kit'::uuid and is_main_device \gset
select component_id as incomer_extra from public.assembly_components
 where assembly_id = :'incomer_kit'::uuid and not is_main_device limit 1 \gset
select app.add_assembly_to_costing(:'panel_id'::uuid, :'incomer_kit'::uuid, 1, 'Incomer');
select app.add_assembly_to_costing(:'panel_id'::uuid, :'feeder_kit'::uuid, 8, 'Outgoers');
select id as cubicle_id, code as cubicle_code from public.v_component_prices
 where is_enclosure_cubicle and unit_price is not null order by code limit 1 \gset
select app.add_component_to_costing(:'panel_id'::uuid, :'cubicle_id'::uuid, 1, 'Enclosure');
select coalesce(material_cost, 0) as material_before
  from public.v_costing_panel_costs where costing_id = :'costing_id'::uuid \gset
select count(*)::int as quiet from public.v_panel_warnings where panel_id = :'panel_id'::uuid \gset
commit;

select test.eq(:quiet, 0,
  'a board of parts nobody has measured or described says nothing at all');

-- === Will it go in? ==========================================================
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.components set depth_mm = 800 where id = :'incomer_device'::uuid;
update public.components
   set enclosure_layout = '{"usable_w_mm": 700, "usable_h_mm": 1800, "usable_d_mm": 600, "form": "3B"}'::jsonb
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'carol');
select count(*)::int as n, coalesce(max(message), '') as msg, coalesce(max(subject), '') as subj
  from public.v_panel_warnings where panel_id = :'panel_id'::uuid and rule_kind = 'device_depth_vs_cubicle' \gset
rollback;
select test.eq(:n, 1,
  'an 800 mm device in a cubicle 600 mm deep inside is one warning');
select test.ok(:'msg' like '%900 mm is wanted%',
  'and the sentence says what it wants: 800 plus the 100 mm behind it');
select test.ok(:'subj' <> '', 'against the kit it names, so somebody knows where to look');

-- The same device in a deeper cubicle, and a shallower device in the same one.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.components set depth_mm = 800 where id = :'incomer_device'::uuid;
update public.components
   set enclosure_layout = '{"usable_w_mm": 700, "usable_h_mm": 1800, "usable_d_mm": 1000}'::jsonb
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'carol');
select count(*)::int as roomy from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'device_depth_vs_cubicle' \gset
select test.sign_in(:'master');
update public.components set depth_mm = 400 where id = :'incomer_device'::uuid;
update public.components
   set enclosure_layout = '{"usable_w_mm": 700, "usable_h_mm": 1800, "usable_d_mm": 600}'::jsonb
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'carol');
select count(*)::int as shallow from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'device_depth_vs_cubicle' \gset
rollback;
select test.eq(:roomy, 0, 'a cubicle 1000 mm deep inside takes it without a word');
select test.eq(:shallow, 0, 'and so does a 400 mm device in the 600 mm cubicle');

-- A measured device and an undescribed cubicle: silent, because half a fact is
-- not a finding.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.components set depth_mm = 2000 where id = :'incomer_device'::uuid;
select test.sign_in(:'carol');
select count(*)::int as half_known from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'device_depth_vs_cubicle' \gset
rollback;
select test.eq(:half_known, 0,
  'a two-metre device in a cubicle nobody has described stays silent');

-- === Does that accessory belong to that device? =============================
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.components set frame_size = '250AF' where id = :'incomer_device'::uuid;
update public.components set attributes = '{"fits_frames": ["125AF"]}'::jsonb
 where id = :'incomer_extra'::uuid;
select test.sign_in(:'carol');
select count(*)::int as wrong_acc, coalesce(max(message), '') as acc_msg
  from public.v_panel_warnings where panel_id = :'panel_id'::uuid
   and rule_kind = 'accessory_fits_device' \gset
select test.sign_in(:'master');
update public.components set attributes = '{"fits_frames": ["125AF", "250AF"]}'::jsonb
 where id = :'incomer_extra'::uuid;
select test.sign_in(:'carol');
select count(*)::int as right_acc from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'accessory_fits_device' \gset
select test.sign_in(:'master');
update public.components set frame_size = null where id = :'incomer_device'::uuid;
update public.components set attributes = '{"fits_frames": ["125AF"]}'::jsonb
 where id = :'incomer_extra'::uuid;
select test.sign_in(:'carol');
select count(*)::int as no_frame from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'accessory_fits_device' \gset
rollback;
select test.eq(:wrong_acc, 1,
  'a part listed for 125AF frames inside a 250AF kit is one warning');
select test.ok(:'acc_msg' like '%250AF%',
  'and the sentence names the frame the kit actually holds');
select test.eq(:right_acc, 0, 'the same part listed for both frames says nothing');
select test.eq(:no_frame, 0,
  'and a device whose frame nobody has recorded cannot be checked, so is not');

-- A part added loose to the board, listed for a device the board does not hold.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.components set frame_size = '250AF' where id = :'incomer_device'::uuid;
update public.components set attributes = '{"fits_frames": ["630AF"]}'::jsonb
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'carol');
select count(*)::int as loose_acc, coalesce(max(subject), '') as loose_subject
  from public.v_panel_warnings where panel_id = :'panel_id'::uuid
   and rule_kind = 'accessory_fits_device' \gset
rollback;
select test.eq(:loose_acc, 1,
  'a loose part listed for 630AF on a board of 250AF devices is a warning too');
select test.eq(:'loose_subject'::text, 'MAIN LV BOARD',
  'against the board, because a loose part belongs to no one kit');

-- === Do the outgoing ways add up? ===========================================
-- Eight 100 A ways under a 250 A incomer is 3.2 times it, which is ordinary
-- diversity. Twelve is 4.8 times, which is worth a question.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select count(*)::int as ways_ok from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'feeders_vs_incomer' \gset
update public.costing_assemblies set quantity = 12
 where panel_id = :'panel_id'::uuid and source_assembly_id = :'feeder_kit'::uuid;
select count(*)::int as ways_many, coalesce(max(message), '') as ways_msg
  from public.v_panel_warnings where panel_id = :'panel_id'::uuid
   and rule_kind = 'feeders_vs_incomer' \gset
rollback;
select test.eq(:ways_ok, 0, 'eight 100 A ways under a 250 A incomer pass without comment');
select test.eq(:ways_many, 1, 'twelve of them do not');
select test.ok(:'ways_msg' like '%1200 A against a 250 A incomer%',
  'and the sentence puts both figures in front of the engineer');

-- The same check without sections: the kits' own labels decide instead.
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.assemblies set tags = '{incomer}' where id = :'incomer_kit'::uuid;
update public.assemblies set tags = '{outgoer}' where id = :'feeder_kit'::uuid;
select test.sign_in(:'carol');
update public.costing_assemblies set quantity = 12, section = null
 where panel_id = :'panel_id'::uuid and source_assembly_id = :'feeder_kit'::uuid;
update public.costing_assemblies set section = null
 where panel_id = :'panel_id'::uuid and source_assembly_id = :'incomer_kit'::uuid;
select count(*)::int as by_tags from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'feeders_vs_incomer' \gset
rollback;
select test.eq(:by_tags, 1,
  'a board with no sections still reads, because the kits themselves say what they are');

-- === A rule switched off is a rule that says nothing =========================
begin;
set local role authenticated;
select test.sign_in(:'master');
update public.compatibility_rules set is_active = false where rule_kind = 'feeders_vs_incomer' and company_id is null;
select test.sign_in(:'carol');
update public.costing_assemblies set quantity = 12
 where panel_id = :'panel_id'::uuid and source_assembly_id = :'feeder_kit'::uuid;
select count(*)::int as switched_off from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'feeders_vs_incomer' \gset
rollback;
select test.eq(:switched_off, 0, 'switching a rule off switches its warnings off with it');

-- === A company's own rule sits beside the master ones ========================
begin;
set local role authenticated;
select test.sign_in(:'alice');
insert into public.compatibility_rules (company_id, rule_kind, name, params, severity, message, sort_order)
values (:'alpha'::uuid, 'feeders_vs_incomer', 'We allow no diversity at all',
        '{"max_ratio": 1, "incomer_sections": ["Incomer"], "feeder_sections": ["Outgoers"]}'::jsonb,
        'warning', 'Alpha: {feeder_a} A of ways on a {incomer_a} A incomer.', 10);
select test.sign_in(:'carol');
select count(*)::int as strict_eight, coalesce(max(rule_name), '') as strict_name
  from public.v_panel_warnings where panel_id = :'panel_id'::uuid
   and rule_kind = 'feeders_vs_incomer' \gset
update public.costing_assemblies set quantity = 12
 where panel_id = :'panel_id'::uuid and source_assembly_id = :'feeder_kit'::uuid;
select count(*)::int as strict_twelve from public.v_panel_warnings
 where panel_id = :'panel_id'::uuid and rule_kind = 'feeders_vs_incomer' \gset
select test.sign_in(:'bob');
select count(*)::int as beta_sees from public.v_panel_warnings where panel_id = :'panel_id'::uuid \gset
select count(*)::int as beta_rules from public.compatibility_rules where company_id = :'alpha'::uuid \gset
rollback;
select test.eq(:strict_eight, 1,
  'a company that allows no diversity is warned about the eight ways the master rule allows');
select test.eq(:'strict_name'::text, 'We allow no diversity at all',
  'and the warning names the rule that made it, which is the company''s own');
select test.eq(:strict_twelve, 2,
  'at twelve ways both rules have something to say, and both are shown');
select test.eq(:beta_sees, 0, 'another company sees nothing of this board');
select test.eq(:beta_rules, 0, 'nor of the rule Alpha wrote for itself');

-- === The one thing a warning may do on its own ===============================
-- A blocker is still only a sentence until somebody writes an approval rule
-- about it. This is that rule, and what it does.
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.costing_facts(:'costing_id'::uuid) as quiet_facts \gset
select test.sign_in(:'master');
update public.compatibility_rules set severity = 'blocker'
 where rule_kind = 'device_depth_vs_cubicle' and company_id is null;
update public.components set depth_mm = 800 where id = :'incomer_device'::uuid;
update public.components
   set enclosure_layout = '{"usable_w_mm": 700, "usable_h_mm": 1800, "usable_d_mm": 600}'::jsonb
 where id = :'cubicle_id'::uuid;
select test.sign_in(:'alice');
insert into public.approval_rules (company_id, sort_order, name, condition, outcome)
values (:'alpha'::uuid, -20, 'Nothing that does not fit may be submitted',
        jsonb_build_array(jsonb_build_object('field', 'compatibility_blockers', 'op', '>', 'value', 0)),
        'block');
select test.sign_in(:'carol');
select app.costing_facts(:'costing_id'::uuid) as blocked_facts \gset
select test.refuses(format($$select app.submit_costing(%L)$$, :'costing_id'),
  'an approval rule can refuse a costing that does not physically fit',
  'Nothing that does not fit may be submitted');
select test.eq((select status from public.costings where id = :'costing_id'::uuid), 'draft',
  'and the costing stays a draft, which is what a blocker is for');
rollback;
select test.eq((:'quiet_facts'::jsonb ->> 'compatibility_blockers')::int, 0,
  'a board with nothing wrong offers the rules engine a count of zero');
select test.eq((:'blocked_facts'::jsonb ->> 'compatibility_blockers')::int, 1,
  'and a board that does not fit offers it a count of one');
select test.ok((:'blocked_facts'::jsonb ->> 'compatibility_warnings')::int >= 0,
  'beside the warnings, which no rule has to act on');

-- === Nothing moved ===========================================================
select test.eq((select coalesce(material_cost, 0) from public.v_costing_panel_costs
                 where costing_id = :'costing_id'::uuid), :material_before,
  'and after all of that the board costs exactly what it cost before');
select test.eq((select count(*)::int from public.v_panel_warnings where panel_id = :'panel_id'::uuid), 0,
  'with nothing left behind: every measurement this file made was rolled back');
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'and NPP-192 is where it has always been: 3,622,781.80');

-- Leave things as found.
delete from public.costings where id = :'costing_id'::uuid;
