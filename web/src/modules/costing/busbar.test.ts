import { describe, expect, it } from 'vitest'
import type { BusbarBar, BusbarCheckRow } from '../../lib/database.types'
import {
  blankRun,
  checkWords,
  describeBar,
  localTotals,
  runMetres,
  runProblems,
  scheduleProblems,
} from './busbar'

const bars: BusbarBar[] = [
  { id: '1', code: '50X10MM', width_mm: 50, thickness_mm: 10, area_mm2: 500, kg_per_metre: 4.6, price_per_metre: 13800, is_priced: true },
  { id: '2', code: '20X10MM', width_mm: 20, thickness_mm: 10, area_mm2: 200, kg_per_metre: 1.8, price_per_metre: 5400, is_priced: true },
  { id: '3', code: '20X5MM', width_mm: 20, thickness_mm: 5, area_mm2: 100, kg_per_metre: 0.9, price_per_metre: null, is_priced: false },
]

const run = (over: Partial<Parameters<typeof runMetres>[0]> = {}) => ({
  label: 'Incoming tails',
  bar_code: '50X10MM',
  phases: 4,
  runs_per_phase: 2,
  length_m: 1.6,
  sets: 1,
  ...over,
})

describe('the CU-OPT1 formula', () => {
  it('is phases × runs per phase × length × sets', () => {
    expect(runMetres(run())).toBe(12.8)
  })

  it('counts the sets, which is how his ATS tails came to 25.6 m', () => {
    expect(runMetres(run({ sets: 2 }))).toBe(25.6)
  })

  it('works out his horizontal busbar at 19.2 m', () => {
    expect(runMetres(run({ bar_code: '20X10MM', runs_per_phase: 4, length_m: 1.2 }))).toBe(19.2)
  })

  it('treats a half-typed row as nothing rather than as not-a-number', () => {
    expect(runMetres({ label: 'x', bar_code: '50X10MM' })).toBe(0)
  })
})

describe('what a row must say', () => {
  it('is happy with a complete one', () => {
    expect(runProblems(run(), bars)).toEqual([])
  })

  it('asks for a name', () => {
    expect(runProblems(run({ label: '  ' }), bars)).toContain('needs a name')
  })

  it('refuses a bar size the catalogue does not hold', () => {
    expect(runProblems(run({ bar_code: '75X12MM' }), bars)).toContain(
      'needs a bar size this catalogue holds',
    )
  })

  it('names a bar that has no price rather than costing it at nothing', () => {
    expect(runProblems(run({ bar_code: '20X5MM' }), bars)).toContain('20X5MM has no price yet')
  })

  it('asks for each figure it needs, one message each', () => {
    expect(runProblems(run({ phases: 0, length_m: 0 }), bars)).toEqual([
      'needs its phases',
      'needs a length',
    ])
  })

  it('says which run is wrong when the whole schedule is checked', () => {
    expect(scheduleProblems([run(), run({ label: '', length_m: 0 })], bars)).toEqual([
      'Run 2 needs a name',
      'Run 2 needs a length',
    ])
  })

  it('starts a new row at the largest bar, ready to be named', () => {
    expect(blankRun(bars)).toMatchObject({ label: '', bar_code: '50X10MM', phases: 4 })
  })
})

describe('the totals on the screen', () => {
  const threeRuns = [
    run(),
    run({ label: 'HBB', bar_code: '20X10MM', runs_per_phase: 4, length_m: 1.2 }),
    run({ label: 'Earth bar', bar_code: '20X10MM', phases: 1, runs_per_phase: 1, length_m: 4.1 }),
  ]

  it('sum by bar size, not by run', () => {
    const totals = localTotals(threeRuns, bars)
    expect(totals.bars.map((b) => [b.bar_code, b.metres])).toEqual([
      ['50X10MM', 12.8],
      ['20X10MM', 23.3],
    ])
  })

  it('carry the kilograms and the money the catalogue gives', () => {
    const totals = localTotals(threeRuns, bars)
    expect(totals.total_metres).toBe(36.1)
    expect(totals.total_kg).toBe(100.82)
    expect(totals.total_value).toBe(302460)
  })

  it('leave a row that is not finished out of the total', () => {
    expect(localTotals([run(), run({ label: '', length_m: 0 })], bars).total_metres).toBe(12.8)
  })

  it('leave out a bar with no price — the row is a problem, not a free metre', () => {
    const totals = localTotals([run({ bar_code: '20X5MM', label: 'Earth' })], bars)
    expect(totals.bars).toEqual([])
    expect(totals.total_value).toBe(0)
    expect(runProblems({ bar_code: '20X5MM', label: 'Earth', phases: 1, runs_per_phase: 1, length_m: 1, sets: 1 }, bars))
      .toContain('20X5MM has no price yet')
  })
})

describe('the schedule against the costing', () => {
  const row = (over: Partial<BusbarCheckRow>): BusbarCheckRow => ({
    panel_id: 'p1',
    bar_code: '50X10MM',
    scheduled_m: 70.4,
    costed_m: 70.4,
    difference_m: 0,
    kg_per_metre: 4.6,
    scheduled_kg: 323.84,
    ...over,
  })

  it('says nothing when they agree', () => {
    expect(checkWords([row({})])).toBe(null)
  })

  it('says nothing when no schedule has been written', () => {
    expect(checkWords([])).toBe(null)
  })

  it('names the worst gap, which is the one his workbook had', () => {
    expect(checkWords([row({ costed_m: 30, difference_m: -40.4 })])).toBe(
      'This panel is costed at 30 m of 50X10MM, 40.4 m less than the runs ask for.',
    )
  })

  it('counts the other sizes that differ', () => {
    const words = checkWords([
      row({ costed_m: 30, difference_m: -40.4 }),
      row({ bar_code: '20X10MM', scheduled_m: 95.3, costed_m: 77, difference_m: -18.3 }),
    ])
    expect(words).toContain('and 1 other size differ too')
  })

  it('reads the other way round when more copper is costed than scheduled', () => {
    expect(checkWords([row({ costed_m: 80.4, difference_m: 10 })])).toContain('more than')
  })
})

describe('how a bar reads', () => {
  it('is the millimetres and the weight, not the part number', () => {
    expect(describeBar(bars[0] as BusbarBar)).toBe('50×10 mm, 4.6 kg/m')
  })
})
