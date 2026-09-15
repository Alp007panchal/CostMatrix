import { describe, expect, it } from 'vitest'
import type { CostingLabourGaps } from '../../lib/database.types'
import { labourWarning } from './labour-gaps'

const gaps = (over: Partial<CostingLabourGaps> = {}): CostingLabourGaps => ({
  costing_id: 'c',
  kit_lines: 4,
  kit_lines_without_hours: 0,
  groups_to_fill: null,
  processes_without_rate: null,
  labour_rows_without_rate: 0,
  material_cost: 3_622_781.8,
  labour_cost: 250_000,
  labour_share_pct: 6.9,
  verdict: 'ok',
  ...over,
})

describe('when the costing is fine, it says nothing', () => {
  it('for a costing whose kits all carry hours', () => {
    expect(labourWarning(gaps())).toBe(null)
  })

  it('for a costing with nothing on it yet', () => {
    expect(labourWarning(gaps({ verdict: 'no_kits', kit_lines: 0, labour_cost: 0 }))).toBe(null)
  })

  it('and when the check has not answered', () => {
    expect(labourWarning(null)).toBe(null)
  })
})

describe('a costing that charges nothing for labour', () => {
  const none = gaps({
    verdict: 'none', labour_cost: 0, labour_share_pct: 0,
    kit_lines_without_hours: 4, groups_to_fill: 'ACB (2), MCCB (2)',
  })

  it('is called out plainly, not hedged', () => {
    expect(labourWarning(none)?.headline).toBe('This costing charges nothing for labour.')
    expect(labourWarning(none)?.tone).toBe('bad')
  })

  it('says what the quotation would leave out, in the customer’s terms', () => {
    expect(labourWarning(none)?.detail).toContain('assembly, wiring and busbar time')
  })

  it('puts the material figure beside the nothing, so the gap is obvious', () => {
    expect(labourWarning(none)?.detail).toContain('3,622,782')
  })

  it('names the kit groups to fill in, because that is the actual fix', () => {
    expect(labourWarning(none)?.fix).toContain('ACB (2), MCCB (2)')
    expect(labourWarning(none)?.fix).toContain('Kit groups')
  })

  it('and says a revision is needed, since a costing freezes what it was given', () => {
    expect(labourWarning(none)?.fix).toContain('new revision')
  })

  it('falls back to the screen name when no group can be named', () => {
    expect(labourWarning(gaps({ ...none, groups_to_fill: null }))?.fix)
      .toBe('Fill in the hours on the Kit groups screen.')
  })
})

describe('the quieter twin: hours priced at a zero rate', () => {
  const noRate = gaps({
    verdict: 'none', labour_cost: 0, labour_share_pct: 0,
    kit_lines_without_hours: 0, labour_rows_without_rate: 3,
    processes_without_rate: 'assembly, wiring',
  })

  it('is told apart from missing hours, because the fix is different', () => {
    expect(labourWarning(noRate)?.detail).toContain('hourly rate')
    expect(labourWarning(noRate)?.detail).not.toContain('no hours in the library')
  })

  it('names the processes whose rate is zero', () => {
    expect(labourWarning(noRate)?.detail).toContain('assembly, wiring')
  })

  it('explains why setting the rate alone will not fix this costing', () => {
    expect(labourWarning(noRate)?.detail).toContain('does not reach it')
    expect(labourWarning(noRate)?.fix).toContain('Labour rates')
  })
})

describe('a half-filled library', () => {
  const some = gaps({
    verdict: 'some', kit_lines_without_hours: 1, kit_lines: 4,
    labour_share_pct: 2.1, groups_to_fill: 'MCCB (1)',
  })

  it('counts what is missing rather than crying wolf over the whole costing', () => {
    expect(labourWarning(some)?.headline).toBe('1 of 4 kit lines carry no labour.')
    expect(labourWarning(some)?.tone).toBe('warn')
  })

  it('gives the labour share, which is how an estimator smells a wrong number', () => {
    expect(labourWarning(some)?.detail).toContain('2.1% of material')
  })

  it('and names where those hours would come from', () => {
    expect(labourWarning(some)?.fix).toContain('MCCB (1)')
  })
})

describe('some hours priced at nothing, but not all', () => {
  const partial = gaps({
    verdict: 'no_rate', labour_rows_without_rate: 2, processes_without_rate: 'busbar',
  })

  it('warns rather than condemns, since the costing does carry labour', () => {
    expect(labourWarning(partial)?.tone).toBe('warn')
    expect(labourWarning(partial)?.headline).toContain('priced at nothing')
    expect(labourWarning(partial)?.detail).toContain('busbar')
  })
})
