import type {
  ComponentPrice, CostingAssembly, CostingItem, CostingPanel, CostingTotals, Kit, PanelPrice,
} from '../../lib/database.types'

/**
 * The costing as one grid: panels across the columns, kits and loose components
 * down the rows (roadmap 2.9, `docs/reference/costing-grid-view.md`).
 *
 * Pure, and deliberately so. Building the model, grouping it into sections,
 * rolling the quantities up and deciding which cells differ is all unit-tested;
 * the component only draws it. Nothing here recomputes a price: every figure in
 * the bottom rows comes from the costing views as they are.
 */

export type GridRowKind = 'kit' | 'component' | 'lump sum'

export interface GridCell {
  quantity: number
  /** The costing_assemblies or costing_items rows this cell stands for. */
  lineIds: string[]
  /**
   * The same kit or part on more than one line of that panel — two sections, say.
   * The grid will not guess which line an edit means, so the cell sends the
   * engineer to the panel editor instead.
   */
  ambiguous: boolean
}

export interface GridRow {
  key: string
  kind: GridRowKind
  name: string
  /** Kit group for a kit, BOM category for a loose part. */
  group: string
  section: string
  /** For ordering inside a section: the kit's rating, biggest first. */
  rating: number | null
  /** The library kit or part behind this row has no price now (a placeholder). */
  unpriced: boolean
  /** Set only for catalogue parts and kits: what a new cell would add. */
  sourceId: string | null
  cells: Record<string, GridCell>
  /** Quantity across the panels, each times its panel quantity. */
  total: number
}

export interface GridColumn {
  panel: CostingPanel
  price: PanelPrice | undefined
  /** An optional extra: priced and printed, out of the total (2.7). */
  isOption: boolean
}

export interface GridSection {
  heading: string
  rows: GridRow[]
}

export interface GridTotalRow {
  label: string
  note?: string
  /** Per panel, in the column order; null where there is no figure. */
  values: (number | null)[]
  /** The all-panels figure, from the costing's own totals. */
  total: number | null
  strong?: boolean
}

export interface GridModel {
  columns: GridColumn[]
  sections: GridSection[]
  totals: GridTotalRow[]
}

export interface GridInput {
  panels: CostingPanel[]
  assemblies: CostingAssembly[]
  items: CostingItem[]
  panelPrices: PanelPrice[]
  totals: CostingTotals | null
  kits: Kit[]
  components: ComponentPrice[]
  categoryNames: Record<string, string>
  /** For the rounding note on the last row. */
  roundingStep: number
}

/** The sections the costing team reads a board in, in that order (spec §2). */
const SECTION_ORDER = [
  'Incomer', 'Outgoers', 'Accessories & metering', 'Busbar & cable', 'Enclosure',
]
const OTHER = 'Other'

export function buildGrid(input: GridInput): GridModel {
  const priceByPanel = new Map(input.panelPrices.map((p) => [p.panel_id, p]))
  const columns: GridColumn[] = input.panels.map((panel) => ({
    panel,
    price: priceByPanel.get(panel.id),
    isOption: panel.is_option,
  }))

  const kitByCode = new Map(input.kits.map((k) => [k.code, k]))
  const componentById = new Map(input.components.map((c) => [c.id, c]))
  const holderById = new Map(input.assemblies.map((a) => [a.id, a]))
  const rows = new Map<string, GridRow>()

  const cellFor = (row: GridRow, panelId: string): GridCell => {
    const existing = row.cells[panelId]
    if (existing) return existing
    const fresh: GridCell = { quantity: 0, lineIds: [], ambiguous: false }
    row.cells[panelId] = fresh
    return fresh
  }

  // Kits: one row per kit, whichever panels use it. Its parts stay inside it.
  for (const line of input.assemblies) {
    if (line.kind !== 'kit') continue
    const kit = kitByCode.get(line.code)
    const key = `kit:${line.code}`
    const row = rows.get(key) ?? {
      key,
      kind: 'kit' as GridRowKind,
      name: line.name,
      group: kit?.group_name ?? '—',
      section: sectionFor(line.section, kit?.group_name ?? null, null, input.categoryNames),
      rating: kit?.rating ?? null,
      unpriced: kit?.has_unpriced_part ?? false,
      sourceId: line.source_assembly_id,
      cells: {},
      total: 0,
    }
    rows.set(key, row)
    const cell = cellFor(row, line.panel_id)
    cell.quantity += Number(line.quantity)
    cell.lineIds.push(line.id)
    cell.ambiguous = cell.lineIds.length > 1
  }

  // Loose parts: a current transformer, a meter, a typed-in lump sum.
  for (const item of input.items) {
    const holder = holderById.get(item.costing_assembly_id)
    if (!holder || holder.kind !== 'free') continue
    const key = item.is_manual ? `lump:${item.code}` : `item:${item.code}`
    const source = item.source_component_id ? componentById.get(item.source_component_id) : undefined
    const row = rows.get(key) ?? {
      key,
      kind: (item.is_manual ? 'lump sum' : 'component') as GridRowKind,
      name: item.name,
      group: input.categoryNames[item.category_code] ?? item.category_code,
      section: sectionFor(holder.section, null, item.category_code, input.categoryNames),
      rating: null,
      // A part the library has since left unpriced — it could not be costed again.
      unpriced: source ? source.unit_price === null : false,
      sourceId: item.source_component_id,
      cells: {},
      total: 0,
    }
    rows.set(key, row)
    const cell = cellFor(row, holder.panel_id)
    cell.quantity += Number(item.quantity)
    cell.lineIds.push(item.id)
    cell.ambiguous = cell.lineIds.length > 1
  }

  // The roll-up, option panels left out as the spec asks: they are not part of
  // what the job comes to.
  for (const row of rows.values()) {
    row.total = columns.reduce((sum, col) => {
      if (col.isOption) return sum
      const cell = row.cells[col.panel.id]
      return sum + (cell ? cell.quantity * Number(col.panel.quantity) : 0)
    }, 0)
  }

  return { columns, sections: intoSections([...rows.values()]), totals: totalRows(input, columns) }
}

/**
 * The line's own section when the engineer set one, else the kit group or the BOM
 * category — which is what the spec asks for, and keeps a board the team has
 * sectioned reading the way they sectioned it.
 */
export function sectionFor(
  lineSection: string | null,
  kitGroup: string | null,
  categoryCode: string | null,
  categoryNames: Record<string, string>,
): string {
  const typed = (lineSection ?? '').trim()
  if (typed !== '') return typed
  if (categoryCode === 'enclosure_parts') return 'Enclosure'
  if (categoryCode === 'busbar') return 'Busbar & cable'
  if (categoryCode === 'accessories_hardware') return 'Accessories & metering'
  if (kitGroup && kitGroup.trim() !== '') return kitGroup.trim()
  if (categoryCode) return categoryNames[categoryCode] ?? OTHER
  return OTHER
}

/** Known sections in the spec's order, then whatever else, then Other last. */
function intoSections(rows: GridRow[]): GridSection[] {
  const byHeading = new Map<string, GridRow[]>()
  for (const row of rows) {
    byHeading.set(row.section, [...(byHeading.get(row.section) ?? []), row])
  }
  const rank = (heading: string) => {
    const i = SECTION_ORDER.findIndex((s) => s.toLowerCase() === heading.toLowerCase())
    if (i >= 0) return i
    return heading === OTHER ? SECTION_ORDER.length + 1 : SECTION_ORDER.length
  }
  return [...byHeading.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([heading, group]) => ({
      heading,
      // Biggest rating first, as a schedule is read; then by name.
      rows: group.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name)),
    }))
}

/**
 * The bottom rows, every figure straight from the costing views: cost per panel
 * for the whole batch, the margin result, and the rounded price each. The
 * all-panels column is the costing's own total, so it already leaves out optional
 * extras and the options nobody chose.
 */
function totalRows(input: GridInput, columns: GridColumn[]): GridTotalRow[] {
  const each = (pick: (p: PanelPrice, qty: number) => number) =>
    columns.map((c) => (c.price ? pick(c.price, Number(c.panel.quantity)) : null))

  return [
    {
      label: 'Material, KES',
      values: each((p, qty) => Number(p.material_cost) * qty),
      total: input.totals ? Number(input.totals.material_cost) : null,
    },
    {
      label: 'Labour, KES',
      note: 'hours × rate',
      values: each((p, qty) => Number(p.labour_cost) * qty),
      total: input.totals ? Number(input.totals.labour_cost) : null,
    },
    {
      label: 'Selling price ex-VAT, each',
      note: 'material and labour at their margins',
      values: each((p) => Number(p.material_sell) + Number(p.labour_sell)),
      total: null,
    },
    {
      label: `Panel price, rounded up to KES ${Number(input.roundingStep).toLocaleString('en-KE')}`,
      values: each((p) => Number(p.unit_price)),
      total: input.totals ? Number(input.totals.subtotal) : null,
      strong: true,
    },
  ]
}

/**
 * Compare two columns: the rows whose quantities differ, a blank against a
 * figure included. One pair at a time, as the spec says.
 */
export function differingRows(model: GridModel, aPanelId: string, bPanelId: string): Set<string> {
  const differ = new Set<string>()
  for (const section of model.sections) {
    for (const row of section.rows) {
      const a = row.cells[aPanelId]?.quantity ?? 0
      const b = row.cells[bPanelId]?.quantity ?? 0
      if (a !== b) differ.add(row.key)
    }
  }
  return differ
}

/** What a cell edit means, given what is in the cell now. */
export type CellAction =
  | { kind: 'add'; sourceId: string; rowKind: GridRowKind }
  | { kind: 'quantity'; lineId: string; rowKind: GridRowKind; quantity: number }
  | { kind: 'remove'; lineId: string; rowKind: GridRowKind }
  | { kind: 'refuse'; reason: string }

export function cellAction(row: GridRow, panelId: string, typed: number | null): CellAction {
  const cell = row.cells[panelId]
  const quantity = typed === null || Number.isNaN(typed) ? 0 : typed
  if (quantity < 0) return { kind: 'refuse', reason: 'A quantity cannot be negative.' }
  if (cell?.ambiguous) {
    return {
      kind: 'refuse',
      reason: 'This panel has it on more than one line, so the grid cannot tell which to change. Use the panel editor.',
    }
  }
  const lineId = cell?.lineIds[0]
  if (lineId) {
    return quantity === 0
      ? { kind: 'remove', lineId, rowKind: row.kind }
      : { kind: 'quantity', lineId, rowKind: row.kind, quantity }
  }
  if (quantity === 0) return { kind: 'refuse', reason: 'Nothing to remove.' }
  if (row.kind === 'lump sum' || row.sourceId === null) {
    return {
      kind: 'refuse',
      reason: 'A typed-in line has no catalogue entry to copy, so it has to be added on the panel itself.',
    }
  }
  return { kind: 'add', sourceId: row.sourceId, rowKind: row.kind }
}
