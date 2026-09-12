import type { BusbarBar, BusbarCheckRow, BusbarRun, BusbarTotals } from '../../lib/database.types'

/**
 * The busbar run calculator, screen side (roadmap 4.1).
 *
 * The database is the authority on the arithmetic — `app.busbar_run_totals` is
 * what a saved schedule and an applied one are worked out from. What is here is
 * the same formula for the row a person is still typing, so the metres appear as
 * they type rather than after a round trip, and the checks that stop a bad row
 * being sent at all.
 */

/** The workbook's CU-OPT1 column F: phases × runs per phase × length × sets. */
export function runMetres(run: Partial<BusbarRun>): number {
  const product =
    num(run.phases) * num(run.runs_per_phase) * num(run.length_m) * num(run.sets)
  return Math.round(product * 1000) / 1000
}

/** What is wrong with a row, in the words the database would use. Empty means good. */
export function runProblems(run: Partial<BusbarRun>, bars: BusbarBar[]): string[] {
  const problems: string[] = []
  if ((run.label ?? '').trim() === '') problems.push('needs a name')
  const bar = bars.find((b) => b.code === run.bar_code)
  if (!bar) problems.push('needs a bar size this catalogue holds')
  else if (!bar.is_priced) problems.push(`${bar.code} has no price yet`)
  if (num(run.phases) <= 0) problems.push('needs its phases')
  if (num(run.runs_per_phase) <= 0) problems.push('needs its runs per phase')
  if (num(run.length_m) <= 0) problems.push('needs a length')
  if (num(run.sets) <= 0) problems.push('needs a number of sets')
  return problems
}

/** Whether the whole schedule can be saved, and why not when it cannot. */
export function scheduleProblems(runs: Partial<BusbarRun>[], bars: BusbarBar[]): string[] {
  return runs.flatMap((run, i) => {
    const name = (run.label ?? '').trim() === '' ? `Run ${i + 1}` : (run.label ?? '').trim()
    return runProblems(run, bars).map((problem) => `${name} ${problem}`)
  })
}

/** A blank row, at the largest bar: a new run is usually a main one. */
export function blankRun(bars: BusbarBar[]): BusbarRun {
  return {
    label: '',
    bar_code: bars[0]?.code ?? '',
    phases: 4,
    runs_per_phase: 1,
    length_m: 1,
    sets: 1,
  }
}

/**
 * The totals, worked out here for the screen. The same sums the database does, so
 * a person is never shown one figure and given another; the database's answer
 * replaces this one as soon as a schedule is saved.
 */
export function localTotals(runs: Partial<BusbarRun>[], bars: BusbarBar[]): BusbarTotals {
  const metres = new Map<string, number>()
  for (const run of runs) {
    const code = run.bar_code ?? ''
    if (code === '') continue
    if (runProblems(run, bars).length > 0) continue
    metres.set(code, round3((metres.get(code) ?? 0) + runMetres(run)))
  }

  const totals = bars
    .filter((bar) => metres.has(bar.code))
    .map((bar) => {
      const m = metres.get(bar.code) ?? 0
      return {
        bar_code: bar.code,
        kg_per_metre: bar.kg_per_metre,
        price_per_metre: bar.price_per_metre,
        metres: m,
        kg: bar.kg_per_metre === null ? null : round2(m * bar.kg_per_metre),
        value: bar.price_per_metre === null ? null : round2(m * bar.price_per_metre),
        is_priced: bar.is_priced,
      }
    })

  const unpriced = totals.filter((t) => !t.is_priced).map((t) => t.bar_code)
  return {
    runs: [],
    bars: totals,
    total_metres: round3(totals.reduce((sum, t) => sum + t.metres, 0)),
    total_kg: round2(totals.reduce((sum, t) => sum + (t.kg ?? 0), 0)),
    total_value: round2(totals.reduce((sum, t) => sum + (t.value ?? 0), 0)),
    unpriced_bars: unpriced.length === 0 ? null : unpriced.join(', '),
  }
}

/** One sentence on the schedule against the costing, or null when they agree. */
export function checkWords(rows: BusbarCheckRow[]): string | null {
  const apart = rows.filter((r) => Math.abs(r.difference_m) >= 0.05)
  if (rows.length === 0 || apart.length === 0) return null
  const worst = [...apart].sort((a, b) => Math.abs(b.difference_m) - Math.abs(a.difference_m))[0]
  if (!worst) return null
  const word = worst.difference_m > 0 ? 'more than' : 'less than'
  return `This panel is costed at ${fmt(worst.costed_m)} m of ${worst.bar_code}, ${fmt(
    Math.abs(worst.difference_m),
  )} m ${word} the runs ask for${apart.length > 1 ? `, and ${apart.length - 1} other size${apart.length > 2 ? 's' : ''} differ too` : ''}.`
}

/** How a bar size reads to a person: 100×10 mm, 9 kg/m. */
export function describeBar(bar: BusbarBar): string {
  const size =
    bar.width_mm !== null && bar.thickness_mm !== null
      ? `${fmt(bar.width_mm)}×${fmt(bar.thickness_mm)} mm`
      : bar.code
  return bar.kg_per_metre === null ? size : `${size}, ${fmt(bar.kg_per_metre)} kg/m`
}

/** Metres and kilograms read better without trailing zeros. */
export function fmt(value: number | null): string {
  if (value === null) return '—'
  return String(Math.round(value * 1000) / 1000)
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}
