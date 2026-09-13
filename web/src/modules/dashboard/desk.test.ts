import { describe, expect, it } from 'vitest'
import type { DeskItem } from '../../lib/database.types'
import { ageWords, byKind, deskLink, headline, kindLabel } from './desk'

const item = (over: Partial<DeskItem> = {}): DeskItem => ({
  kind: 'returned_to_you', sort_order: 10, entity: 'costing', entity_id: 'c1',
  reference: 'CM-2026-0001', title: 'MCC for Triclover', since: '2026-09-10T09:00:00Z',
  days: 3, detail: 'The 400 A feeder is priced twice',
  ...over,
})

describe('how long a thing has sat there', () => {
  it('says today and yesterday rather than a number', () => {
    expect(ageWords(0)).toBe('today')
    expect(ageWords(1)).toBe('yesterday')
  })

  it('counts days for a fortnight, then weeks, then months', () => {
    expect(ageWords(3)).toBe('3 days ago')
    expect(ageWords(13)).toBe('13 days ago')
    expect(ageWords(21)).toBe('3 weeks ago')
    expect(ageWords(90)).toBe('3 months ago')
  })

  it('never says a negative age, whatever the clocks do', () => {
    expect(ageWords(-2)).toBe('today')
  })
})

describe('the line under the heading', () => {
  it('names the oldest rather than only counting, so you know which to open', () => {
    const words = headline([item({ days: 1 }), item({ entity_id: 'c2', days: 23 })])
    expect(words).toBe('2 things waiting; the oldest since 3 weeks ago.')
  })

  it('counts one in the singular', () => {
    expect(headline([item({ days: 5 })])).toContain('1 thing waiting')
  })

  it('does not make a point of the age when everything arrived today', () => {
    expect(headline([item({ days: 0 })])).toBe('1 thing waiting.')
  })

  it('says nothing at all when the desk is clear', () => {
    expect(headline([])).toBe('')
  })
})

describe('the grouping', () => {
  it('keeps the four kinds in their own order, whatever order they arrive in', () => {
    const groups = byKind([
      item({ kind: 'sent_unanswered', entity: 'quotation', entity_id: 'q1' }),
      item({ kind: 'returned_to_you' }),
      item({ kind: 'waiting_for_you', entity_id: 'c3' }),
    ])
    expect(groups.map((g) => g.kind)).toEqual(['returned_to_you', 'waiting_for_you', 'sent_unanswered'])
  })

  it('leaves out a kind with nothing in it rather than showing an empty heading', () => {
    expect(byKind([item()]).map((g) => g.kind)).toEqual(['returned_to_you'])
  })

  it('puts the one that has waited longest at the top of its group', () => {
    const group = byKind([
      item({ entity_id: 'c1', reference: 'CM-1', days: 2 }),
      item({ entity_id: 'c2', reference: 'CM-2', days: 30 }),
      item({ entity_id: 'c3', reference: 'CM-3', days: 9 }),
    ])[0]
    expect(group?.items.map((i) => i.reference)).toEqual(['CM-2', 'CM-3', 'CM-1'])
  })

  it('names each kind as the thing it is, not as the column', () => {
    expect(kindLabel('released_not_sent')).toBe('Released, never sent')
    expect(kindLabel('waiting_for_you')).toBe('Waiting for you to approve')
  })
})

describe('where a line goes', () => {
  it('opens the costing itself', () => {
    expect(deskLink(item({ entity: 'costing', entity_id: 'abc' }))).toBe('/costings/abc')
  })

  it('and the quotations list, because a quotation has no page of its own yet', () => {
    expect(deskLink(item({ entity: 'quotation', entity_id: 'q1' }))).toBe('/quotations')
  })
})
