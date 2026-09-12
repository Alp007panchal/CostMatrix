import { describe, expect, it } from 'vitest'
import type { CostingPanel, CostingTotals, PanelPrice } from '../../lib/database.types'
import { buildGrid, type GridInput } from './grid'
import { gridCells, gridFileName, panelCells } from './grid-export'

const panel = (id: string, name: string, over: Partial<CostingPanel> = {}): CostingPanel => ({
  id, costing_id: 'c', company_id: 'co', name, tag: 'Ground floor', option_label: null, uom: 'PC',
  quantity: 1, is_option: false, technical_description: null, enclosure_dimensions: null,
  sort_order: 0, ...over,
})
const price = (panel_id: string): PanelPrice => ({
  panel_id, material_cost: 1000.456, labour_cost: 100, hours: 2, material_sell: 1100,
  labour_sell: 110, unit_price: 1300, line_total: 1300, is_option: false, in_chosen_offer: true,
  counts_in_total: true,
})
const TOTALS: CostingTotals = {
  costing_id: 'c', material_cost: 1000.456, labour_cost: 100, hours: 2, subtotal: 1300, tax: 208,
  grand_total: 1508, optional_subtotal: 0, optional_tax: 0, optional_total: 0,
  chosen_option_label: null, option_count: 0,
}

const INPUT: GridInput = {
  panels: [panel('p1', 'MDB'), panel('p2', 'DB-1', { quantity: 2, is_option: true })],
  assemblies: [
    { id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', section: 'Incomer', source_assembly_id: 's1',
      code: 'ACB-1600', name: '1600A ACB KIT', quantity: 1, sort_order: 0 },
    { id: 'f1', costing_id: 'c', panel_id: 'p1', kind: 'free', section: null, source_assembly_id: null,
      code: 'FREE', name: 'Loose', quantity: 1, sort_order: 1 },
  ] as GridInput['assemblies'],
  items: [{
    id: 'i1', costing_id: 'c', costing_assembly_id: 'f1', source_component_id: null, code: 'CONTROLS',
    name: 'CONTROLS & WIRING', category_code: 'accessories_hardware', unit: 'lot', manufacturer: null,
    part_number: null, quantity: 1, pricing_mode: 'fixed', purchase_price: null, purchase_currency: null,
    landed_factor: null, uplift_pct: null, unit_price: 50000, is_manual: true, sort_order: 0,
  }],
  panelPrices: [price('p1'), price('p2')],
  totals: TOTALS,
  kits: [],
  components: [],
  categoryNames: { accessories_hardware: 'Accessories and hardware' },
  roundingStep: 100,
}

describe('the grid as spreadsheet cells', () => {
  const cells = gridCells(buildGrid(INPUT))

  it('heads the columns with the panels, their quantity and the option tag', () => {
    expect(cells[0]).toEqual(['Kit / component', 'Group', 'MDB', 'DB-1 · qty 2 · option', 'All panels'])
  })

  it('writes a section heading on its own row', () => {
    expect(cells.some((r) => r.length === 1 && r[0] === 'INCOMER')).toBe(true)
  })

  it('leaves a cell blank where the panel does not use the row, rather than writing zero', () => {
    const row = cells.find((r) => String(r[0]).startsWith('1600A ACB KIT'))!
    expect(row[2]).toBe(1)
    expect(row[3]).toBe('')
    expect(row[4]).toBe(1)
  })

  it('names what kind of line a loose one is', () => {
    expect(cells.some((r) => r[0] === 'CONTROLS & WIRING (lump sum)')).toBe(true)
  })

  it('ends with the same four total rows as the screen, rounded to the cent', () => {
    const totals = cells.slice(-4)
    expect(totals.map((r) => String(r[0]))).toEqual([
      'Material, KES',
      'Labour, KES (hours × rate)',
      'Selling price ex-VAT, each (material and labour at their margins)',
      'Panel price, rounded up to KES 100',
    ])
    expect(totals[0]?.[2]).toBe(1000.46)
    expect(totals[0]?.[3]).toBe(2000.91)
    expect(totals[3]?.[4]).toBe(1300)
  })
})

describe('the per-panel sheet', () => {
  const rows = panelCells(buildGrid(INPUT))
  it('lists one row per panel with what it costs and sells for', () => {
    expect(rows[0]?.slice(0, 4)).toEqual(['Panel', 'Description', 'Quantity', 'Optional extra'])
    expect(rows[1]?.slice(0, 4)).toEqual(['MDB', 'Ground floor', 1, ''])
    expect(rows[2]?.slice(0, 4)).toEqual(['DB-1', 'Ground floor', 2, 'yes'])
    expect(rows[1]?.[4]).toBe(1000.46)
    expect(rows[1]?.[7]).toBe(1210)
  })
})

describe('the file name', () => {
  it('names it by costing and revision', () => {
    expect(gridFileName('NPP-201', 0)).toBe('NPP-201-panels-at-a-glance.xlsx')
    expect(gridFileName('NPP-201', 2)).toBe('NPP-201-rev2-panels-at-a-glance.xlsx')
  })
})
