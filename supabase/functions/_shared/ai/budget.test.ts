import { describe, expect, it } from 'vitest'
import { decideAllowance } from './budget.ts'

/**
 * Acceptance test 6 (AI spec §9): with a 1,000-token budget the request is
 * refused with a clear message. The "no provider call" half is in agent.test.ts.
 */

const on = { enabled: true, monthly_token_budget: 1000, used_this_month: 0, recent_requests: 0, rate_limit_per_minute: 20 }

describe('may the assistant run?', () => {
  it('refuses a company that has not switched it on, and says who can', () => {
    const d = decideAllowance({ ...on, enabled: false })
    expect(d.ok).toBe(false)
    if (!d.ok) {
      expect(d.status).toBe(403)
      expect(d.reason).toMatch(/switched off/)
      expect(d.reason).toMatch(/master administrator/)
    }
  })

  it('refuses when the budget is used up, naming the figures and when it resets', () => {
    const d = decideAllowance({ ...on, used_this_month: 1000 })
    expect(d.ok).toBe(false)
    if (!d.ok) {
      expect(d.status).toBe(429)
      expect(d.reason).toMatch(/1,000 of 1,000 tokens/)
      expect(d.reason).toMatch(/resets on the 1st/)
    }
  })

  it('refuses when over budget too, not only exactly at it', () => {
    const d = decideAllowance({ ...on, used_this_month: 1450 })
    expect(d.ok).toBe(false)
  })

  it('refuses a company with no budget set at all, so nobody spends by omission', () => {
    const d = decideAllowance({ ...on, monthly_token_budget: 0 })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.reason).toMatch(/No monthly token budget/)
  })

  it('rate-limits one user, counting their own requests in the last minute', () => {
    const d = decideAllowance({ ...on, recent_requests: 20 })
    expect(d.ok).toBe(false)
    if (!d.ok) {
      expect(d.status).toBe(429)
      expect(d.reason).toMatch(/20 requests in the last minute/)
    }
    expect(decideAllowance({ ...on, recent_requests: 19 }).ok).toBe(true)
  })

  it('lets a request through with no warning under 80 %', () => {
    const d = decideAllowance({ ...on, used_this_month: 799 })
    expect(d).toEqual({ ok: true, warning: null, remaining: 201 })
  })

  it('warns from 80 % of the month’s budget', () => {
    const d = decideAllowance({ ...on, used_this_month: 800 })
    expect(d.ok).toBe(true)
    if (d.ok) expect(d.warning).toMatch(/80 %/)
  })

  it('treats a missing or odd answer from the database as switched off', () => {
    expect(decideAllowance(null).ok).toBe(false)
    expect(decideAllowance({ enabled: 'yes' }).ok).toBe(false)
    expect(decideAllowance({ enabled: true, monthly_token_budget: 'lots' }).ok).toBe(false)
  })

  it('accepts numbers that arrive as strings, which jsonb numerics can', () => {
    const d = decideAllowance({ ...on, monthly_token_budget: '2000000', used_this_month: '12' })
    expect(d.ok).toBe(true)
    if (d.ok) expect(d.remaining).toBe(1999988)
  })
})
