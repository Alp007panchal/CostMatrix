import { supabase } from '../../lib/supabase'
import type { EplanPart } from './eplan'

/**
 * Reading and writing the EPLAN side (roadmap 4.3). The metadata goes through the
 * database functions, so a costing that is no longer open for editing refuses the
 * change for the same reason everything else does.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/** Every frozen line of the costing, with its device tag where one exists. */
export async function eplanParts(costingId: string): Promise<EplanPart[]> {
  const { data, error } = await supabase
    .from('v_eplan_parts')
    .select(
      'costing_id, panel_id, panel, panel_quantity, section, kit, device_tag, part_number, manufacturer, description, code, category_code, quantity, unit, mounting_type, width_mm, height_mm, depth_mm, weight_kg',
    )
    .eq('costing_id', costingId)
    .order('panel')
    .order('device_tag', { nullsFirst: false })
  fail('Could not read the parts list', error)
  return (data ?? []) as EplanPart[]
}

/** The project name and drawing numbers on the costing. Draft only. */
export async function setEplanMetadata(
  costingId: string,
  project: string,
  drawings: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_eplan_metadata', {
    target: costingId,
    project,
    drawings,
  })
  fail('Could not save the project details', error)
}

export interface EplanImportReport {
  costing_id: string
  applied: boolean
  lines_read: number
  project: string | null
  drawings: string[]
  unmatched: { line: string; why: string }[]
  why: string
}

/** Reads a pasted EPLAN export. Proposes by default; writes only when asked. */
export async function importEplanMetadata(
  costingId: string,
  pasted: string,
  apply: boolean,
): Promise<EplanImportReport> {
  const { data, error } = await supabase.rpc('import_eplan_metadata', {
    target: costingId,
    pasted,
    apply,
  })
  fail('Could not read what you pasted', error)
  return data as EplanImportReport
}
