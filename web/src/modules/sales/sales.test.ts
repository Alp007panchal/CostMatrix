import { describe, expect, it } from 'vitest'
import type { MarginAchieved, SalesGroupOutcome, SalesOutcome, SalesPipelineRow } from '../../lib/database.types'
import {
  averageDaysToDecide, bandRank, byBand, byCustomer, byKitGroup, byMonth, lostReasons,
  marginDomain, percent, pipelineSummary, position, restsOn, tally,
} from './sales'

const out = (over: Partial<SalesOutcome> = {}): SalesOutcome => ({
  company_id: 'co', enquiry_id: 'e1', enquiry_no: 'ENQ-1', title: 'A board',
  customer_id: 'c1', customer_name: 'Triclover', received_on: '2026-09-01',
  status: 'won', decided_at: '2026-09-08T00:00:00Z', lost_reason: null, won_quotation_id: 'q1',
  days_to_decide: 7, quotations_released: 1, costing_id: 'k1', costing_no: 'NPP-1',
  value_ex_vat: 1000000, value_band: '500 K to 2 M', ...over,
})

describe('the hit rate', () => {
  it('counts decided jobs only — an open offer is not a loss', () => {
    const t = tally('all', [
      out({ status: 'won', value_ex_vat: 100 }),
      out({ status: 'lost', value_ex_vat: 300 }),
      out({ status: 'open', value_ex_vat: 900 }),
      out({ status: 'quoted', value_ex_vat: 50 }),
    ])
    expect(t.decided).toBe(2)
    expect(t.hitRate).toBe(0.5)
    expect(t.open).toBe(2)
    expect(t.openValue).toBe(950)
  })

  it('is null, not zero, before anything has been decided', () => {
    const t = tally('all', [out({ status: 'open' }), out({ status: 'quoted' })])
    expect(t.hitRate).toBeNull()
    expect(t.valueRate).toBeNull()
    expect(percent(t.hitRate)).toBe('—')
  })

  it('has a second figure by value, because one big job outweighs three small ones', () => {
    const t = tally('all', [
      out({ status: 'won', value_ex_vat: 100 }),
      out({ status: 'lost', value_ex_vat: 900 }),
    ])
    expect(t.hitRate).toBe(0.5)
    expect(t.valueRate).toBe(0.1)
  })

  it('says what it rests on', () => {
    expect(restsOn(tally('x', [out({ status: 'won' }), out({ status: 'lost' })]))).toBe('1 of 2 decided')
    expect(restsOn(tally('x', [out({ status: 'open' })]))).toBe('1 still open')
  })

  it('treats a missing value as nothing rather than crashing', () => {
    const t = tally('all', [out({ status: 'won', value_ex_vat: null })])
    expect(t.wonValue).toBe(0)
  })
})

describe('the four groupings', () => {
  const rows = [
    out({ enquiry_id: 'a', customer_name: 'Triclover', status: 'won', value_ex_vat: 1000, value_band: 'under 500 K', decided_at: '2026-09-08T00:00:00Z' }),
    out({ enquiry_id: 'b', customer_name: 'Triclover', status: 'lost', value_ex_vat: 2000, value_band: '500 K to 2 M', decided_at: '2026-08-20T00:00:00Z' }),
    out({ enquiry_id: 'c', customer_name: 'Bidco', status: 'won', value_ex_vat: 9000, value_band: 'over 10 M', decided_at: '2026-09-02T00:00:00Z' }),
  ]

  it('groups by customer, busiest first', () => {
    const byC = byCustomer(rows)
    expect(byC.map((t) => t.label)).toEqual(['Triclover', 'Bidco'])
    expect(byC[0]?.hitRate).toBe(0.5)
  })

  it('orders value bands smallest to largest, not alphabetically', () => {
    expect(byBand(rows).map((t) => t.label)).toEqual(['under 500 K', '500 K to 2 M', 'over 10 M'])
  })

  it('orders months newest first, and uses the month it was decided in', () => {
    expect(byMonth(rows).map((t) => t.label)).toEqual(['2026-09', '2026-08'])
  })

  it('falls back to the month it came in while a job is undecided', () => {
    const open = [out({ status: 'open', decided_at: null, received_on: '2026-07-14' })]
    expect(byMonth(open)[0]?.label).toBe('2026-07')
  })

  it('ranks the bands the database words', () => {
    expect(bandRank('under 500 K')).toBeLessThan(bandRank('500 K to 2 M'))
    expect(bandRank('500 K to 2 M')).toBeLessThan(bandRank('2 M to 10 M'))
    expect(bandRank('2 M to 10 M')).toBeLessThan(bandRank('over 10 M'))
    expect(bandRank('over 10 M')).toBeLessThan(bandRank('no value yet'))
  })
})

describe('why jobs were lost', () => {
  it('counts the reasons as they were heard, commonest first', () => {
    const reasons = lostReasons([
      out({ status: 'lost', lost_reason: 'price', value_ex_vat: 100 }),
      out({ status: 'lost', lost_reason: 'price', value_ex_vat: 200 }),
      out({ status: 'lost', lost_reason: 'delivery', value_ex_vat: 900 }),
      out({ status: 'won', lost_reason: null }),
    ])
    expect(reasons).toEqual([
      { reason: 'price', jobs: 2, value: 300 },
      { reason: 'delivery', jobs: 1, value: 900 },
    ])
  })
  it('does not hide a loss nobody gave a reason for', () => {
    expect(lostReasons([out({ status: 'lost', lost_reason: '  ' })])[0]?.reason).toBe('no reason recorded')
  })
})

describe('by product group', () => {
  const g = (over: Partial<SalesGroupOutcome>): SalesGroupOutcome => ({
    enquiry_id: 'e', status: 'won', value_ex_vat: 100, kit_group_name: 'MCCB',
    lines: 1, material: 1000, labour: 100, hours: 2, ...over,
  })
  it('gives a hit rate and the money at stake, biggest material first', () => {
    const rows = byKitGroup([
      g({ enquiry_id: '1', kit_group_name: 'MCCB', status: 'won', material: 1000 }),
      g({ enquiry_id: '2', kit_group_name: 'MCCB', status: 'lost', material: 500 }),
      g({ enquiry_id: '3', kit_group_name: 'ACB frame 1', status: 'won', material: 9000 }),
    ])
    expect(rows.map((r) => r.kitGroup)).toEqual(['ACB frame 1', 'MCCB'])
    expect(rows[1]?.hitRate).toBe(0.5)
    expect(rows[1]?.material).toBe(1500)
  })
  it('has no hit rate for a group whose jobs are all still open', () => {
    expect(byKitGroup([g({ status: 'open' })])[0]?.hitRate).toBeNull()
  })
})

describe('days to decide', () => {
  it('averages the decided jobs only', () => {
    expect(averageDaysToDecide([
      out({ status: 'won', days_to_decide: 4 }),
      out({ status: 'lost', days_to_decide: 10 }),
      out({ status: 'open', days_to_decide: null }),
    ])).toBe(7)
  })
  it('is null when nothing has been decided', () => {
    expect(averageDaysToDecide([out({ status: 'open', days_to_decide: null })])).toBeNull()
  })
})

describe('the pipeline', () => {
  const p = (over: Partial<SalesPipelineRow>): SalesPipelineRow => ({
    enquiry_id: 'e', enquiry_no: 'ENQ', title: 'T', customer_name: 'C', status: 'quoted',
    received_on: '2026-09-01', age_days: 11, value_ex_vat: 500, value_band: 'under 500 K',
    quotations_released: 1, latest_quotation: 'NPP-1', quotation_status: 'sent',
    sent_at: '2026-09-02T00:00:00Z', days_left: 12, has_run_out: false, ...over,
  })
  it('adds up what is out there, what is with the customer and what has run out', () => {
    const s = pipelineSummary([
      p({ enquiry_id: '1', value_ex_vat: 500 }),
      p({ enquiry_id: '2', value_ex_vat: 1500, quotation_status: 'released', has_run_out: true, age_days: 40 }),
      p({ enquiry_id: '3', value_ex_vat: null, quotation_status: null, age_days: 3 }),
    ])
    expect(s).toEqual({ jobs: 3, value: 2000, withCustomer: 1, runOut: 1, oldestDays: 40 })
  })
  it('says nothing rather than a zero when the pipeline is empty', () => {
    expect(pipelineSummary([]).oldestDays).toBeNull()
  })
})

describe('the margin dumbbell scale', () => {
  const m = (quoted: number, achieved: number): MarginAchieved => ({
    costing_id: 'k', costing_no: 'NPP-1', revision_no: 0, price_ex_vat: 100, material_cost: 50,
    labour_quoted: 10, labour_achieved: 20, hours_quoted: 2, hours_achieved: 4,
    margin_quoted_pct: quoted, margin_achieved_pct: achieved, labour_measured_pct: 100,
  })
  it('always includes zero, so a negative margin reads as below the line', () => {
    const d = marginDomain([m(12, -4)].flatMap((r) => [r.margin_quoted_pct, r.margin_achieved_pct]))
    expect(d.min).toBeLessThan(-4)
    expect(d.max).toBeGreaterThan(12)
    expect(position(0, d)).toBeGreaterThan(0)
  })
  it('survives having nothing to scale', () => {
    expect(marginDomain([])).toEqual({ min: 0, max: 1 })
    expect(marginDomain([null, null])).toEqual({ min: 0, max: 1 })
    expect(position(5, { min: 0, max: 0 })).toBe(0)
  })
  it('clamps an outlier to the track', () => {
    const d = marginDomain([0, 10])
    expect(position(-100, d)).toBe(0)
    expect(position(100, d)).toBe(1)
  })
})
