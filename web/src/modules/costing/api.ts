import { supabase } from '../../lib/supabase'
import type {
  AssemblyTotals,
  BomItem,
  Kit,
  Costing,
  CostingAssembly,
  CostingHistoryRow,
  CostingItem,
  CostingLabour,
  CostingPanel,
  CopyReport,
  CostingTotals,
  OptionTotals,
  PanelCopyReport,
  PanelPrice,
  PanelSection,
} from '../../lib/database.types'

/**
 * Costings. Creating one and moving it through its life goes through database
 * functions, which freeze prices and write the history. Editing a draft's
 * panels, quantities and hours is ordinary writes, which the policies allow
 * only while the costing is an editable draft.
 *
 * Every total comes from a view. Nothing here multiplies anything.
 */

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`)
}

// --- the list --------------------------------------------------------------

export async function listCostings(): Promise<(Costing & { totals: CostingTotals | null })[]> {
  const [{ data: costings, error }, { data: totals, error: totalsError }] = await Promise.all([
    supabase.from('costings').select('*').order('created_at', { ascending: false }),
    supabase.from('v_costing_totals').select('*'),
  ])
  fail('Could not load costings', error)
  fail('Could not load totals', totalsError)
  const byId = new Map((totals ?? []).map((t) => [(t as CostingTotals).costing_id, t as CostingTotals]))
  return ((costings ?? []) as Costing[]).map((c) => ({ ...c, totals: byId.get(c.id) ?? null }))
}

export async function createCosting(title: string, notes: string | null, enquiryId: string | null): Promise<Costing> {
  const { data, error } = await supabase.rpc('create_costing', { title, notes, enquiry: enquiryId })
  fail('Could not create the costing', error)
  return data as Costing
}

// --- one costing, in full ---------------------------------------------------

export interface CostingDetail {
  costing: Costing
  panels: CostingPanel[]
  assemblies: CostingAssembly[]
  items: CostingItem[]
  labour: CostingLabour[]
  assemblyTotals: AssemblyTotals[]
  panelPrices: PanelPrice[]
  totals: CostingTotals | null
  optionTotals: OptionTotals[]
  /** The library kits, for group names and main devices in the technical offer. */
  kits: Kit[]
}

export async function getCostingDetail(id: string): Promise<CostingDetail> {
  const [costing, panels, assemblies, items, labour, assemblyTotals, panelPrices, totals, options, kits] =
    await Promise.all([
      supabase.from('costings').select('*').eq('id', id).single(),
      supabase.from('costing_panels').select('*').eq('costing_id', id).order('sort_order'),
      supabase.from('costing_assemblies').select('*').eq('costing_id', id).order('sort_order'),
      supabase.from('costing_items').select('*').eq('costing_id', id).order('sort_order'),
      supabase.from('costing_labour').select('*').eq('costing_id', id),
      supabase.from('v_costing_assembly_totals').select('*').eq('costing_id', id),
      supabase.from('v_costing_panel_prices').select('*').eq('costing_id', id),
      supabase.from('v_costing_totals').select('*').eq('costing_id', id).maybeSingle(),
      supabase.from('v_costing_option_totals').select('*').eq('costing_id', id),
      supabase.from('v_kits').select('*'),
    ])

  fail('Could not load the costing', costing.error)
  fail('Could not load panels', panels.error)
  fail('Could not load kits', assemblies.error)
  fail('Could not load items', items.error)
  fail('Could not load labour', labour.error)
  fail('Could not load kit totals', assemblyTotals.error)
  fail('Could not load panel prices', panelPrices.error)
  fail('Could not load totals', totals.error)
  fail('Could not load option totals', options.error)
  fail('Could not load kits', kits.error)

  return {
    costing: costing.data as Costing,
    panels: (panels.data ?? []) as CostingPanel[],
    assemblies: (assemblies.data ?? []) as CostingAssembly[],
    items: (items.data ?? []) as CostingItem[],
    labour: (labour.data ?? []) as CostingLabour[],
    assemblyTotals: (assemblyTotals.data ?? []) as AssemblyTotals[],
    panelPrices: (panelPrices.data ?? []) as PanelPrice[],
    totals: (totals.data as CostingTotals | null) ?? null,
    optionTotals: (options.data ?? []) as OptionTotals[],
    kits: (kits.data ?? []) as Kit[],
  }
}

export async function listHistory(costingId: string): Promise<CostingHistoryRow[]> {
  const { data, error } = await supabase
    .from('v_costing_history')
    .select('*')
    .eq('costing_id', costingId)
    .order('at', { ascending: false })
  fail('Could not load the history', error)
  return (data ?? []) as CostingHistoryRow[]
}

// --- editing a draft ---------------------------------------------------------

export async function updateCosting(
  id: string,
  changes: Partial<Pick<Costing, 'title' | 'notes' | 'negotiation_margin_pct'>>,
): Promise<void> {
  const { error } = await supabase.from('costings').update(changes).eq('id', id)
  fail('Could not save the costing', error)
}

export async function addPanel(
  costingId: string,
  companyId: string,
  name: string,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase
    .from('costing_panels')
    .insert({ costing_id: costingId, company_id: companyId, name, sort_order: sortOrder })
  fail('Could not add the panel', error)
}

export async function updatePanel(
  id: string,
  changes: Partial<
    Pick<
      CostingPanel,
      'name' | 'tag' | 'option_label' | 'uom' | 'quantity' | 'technical_description' | 'enclosure_dimensions'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('costing_panels').update(changes).eq('id', id)
  fail('Could not save the panel', error)
}

export async function removePanel(id: string): Promise<void> {
  const { error } = await supabase.from('costing_panels').delete().eq('id', id)
  fail('Could not remove the panel', error)
}

/** Copies an assembly in at today's prices and this costing's frozen rates. */
export async function addAssemblyToPanel(
  panelId: string,
  assemblyId: string,
  quantity: number,
  section: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('add_assembly_to_costing', {
    target_panel_id: panelId,
    source_assembly: assemblyId,
    qty: quantity,
    section,
  })
  fail('Could not add the kit', error)
}

/** A catalogue component on its own, into that section's loose-parts line. */
export async function addComponentToPanel(
  panelId: string,
  componentId: string,
  quantity: number,
  section: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('add_component_to_costing', {
    target_panel_id: panelId,
    component: componentId,
    qty: quantity,
    section,
  })
  fail('Could not add the component', error)
}

export interface ManualItemInput {
  name: string
  category: string
  unit_price: number
  quantity: number
  unit: string
  make: string | null
  part_number: string | null
}

/** A line typed in with its own price: a part no catalogue holds yet. */
export async function addManualItem(
  panelId: string,
  input: ManualItemInput,
  section: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('add_manual_item', {
    target_panel_id: panelId,
    item_name: input.name,
    category: input.category,
    unit_price: input.unit_price,
    qty: input.quantity,
    unit: input.unit,
    make: input.make,
    part_no: input.part_number,
    section,
  })
  fail('Could not add the line', error)
}

/** The section names offered by the picker. Anything else typed is kept too. */
export async function listPanelSections(): Promise<PanelSection[]> {
  const { data, error } = await supabase.from('panel_sections').select('*').order('sort_order')
  fail('Could not load the section names', error)
  return (data ?? []) as PanelSection[]
}

/** Moves a kit line into another section of the same panel. */
export async function setAssemblySection(id: string, section: string | null): Promise<void> {
  const { error } = await supabase.from('costing_assemblies').update({ section }).eq('id', id)
  fail('Could not move the line', error)
}

/** Kits with group, rating and main device, for the picker. */
export async function listKits(): Promise<Kit[]> {
  const { data, error } = await supabase.from('v_kits').select('*').order('group_name').order('rating').order('name')
  fail('Could not load kits', error)
  return (data ?? []) as Kit[]
}

export async function setCostingAssemblyQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await supabase.from('costing_assemblies').update({ quantity }).eq('id', id)
  fail('Could not change the quantity', error)
}

export async function removeCostingAssembly(id: string): Promise<void> {
  const { error } = await supabase.from('costing_assemblies').delete().eq('id', id)
  fail('Could not remove the kit', error)
}

export async function setItemQuantity(id: string, quantity: number): Promise<void> {
  const { error } = await supabase.from('costing_items').update({ quantity }).eq('id', id)
  fail('Could not change the quantity', error)
}

export async function removeItem(id: string): Promise<void> {
  const { error } = await supabase.from('costing_items').delete().eq('id', id)
  fail('Could not remove the item', error)
}

export async function setLabourHours(id: string, hours: number): Promise<void> {
  const { error } = await supabase
    .from('costing_labour')
    .update({ hours, source: 'manual' })
    .eq('id', id)
  fail('Could not change the hours', error)
}

// --- the lifecycle -----------------------------------------------------------

export async function submitCosting(id: string): Promise<void> {
  const { error } = await supabase.rpc('submit_costing', { target: id })
  fail('Could not submit', error)
}

export async function approveCosting(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_costing', { target: id })
  fail('Could not approve', error)
}

export async function returnCosting(id: string, comment: string): Promise<void> {
  const { error } = await supabase.rpc('return_costing', { target: id, comment })
  fail('Could not return it', error)
}

export async function createRevision(id: string): Promise<Costing> {
  const { data, error } = await supabase.rpc('create_costing_revision', { target: id })
  fail('Could not create a revision', error)
  return data as Costing
}

// --- copying ------------------------------------------------------------------

/**
 * A copy is a new job: its own number, revision 0, the source untouched. Every
 * catalogue line is priced again at today's rates; the report names anything
 * that could not be, so the engineer checks it rather than trusting it.
 */
export async function copyCosting(
  source: string,
  title: string | null,
  enquiryId: string | null,
): Promise<CopyReport> {
  const { data, error } = await supabase.rpc('copy_costing', {
    source,
    new_title: title,
    enquiry: enquiryId,
  })
  fail('Could not copy the costing', error)
  return data as CopyReport
}

/** One panel, into this costing or another draft of the same company. */
export async function copyPanel(
  sourcePanelId: string,
  targetCostingId: string,
  newName: string | null,
): Promise<PanelCopyReport> {
  const { data, error } = await supabase.rpc('copy_panel', {
    source_panel: sourcePanelId,
    target_costing: targetCostingId,
    new_name: newName,
  })
  fail('Could not copy the panel', error)
  return data as PanelCopyReport
}

// --- bill of materials -------------------------------------------------------

/** Every distinct component in a costing with its total quantity, for the exports. */
export async function listBomItems(costingId: string): Promise<BomItem[]> {
  const { data, error } = await supabase
    .from('v_costing_items_by_category')
    .select('*')
    .eq('costing_id', costingId)
    .order('category_code')
    .order('code')
  fail('Could not load the bill of materials', error)
  return (data ?? []) as BomItem[]
}
