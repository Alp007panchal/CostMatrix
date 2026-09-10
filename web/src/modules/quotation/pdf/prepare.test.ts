import { describe, expect, it } from 'vitest'
import type { CostingDetail } from '../../costing/api'
import { buildSchedules, buildTechnical, buildTerms, splitLines } from './prepare'

function detail(over: Partial<CostingDetail> = {}): CostingDetail {
  return {
    costing: {
      id: 'c', company_id: 'co', enquiry_id: null, costing_no: 'CM-2026-0001', revision_no: 0, family_id: 'f',
      previous_revision_id: null, is_current: true, title: 'MCC', notes: null, status: 'approved',
      currency_code: 'KES', currency_label: 'KSH', exchange_rate: 1, discount_pct: 0,
      material_margin_pct: 10, labour_margin_pct: 20, negotiation_margin_pct: 0,
      price_rounding_step: 100, tax_pct: 16, enclosure_uplift_pct: 0, submitted_at: null, approved_at: null,
      returned_at: null, return_comment: null, created_at: '', updated_at: '',
    },
    panels: [], assemblies: [], items: [], labour: [], assemblyTotals: [],
    panelPrices: [], totals: null, optionTotals: [], kits: [],
    ...over,
  }
}

const panel = (id: string, name: string, qty: number, option: string | null = null) => ({
  id, costing_id: 'c', company_id: 'co', name, tag: null, option_label: option, uom: 'PC',
  quantity: qty, technical_description: null, enclosure_dimensions: null, sort_order: 0,
})
const price = (panel_id: string, unit: number, qty: number) => ({
  panel_id, material_cost: 0, labour_cost: 0, hours: 0, material_sell: 0, labour_sell: 0,
  unit_price: unit, line_total: unit * qty,
})

describe('buildSchedules', () => {
  it('prints one table when there are no options, in the reference style', () => {
    const d = detail({
      panels: [panel('p1', '1600A Main LV Board', 1)],
      panelPrices: [price('p1', 5784800, 1)],
      optionTotals: [{ option_label: '', subtotal: 5784800, tax: 925568, grand_total: 6710368 }],
    })
    const [sch] = buildSchedules(d, 'KSH')
    expect(buildSchedules(d, 'KSH')).toHaveLength(1)
    expect(sch?.heading).toBe('LV BOARDS PRICE SCHEDULE')
    expect(sch?.rows[0]).toMatchObject({ itemNo: 1, description: '1600A MAIN LV BOARD', uom: 'PC', qty: '1', unitPrice: '5,784,800.00', total: '5,784,800.00' })
    expect(sch?.taxLabel).toBe('16% VAT-IN KSH.')
    expect(sch?.tax).toBe('925,568.00')
    expect(sch?.total).toBe('6,710,368.00')
  })

  it('prints one table per option, each with its own totals', () => {
    const d = detail({
      panels: [panel('p1', 'Board', 1, 'Option 1'), panel('p2', 'Board', 1, 'Option 2')],
      panelPrices: [price('p1', 5784800, 1), price('p2', 7684700, 1)],
      optionTotals: [
        { option_label: 'Option 1', subtotal: 5784800, tax: 925568, grand_total: 6710368 },
        { option_label: 'Option 2', subtotal: 7684700, tax: 1229552, grand_total: 8914252 },
      ],
    })
    const schedules = buildSchedules(d, 'KSH')
    expect(schedules.map((s) => s.heading)).toEqual(['OPTION 1 — PRICE SCHEDULE', 'OPTION 2 — PRICE SCHEDULE'])
    expect(schedules[1]?.total).toBe('8,914,252.00')
  })

  it('numbers items from 1 within each option', () => {
    const d = detail({
      panels: [panel('a', 'A', 1, 'Option 1'), panel('b', 'B', 1, 'Option 1'), panel('c', 'C', 1, 'Option 2')],
      panelPrices: [price('a', 1, 1), price('b', 1, 1), price('c', 1, 1)],
    })
    const [one, two] = buildSchedules(d, 'KSH')
    expect(one?.rows.map((r) => r.itemNo)).toEqual([1, 2])
    expect(two?.rows.map((r) => r.itemNo)).toEqual([1])
  })
})

describe('buildTerms', () => {
  it('drops empty sections and keeps the order of the reference document', () => {
    const terms = buildTerms({
      scope_of_supply: 'Supply only.', validity: null, payment: '50% with order.',
      delivery_terms: '  ', delivery_timelines: 'TBA',
    })
    expect(terms.map((t) => t.heading)).toEqual(['SCOPE OF SUPPLY', 'TERMS OF PAYMENT', 'DELIVERY TIMELINES'])
  })
})

describe('buildTechnical', () => {
  it('appends the enclosure line after the description', () => {
    const d = detail({
      panels: [{ ...panel('p1', 'Main LV Board', 1, 'Option 1'), technical_description: 'Form 3B, IP31.', enclosure_dimensions: '2100(H)x3500(W)x800(D)mm' }],
    })
    const [row] = buildTechnical(d)
    expect(row?.particular).toBe('MAIN LV BOARD - OPTION 1')
    expect(row?.description).toBe('Form 3B, IP31.\n\nProposed Enclosure: 2100(H)x3500(W)x800(D)mm')
  })
})

describe('splitLines', () => {
  it('turns typed notes into bullets, tolerating existing bullet marks', () => {
    expect(splitLines('• Siemens switchgear.\n- Supply only.\n\nIP31 board.')).toEqual([
      'Siemens switchgear.', 'Supply only.', 'IP31 board.',
    ])
  })
})

describe('buildTechnical from the kits', () => {
  it('writes the description from the kits when the engineer has not', () => {
    const d = detail({
      panels: [panel('p1', 'MAIN LV BOARD', 1, 'Option 1')],
      assemblies: [{ id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', source_assembly_id: null, code: 'K', name: '250A MCCB KIT', quantity: 2, sort_order: 0 }],
      items: [],
    })
    expect(buildTechnical(d)[0]?.description).toBe('KITS\n2 No. 250A MCCB KIT')
  })
  it('keeps the engineer\'s own text when there is one', () => {
    const d = detail({
      panels: [{ ...panel('p1', 'MAIN LV BOARD', 1), technical_description: 'As specified.', enclosure_dimensions: '2100(H) x 800(W)' }],
      assemblies: [{ id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', source_assembly_id: null, code: 'K', name: 'KIT', quantity: 1, sort_order: 0 }],
    })
    expect(buildTechnical(d)[0]?.description).toBe('As specified.\n\nProposed Enclosure: 2100(H) x 800(W)')
  })
})
