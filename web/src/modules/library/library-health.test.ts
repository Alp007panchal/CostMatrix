import { describe, expect, it } from 'vitest'
import type { LibraryHealthRow } from '../../lib/database.types'
import { bySeverity, exampleWords, headline, kindLabel, libraryLabel, severityLabel } from './library-health'

const row = (over: Partial<LibraryHealthRow> = {}): LibraryHealthRow => ({
  library: 'master', kind: 'part_placeholder', severity: 'refuses', sort_order: 20,
  fix_on: 'Library → Components', items: 8, used_by_kits: 15,
  examples: ['LA9D50978X', '5SL6263-7RC'],
  ...over,
})

describe('the line at the top', () => {
  it('says nothing is wrong when nothing is', () => {
    expect(headline([])).toContain('Nothing to fix')
  })

  it('leads with what would stop a costing, then with what would go quiet', () => {
    const words = headline([
      row({ items: 8 }),
      row({ kind: 'kit_no_hours', severity: 'silent', sort_order: 80, items: 240 }),
    ])
    expect(words).toContain('8 things that would stop a costing')
    expect(words).toContain('240 things that would cost and leave something out')
    expect(words).toContain('which screen fixes it')
  })

  it('does not lead with the harmless ones when they are all there is', () => {
    const words = headline([row({ kind: 'kit_no_rating', severity: 'check', sort_order: 110, items: 3 })])
    expect(words).toContain('3 things worth a look')
    expect(words).toContain('Nothing is broken')
  })

  it('counts one in the singular, because a screen that says "1 things" is not read again', () => {
    expect(headline([row({ items: 1 })])).toContain('1 thing that would stop a costing')
  })

  it('groups the thousands, because a four-figure count is the one people misread', () => {
    expect(headline([row({ items: 1240 })])).toContain('1,240 things')
  })
})

describe('the order things are shown in', () => {
  it('puts what stops a costing above what goes quiet, and that above the rest', () => {
    const groups = bySeverity([
      row({ kind: 'kit_no_rating', severity: 'check', sort_order: 110 }),
      row({ kind: 'kit_no_hours', severity: 'silent', sort_order: 80 }),
      row(),
    ])
    expect(groups.map((g) => g.severity)).toEqual(['refuses', 'silent', 'check'])
  })

  it('leaves out a severity with nothing in it rather than showing an empty table', () => {
    expect(bySeverity([row()]).map((g) => g.severity)).toEqual(['refuses'])
  })

  it('keeps the database’s own order inside a group', () => {
    const group = bySeverity([
      row({ kind: 'kit_unpriced_part', sort_order: 50 }),
      row({ kind: 'part_no_factor', sort_order: 30 }),
      row({ kind: 'part_placeholder', sort_order: 20 }),
    ])[0]
    expect(group?.rows.map((r) => r.kind)).toEqual(['part_placeholder', 'part_no_factor', 'kit_unpriced_part'])
  })

  it('shows the shared catalogue and a company’s own library as separate rows', () => {
    const group = bySeverity([
      row({ library: 'private' }),
      row({ library: 'master' }),
    ])[0]
    expect(group?.rows.map((r) => r.library)).toEqual(['master', 'private'])
  })
})

describe('the words', () => {
  it('names a fault the way the owner would say it, not the way the column does', () => {
    expect(kindLabel('kit_no_hours')).toBe('Kits whose group has no hours')
    expect(kindLabel('part_no_factor')).toBe('Parts priced in a currency with no landed factor')
  })

  it('says a severity as a consequence rather than as a colour', () => {
    expect(severityLabel('refuses')).toBe('Stops a costing')
    expect(severityLabel('silent')).toBe('Costs, and leaves something out')
    expect(severityLabel('check')).toBe('Worth a look')
  })

  it('says which library a row is in', () => {
    expect(libraryLabel('master')).toBe('the shared catalogue')
    expect(libraryLabel('private')).toBe('your own library')
  })
})

describe('the examples', () => {
  it('says how many more there are, so five of 240 does not read as five', () => {
    expect(exampleWords(row({ items: 240, examples: ['A', 'B', 'C', 'D', 'E'] })))
      .toBe('A, B, C, D, E and 235 more')
  })

  it('says nothing extra when the examples are all of them', () => {
    expect(exampleWords(row({ items: 2, examples: ['A', 'B'] }))).toBe('A, B')
  })

  it('copes with a row that carries no examples at all', () => {
    expect(exampleWords(row({ items: 0, examples: [] }))).toBe('')
  })
})
