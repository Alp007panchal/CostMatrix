import { describe, expect, it } from 'vitest'
import type {
  ComponentPrice, CostingAssembly, CostingItem, CostingPanel, CostingTotals, Kit, PanelPrice,
} from '../../lib/database.types'
import { buildGrid, cellAction, differingRows, sectionFor, type GridInput } from './grid'

const panel = (id: string, name: string, over: Partial<CostingPanel> = {}): CostingPanel => ({
  id, costing_id: 'c', company_id: 'co', name, tag: null, option_label: null, uom: 'PC',
  quantity: 1, is_option: false, technical_description: null, enclosure_dimensions: null,
  sort_order: 0, ...over,
})

const kitLine = (id: string, panelId: string, code: string, quantity: number, over: Partial<CostingAssembly> = {}): CostingAssembly => ({
  id, costing_id: 'c', panel_id: panelId, kind: 'kit', section: null, source_assembly_id: `src-${code}`,
  code, name: `${code} KIT`, quantity, sort_order: 0, ...over,
} as CostingAssembly)

const freeHolder = (id: string, panelId: string, section: string | null = null): CostingAssembly => ({
  id, costing_id: 'c', panel_id: panelId, kind: 'free', section, source_assembly_id: null,
  code: 'FREE', name: 'Loose parts', quantity: 1, sort_order: 9,
} as CostingAssembly)

const item = (id: string, holderId: string, code: string, quantity: number, over: Partial<CostingItem> = {}): CostingItem => ({
  id, costing_id: 'c', costing_assembly_id: holderId, source_component_id: `comp-${code}`, code,
  name: code, category_code: 'accessories_hardware', unit: 'pcs', manufacturer: null, part_number: null,
  quantity, pricing_mode: 'fixed', purchase_price: null, purchase_currency: null, landed_factor: null,
  uplift_pct: null, unit_price: 100, is_manual: false, sort_order: 0, ...over,
})

const price = (panelId: string, over: Partial<PanelPrice> = {}): PanelPrice => ({
  panel_id: panelId, material_cost: 1000, labour_cost: 100, hours: 2, material_sell: 1100,
  labour_sell: 110, unit_price: 1300, line_total: 1300, is_option: false, in_chosen_offer: true,
  counts_in_total: true, ...over,
})

const TOTALS: CostingTotals = {
  costing_id: 'c', material_cost: 2000, labour_cost: 200, hours: 4, subtotal: 2600, tax: 416,
  grand_total: 3016, optional_subtotal: 0, optional_tax: 0, optional_total: 0,
  chosen_option_label: null, option_count: 0,
}

const KITS = [
  { code: 'ACB-1600', group_name: 'ACB frame 1', rating: 1600, has_unpriced_part: false },
  { code: 'MCCB-250', group_name: 'MCCB', rating: 250, has_unpriced_part: true },
] as unknown as Kit[]

const COMPONENTS = [
  { id: 'comp-CT800', unit_price: 4000 },
  { id: 'comp-METER', unit_price: null },
] as unknown as ComponentPrice[]

const CATEGORIES = {
  accessories_hardware: 'Accessories and hardware',
  enclosure_parts: 'Fabricated enclosure parts',
  busbar: 'Busbar and cable',
}

function input(over: Partial<GridInput> = {}): GridInput {
  return {
    panels: [panel('p1', 'MDB'), panel('p2', 'DB-1', { quantity: 2 })],
    assemblies: [
      kitLine('a1', 'p1', 'ACB-1600', 1, { section: 'Incomer' }),
      kitLine('a2', 'p1', 'MCCB-250', 3, { section: 'Outgoers' }),
      kitLine('a3', 'p2', 'MCCB-250', 4, { section: 'Outgoers' }),
      freeHolder('f1', 'p1'),
    ],
    items: [item('i1', 'f1', 'CT800', 14)],
    panelPrices: [price('p1'), price('p2', { material_cost: 500, labour_cost: 50, unit_price: 700, line_total: 1400 })],
    totals: TOTALS,
    kits: KITS,
    components: COMPONENTS,
    categoryNames: CATEGORIES,
    roundingStep: 100,
    ...over,
  }
}

describe('the grid model', () => {
  it('has a column per panel and a row per kit or loose part any panel uses', () => {
    const model = buildGrid(input())
    expect(model.columns.map((c) => c.panel.name)).toEqual(['MDB', 'DB-1'])
    const rows = model.sections.flatMap((s) => s.rows)
    expect(rows.map((r) => r.key).sort()).toEqual(['item:CT800', 'kit:ACB-1600', 'kit:MCCB-250'])
  })

  it('puts each panel\'s own quantity in its cell and leaves the others blank', () => {
    const rows = buildGrid(input()).sections.flatMap((s) => s.rows)
    const mccb = rows.find((r) => r.key === 'kit:MCCB-250')!
    expect(mccb.cells['p1']?.quantity).toBe(3)
    expect(mccb.cells['p2']?.quantity).toBe(4)
    const acb = rows.find((r) => r.key === 'kit:ACB-1600')!
    expect(acb.cells['p2']).toBeUndefined()
  })

  it('rolls up across the panels, each times its panel quantity', () => {
    const rows = buildGrid(input()).sections.flatMap((s) => s.rows)
    // 3 on one MDB, 4 on each of two DB-1s.
    expect(rows.find((r) => r.key === 'kit:MCCB-250')?.total).toBe(3 + 4 * 2)
    expect(rows.find((r) => r.key === 'kit:ACB-1600')?.total).toBe(1)
  })

  it('leaves an optional extra panel out of the all-panels column', () => {
    const model = buildGrid(input({
      panels: [panel('p1', 'MDB'), panel('p2', 'SPARE', { is_option: true })],
    }))
    expect(model.columns[1]?.isOption).toBe(true)
    expect(model.sections.flatMap((s) => s.rows).find((r) => r.key === 'kit:MCCB-250')?.total).toBe(3)
  })

  it('groups by section in the order a board is read, biggest rating first', () => {
    const model = buildGrid(input({
      assemblies: [
        kitLine('a1', 'p1', 'MCCB-250', 1, { section: 'Outgoers' }),
        kitLine('a2', 'p1', 'ACB-1600', 1, { section: 'Incomer' }),
        freeHolder('f1', 'p1', 'Accessories & metering'),
      ],
    }))
    expect(model.sections.map((s) => s.heading)).toEqual(['Incomer', 'Outgoers', 'Accessories & metering'])
  })

  it('marks a row whose library kit or part has no price now', () => {
    const rows = buildGrid(input({
      items: [item('i1', 'f1', 'CT800', 1), item('i2', 'f1', 'METER', 1)],
    })).sections.flatMap((s) => s.rows)
    expect(rows.find((r) => r.key === 'kit:MCCB-250')?.unpriced).toBe(true)
    expect(rows.find((r) => r.key === 'kit:ACB-1600')?.unpriced).toBe(false)
    expect(rows.find((r) => r.key === 'item:METER')?.unpriced).toBe(true)
    expect(rows.find((r) => r.key === 'item:CT800')?.unpriced).toBe(false)
  })

  it('tags a typed-in line as a lump sum and keeps it out of the catalogue rows', () => {
    const rows = buildGrid(input({
      items: [item('i1', 'f1', 'CONTROLS', 1, { is_manual: true, source_component_id: null })],
    })).sections.flatMap((s) => s.rows)
    const lump = rows.find((r) => r.key === 'lump:CONTROLS')!
    expect(lump.kind).toBe('lump sum')
    expect(lump.sourceId).toBeNull()
  })

  it('adds the same thing on two lines of one panel into one cell, and says so', () => {
    const rows = buildGrid(input({
      assemblies: [
        kitLine('a1', 'p1', 'MCCB-250', 2, { section: 'Incomer' }),
        kitLine('a2', 'p1', 'MCCB-250', 3, { section: 'Outgoers' }),
      ],
      items: [],
    })).sections.flatMap((s) => s.rows)
    const cell = rows.find((r) => r.key === 'kit:MCCB-250')?.cells['p1']
    expect(cell?.quantity).toBe(5)
    expect(cell?.ambiguous).toBe(true)
  })

  it('takes every figure in the bottom rows from the views, panel quantity through', () => {
    const model = buildGrid(input())
    const [material, labour, selling, rounded] = model.totals
    expect(material?.values).toEqual([1000, 1000])          // 500 × 2 on DB-1
    expect(material?.total).toBe(2000)
    expect(labour?.values).toEqual([100, 100])
    expect(selling?.values).toEqual([1210, 1210])            // material_sell + labour_sell
    expect(selling?.total).toBeNull()
    expect(rounded?.label).toBe('Panel price, rounded up to KES 100')
    expect(rounded?.values).toEqual([1300, 700])             // the price each, as the view rounds it
    expect(rounded?.total).toBe(2600)                        // the costing's own subtotal
  })
})

describe('comparing two columns', () => {
  it('names the rows that differ, a blank against a figure included', () => {
    const model = buildGrid(input())
    const differ = differingRows(model, 'p1', 'p2')
    expect([...differ].sort()).toEqual(['item:CT800', 'kit:ACB-1600', 'kit:MCCB-250'])
  })
  it('finds nothing between two identical panels', () => {
    const model = buildGrid(input({
      panels: [panel('p1', 'A'), panel('p2', 'B')],
      assemblies: [kitLine('a1', 'p1', 'MCCB-250', 4), kitLine('a2', 'p2', 'MCCB-250', 4)],
      items: [],
    }))
    expect(differingRows(model, 'p1', 'p2').size).toBe(0)
  })
})

describe('what an edit to a cell means', () => {
  const rows = () => buildGrid(input()).sections.flatMap((s) => s.rows)

  it('changes the quantity of the line that is there', () => {
    const row = rows().find((r) => r.key === 'kit:MCCB-250')!
    expect(cellAction(row, 'p1', 6)).toEqual({ kind: 'quantity', lineId: 'a2', rowKind: 'kit', quantity: 6 })
  })
  it('removes the line when the cell is cleared or set to zero', () => {
    const row = rows().find((r) => r.key === 'kit:MCCB-250')!
    expect(cellAction(row, 'p1', null)).toEqual({ kind: 'remove', lineId: 'a2', rowKind: 'kit' })
    expect(cellAction(row, 'p1', 0)).toEqual({ kind: 'remove', lineId: 'a2', rowKind: 'kit' })
  })
  it('adds the kit to a panel that did not have it', () => {
    const row = rows().find((r) => r.key === 'kit:ACB-1600')!
    expect(cellAction(row, 'p2', 1)).toEqual({ kind: 'add', sourceId: 'src-ACB-1600', rowKind: 'kit' })
  })
  it('refuses a negative quantity', () => {
    const row = rows().find((r) => r.key === 'kit:MCCB-250')!
    expect(cellAction(row, 'p1', -2)).toMatchObject({ kind: 'refuse' })
  })
  it('refuses to guess when the panel has it on more than one line', () => {
    const row = buildGrid(input({
      assemblies: [kitLine('a1', 'p1', 'MCCB-250', 2), kitLine('a2', 'p1', 'MCCB-250', 3)],
      items: [],
    })).sections.flatMap((s) => s.rows)[0]!
    expect(cellAction(row, 'p1', 9)).toMatchObject({ kind: 'refuse', reason: expect.stringContaining('panel editor') })
  })
  it('refuses to copy a typed-in line into another panel', () => {
    const row = buildGrid(input({
      items: [item('i1', 'f1', 'CONTROLS', 1, { is_manual: true, source_component_id: null })],
    })).sections.flatMap((s) => s.rows).find((r) => r.key === 'lump:CONTROLS')!
    expect(cellAction(row, 'p2', 1)).toMatchObject({ kind: 'refuse', reason: expect.stringContaining('typed-in') })
  })
  it('has nothing to remove from a blank cell', () => {
    const row = rows().find((r) => r.key === 'kit:ACB-1600')!
    expect(cellAction(row, 'p2', null)).toMatchObject({ kind: 'refuse', reason: 'Nothing to remove.' })
  })
})

describe('which section a row belongs to', () => {
  it('keeps the section the engineer typed', () => {
    expect(sectionFor('Incomer', 'MCCB', null, CATEGORIES)).toBe('Incomer')
    expect(sectionFor('  Sub-incomer ', null, null, CATEGORIES)).toBe('Sub-incomer')
  })
  it('falls back to the BOM category for a loose part', () => {
    expect(sectionFor(null, null, 'enclosure_parts', CATEGORIES)).toBe('Enclosure')
    expect(sectionFor(null, null, 'busbar', CATEGORIES)).toBe('Busbar & cable')
    expect(sectionFor(null, null, 'accessories_hardware', CATEGORIES)).toBe('Accessories & metering')
  })
  it('falls back to the kit group for a kit, and to Other with nothing to go on', () => {
    expect(sectionFor(null, 'ACB frame 1', null, CATEGORIES)).toBe('ACB frame 1')
    expect(sectionFor(null, null, null, CATEGORIES)).toBe('Other')
  })
})
