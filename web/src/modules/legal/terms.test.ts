import { describe, expect, it } from 'vitest'
import { TERMS_SECTIONS, TERMS_UPDATED } from './terms'

const all = TERMS_SECTIONS.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.points ?? [])])
  .join('\n')
  .toLowerCase()

describe('the terms page', () => {
  // docs/architecture.md §2 promises this page states four things. A page that
  // quietly dropped one of them would be worse than no page, so each is a test
  // rather than a matter of care.
  it('says what is stored', () => {
    expect(all).toContain('parts, prices, kits')
    expect(all).toContain('costings and quotations')
    expect(all).toContain('your name, your email address')
  })

  it('says the data is held in Ireland', () => {
    expect(all).toContain('ireland')
    expect(all).toContain('eu-west-1')
  })

  it('says no company can see another company’s data', () => {
    expect(all).toContain('no company can see another company’s data')
  })

  it('says a company’s data is deleted on request', () => {
    expect(all).toContain('deleted on request')
  })

  it('is honest about the two things people are surprised by', () => {
    // Frozen prices look like a bug the first time somebody opens an old
    // quotation, and a departed colleague's name staying in the history looks
    // like a failure to delete. Both are deliberate, so both are said here.
    expect(all).toContain('as they stood when the costing was made')
    expect(all).toContain('deactivated rather than erased')
  })

  it('carries a date, and every section can be linked to', () => {
    expect(TERMS_UPDATED).toMatch(/\d{4}$/)
    const ids = TERMS_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*[a-z]$/)
  })

  it('has no empty section', () => {
    for (const section of TERMS_SECTIONS) {
      expect(section.heading.length).toBeGreaterThan(0)
      expect(section.paragraphs.length).toBeGreaterThan(0)
      for (const p of section.paragraphs) expect(p.length).toBeGreaterThan(20)
    }
  })
})
