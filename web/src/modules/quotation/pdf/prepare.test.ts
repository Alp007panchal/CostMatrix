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
      price_rounding_step: 100, tax_pct: 16, enclosure_uplift_pct: 0, chosen_option_label: null,
      submitted_at: null, approved_at: null,
      returned_at: null, return_comment: null, created_at: '', updated_at: '',
    },
    panels: [], assemblies: [], items: [], labour: [], assemblyTotals: [],
    panelPrices: [], totals: null, optionTotals: [], kits: [],
    ...over,
  }
}

const panel = (id: string, name: string, qty: number, option: string | null = null, isOption = false) => ({
  id, costing_id: 'c', company_id: 'co', name, tag: null, option_label: option, uom: 'PC',
  quantity: qty, is_option: isOption, technical_description: null, enclosure_dimensions: null, sort_order: 0,
})
const price = (panel_id: string, unit: number, qty: number, isOption = false) => ({
  panel_id, material_cost: 0, labour_cost: 0, hours: 0, material_sell: 0, labour_sell: 0,
  unit_price: unit, line_total: unit * qty,
  is_option: isOption, in_chosen_offer: true, counts_in_total: !isOption,
})
const optionTotals = (
  option_label: string, subtotal: number, tax: number, grand_total: number,
  extras: { subtotal: number; tax: number; total: number } = { subtotal: 0, tax: 0, total: 0 },
) => ({
  option_label, subtotal, tax, grand_total,
  optional_subtotal: extras.subtotal, optional_tax: extras.tax, optional_total: extras.total,
  is_chosen: false,
})

describe('buildSchedules', () => {
  it('prints one table when there are no options, in the reference style', () => {
    const d = detail({
      panels: [panel('p1', '1600A Main LV Board', 1)],
      panelPrices: [price('p1', 5784800, 1)],
      optionTotals: [optionTotals('', 5784800, 925568, 6710368)],
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
        optionTotals('Option 1', 5784800, 925568, 6710368),
        optionTotals('Option 2', 7684700, 1229552, 8914252),
      ],
    })
    const schedules = buildSchedules(d, 'KSH')
    expect(schedules.map((s) => s.heading)).toEqual(['OPTION 1 — PRICE SCHEDULE', 'OPTION 2 — PRICE SCHEDULE'])
    expect(schedules[1]?.total).toBe('8,914,252.00')
  })

  it('leaves an optional extra out of the schedule and quotes it underneath', () => {
    const d = detail({
      panels: [panel('p1', 'Main board', 1), panel('p2', 'Spare feeder', 2, null, true)],
      panelPrices: [price('p1', 1000000, 1), price('p2', 50000, 2, true)],
      optionTotals: [optionTotals('', 1000000, 160000, 1160000, { subtotal: 100000, tax: 16000, total: 116000 })],
    })
    const [sch] = buildSchedules(d, 'KSH')
    expect(sch?.rows.map((r) => r.description)).toEqual(['MAIN BOARD'])
    expect(sch?.total).toBe('1,160,000.00')
    expect(sch?.optionalRows.map((r) => r.description)).toEqual(['SPARE FEEDER'])
    expect(sch?.optionalRows[0]).toMatchObject({ itemNo: 1, qty: '2', total: '100,000.00' })
    expect(sch?.optionalTotal).toBe('116,000.00')
  })

  it('has no extras table on an ordinary job', () => {
    const d = detail({
      panels: [panel('p1', 'Main board', 1)],
      panelPrices: [price('p1', 1000, 1)],
      optionTotals: [optionTotals('', 1000, 160, 1160)],
    })
    expect(buildSchedules(d, 'KSH')[0]?.optionalRows).toEqual([])
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

describe('buildTechnical and optional extras', () => {
  it('says in the technical annexure which line is an extra', () => {
    const d = detail({ panels: [panel('p1', 'Spare feeder', 1, 'Option 1', true)] })
    expect(buildTechnical(d)[0]?.particular).toBe('SPARE FEEDER - OPTION 1 - OPTIONAL EXTRA')
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
      assemblies: [{ id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', section: null, source_assembly_id: null, code: 'K', name: '250A MCCB KIT', quantity: 2, parameters: {}, sort_order: 0 }],
      items: [],
    })
    expect(buildTechnical(d)[0]?.description).toBe('KITS\n2 No. 250A MCCB KIT')
  })
  it('keeps the engineer\'s own text when there is one', () => {
    const d = detail({
      panels: [{ ...panel('p1', 'MAIN LV BOARD', 1), technical_description: 'As specified.', enclosure_dimensions: '2100(H) x 800(W)' }],
      assemblies: [{ id: 'a1', costing_id: 'c', panel_id: 'p1', kind: 'kit', section: null, source_assembly_id: null, code: 'K', name: 'KIT', quantity: 1, parameters: {}, sort_order: 0 }],
    })
    expect(buildTechnical(d)[0]?.description).toBe('As specified.\n\nProposed Enclosure: 2100(H) x 800(W)')
  })
})
