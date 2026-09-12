import { describe, expect, it } from 'vitest'
import type { KitGroupLabourVariance } from '../../lib/database.types'
import {
  byHoursAtStake, groupLabel, varianceSentence, weigh, weightSentence, worthChanging,
} from './labour-variance'

const row = (over: Partial<KitGroupLabourVariance> = {}): KitGroupLabourVariance => ({
  company_id: 'co', kit_group_id: 'g1', kit_group_name: 'MCCB', process_type: 'assembly',
  process_name: 'Panel assembly', sort_order: 1, jobs: 1, panels: 1, kit_units: 6,
  estimated_hours: 24, actual_hours: 27.69, estimated_hours_per_kit: 4,
  actual_hours_per_kit: 4.62, variance_pct: 15.4, suggested_hours: 4.62, standard_hours: 4,
  ...over,
})

describe('how much a suggestion rests on', () => {
  it('calls one job too little to change a standard on', () => {
    expect(weigh(row({ jobs: 1, kit_units: 6 }))).toBe('thin')
    expect(weightSentence(row({ jobs: 1, kit_units: 6 }))).toBe('1 job, 6 kits — too little to change a standard on')
  })
  it('calls a handful a useful hint', () => {
    expect(weigh(row({ jobs: 3, kit_units: 12 }))).toBe('fair')
    expect(weightSentence(row({ jobs: 3, kit_units: 12 }))).toContain('not yet a standard')
  })
  it('takes five jobs and twenty kits seriously', () => {
    expect(weigh(row({ jobs: 6, kit_units: 40 }))).toBe('solid')
    expect(weightSentence(row({ jobs: 6, kit_units: 40 }))).toContain('enough to take seriously')
  })
  it('counts one kit in the singular', () => {
    expect(weightSentence(row({ jobs: 1, kit_units: 1 }))).toBe('1 job, 1 kit — too little to change a standard on')
  })
})

describe('varianceSentence', () => {
  it('says longer, quicker or exactly', () => {
    expect(varianceSentence(row({ variance_pct: 15.4 }))).toBe('15.4 % longer than estimated')
    expect(varianceSentence(row({ variance_pct: -8 }))).toBe('8.0 % quicker than estimated')
    expect(varianceSentence(row({ variance_pct: 0 }))).toBe('exactly as estimated')
  })
  it('says so when there is nothing to compare with', () => {
    expect(varianceSentence(row({ variance_pct: null }))).toBe('nothing to compare')
  })
})

describe('worthChanging', () => {
  it('is false when the suggestion is what the standard already says', () => {
    expect(worthChanging(row({ suggested_hours: 4, standard_hours: 4 }))).toBe(false)
    expect(worthChanging(row({ suggested_hours: 4.02, standard_hours: 4 }))).toBe(false)
  })
  it('is true for a real difference, and where there is no standard yet', () => {
    expect(worthChanging(row({ suggested_hours: 4.62, standard_hours: 4 }))).toBe(true)
    expect(worthChanging(row({ suggested_hours: 4.62, standard_hours: null }))).toBe(true)
  })
})

describe('ordering and labels', () => {
  it('puts the hours at stake first, not the biggest percentage', () => {
    const small = row({ kit_group_name: 'TINY', estimated_hours: 1, actual_hours: 2, variance_pct: 100 })
    const big = row({ kit_group_name: 'BIG', estimated_hours: 100, actual_hours: 130, variance_pct: 30 })
    expect(byHoursAtStake([small, big]).map((r) => r.kit_group_name)).toEqual(['BIG', 'TINY'])
  })
  it('does not mutate what it was given', () => {
    const list = [row({ kit_group_name: 'A', estimated_hours: 1, actual_hours: 2 }), row({ kit_group_name: 'B', estimated_hours: 1, actual_hours: 50 })]
    byHoursAtStake(list)
    expect(list.map((r) => r.kit_group_name)).toEqual(['A', 'B'])
  })
  it('names the kits that belong to no group', () => {
    expect(groupLabel(row({ kit_group_name: null }))).toBe('Kits with no group')
  })
})
