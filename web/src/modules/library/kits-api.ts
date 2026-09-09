import { supabase } from '../../lib/supabase'
import type { KitGroup, KitGroupHours } from '../../lib/database.types'
import { fail } from './api'

/**
 * Kit groups and the main device of a kit (migration 0009). A kit group is a
 * family of kits — ACB, MCCB, ATS, APFC BANK — that share labour hours per
 * process type; a kit may override one process type at a time on its own row.
 */

export async function listKitGroups(): Promise<KitGroup[]> {
  const { data, error } = await supabase.from('kit_groups').select('*').order('sort_order').order('name')
  fail('Could not load kit groups', error)
  return (data ?? []) as KitGroup[]
}

export async function createKitGroup(input: {
  company_id: string | null
  name: string
  description: string | null
}): Promise<KitGroup> {
  const { data, error } = await supabase.from('kit_groups').insert(input).select().single()
  fail('Could not add the kit group', error)
  return data as KitGroup
}

export async function updateKitGroup(
  id: string,
  input: { name: string; description: string | null },
): Promise<void> {
  const { error } = await supabase.from('kit_groups').update(input).eq('id', id)
  fail('Could not save the kit group', error)
}

/** Every group's hours in one read; the page is small enough for that. */
export async function listAllKitGroupHours(): Promise<KitGroupHours[]> {
  const { data, error } = await supabase.from('kit_group_labour').select('*')
  fail('Could not load kit group hours', error)
  return (data ?? []) as KitGroupHours[]
}

export async function setKitGroupHours(
  kitGroupId: string,
  processType: string,
  hours: number,
): Promise<void> {
  const { error } = await supabase
    .from('kit_group_labour')
    .upsert(
      { kit_group_id: kitGroupId, process_type: processType, hours },
      { onConflict: 'kit_group_id,process_type' },
    )
  fail('Could not save the hours', error)
}

/**
 * Marks one line as the kit's main device. The database allows at most one,
 * so the old flag is cleared first; both writes are small and the second
 * failing leaves a kit with no main device, which the screen shows plainly.
 */
export async function setMainDevice(assemblyId: string, lineId: string): Promise<void> {
  const clear = await supabase
    .from('assembly_components')
    .update({ is_main_device: false })
    .eq('assembly_id', assemblyId)
    .eq('is_main_device', true)
  fail('Could not change the main device', clear.error)
  const set = await supabase.from('assembly_components').update({ is_main_device: true }).eq('id', lineId)
  fail('Could not change the main device', set.error)
}
