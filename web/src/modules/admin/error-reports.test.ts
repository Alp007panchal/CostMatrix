import { describe, expect, it } from 'vitest'
import type { ErrorReport } from '../../lib/database.types'
import { kindLabel, nothingWrong, orderReports, summary, timesLabel, whereLabel } from './error-reports'

function report(over: Partial<ErrorReport> = {}): ErrorReport {
  return {
    id: 'r1',
    company_id: 'c1',
    company_name: 'Alpha',
    user_id: 'u1',
    full_name: 'Carol',
    kind: 'render',
    path: '/costings/abc',
    message: 'Cannot read properties of null',
    detail: null,
    user_agent: null,
    first_seen_at: '2026-09-13T09:00:00Z',
    last_seen_at: '2026-09-13T09:00:00Z',
    times_seen: 1,
    ...over,
  }
}

describe('ordering', () => {
  it('puts what happened most recently first', () => {
    const rows = [
      report({ id: 'old', last_seen_at: '2026-09-01T00:00:00Z' }),
      report({ id: 'new', last_seen_at: '2026-09-13T00:00:00Z' }),
    ]
    expect(orderReports(rows).map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('breaks a tie on how often, because that is the next most useful thing', () => {
    const rows = [
      report({ id: 'once', times_seen: 1 }),
      report({ id: 'often', times_seen: 40 }),
    ]
    expect(orderReports(rows).map((r) => r.id)).toEqual(['often', 'once'])
  })

  it('does not reorder the caller’s array', () => {
    const rows = [report({ id: 'a', last_seen_at: '2026-09-01T00:00:00Z' }), report({ id: 'b' })]
    orderReports(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('wording', () => {
  it('says what happened in words, not in jargon', () => {
    expect(kindLabel('render')).toBe('The screen stopped drawing')
    expect(kindLabel('load')).toBe('Something would not load')
  })

  it('counts in English', () => {
    expect(timesLabel(report({ times_seen: 1 }))).toBe('once')
    expect(timesLabel(report({ times_seen: 4 }))).toBe('4 times')
  })

  it('shortens the long ids in a route, which say nothing on their own', () => {
    expect(whereLabel('/costings/2f1c9e7a-1111-4222-8333-444455556666')).toBe('/costings/…')
    expect(whereLabel('/quotations')).toBe('/quotations')
    expect(whereLabel('/')).toBe('the home page')
    expect(whereLabel('')).toBe('the home page')
  })

  it('reads silence as good news rather than as a broken page', () => {
    const text = nothingWrong(30)
    expect(text).toContain('Nothing has gone wrong')
    expect(text).toContain('nobody has to send them')
  })

  it('summarises faults, occurrences and people separately', () => {
    // The three numbers are different questions: how many things are wrong, how
    // much they are happening, and how many people are meeting them.
    const rows = [
      report({ id: 'a', user_id: 'u1', times_seen: 3 }),
      report({ id: 'b', user_id: 'u2', times_seen: 1 }),
    ]
    expect(summary(rows)).toBe('2 faults, 4 times in all, affecting 2 people.')
  })

  it('counts one person once, however many faults they met', () => {
    const rows = [report({ id: 'a', user_id: 'u1' }), report({ id: 'b', user_id: 'u1' })]
    expect(summary(rows)).toBe('2 faults, 2 times in all, affecting 1 person.')
  })

  it('says nothing at all when there is nothing', () => {
    expect(summary([])).toBe('')
  })
})
