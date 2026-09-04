import { supabase } from '../../lib/supabase'
import type {
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
