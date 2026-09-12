-- The APFC configurator (migration 0113, roadmap 3.2). Runs after 14, so the
-- step kits are the owner's own: 2.5, 5, 12.5, 25 and 50 kVAr, in a fuse family
-- and a breaker family.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq((select count(distinct rating)::int from public.v_apfc_kits where family = 'FUSE'), 5,
  'the library has five sizes of fuse-protected step kit');
select test.eq((select count(distinct rating)::int from public.v_apfc_kits where family = 'BREAKER'), 5,
  'and five breaker-protected');

select id as job from app.create_costing('APFC bank') \gset
insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'APFC PANEL', 1, 'PC') returning id as panel \gset

-- === The owner's own bank ===================================================
-- NPP-192 was 50×4, 25×4, 12.5×6, 5×5 — 400 kVAr. The seeded grading is that
-- bank's own shares, so a target of 400 gives it back exactly.
select app.propose_apfc(:'panel'::uuid, 400, 'FUSE') as proposal \gset

select test.eq((:'proposal'::jsonb->>'total_kvar')::numeric, 400.0,
  'a 400 kVAr target is met exactly');
select test.eq((:'proposal'::jsonb->>'shortfall_kvar')::numeric, 0.0, 'with nothing left over');
select test.eq((:'proposal'::jsonb->>'family'), 'FUSE', 'from the family asked for');
-- With no family given it takes the one with the most priced sizes, which is
-- the fuse family while the breaker kits hold unpriced parts.
select test.eq((app.propose_apfc(:'panel'::uuid, 100)->>'family'), 'FUSE',
  'and asking for no family in particular gives the one that can actually be costed');
select test.eq((select string_agg(format('%sx%s', s->>'rating', s->>'quantity'), ' ' order by (s->>'rating')::numeric desc)
                from jsonb_array_elements(:'proposal'::jsonb->'steps') as s),
               '50.00x4 25.00x4 12.50x6 5.00x5',
  'and it is the bank they actually built: 50×4, 25×4, 12.5×6, 5×5');
select test.ok((select bool_and(upper(s->>'name') like '%FUSE%')
                from jsonb_array_elements(:'proposal'::jsonb->'steps') as s),
  'every step is of the one family — a bank is never a mixture');

-- === A target the sizes cannot reach ========================================
select app.propose_apfc(:'panel'::uuid, 401, 'FUSE') as odd \gset
select test.eq((:'odd'::jsonb->>'total_kvar')::numeric, 400.0,
  'a target of 401 gets as close as the sizes allow');
select test.eq((:'odd'::jsonb->>'shortfall_kvar')::numeric, 1.0,
  'and the kVAr it is short by is named, not papered over');

-- === Small targets and the other family =====================================
select app.propose_apfc(:'panel'::uuid, 2.5, 'FUSE') as small \gset
select test.eq((:'small'::jsonb->>'total_kvar')::numeric, 2.5,
  'the smallest bank is one of the smallest kit');
select test.eq(jsonb_array_length(:'small'::jsonb->'steps'), 1, 'one kind of step, not five of nothing');

-- The owner's breaker kits every one hold an unpriced part (the eight on the
-- Components screen), so today the honest answer is to say so and why.
select test.refuses(format($$select app.propose_apfc(%L, 100, 'BREAKER')$$, :'panel'),
  'the breaker family says plainly that its kits have no price yet',
  'still holds a part with no price');
select test.eq((select count(*)::int from public.v_apfc_kits
                where family = 'BREAKER' and not has_unpriced_part), 0,
  'because that is true of every one of them until those parts are priced');

-- === A grading of the company's own =========================================
select app.propose_apfc(:'panel'::uuid, 400, 'FUSE', '100') as all_big \gset
select test.eq((select string_agg(format('%sx%s', s->>'rating', s->>'quantity'), ' ')
                from jsonb_array_elements(:'all_big'::jsonb->'steps') as s),
               '50.00x8',
  'a pattern of one share puts the lot in the largest size: eight fifties');
select test.refuses(format($$select app.propose_apfc(%L, 0)$$, :'panel'),
  'a bank needs a target', 'how many kVAr');

-- === Applying it ============================================================
select app.apply_apfc_steps(:'panel'::uuid, :'proposal'::jsonb->'steps') as applied \gset
select test.eq((:'applied'::jsonb->>'total_kvar')::numeric, 400.0, 'the bank applied comes to 400 kVAr');
select test.eq((:'applied'::jsonb->>'kinds')::int, 4, 'in four kinds of step');
select test.eq((select count(*)::int from public.costing_assemblies
                where panel_id = :'panel'::uuid and section = 'APFC bank'), 4,
  'the lines land in the panel''s APFC bank section');
select test.ok((select bool_and(kind = 'kit') from public.costing_assemblies
                where panel_id = :'panel'::uuid),
  'as ordinary kit lines, priced and frozen like any other');
select test.ok((select sum(i.quantity * i.unit_price) > 0 from public.costing_items i
                join public.costing_assemblies ca on ca.id = i.costing_assembly_id
                where ca.panel_id = :'panel'::uuid),
  'and they cost something, through the ordinary engine');
select test.ok((select count(*) > 0 from public.activity_log
                where entity_id = :'job'::uuid and action = 'apfc.applied'),
  'the activity log says a bank was applied, and by whom');

-- The kVAr the panel now holds is what was asked for (decision 4's total).
select test.eq((select sum(a.rating * ca.quantity) from public.costing_assemblies ca
                join public.assemblies a on a.id = ca.source_assembly_id
                where ca.panel_id = :'panel'::uuid and a.rating_unit = 'KVAR'),
               400.00, 'and the panel''s total kVAr is the target');

select test.refuses(format($$select app.apply_apfc_steps(%L, '[]'::jsonb)$$, :'panel'),
  'an empty bank is not applied', 'no steps to add');
select test.refuses(format($$select app.apply_apfc_steps(%L,
        '[{"assembly_id": "00000000-0000-0000-0000-0000000000ff", "quantity": 1}]'::jsonb)$$, :'panel'),
  'and neither is something that is not a step kit', 'not a step kit');
commit;

-- === Once approved, nothing is added ========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.submit_costing(:'job'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'job'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select test.refuses(format($$select app.apply_apfc_steps(%L,
        (select app.propose_apfc(%L, 50, 'FUSE') -> 'steps'))$$, :'panel', :'panel'),
  'an approved costing takes no more steps', 'not open for editing');
rollback;

-- === Another company =========================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');   -- Beta
select test.refuses(format($$select app.propose_apfc(%L, 400)$$, :'panel'),
  'another company cannot propose against a panel it cannot see', 'no such panel');
rollback;

delete from public.costings where id = :'job'::uuid;
