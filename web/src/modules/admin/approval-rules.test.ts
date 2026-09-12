import { describe, expect, it } from 'vitest'
import {
  conditionSentence, factValue, ruleProblem, ruleSentence, toCondition, toRows, verdictSentence,
} from './approval-rules'

describe('a rule read back in words', () => {
  it('says what it tests and what it does', () => {
    expect(
      ruleSentence({
        condition: [{ field: 'total_ex_vat', op: '<', value: 500000 }],
        outcome: 'auto_approve',
      }),
    ).toBe('When Job total before VAT is under 500,000: approve it automatically')
  })

  it('joins several conditions with "and", because all of them must hold', () => {
    expect(
      ruleSentence({
        condition: [
          { field: 'total_ex_vat', op: '<', value: 500000 },
          { field: 'uses_placeholder_part', op: '=', value: false },
        ],
        outcome: 'auto_approve',
      }),
    ).toBe(
      'When Job total before VAT is under 500,000 and Has a part with no price is no: approve it automatically',
    )
  })

  it('says "always" for a rule with no conditions, which is what the default one is', () => {
    expect(ruleSentence({ condition: [], outcome: 'require_approver' })).toBe(
      'Always: an approver must approve it',
    )
  })

  it('shows each fact in its own units', () => {
    expect(factValue('total_ex_vat', 1234567)).toBe('1,234,567')
    expect(factValue('profit_margin_pct', 12)).toBe('12 %')
    expect(factValue('price_age_days', 1)).toBe('1 day')
    expect(factValue('price_age_days', 90)).toBe('90 days')
    expect(factValue('uses_placeholder_part', true)).toBe('yes')
    expect(factValue('uses_placeholder_part', false)).toBe('no')
    expect(factValue('total_ex_vat', null)).toBe('not known')
  })

  it('falls back to the raw field name for a fact it does not know', () => {
    expect(conditionSentence({ field: 'something_new', op: '>', value: 3 })).toBe('something_new is over 3')
  })
})

describe('what the verdict means to the person looking at the costing', () => {
  it('explains each outcome, naming the rule', () => {
    expect(verdictSentence('auto_approve', 'Small jobs')).toMatch(/approves itself when you submit it — Small jobs/)
    expect(verdictSentence('require_approver', 'Always require an approver')).toMatch(/An approver has to approve/)
    expect(verdictSentence('require_master_admin', 'Very big jobs')).toMatch(/Only the master administrator/)
    expect(verdictSentence('block', 'No unpriced parts')).toMatch(/cannot be submitted as it stands/)
  })

  it('reads sensibly when no rule is named', () => {
    expect(verdictSentence('require_approver', null)).toBe('An approver has to approve this one.')
  })
})

describe('checking a rule somebody is typing', () => {
  const ok = { name: 'Small jobs', condition: [{ field: 'total_ex_vat', op: '<', value: '500000' }] }

  it('accepts a sound rule', () => {
    expect(ruleProblem(ok)).toBeNull()
  })

  it('insists on a name, because the history records which rule decided', () => {
    expect(ruleProblem({ ...ok, name: '  ' })).toMatch(/Give the rule a name/)
  })

  it('refuses a fact nothing can answer and a comparison that is not one', () => {
    expect(ruleProblem({ ...ok, condition: [{ field: 'phase_of_moon', op: '<', value: '1' }] })).toMatch(/not something a rule can test/)
    expect(ruleProblem({ ...ok, condition: [{ field: 'total_ex_vat', op: '~', value: '1' }] })).toMatch(/not a comparison/)
  })

  it('refuses a value that is not a number where a number is meant', () => {
    expect(ruleProblem({ ...ok, condition: [{ field: 'total_ex_vat', op: '<', value: 'lots' }] })).toMatch(/not a number/)
    expect(ruleProblem({ ...ok, condition: [{ field: 'total_ex_vat', op: '<', value: '' }] })).toMatch(/not a number/)
  })

  it('keeps a yes-or-no fact to yes or no, and to "is" or "is not"', () => {
    expect(ruleProblem({ ...ok, condition: [{ field: 'uses_placeholder_part', op: '=', value: 'true' }] })).toBeNull()
    expect(ruleProblem({ ...ok, condition: [{ field: 'uses_placeholder_part', op: '=', value: '3' }] })).toMatch(/compared with yes or no/)
    expect(ruleProblem({ ...ok, condition: [{ field: 'uses_placeholder_part', op: '<', value: 'true' }] })).toMatch(/only be "is" or "is not"/)
  })
})

describe('the boxes and what the database stores', () => {
  it('sends a number as a number and a yes-or-no as a boolean', () => {
    expect(toCondition([
      { field: 'total_ex_vat', op: '<', value: '500000' },
      { field: 'uses_placeholder_part', op: '=', value: 'false' },
    ])).toEqual([
      { field: 'total_ex_vat', op: '<', value: 500000 },
      { field: 'uses_placeholder_part', op: '=', value: false },
    ])
  })

  it('reads a saved rule back into the boxes unchanged', () => {
    const stored = [
      { field: 'total_ex_vat', op: '<', value: 500000 },
      { field: 'uses_placeholder_part', op: '=', value: false },
    ]
    expect(toCondition(toRows(stored))).toEqual(stored)
  })
})
