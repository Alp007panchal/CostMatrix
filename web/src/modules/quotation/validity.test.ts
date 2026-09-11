import { describe, expect, it } from 'vitest'
import { sweepLabel, validityLabel } from './validity'

describe('how long a quotation has left', () => {
  const base = { valid_until: '2026-10-01', expired_at: null }

  it('says nothing useful when there is no date, rather than pretending', () => {
    expect(validityLabel({ ...base, valid_until: null, days_left: null, has_run_out: false })).toEqual({
      tone: 'muted', text: 'No validity date',
    })
    expect(validityLabel(null).text).toBe('No validity date')
  })

  it('counts the days left while there is room', () => {
    expect(validityLabel({ ...base, days_left: 20, has_run_out: false })).toEqual({
      tone: 'ok', text: 'Valid for 20 more days',
    })
  })

  it('warns as the date comes close', () => {
    expect(validityLabel({ ...base, days_left: 7, has_run_out: false })).toEqual({
      tone: 'muted', text: 'Runs out in 7 days',
    })
    expect(validityLabel({ ...base, days_left: 1, has_run_out: false })).toEqual({
      tone: 'muted', text: 'Runs out in 1 day',
    })
  })

  it('tells today and yesterday apart, because they mean opposite things', () => {
    expect(validityLabel({ ...base, days_left: 0, has_run_out: false })).toEqual({
      tone: 'error', text: 'Runs out today',
    })
    expect(validityLabel({ ...base, days_left: 0, has_run_out: true })).toEqual({
      tone: 'error', text: 'Ran out today',
    })
    expect(validityLabel({ ...base, days_left: -1, has_run_out: true })).toEqual({
      tone: 'error', text: 'Ran out 1 day ago',
    })
    expect(validityLabel({ ...base, days_left: -12, has_run_out: true })).toEqual({
      tone: 'error', text: 'Ran out 12 days ago',
    })
  })

  it('believes the days even if nothing has swept yet', () => {
    expect(validityLabel({ ...base, days_left: -3, has_run_out: false }).text).toBe('Ran out 3 days ago')
  })
})

describe('what a sweep found', () => {
  it('says so plainly when there was nothing to do', () => {
    expect(sweepLabel({ expired: 0, followups: 0 })).toBe('Nothing had run out.')
  })

  it('counts what it marked and what it raised', () => {
    expect(sweepLabel({ expired: 1, followups: 1 })).toBe(
      '1 quotation marked as run out. 1 follow-up raised for the ones that had been sent.',
    )
    expect(sweepLabel({ expired: 3, followups: 2 })).toBe(
      '3 quotations marked as run out. 2 follow-ups raised for the ones that had been sent.',
    )
  })

  it('says nothing about follow-ups when none was needed', () => {
    expect(sweepLabel({ expired: 2, followups: 0 })).toBe('2 quotations marked as run out.')
  })
})
