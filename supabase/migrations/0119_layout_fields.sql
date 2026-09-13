-- 0119  What the panel layout will need, so the library can be filled in now
--       (roadmap 3.8, `docs/reference/panel-layout-spec.md`).
--
-- The canvas itself is not built here and is not next: the owner's instruction is
-- fields now, drawing later, against the high-fidelity mockups. What this adds is
-- the data a layout cannot be drawn without — which kind of mounting a kit
-- belongs to, how much height it takes on a plate, how many go across one — and
-- the shape the layout is stored in, so nothing has to be migrated twice when the
-- canvas arrives.
--
-- Three decisions of the owner's, recorded as D-276 and built in here:
--   · SIVACON S4 is the default construction (`sivacon-s4-construction.md`);
--   · front- and rear-connection sections are both standard;
--   · double-front boards — Nationwide's own fabrication on an S4-style frame,
--     mainly KPLC meter boards — are standard too, so a section has two faces.
--   · module heights are decided by Nationwide and held on the kit, never derived.
--
-- **Nothing here changes a price.** New nullable columns, one reference table, and
-- a rename of a jsonb column nothing writes yet. NPP-192 is untouched.

-- ===========================================================================
-- 1. Which mounting design a kit belongs to
-- ===========================================================================
-- The six designs of the specification §3. An enum rather than free text because
-- the capacity rule per design is what the canvas will switch on, and a typo
-- would silently give a kit no rule at all.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mounting_design') then
    create type public.mounting_design as enum (
      'busbar_fed',          -- ACB, ATS pair, changeover, isolator: the device takes the section
      'mccb_plates',         -- MCCBs, one per cover, stacked down the device compartment
      'side_by_side_plates', -- MCBs, contactors, meters, terminals: devices across a plate
      'compensation',        -- APFC steps, with the kVAr limit per section
      'meter_board_plate',   -- the four plate types of a wall-mounted meter board
      'inline_3nj6'          -- in-line fuse-switch disconnectors, 50 mm rail pitch
    );
  end if;
end $$;

comment on type public.mounting_design is
  'How a kit is mounted, which decides the capacity rule the layout uses for it
   (panel-layout-spec.md §3). Null on a kit means nobody has said yet.';

alter table public.assemblies
  add column if not exists mounting_design public.mounting_design,
  add column if not exists module_height_mm integer,
  add column if not exists positions_per_plate integer;

-- The S4 cover heights are 150–800 mm in 50 mm steps (the Application Manual's
-- hinge table). The check keeps the grid without pinning the range, because a
-- board of our own fabrication may use a cover the manual does not list.
alter table public.assemblies
  drop constraint if exists assemblies_module_height_grid;
alter table public.assemblies
  add constraint assemblies_module_height_grid check (
    module_height_mm is null or (module_height_mm > 0 and module_height_mm % 50 = 0));

alter table public.assemblies
  drop constraint if exists assemblies_positions_per_plate_positive;
alter table public.assemblies
  add constraint assemblies_positions_per_plate_positive check (
    positions_per_plate is null or positions_per_plate > 0);

comment on column public.assemblies.mounting_design is
  'Which mounting design this kit belongs to, and so which capacity rule the
   layout applies to it. Null = not decided yet; the layout will place such a kit
   as unsized and refuse to call the section a fit.';
comment on column public.assemblies.module_height_mm is
  'The height this kit takes on the stack, in millimetres on the 50 mm grid — the
   S4 cover height for an MCCB, the compartment a busbar-fed device occupies.
   Decided by us and held here (D-276), never derived from the device.';
comment on column public.assemblies.positions_per_plate is
  'For a side-by-side design, how many of this kit fit across one plate, when the
   answer is not simply the plate width divided by the device width.';

-- ===========================================================================
-- 2. The constructions, and the widths and depths each offers
-- ===========================================================================
-- Admin-maintained lists rather than numbers in code: S4 comes from the Siemens
-- manual, the double-front frame is Nationwide's own and only they know it.

create table if not exists public.layout_constructions (
  id                  uuid primary key default gen_random_uuid(),
  -- Null = the master list every company starts from; a row with a company is
  -- that company's own, and wins over the master row of the same code.
  company_id          uuid references public.companies(id) on delete cascade,
  code                text not null check (btrim(code) <> ''),
  name                text not null check (btrim(name) <> ''),
  -- Whether sections of this construction can carry a second face (§2.1).
  allows_double_front boolean not null default false,
  widths_mm           integer[] not null default '{}',
  -- Depths differ by where the main busbar runs, so both lists are held.
  depths_busbar_top_mm  integer[] not null default '{}',
  depths_busbar_rear_mm integer[] not null default '{}',
  height_mm           integer check (height_mm is null or height_mm > 0),
  base_heights_mm     integer[] not null default '{}',
  forms               text[] not null default '{}',
  -- The grid module heights sit on, and the heights the construction allows.
  module_height_step_mm integer check (module_height_step_mm is null or module_height_step_mm > 0),
  module_heights_mm   integer[] not null default '{}',
  -- kVAr a compensation section of this construction may hold (spec §3).
  kvar_per_section    numeric(10,2) check (kvar_per_section is null or kvar_per_section > 0),
  source              text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid,
  unique (company_id, code)
);

create unique index if not exists layout_constructions_master_code
  on public.layout_constructions (code) where company_id is null;

select app.add_audit_triggers('public.layout_constructions');

comment on table public.layout_constructions is
  'The free-standing constructions a board can be built in, and the widths,
   depths, forms and module heights each offers. S4 is seeded from the Siemens
   Application Manual; the rest are Nationwide''s to fill in. Admin-maintained:
   the layout reads these lists rather than holding numbers in code (D-276).';

alter table public.layout_constructions enable row level security;
drop policy if exists layout_constructions_read on public.layout_constructions;
create policy layout_constructions_read on public.layout_constructions for select
  to authenticated
  using (company_id is null or company_id = app.current_company_id() or app.is_master_admin());
drop policy if exists layout_constructions_write_master on public.layout_constructions;
create policy layout_constructions_write_master on public.layout_constructions for all
  to authenticated
  using (company_id is null and app.is_master_admin())
  with check (company_id is null and app.is_master_admin());
drop policy if exists layout_constructions_write_own on public.layout_constructions;
create policy layout_constructions_write_own on public.layout_constructions for all
  to authenticated
  using (company_id = app.current_company_id() and app.has_role('company_admin'))
  with check (company_id = app.current_company_id() and app.has_role('company_admin'));
grant select, insert, update, delete on public.layout_constructions to authenticated;

-- S4, from `docs/reference/sivacon-s4-construction.md` §1 — the manual's own
-- figures, nothing inferred. The others are named so the list is complete and
-- left empty: their figures are the owner's, and inventing them would be worse
-- than an empty row that says so.
insert into public.layout_constructions
  (company_id, code, name, allows_double_front, widths_mm,
   depths_busbar_top_mm, depths_busbar_rear_mm, height_mm, base_heights_mm, forms,
   module_height_step_mm, module_heights_mm, source)
values
  (null, 'S4', 'Siemens SIVACON S4', false,
   '{400,600,800,1000,1200}', '{400,600,800}', '{800,1000,1200}', 2000, '{100,200}',
   '{1,2b,3b,4b}', 50, '{150,200,250,300,350,400,450,500,550,600,650,800}',
   'SIVACON S4 Application Manual 03/2025, via docs/reference/sivacon-s4-construction.md'),
  (null, 'S8', 'Siemens SIVACON S8', false,
   '{}', '{}', '{}', null, '{}', '{}', 50, '{}',
   'to be filled from the S8 manual'),
  (null, 'meter_board', 'Wall-mounted meter board', false,
   '{}', '{}', '{}', null, '{}', '{}', null, '{}',
   'boxes come from the catalogue; the plate types are in panel-layout-spec.md §3'),
  (null, 'custom_double_front', 'Double-front board, our own fabrication', true,
   '{}', '{}', '{}', null, '{}', '{}', 50, '{}',
   'Nationwide''s own frame — widths, depths and heights to be filled in')
on conflict do nothing;

-- ===========================================================================
-- 3. A section, not a cubicle, and a section has faces
-- ===========================================================================
-- 0106 called the list `cubicles` and gave each one a flat list of placements.
-- A double-front board breaks that: one section carries two device compartments
-- back to back, each with its own mounting design and its own stack (§2.1). So
-- the column is renamed and the shape documented before anything writes it —
-- nothing does yet, which is exactly why now is the cheap moment.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'panel_layouts'
                and column_name = 'cubicles')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'panel_layouts'
                and column_name = 'sections') then
    alter table public.panel_layouts rename column cubicles to sections;
  end if;
end $$;

comment on column public.panel_layouts.sections is
  'The sections of this panel, in order, each
   {name, width_mm, depth_mm, access: single_front|double_front, form,
    busbar_compartment_mm, faces: [{side: front|rear, connection: front|rear,
    design, plates: [...]}]}.
   A placement names the face it sits on:
   {costing_assembly_id, face, plate_index, position, x_mm, y_mm, w_mm, h_mm}.
   A single-front section has one face, side front. Renamed from `cubicles` in
   0119 because a double-front board is one section with two faces, not two
   cubicles (panel-layout-spec.md §2.1).';

-- A layout says which construction it was drawn in, so the widths it used can be
-- checked against the list that was in force.
alter table public.panel_layouts
  add column if not exists construction_code text;

comment on column public.panel_layouts.construction_code is
  'The construction this layout was drawn in — a `layout_constructions.code`,
   S4 unless somebody says otherwise. Null on the rows that predate 0119, of
   which there are none, because nothing writes layouts yet.';

-- ===========================================================================
-- 4. Filling the kit library in bulk
-- ===========================================================================
-- The F12 footprints have only ever been fillable one kit at a time on the kit
-- form; the three fields above would have the same problem. One row per kit,
-- the same preview-then-apply shape as `import_dimensions`, and the same rule:
-- a blank cell is "not done yet", never "set it to nothing".

create or replace function app.import_kit_layout(rows jsonb, to_company uuid, apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_key uuid := coalesce(to_company, '00000000-0000-0000-0000-000000000000'::uuid);
  r record;
  cur public.assemblies;
  n_changed int := 0; n_same int := 0; n_blank int := 0;
  rejected jsonb := '[]'; changes jsonb := '[]';
  kit_name text; design text; height numeric; positions numeric;
  fp_w numeric; fp_h numeric; fp_d numeric;
  diffs jsonb;
begin
  perform app.assert_may_import(to_company);

  for r in
    select e.elem ->> 'kitName' as kit_name,
           e.elem ->> 'mountingDesign' as mounting_design,
           e.elem ->> 'moduleHeightMm' as module_height,
           e.elem ->> 'positionsPerPlate' as positions,
           e.elem ->> 'footprintWMm' as fp_w,
           e.elem ->> 'footprintHMm' as fp_h,
           e.elem ->> 'footprintDMm' as fp_d,
           e.row_no + 1 as line
    from jsonb_array_elements(rows) with ordinality as e(elem, row_no)
  loop
    kit_name  := btrim(coalesce(r.kit_name, ''));
    design    := nullif(lower(btrim(coalesce(r.mounting_design, ''))), '');
    height    := app.parse_numeric(r.module_height);
    positions := app.parse_numeric(r.positions);
    fp_w := app.parse_numeric(r.fp_w); fp_h := app.parse_numeric(r.fp_h); fp_d := app.parse_numeric(r.fp_d);

    if kit_name = '' then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', '', 'reason', 'kitName is blank');
      continue;
    end if;
    if design is not null and design not in
       ('busbar_fed','mccb_plates','side_by_side_plates','compensation','meter_board_plate','inline_3nj6') then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', kit_name,
        'reason', format('mountingDesign "%s" is not one of busbar_fed, mccb_plates, side_by_side_plates, compensation, meter_board_plate, inline_3nj6', design));
      continue;
    end if;
    if height is not null and (height <= 0 or height::integer % 50 <> 0) then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', kit_name,
        'reason', format('moduleHeightMm %s is not a whole number of 50 mm steps', r.module_height));
      continue;
    end if;
    if positions is not null and positions <= 0 then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', kit_name,
        'reason', 'positionsPerPlate must be more than zero');
      continue;
    end if;

    select * into cur from public.assemblies
    where coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid) = owner_key
      and upper(assemblies.name) = upper(kit_name);
    if cur.id is null then
      rejected := rejected || jsonb_build_object('row', r.line, 'key', kit_name,
        'reason', 'no kit with that name in this library');
      continue;
    end if;

    if design is null and height is null and positions is null
       and fp_w is null and fp_h is null and fp_d is null then
      n_blank := n_blank + 1;
      continue;
    end if;

    diffs := '[]'::jsonb;
    if design is not null and cur.mounting_design::text is distinct from design then
      diffs := diffs || jsonb_build_object('field', 'mounting design', 'from', cur.mounting_design::text, 'to', design);
    end if;
    if height is not null and cur.module_height_mm is distinct from height::integer then
      diffs := diffs || jsonb_build_object('field', 'module height', 'from', cur.module_height_mm, 'to', height::integer);
    end if;
    if positions is not null and cur.positions_per_plate is distinct from positions::integer then
      diffs := diffs || jsonb_build_object('field', 'positions per plate', 'from', cur.positions_per_plate, 'to', positions::integer);
    end if;
    if fp_w is not null and cur.footprint_w_mm is distinct from fp_w then
      diffs := diffs || jsonb_build_object('field', 'footprint width', 'from', cur.footprint_w_mm, 'to', fp_w);
    end if;
    if fp_h is not null and cur.footprint_h_mm is distinct from fp_h then
      diffs := diffs || jsonb_build_object('field', 'footprint height', 'from', cur.footprint_h_mm, 'to', fp_h);
    end if;
    if fp_d is not null and cur.footprint_d_mm is distinct from fp_d then
      diffs := diffs || jsonb_build_object('field', 'footprint depth', 'from', cur.footprint_d_mm, 'to', fp_d);
    end if;

    if jsonb_array_length(diffs) = 0 then
      n_same := n_same + 1;
      continue;
    end if;

    n_changed := n_changed + 1;
    if jsonb_array_length(changes) < 200 then
      changes := changes || jsonb_build_object('key', cur.name, 'changes', diffs);
    end if;

    if apply then
      update public.assemblies set
        mounting_design     = coalesce(design::public.mounting_design, mounting_design),
        module_height_mm    = coalesce(height::integer, module_height_mm),
        positions_per_plate = coalesce(positions::integer, positions_per_plate),
        footprint_w_mm      = coalesce(fp_w, footprint_w_mm),
        footprint_h_mm      = coalesce(fp_h, footprint_h_mm),
        footprint_d_mm      = coalesce(fp_d, footprint_d_mm)
      where id = cur.id;
    end if;
  end loop;

  return jsonb_build_object(
    'applied', apply,
    'changed', n_changed,
    'unchanged', n_same,
    'blank', n_blank,
    'rejected', rejected,
    'changes', changes);
end;
$$;

comment on function app.import_kit_layout(jsonb, uuid, boolean) is
  'Reads data/seed/kit-layout-template.csv: one row per kit with its mounting
   design, module height, positions per plate and F12 footprint. Previews, then
   applies. A blank cell is left alone — the file is filled in over time — and a
   kit name the library does not hold is rejected by name rather than created.';

create or replace function public.import_kit_layout(rows jsonb, to_company uuid, apply boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$ begin return app.import_kit_layout(rows, to_company, apply); end $$;

grant execute on function app.import_kit_layout(jsonb, uuid, boolean)    to authenticated;
grant execute on function public.import_kit_layout(jsonb, uuid, boolean) to authenticated;

-- ===========================================================================
-- 5. The kit list carries the new fields
-- ===========================================================================
-- Re-derived from the 0011 text by insertion: three columns appended, nothing
-- else touched, so every existing reader is unaffected.

create or replace view public.v_kits
with (security_invoker = true)
as
select
  a.id, a.company_id, a.code, a.name, a.description, a.is_active,
  a.kit_group_id, g.name as group_name, a.rating, a.rating_unit, a.poles,
  md.code as main_device_code, md.name as main_device_name,
  exists (select 1 from public.assembly_components x
          join public.v_component_prices p on p.id = x.component_id
          where x.assembly_id = a.id and p.unit_price is null) as has_unpriced_part,
  (select count(*) from public.assembly_components x where x.assembly_id = a.id) as line_count,
  a.mounting_design,
  a.module_height_mm,
  a.positions_per_plate
from public.assemblies a
left join public.kit_groups g on g.id = a.kit_group_id
left join lateral (
  select c.code, c.name from public.assembly_components x
  join public.components c on c.id = x.component_id
  where x.assembly_id = a.id and x.is_main_device limit 1
) md on true;

grant select on public.v_kits to authenticated;

revoke execute on all functions in schema public from anon;
