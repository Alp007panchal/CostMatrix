import { supabase } from '../../lib/supabase'
import type {
  LayoutEnclosureApplied,
  LayoutFit,
  LayoutKit,
  LayoutPlan,
  LayoutSection,
} from '../../lib/database.types'

/**
 * The panel layout (roadmap 3.8, stage one). Every figure comes from the
 * database — the arrangement, the capacity and the verdict — so the drawing and
 * the costing can never disagree. Only `applyLayoutEnclosure` writes a line.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/** The kits on this panel, with what the library says about placing each one. */
export async function layoutKits(panelId: string): Promise<LayoutKit[]> {
  const { data, error } = await supabase
    .from('v_panel_layout_kits')
    .select(
      'costing_assembly_id, panel_id, name, quantity, assembly_id, mounting_design, module_height_mm, positions_per_plate, footprint_w_mm, rating, rating_unit, is_sized',
    )
    .eq('panel_id', panelId)
    .order('name')
  fail('Could not read the kits on this panel', error)
  return (data ?? []) as LayoutKit[]
}

/** The sections this board needs, and the rule that made each one. Writes nothing. */
export async function arrangePanel(panelId: string, construction: string): Promise<LayoutPlan> {
  const { data, error } = await supabase.rpc('arrange_panel', {
    target_panel: panelId,
    construction,
  })
  fail('Could not work the board out', error)
  return data as LayoutPlan
}

/** What is on each section against what it holds. */
export async function layoutFit(sections: LayoutSection[], construction: string): Promise<LayoutFit> {
  const { data, error } = await supabase.rpc('layout_fit', { sections, construction })
  fail('Could not judge the layout', error)
  return data as LayoutFit
}

/** Keeps the drawing as the next version. Moves no price. */
export async function saveLayout(
  panelId: string,
  sections: LayoutSection[],
  construction: string,
  note: string | null,
): Promise<{ version: number; fit: LayoutFit }> {
  const { data, error } = await supabase.rpc('save_panel_layout', {
    target_panel: panelId,
    sections,
    construction,
    note,
  })
  fail('Could not save the layout', error)
  return data as { version: number; fit: LayoutFit }
}

/** The layout already saved against this panel, if there is one. */
export async function savedLayout(
  panelId: string,
): Promise<{ sections: LayoutSection[]; construction_code: string | null; version: number } | null> {
  const { data, error } = await supabase
    .from('panel_layouts')
    .select('sections, construction_code, version')
    .eq('panel_id', panelId)
    .order('version', { ascending: false })
    .limit(1)
  fail('Could not read the saved layout', error)
  const row = (data ?? [])[0]
  return row === undefined
    ? null
    : (row as { sections: LayoutSection[]; construction_code: string | null; version: number })
}

/** Turns the saved sections into enclosure cubicle lines on the costing. */
export async function applyLayoutEnclosure(
  panelId: string,
  replaceExisting: boolean,
): Promise<LayoutEnclosureApplied> {
  const { data, error } = await supabase.rpc('apply_layout_enclosure', {
    target_panel: panelId,
    section: 'Enclosure',
    replace_existing: replaceExisting,
  })
  fail('Could not put the cubicles on the costing', error)
  return data as LayoutEnclosureApplied
}

/** The constructions a board can be built in, for the picker. */
export async function constructions(): Promise<{ code: string; name: string; height_mm: number | null }[]> {
  const { data, error } = await supabase
    .from('layout_constructions')
    .select('code, name, height_mm, widths_mm')
    .eq('is_active', true)
    .order('code')
  fail('Could not read the constructions', error)
  return (data ?? []).filter((row) => ((row as { widths_mm: number[] }).widths_mm ?? []).length > 0) as {
    code: string
    name: string
    height_mm: number | null
  }[]
}
