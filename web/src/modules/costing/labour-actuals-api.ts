import { supabase } from '../../lib/supabase'
import type { LabourActual, PanelLabourVariance } from '../../lib/database.types'

/**
 * Hours actually worked (roadmap 2.8). Nothing here touches a costing: the hours
 * it froze are what it was priced on, and these are a separate record made after
 * the boards were built.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listLabourVariance(costingId: string): Promise<PanelLabourVariance[]> {
  const { data, error } = await supabase
    .from('v_panel_labour_variance')
    .select('*')
    .eq('costing_id', costingId)
    .order('sort_order')
  fail('Could not load the hours', error)
  return (data ?? []) as PanelLabourVariance[]
}

export async function listActualEntries(costingId: string): Promise<LabourActual[]> {
  const { data, error } = await supabase
    .from('labour_actuals')
    .select('*')
    .eq('costing_id', costingId)
    .order('recorded_at', { ascending: false })
  fail('Could not load the entries', error)
  return (data ?? []) as LabourActual[]
}

export async function recordActualHours(input: {
  panelId: string
  processType: string
  hours: number
  note: string | null
}): Promise<void> {
  const { error } = await supabase.rpc('record_actual_hours', {
    panel: input.panelId,
    process: input.processType,
    worked: input.hours,
    note: input.note,
  })
  fail('Could not record the hours', error)
}

export async function removeActualHours(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_actual_hours', { entry: id })
  fail('Could not remove the entry', error)
}
