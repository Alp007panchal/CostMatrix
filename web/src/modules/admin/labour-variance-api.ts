import { supabase } from '../../lib/supabase'
import type { KitGroupLabourVariance } from '../../lib/database.types'

/** The labour variance report and the one deliberate write it offers (roadmap 2.8). */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listKitGroupVariance(): Promise<KitGroupLabourVariance[]> {
  const { data, error } = await supabase.from('v_kit_group_labour_variance').select('*')
  fail('Could not load the labour variance', error)
  return (data ?? []) as KitGroupLabourVariance[]
}

/** Writes one kit group's standard hours. Only ever from a button somebody presses. */
export async function applyLabourSuggestion(kitGroupId: string, processType: string): Promise<number> {
  const { data, error } = await supabase.rpc('apply_labour_suggestion', {
    target_group: kitGroupId,
    process: processType,
  })
  fail('Could not apply the suggestion', error)
  return Number(data)
}
