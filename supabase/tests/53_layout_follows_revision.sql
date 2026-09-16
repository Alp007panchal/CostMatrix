-- Does a revision keep the panel drawing? (migration 0132)
--
-- The fault: `create_costing_revision` copied panels but never `panel_layouts`,
-- so a revised costing started undrawn and `pdf/ga.ts` — which gives a panel
-- with no saved layout no sheet — dropped Annexure V from the quotation without
-- a word.
--
-- The thing actually worth testing is not that a row appears. It is that the
-- ids INSIDE the drawing point at the revision's own kit lines. A layout's
-- `sections` jsonb carries a `costing_assembly_id` per placement, and a
-- revision's kit lines are new rows, so a copy that clones the jsonb unchanged
-- produces a drawing that renders perfectly and is wired to nothing: the editor
-- reads "0 of N placed" against every kit. That is the assertion below marked
-- THE ONE THAT MATTERS, and it is the one a naive copy fails.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

-- The layout feature itself has to be on for anything to be drawn at all; the
-- new switch is separate and starts off, which is the first thing asserted.
select test.feature(:'alpha'::uuid, 'panel_layout', true);

-- Kits of its own rather than test 44's, so this file does not depend on the
-- order the suite happens to run in. Two module heights, so the arrangement has
-- something real to place.
select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.assemblies (id, company_id, code, name, mounting_design, module_height_mm, footprint_w_mm)
values ('00000000-0000-0000-0000-0000000053a1', null, 'REV-ACB', 'REVISION ACB KIT', 'busbar_fed', 1200, 700),
       ('00000000-0000-0000-0000-0000000053a2', null, 'REV-M400', 'REVISION MCCB 400', 'mccb_plates', 250, null);
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
select id, :'part_id'::uuid, 1, true from public.assemblies
 where id in ('00000000-0000-0000-0000-0000000053a1', '00000000-0000-0000-0000-0000000053a2');

-- ---------------------------------------------------------------------------
-- A drawn, approved costing: two panels, only one of them drawn.
-- ---------------------------------------------------------------------------
-- The kits are test 44's, which carry known module heights; the owner's library
-- has none, and what is under test here is the copying, not his figures.
--
-- `test.sign_in` sets a transaction-local claim, so each signed-in stretch is
-- its own begin/commit, as everywhere else in the suite.

begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as job from app.create_costing('Revision keeps the drawing') \gset

insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'DRAWN PANEL', 1, 'PC') returning id as drawn \gset

insert into public.costing_panels (costing_id, company_id, name, quantity, uom)
values (:'job'::uuid, :'alpha'::uuid, 'UNDRAWN PANEL', 1, 'PC') returning id as undrawn \gset

select app.add_assembly_to_costing(:'drawn'::uuid, '00000000-0000-0000-0000-0000000053a1'::uuid, 1);
select app.add_assembly_to_costing(:'drawn'::uuid, '00000000-0000-0000-0000-0000000053a2'::uuid, 2);
select app.add_assembly_to_costing(:'undrawn'::uuid, '00000000-0000-0000-0000-0000000053a1'::uuid, 1);

select app.arrange_panel(:'drawn'::uuid, 'S4') as plan \gset
select app.save_panel_layout(:'drawn'::uuid, :'plan'::jsonb -> 'sections', 'S4', 'first pass');
-- A second version, so the copy has to choose the latest rather than the first.
select app.save_panel_layout(:'drawn'::uuid, :'plan'::jsonb -> 'sections', 'S4', 'the one to carry');

select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'drawn'::uuid), 2,
  'the drawn panel has two saved versions of its layout');

select app.submit_costing(:'job'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');          -- the approver
select app.approve_costing(:'job'::uuid);
commit;

-- ---------------------------------------------------------------------------
-- Switched off: exactly what shipped. A revision starts undrawn.
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.eq(app.feature_on('layout_follows_revision', :'alpha'::uuid)::text, 'false',
  'the new switch is off until somebody turns it on');

select id as rev_off from app.create_costing_revision(:'job'::uuid) \gset

select test.eq((select count(*)::int
                  from public.panel_layouts pl
                  join public.costing_panels p on p.id = pl.panel_id
                 where p.costing_id = :'rev_off'::uuid), 0,
  'off, a revision carries no drawing at all — not an empty one');

select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'drawn'::uuid), 2,
  'and the original costing''s drawing is untouched');

-- Draw this revision's panel, so the next revision has something to carry. Its
-- kit lines are this revision's, which is the whole point of what follows.
select id as rev_drawn from public.costing_panels
 where costing_id = :'rev_off'::uuid and name = 'DRAWN PANEL' \gset

select app.arrange_panel(:'rev_drawn'::uuid, 'S4') as plan2 \gset
select app.save_panel_layout(:'rev_drawn'::uuid, :'plan2'::jsonb -> 'sections', 'S4', 'carried');

select app.submit_costing(:'rev_off'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'rev_off'::uuid);
commit;

-- ---------------------------------------------------------------------------
-- Switched on.
-- ---------------------------------------------------------------------------

select test.feature(:'alpha'::uuid, 'layout_follows_revision', true);

begin;
set local role authenticated;
select test.sign_in(:'carol');

select id as rev_on from app.create_costing_revision(:'rev_off'::uuid) \gset

select id as on_drawn from public.costing_panels
 where costing_id = :'rev_on'::uuid and name = 'DRAWN PANEL' \gset
select id as on_undrawn from public.costing_panels
 where costing_id = :'rev_on'::uuid and name = 'UNDRAWN PANEL' \gset

select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'on_drawn'::uuid), 1,
  'on, the drawn panel comes across with one version');

select test.eq((select version::int from public.panel_layouts where panel_id = :'on_drawn'::uuid), 1,
  'numbered 1 on the new panel, whatever version it was on the old one');

select test.eq((select note from public.panel_layouts where panel_id = :'on_drawn'::uuid), 'carried',
  'and it is the LATEST version that came across, not the first');

select test.eq((select count(*)::int from public.panel_layouts where panel_id = :'on_undrawn'::uuid), 0,
  'a panel nobody drew stays undrawn');

select test.ok((select jsonb_array_length(sections) > 0 from public.panel_layouts
                 where panel_id = :'on_drawn'::uuid),
  'the carried drawing has its sections, not an empty list');

-- ---------------------------------------------------------------------------
-- THE ONE THAT MATTERS: every id inside the drawing is a kit line of THIS
-- revision. A copy that clones the jsonb unchanged passes every assertion above
-- and fails these two.
-- ---------------------------------------------------------------------------

create temporary table placed_ids on commit drop as
select (p ->> 'costing_assembly_id')::uuid as id
  from public.panel_layouts pl,
       jsonb_array_elements(pl.sections)            as section,
       jsonb_array_elements(section -> 'faces')     as face,
       jsonb_array_elements(face -> 'placements')   as p
 where pl.panel_id = :'on_drawn'::uuid;

select test.ok((select count(*) > 0 from placed_ids),
  'the carried drawing places devices at all');

select test.eq((select count(*)::int from placed_ids
                 where id not in (select id from public.costing_assemblies
                                   where costing_id = :'rev_on'::uuid)), 0,
  'every device in the carried drawing points at a kit line of THIS revision');

select test.eq((select count(*)::int from placed_ids
                 where id in (select id from public.costing_assemblies
                               where costing_id = :'rev_off'::uuid)), 0,
  'and none of them still points at the revision it was copied from');
commit;

-- ---------------------------------------------------------------------------
-- Isolation, and the figure that must never move.
-- ---------------------------------------------------------------------------

begin;
set local role authenticated;
select test.sign_in(:'bob');            -- Beta
select test.eq((select count(*)::int from public.panel_layouts
                 where panel_id in (:'on_drawn'::uuid, :'drawn'::uuid)), 0,
  'another company sees neither the drawing nor the one it was copied from');
commit;

select test.feature(:'alpha'::uuid, 'layout_follows_revision', false);

select test.eq((select round(sum(material_cost), 2) from public.v_costing_panel_costs c
                  join public.costings j on j.id = c.costing_id
                 where j.title = 'NPP-192 Option 1, from the seed'),
               3622781.80,
  'NPP-192 is where it has always been: 3,622,781.80');
