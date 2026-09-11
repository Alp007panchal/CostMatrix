import { supabase } from '../../lib/supabase'
import type {
  Assembly,
  AssemblyComponentRow,
  AssemblyHours,
  Component,
  ComponentCategory,
  ComponentPrice,
  PriceHistoryRow,
  ProcessType,
} from '../../lib/database.types'

/**
 * The component and kit library.
 *
 * Prices are read from v_component_prices, never from the components table:
 * the view lands the purchase price in KES through the currency's exchange
 * rate and landed factor, applies the company's discount, converts into the
 * company currency, and works out what a busbar costs from its weight.
 * Writing goes to the table. Rates and currency factors live in rates-api.ts,
 * kit groups and main devices in kits-api.ts.
 */

export function fail(context: string, error: { message: string } | null): void {
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
  | 'purchase_price'
  | 'purchase_currency'
  | 'weight_per_unit'
  | 'material_rate_code'
  | 'is_enclosure_cubicle'
  | 'is_placeholder'
> & { company_id: string | null } &
  // Added by migration 0100 (foundations F1). Optional in the type as well as in
  // the database, so the Excel upload and the seed importer, which set none of
  // them, still typecheck. `status` is deliberately absent: it is a generated
  // column and writing it is an error.
  Partial<
    Pick<
      Component,
      | 'supplier'
      | 'attributes'
      | 'datasheet_url'
      | 'lead_time_days'
      | 'price_valid_from'
      | 'price_source'
      // Added by migration 0106 (foundations F12).
      | 'width_mm'
      | 'height_mm'
      | 'depth_mm'
      | 'mounting_type'
      | 'clearances'
      | 'weight_kg'
      | 'enclosure_layout'
    >
  >

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
    : { ...input, purchase_price: null, is_placeholder: false }
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

// --- assemblies ------------------------------------------------------------

export async function listAssemblies(): Promise<Assembly[]> {
  const { data, error } = await supabase.from('assemblies').select('*').order('code')
  fail('Could not load kits', error)
  return (data ?? []) as Assembly[]
}

export async function createAssembly(input: {
  company_id: string | null
  code: string
  name: string
  description: string | null
}): Promise<Assembly> {
  const { data, error } = await supabase.from('assemblies').insert(input).select().single()
  fail('Could not add the kit', error)
  return data as Assembly
}

export async function updateAssembly(
  id: string,
  // `status` is absent on purpose: it is a generated column derived from
  // is_active, and writing it is an error (migration 0100).
  input: Partial<
    Pick<
      Assembly,
      | 'code'
      | 'name'
      | 'description'
      | 'kit_group_id'
      | 'rating'
      | 'rating_unit'
      | 'poles'
      | 'customer_wording'
      | 'tags'
      | 'version'
      // Added by migration 0106 (foundations F12).
      | 'footprint_w_mm'
      | 'footprint_h_mm'
      | 'footprint_d_mm'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('assemblies').update(input).eq('id', id)
  fail('Could not save the kit', error)
}

export async function setAssemblyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('assemblies').update({ is_active: isActive }).eq('id', id)
  fail('Could not change the kit', error)
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

// --- spreadsheet uploads -----------------------------------------------------

export interface ImportBatchInput {
  company_id: string | null
  target: 'components' | 'assemblies'
  file_name: string
  rows_new: number
  rows_changed: number
  rows_unchanged: number
  rows_rejected: number
  details: unknown
}

/** One row per upload, kept so a bad file can be traced afterwards. */
export async function createImportBatch(input: ImportBatchInput): Promise<string> {
  const { data, error } = await supabase
    .from('import_batches')
    .insert(input)
    .select('id')
    .single()
  fail('Could not record the upload', error)
  return (data as { id: string }).id
}

/** Inserts many components at once, all stamped with the upload they came from. */
export async function insertComponents(
  rows: (ComponentInput & { import_batch_id: string })[],
): Promise<void> {
  if (rows.length === 0) return
  const { error } = await supabase.from('components').insert(rows.map(cleanForMode))
  fail('Could not add the new components', error)
}

/** Updates one component from an upload; the batch id rides along for the history. */
export async function updateComponentFromImport(
  id: string,
  changes: Partial<ComponentInput>,
  importBatchId: string,
): Promise<void> {
  const { error } = await supabase
    .from('components')
    .update({ ...changes, import_batch_id: importBatchId })
    .eq('id', id)
  fail('Could not update a component', error)
}
