import { describe, expect, it } from 'vitest'
import type { PanelWarning } from '../../lib/database.types'
import {
  costingWarningSummary, orderWarnings, warningsByPanel, warningsHeading,
} from './warnings'

const warning = (over: Partial<PanelWarning>): PanelWarning => ({
  company_id: 'c1',
  costing_id: 'k1',
  panel_id: 'p1',
  panel_name: 'MAIN LV BOARD',
  rule_id: 'r1',
  rule_kind: 'feeders_vs_incomer',
  rule_name: 'Outgoing ways far above the incomer',
  severity: 'warning',
  subject: 'MAIN LV BOARD',
  message: 'The outgoing ways come to 1200 A against a 250 A incomer.',
  detail: {},
  ...over,
})

describe('orderWarnings', () => {
  it('puts a blocker above a warning', () => {
    const list = orderWarnings([
      warning({ rule_id: 'a' }),
      warning({ rule_id: 'b', severity: 'blocker', rule_name: 'Zzz last alphabetically' }),
    ])
    expect(list.map((w) => w.rule_id)).toEqual(['b', 'a'])
  })

  it('then reads in rule order, then by what the finding is about', () => {
    const list = orderWarnings([
      warning({ rule_id: 'a', rule_name: 'B rule', subject: 'Kit 2' }),
      warning({ rule_id: 'b', rule_name: 'A rule', subject: 'Kit 9' }),
      warning({ rule_id: 'c', rule_name: 'B rule', subject: 'Kit 1' }),
    ])
    expect(list.map((w) => w.rule_id)).toEqual(['b', 'c', 'a'])
  })

  it('leaves the list it was given alone', () => {
    const given = [warning({ rule_id: 'a' }), warning({ rule_id: 'b', severity: 'blocker' })]
    orderWarnings(given)
    expect(given.map((w) => w.rule_id)).toEqual(['a', 'b'])
  })
})

describe('warningsByPanel', () => {
  it('keeps each panel to itself', () => {
    const map = warningsByPanel([
      warning({ panel_id: 'p1' }),
      warning({ panel_id: 'p2' }),
      warning({ panel_id: 'p1', rule_id: 'r2' }),
    ])
    expect(map.get('p1')).toHaveLength(2)
    expect(map.get('p2')).toHaveLength(1)
    expect(map.get('p3')).toBeUndefined()
  })
})

describe('warningsHeading', () => {
  it('says nothing when there is nothing to say', () => {
    expect(warningsHeading([])).toBe('')
  })

  it('counts what there is', () => {
    expect(warningsHeading([warning({})])).toBe('1 thing to check')
    expect(warningsHeading([warning({}), warning({ rule_id: 'r2' })])).toBe('2 things to check')
  })

  it('says plainly when a blocker is among them', () => {
    expect(warningsHeading([warning({ severity: 'blocker' })]))
      .toBe('1 thing to check, and it may stop this costing being submitted')
    expect(warningsHeading([warning({ severity: 'blocker' }), warning({ rule_id: 'r2' })]))
      .toBe('2 things to check, 1 of which may stop this costing being submitted')
  })
})

describe('costingWarningSummary', () => {
  it('counts the panels as well as the findings', () => {
    expect(costingWarningSummary([])).toBe('')
    expect(costingWarningSummary([warning({})])).toBe('1 thing to check on 1 panel')
    expect(costingWarningSummary([warning({}), warning({ panel_id: 'p2' })]))
      .toBe('2 things to check on 2 panels')
  })
})
