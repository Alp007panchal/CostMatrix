import { describe, expect, it } from 'vitest'
import type { CompatibilityRule } from '../../lib/database.types'
import {
  kindLabel, numberProblem, ruleNumber, ruleSentence, ruleSource, withNumber,
} from './compatibility-rules'

const rule = (over: Partial<CompatibilityRule> = {}): CompatibilityRule => ({
  id: 'r1',
  company_id: null,
  rule_kind: 'feeders_vs_incomer',
  name: 'Outgoing ways far above the incomer',
  params: { max_ratio: 4 },
  severity: 'warning',
  message: 'The outgoing ways come to {feeder_a} A.',
  is_active: true,
  sort_order: 3,
  ...over,
})

describe('ruleNumber and withNumber', () => {
  it('finds the one number a kind has', () => {
    expect(ruleNumber(rule())).toBe(4)
    expect(ruleNumber(rule({ rule_kind: 'device_depth_vs_cubicle', params: { clearance_mm: 100 } }))).toBe(100)
  })

  it('says there is none where a kind has none', () => {
    expect(ruleNumber(rule({ rule_kind: 'accessory_fits_device', params: { attribute: 'fits_frames' } }))).toBeNull()
  })

  it('treats a missing or unreadable figure as none rather than as zero', () => {
    expect(ruleNumber(rule({ params: {} }))).toBeNull()
    expect(ruleNumber(rule({ params: { max_ratio: 'four' } }))).toBeNull()
  })

  it('changes that number and leaves the rest of the parameters alone', () => {
    const params = withNumber(rule({ params: { max_ratio: 4, feeder_sections: ['Outgoers'] } }), 6)
    expect(params).toEqual({ max_ratio: 6, feeder_sections: ['Outgoers'] })
  })

  it('changes nothing for a kind with no number', () => {
    const original = { attribute: 'fits_frames' }
    expect(withNumber(rule({ rule_kind: 'accessory_fits_device', params: original }), 9)).toEqual(original)
  })
})

describe('numberProblem', () => {
  it('refuses a ratio that would warn about every board', () => {
    expect(numberProblem('feeders_vs_incomer', 0)).toMatch(/every board/)
    expect(numberProblem('feeders_vs_incomer', 4)).toBeNull()
  })

  it('refuses a negative clearance but allows none at all', () => {
    expect(numberProblem('device_depth_vs_cubicle', -1)).toMatch(/less than nothing/)
    expect(numberProblem('device_depth_vs_cubicle', 0)).toBeNull()
  })

  it('and says nothing about a kind with no number', () => {
    expect(numberProblem('accessory_fits_device', Number.NaN)).toBeNull()
  })
})

describe('wording', () => {
  it('names the check and the figure it uses', () => {
    expect(ruleSentence(rule())).toContain('Do the outgoing ways add up?')
    expect(ruleSentence(rule())).toContain('4 ×')
    expect(ruleSentence(rule())).toContain('changes no figure')
  })

  it('says plainly when a rule can refuse a costing', () => {
    expect(ruleSentence(rule({ severity: 'blocker' }))).toContain('can refuse a costing')
  })

  it('says whose rule it is', () => {
    expect(ruleSource(rule())).toBe('Everybody')
    expect(ruleSource(rule({ company_id: 'c1' }))).toBe('Ours')
  })

  it('falls back to the kind itself if a new one is ever added', () => {
    expect(kindLabel('accessory_fits_device')).toBe('Does that part belong to that device?')
  })
})
