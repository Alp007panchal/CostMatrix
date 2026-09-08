import { supabase } from '../../lib/supabase'
import type {
  Assembly,
  AssemblyComponentRow,
  AssemblyHours,
  Component,
  ComponentCategory,
  ComponentPrice,
  EffectiveMaterialRate,
  LabourRate,
  MaterialRate,
  PriceHistoryRow,
  ProcessType,
} from '../../lib/database.types'

/**
 * The component and assembly library.
 *
 * Prices are read from v_component_prices, never from the components table:
 * the view applies the company's discount, converts out of KES and works out
 * what a busbar costs from its weight. Writing goes to the table.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

export async function listCategories(): Promise<ComponentCategory[]> {
  const { data, error } = await supabase
    .from('component_categories')
    .select('*')
    .order('sort_order')
  fail('Could not load categories', error)
  return (data ?? []) as ComponentCategory[]
}

export async function listProcessTypes(): Promise<ProcessType[]> {
  const { data, error } = await supabase.from('process_types').select('*').order('sort_order')
  fail('Could not load process types', error)
  return (data ?? []) as ProcessType[]
}

/** Every component this company may use, priced as it would pay. */
export async function listComponentPrices(): Promise<ComponentPrice[]> {
  const { data, error } = await supabase
    .from('v_component_prices')
    .select('*')
    .order('category_code')
    .order('code')
  fail('Could not load components', error)
  return (data ?? []) as ComponentPrice[]
}

export type ComponentInput = Pick<
  Component,
  | 'category_code'
  | 'code'
  | 'name'
  | 'description'
  | 'unit'
  | 'manufacturer'
  | 'part_number'
  | 'pricing_mode'
  | 'unit_price'
  | 'weight_per_unit'
  | 'material_rate_code'
> & { company_id: string | null }

export async function createComponent(input: ComponentInput): Promise<void> {
  const { error } = await supabase.from('components').insert(cleanForMode(input))
  fail('Could not add the component', error)
}

export async function updateComponent(id: string, input: ComponentInput): Promise<void> {
  const { error } = await supabase.from('components').update(cleanForMode(input)).eq('id', id)
  fail('Could not save the component', error)
}

export async function setComponentActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('components').update({ is_active: isActive }).eq('id', id)
  fail('Could not change the component', error)
}

/**
 * The database refuses a row that carries fields from both pricing modes, so
 * blank the ones that do not belong rather than passing empty strings through.
 */
function cleanForMode(input: ComponentInput): ComponentInput {
  return input.pricing_mode === 'fixed'
    ? { ...input, weight_per_unit: null, material_rate_code: null }
    : { ...input, unit_price: null }
}

export async function listPriceHistory(componentId: string): Promise<PriceHistoryRow[]> {
  const { data, error } = await supabase
    .from('component_price_history')
    .select('*')
    .eq('component_id', componentId)
    .order('changed_at', { ascending: false })
    .limit(50)
  fail('Could not load the price history', error)
  return (data ?? []) as PriceHistoryRow[]
}

// --- rates -----------------------------------------------------------------

/** Raw rows: master rows have company_id null, the company's own have its id. */
export async function listLabourRates(): Promise<LabourRate[]> {
  const { data, error } = await supabase.from('labour_rates').select('*')
  fail('Could not load labour rates', error)
  return (data ?? []) as LabourRate[]
}

export async function setLabourRate(
  companyId: string,
  processType: string,
  hourlyRate: number,
): Promise<void> {
  const { error } = await supabase
    .from('labour_rates')
    .upsert(
      { company_id: companyId, process_type: processType, hourly_rate: hourlyRate },
      { onConflict: 'company_id,process_type' },
    )
  fail('Could not save the rate', error)
}

export async function listMaterialRates(): Promise<MaterialRate[]> {
  const { data, error } = await supabase.from('material_rates').select('*').order('code')
  fail('Could not load material rates', error)
  return (data ?? []) as MaterialRate[]
}

/** What this company actually pays per kilogram, its own rate or the master. */
export async function listEffectiveMaterialRates(): Promise<EffectiveMaterialRate[]> {
  const { data, error } = await supabase.from('v_material_rates').select('*').order('code')
  fail('Could not load material rates', error)
  return (data ?? []) as EffectiveMaterialRate[]
}

export async function setMaterialRate(
  companyId: string,
  code: string,
  name: string,
  rate: number,
): Promise<void> {
  const { error } = await supabase
    .from('material_rates')
    .upsert({ company_id: companyId, code, name, unit: 'kg', rate }, { onConflict: 'company_id,code' })
  fail('Could not save the rate', error)
}

export async function updateMasterMaterialRate(id: string, rate: number): Promise<void> {
  const { error } = await supabase.from('material_rates').update({ rate }).eq('id', id)
  fail('Could not save the rate', error)
}

// --- assemblies ------------------------------------------------------------

export async function listAssemblies(): Promise<Assembly[]> {
  const { data, error } = await supabase.from('assemblies').select('*').order('code')
  fail('Could not load assemblies', error)
  return (data ?? []) as Assembly[]
}

export async function createAssembly(input: {
  company_id: string | null
  code: string
  name: string
  description: string | null
}): Promise<Assembly> {
  const { data, error } = await supabase.from('assemblies').insert(input).select().single()
  fail('Could not add the assembly', error)
  return data as Assembly
}

export async function updateAssembly(
  id: string,
  input: { code: string; name: string; description: string | null },
): Promise<void> {
  const { error } = await supabase.from('assemblies').update(input).eq('id', id)
  fail('Could not save the assembly', error)
}

export async function setAssemblyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('assemblies').update({ is_active: isActive }).eq('id', id)
  fail('Could not change the assembly', error)
}

export async function listAssemblyComponents(assemblyId: string): Promise<AssemblyComponentRow[]> {
  const { data, error } = await supabase
    .from('assembly_components')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order')
  fail('Could not load the material list', error)
  return (data ?? []) as AssemblyComponentRow[]
}

export async function addAssemblyComponent(
  assemblyId: string,
  componentId: string,
  quantity: number,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase.from('assembly_components').insert({
    assembly_id: assemblyId,
    component_id: componentId,
    quantity,
    sort_order: sortOrder,
  })
  fail('Could not add that component', error)
}

export async function setAssemblyComponentQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await supabase.from('assembly_components').update({ quantity }).eq('id', id)
  fail('Could not change the quantity', error)
}

export async function removeAssemblyComponent(id: string): Promise<void> {
  const { error } = await supabase.from('assembly_components').delete().eq('id', id)
  fail('Could not remove that component', error)
}

/** Hours as this company plans them: its override, else the assembly's own. */
export async function listAssemblyHours(assemblyId: string): Promise<AssemblyHours[]> {
  const { data, error } = await supabase
    .from('v_assembly_hours')
    .select('*')
    .eq('assembly_id', assemblyId)
    .order('sort_order')
  fail('Could not load the hours', error)
  return (data ?? []) as AssemblyHours[]
}

/** Hours on the assembly itself. Master rows: master admin only. */
export async function setAssemblyHours(
  assemblyId: string,
  processType: string,
  hours: number,
): Promise<void> {
  const { error } = await supabase
    .from('assembly_labour')
    .upsert(
      { assembly_id: assemblyId, process_type: processType, hours },
      { onConflict: 'assembly_id,process_type' },
    )
  fail('Could not save the hours', error)
}

/** This company's own hours for a master assembly, leaving the master alone. */
export async function setCompanyAssemblyHours(
  companyId: string,
  assemblyId: string,
  processType: string,
  hours: number,
): Promise<void> {
  const { error } = await supabase
    .from('company_assembly_hours')
    .upsert(
      { company_id: companyId, assembly_id: assemblyId, process_type: processType, hours },
      { onConflict: 'company_id,assembly_id,process_type' },
    )
  fail('Could not save your hours', error)
}

export async function clearCompanyAssemblyHours(
  companyId: string,
  assemblyId: string,
  processType: string,
): Promise<void> {
  const { error } = await supabase
    .from('company_assembly_hours')
    .delete()
    .eq('company_id', companyId)
    .eq('assembly_id', assemblyId)
    .eq('process_type', processType)
  fail('Could not remove your override', error)
}
