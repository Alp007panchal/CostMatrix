import { supabase } from '../../lib/supabase'
import type { KitGroup, KitGroupHours, KitParameter } from '../../lib/database.types'
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

// --- parameterised kits (roadmap 3.3) ----------------------------------------

/**
 * What a kit asks for before it can be added. The database decides who may
 * change these — master rows for the master administrator, a company's own for
 * its administrator — so this only asks.
 */
export async function listKitParameters(assemblyId: string): Promise<KitParameter[]> {
  const { data, error } = await supabase
    .from('kit_parameters')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order')
  fail('Could not load the kit parameters', error)
  return (data ?? []) as KitParameter[]
}

export async function addKitParameter(input: {
  assembly_id: string
  name: string
  unit: string | null
  default_value: string | null
  min_value: number | null
  max_value: number | null
  sort_order: number
}): Promise<void> {
  const { error } = await supabase.from('kit_parameters').insert({ ...input, value_type: 'number' })
  fail('Could not add the parameter', error)
}

export async function updateKitParameter(
  id: string,
  changes: Partial<Pick<KitParameter, 'name' | 'unit' | 'default_value' | 'min_value' | 'max_value' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('kit_parameters').update(changes).eq('id', id)
  fail('Could not save the parameter', error)
}

export async function removeKitParameter(id: string): Promise<void> {
  const { error } = await supabase.from('kit_parameters').delete().eq('id', id)
  fail('Could not remove the parameter', error)
}

/** The formula for one line's quantity; null or blank means the fixed quantity. */
export async function setLineFormula(lineId: string, formula: string | null): Promise<void> {
  const { error } = await supabase
    .from('assembly_components')
    .update({ qty_expression: formula && formula.trim() !== '' ? formula.trim() : null })
    .eq('id', lineId)
  fail('Could not save the formula', error)
}

/** What the kit would be added with: the answers over its defaults, checked. */
export async function kitParameterValues(
  assemblyId: string,
  given: Record<string, string>,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('kit_parameter_values', {
    source_assembly: assemblyId,
    given,
  })
  fail('Could not work out the kit parameters', error)
  return (data ?? {}) as Record<string, string>
}
