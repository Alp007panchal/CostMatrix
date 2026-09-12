import { supabase } from '../../lib/supabase'
import type {
  BusbarApplied,
  BusbarBar,
  BusbarCheckRow,
  BusbarRun,
  BusbarStart,
  BusbarTotals,
} from '../../lib/database.types'

/**
 * The busbar run calculator (roadmap 4.1) — the owner's own CU-OPT1 sheet.
 *
 * The arithmetic lives in the database, not here, so the figure on the screen is
 * the figure the costing would be given. This file only carries it back and
 * forth. Nothing here prices anything: applying a schedule adds ordinary
 * component lines through the ordinary function.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

/** The copper bar sizes a run can be cut from, largest first. */
export async function busbarBars(): Promise<BusbarBar[]> {
  const { data, error } = await supabase
    .from('v_busbar_bars')
    .select('id, code, width_mm, thickness_mm, area_mm2, kg_per_metre, price_per_metre, is_priced')
    .order('area_mm2', { ascending: false })
  fail('Could not read the bar sizes', error)
  return (data ?? []) as BusbarBar[]
}

/** The schedule already saved against a panel, a run a row (v_panel_busbar_runs). */
export async function panelBusbarRuns(panelId: string): Promise<BusbarRun[]> {
  const { data, error } = await supabase
    .from('v_panel_busbar_runs')
    .select('label, bar_code, phases, runs_per_phase, length_m, sets, metres')
    .eq('panel_id', panelId)
    .order('sort_order')
  fail('Could not read the run schedule', error)
  return (data ?? []) as BusbarRun[]
}

/** The runs a board like this one needs, for the engineer to correct. Writes nothing. */
export async function startingBusbarRuns(panelId: string): Promise<BusbarStart> {
  const { data, error } = await supabase.rpc('starting_busbar_runs', { target_panel: panelId })
  fail('Could not work out a starting schedule', error)
  return data as BusbarStart
}

/** The CU-OPT1 arithmetic, from the database so the screen and the costing agree. */
export async function busbarRunTotals(runs: BusbarRun[]): Promise<BusbarTotals> {
  const { data, error } = await supabase.rpc('busbar_run_totals', { runs })
  fail('Could not add the runs up', error)
  return data as BusbarTotals
}

/** Keeps the schedule with the panel. Moves no price. */
export async function saveBusbarRuns(panelId: string, runs: BusbarRun[]): Promise<BusbarTotals> {
  const { data, error } = await supabase.rpc('save_busbar_runs', { target_panel: panelId, runs })
  fail('Could not save the run schedule', error)
  return data as BusbarTotals
}

/** Adds one busbar line per size at the metres worked out. */
export async function applyBusbarRuns(
  panelId: string,
  replaceExisting: boolean,
): Promise<BusbarApplied> {
  const { data, error } = await supabase.rpc('apply_busbar_runs', {
    target_panel: panelId,
    section: 'Busbar',
    replace_existing: replaceExisting,
  })
  fail('Could not add the busbar lines', error)
  return data as BusbarApplied
}

/** What the schedule asks for against what the panel is costed at. */
export async function panelBusbarCheck(panelId: string): Promise<BusbarCheckRow[]> {
  const { data, error } = await supabase
    .from('v_panel_busbar_check')
    .select('panel_id, bar_code, scheduled_m, costed_m, difference_m, kg_per_metre, scheduled_kg')
    .eq('panel_id', panelId)
  fail('Could not compare the runs with the costing', error)
  return (data ?? []) as BusbarCheckRow[]
}
