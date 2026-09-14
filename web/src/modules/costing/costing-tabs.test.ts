import { describe, expect, it } from 'vitest'
import type { Costing, CostingPanel, PanelPrice } from '../../lib/database.types'
import { costingSteps, costingTabs, firstTabKey } from './costing-tabs'

const panel = (id: string, name: string): CostingPanel => ({ id, name } as CostingPanel)
const price = (panel_id: string, line_total: number): PanelPrice => ({ panel_id, line_total } as PanelPrice)
const money = (n: number) => `KES ${n.toLocaleString()}`
const nothingOn = () => false
const allOn = () => true

describe('the left column', () => {
  it('makes one tab per panel, numbered, with its ex-VAT price beside it', () => {
    const tabs = costingTabs({
      panels: [panel('p1', 'MDB 1600 A'), panel('p2', 'Sub board')],
      panelPrices: [price('p1', 7_537_900)],
      on: nothingOn,
      money,
    })
    expect(tabs[0]).toMatchObject({ key: 'p1', label: '1 · MDB 1600 A', note: 'KES 7,537,900', group: 'panels' })
    // No price yet on a panel with nothing in it: no figure, rather than a zero.
    expect(tabs[1]?.note).toBeUndefined()
  })

  it('offers only what is switched on, and always the four that need no switch', () => {
    const off = costingTabs({ panels: [], panelPrices: [], on: nothingOn, money }).map((t) => t.key)
    expect(off).toEqual(['commercial', 'exports', 'approval'])

    const on = costingTabs({ panels: [], panelPrices: [], on: allOn, money }).map((t) => t.key)
    expect(on).toEqual(['grid', 'commercial', 'documents', 'actuals', 'assistant', 'exports', 'approval'])
  })

  it('opens on the first panel, or the grid for somebody who reads costings that way', () => {
    const tabs = costingTabs({ panels: [panel('p1', 'MDB')], panelPrices: [], on: allOn, money })
    expect(firstTabKey(tabs, false)).toBe('p1')
    expect(firstTabKey(tabs, true)).toBe('grid')
    // The grid is behind a switch; wanting it does not conjure it.
    const noGrid = costingTabs({ panels: [panel('p1', 'MDB')], panelPrices: [], on: nothingOn, money })
    expect(firstTabKey(noGrid, true)).toBe('p1')
  })

  it('has something to show even on a costing with no panels at all', () => {
    const tabs = costingTabs({ panels: [], panelPrices: [], on: nothingOn, money })
    expect(firstTabKey(tabs, false)).toBe('commercial')
  })
})

const costing = (over: Partial<Costing> = {}): Costing => ({
  status: 'draft', submitted_at: null, approved_at: null, ...over,
} as Costing)

describe('the status steps', () => {
  it('marks where it is now, what is behind it and what is ahead', () => {
    expect(costingSteps(costing(), false).map((s) => s.state)).toEqual(['now', 'later', 'later', 'later'])
    expect(costingSteps(costing({ status: 'submitted' }), false).map((s) => s.state))
      .toEqual(['done', 'now', 'later', 'later'])
    expect(costingSteps(costing({ status: 'approved' }), false).map((s) => s.state))
      .toEqual(['done', 'done', 'now', 'later'])
  })

  it('moves past Approved once the quotation is actually out', () => {
    const steps = costingSteps(costing({ status: 'approved' }), true)
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done'])
    expect(steps[3]?.label).toBe('Quotation released')
  })

  it('shows a returned costing as a draft again, which is what it is', () => {
    const returned = costing({ status: 'draft', submitted_at: '2026-09-01', return_comment: 'price the feeder once' })
    expect(costingSteps(returned, false).map((s) => s.state)).toEqual(['now', 'later', 'later', 'later'])
  })
})
