import type { SalesGroupOutcome, SalesOutcome, SalesPipelineRow } from '../../lib/database.types'

/**
 * The sums behind the sales reports (roadmap 3.6). Pure, so the hit rate, the
 * grouping and the wording are unit-tested rather than eyeballed — and so the
 * screen holds no arithmetic. Every figure starts from a row the database gave.
 *
 * A hit rate counts **decided** jobs only: won ÷ (won + lost). Counting the open
 * ones would make a busy month look like a bad one.
 */

export interface Tally {
  label: string
  quoted: number
  won: number
  lost: number
  open: number
  decided: number
  /** Null until something has been decided — not zero, which reads as "we lose everything". */
  hitRate: number | null
  wonValue: number
  lostValue: number
  openValue: number
  /** Share of the decided value that was won, null until something is decided. */
  valueRate: number | null
}

const DECIDED = ['won', 'lost']

export function tally(label: string, rows: SalesOutcome[]): Tally {
  const value = (r: SalesOutcome) => Number(r.value_ex_vat ?? 0)
  const of = (status: string) => rows.filter((r) => r.status === status)
  const won = of('won')
  const lost = of('lost')
  const open = rows.filter((r) => !DECIDED.includes(r.status))
  const decided = won.length + lost.length
  const wonValue = won.reduce((s, r) => s + value(r), 0)
  const lostValue = lost.reduce((s, r) => s + value(r), 0)
  return {
    label,
    quoted: rows.length,
    won: won.length,
    lost: lost.length,
    open: open.length,
    decided,
    hitRate: decided === 0 ? null : won.length / decided,
    wonValue,
    lostValue,
    openValue: open.reduce((s, r) => s + value(r), 0),
    valueRate: wonValue + lostValue === 0 ? null : wonValue / (wonValue + lostValue),
  }
}

/** Busiest first, so the rows that decide the hit rate are at the top. */
function byDecidedThenValue(a: Tally, b: Tally): number {
  return b.decided - a.decided || b.wonValue + b.lostValue - (a.wonValue + a.lostValue)
    || a.label.localeCompare(b.label)
}

export function groupTallies(
  rows: SalesOutcome[],
  key: (row: SalesOutcome) => string,
  sort: (a: Tally, b: Tally) => number = byDecidedThenValue,
): Tally[] {
  const groups = new Map<string, SalesOutcome[]>()
  for (const row of rows) {
    const label = key(row)
    groups.set(label, [...(groups.get(label) ?? []), row])
  }
  return [...groups.entries()].map(([label, group]) => tally(label, group)).sort(sort)
}

export const byCustomer = (rows: SalesOutcome[]): Tally[] =>
  groupTallies(rows, (r) => r.customer_name)

export const byBand = (rows: SalesOutcome[]): Tally[] =>
  groupTallies(rows, (r) => r.value_band, (a, b) => bandRank(a.label) - bandRank(b.label))

/** The month a job was decided in, or the month it came in while it is undecided. */
export const byMonth = (rows: SalesOutcome[]): Tally[] =>
  groupTallies(rows, (r) => (r.decided_at ?? r.received_on).slice(0, 7),
               (a, b) => b.label.localeCompare(a.label))

/** Bands read smallest first: "under 500 K", "500 K to 2 M", "over 10 M". */
export function bandRank(label: string): number {
  if (label.startsWith('under')) return 0
  if (label.startsWith('over')) return 8
  if (label.startsWith('no value')) return 9
  const first = /([\d.]+)\s*([KM])?/.exec(label)
  if (!first) return 5
  const size = Number(first[1]) * (first[2] === 'M' ? 1000 : first[2] === 'K' ? 1 : 0.001)
  return 1 + Math.min(Math.log10(Math.max(size, 1)), 6)
}

export interface ReasonTally {
  reason: string
  jobs: number
  value: number
}

/** Why jobs were lost, the commonest first — the one report a sales meeting asks for. */
export function lostReasons(rows: SalesOutcome[]): ReasonTally[] {
  const groups = new Map<string, SalesOutcome[]>()
  for (const row of rows.filter((r) => r.status === 'lost')) {
    const reason = (row.lost_reason ?? '').trim() || 'no reason recorded'
    groups.set(reason, [...(groups.get(reason) ?? []), row])
  }
  return [...groups.entries()]
    .map(([reason, group]) => ({
      reason,
      jobs: group.length,
      value: group.reduce((s, r) => s + Number(r.value_ex_vat ?? 0), 0),
    }))
    .sort((a, b) => b.jobs - a.jobs || b.value - a.value)
}

export interface GroupTally {
  kitGroup: string
  jobs: number
  won: number
  lost: number
  hitRate: number | null
  material: number
  hours: number
}

/** Win and loss by product group, which is the library's own kit group. */
export function byKitGroup(rows: SalesGroupOutcome[]): GroupTally[] {
  const groups = new Map<string, SalesGroupOutcome[]>()
  for (const row of rows) {
    groups.set(row.kit_group_name, [...(groups.get(row.kit_group_name) ?? []), row])
  }
  return [...groups.entries()]
    .map(([kitGroup, group]) => {
      const won = group.filter((r) => r.status === 'won').length
      const lost = group.filter((r) => r.status === 'lost').length
      return {
        kitGroup,
        jobs: group.length,
        won,
        lost,
        hitRate: won + lost === 0 ? null : won / (won + lost),
        material: group.reduce((s, r) => s + Number(r.material ?? 0), 0),
        hours: group.reduce((s, r) => s + Number(r.hours ?? 0), 0),
      }
    })
    .sort((a, b) => b.material - a.material || a.kitGroup.localeCompare(b.kitGroup))
}

/** The average days to decide, over the jobs that have been decided. */
export function averageDaysToDecide(rows: SalesOutcome[]): number | null {
  const days = rows
    .filter((r) => DECIDED.includes(r.status) && r.days_to_decide !== null)
    .map((r) => Number(r.days_to_decide))
  if (days.length === 0) return null
  return Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10
}

/** What is still out there, and how much of it is already with the customer. */
export function pipelineSummary(rows: SalesPipelineRow[]): {
  jobs: number
  value: number
  withCustomer: number
  runOut: number
  oldestDays: number | null
} {
  return {
    jobs: rows.length,
    value: rows.reduce((s, r) => s + Number(r.value_ex_vat ?? 0), 0),
    withCustomer: rows.filter((r) => r.quotation_status === 'sent').length,
    runOut: rows.filter((r) => r.has_run_out === true).length,
    oldestDays: rows.length === 0 ? null : Math.max(...rows.map((r) => Number(r.age_days))),
  }
}

/** "7 of 10 decided" — what a hit rate rests on, which matters more than the figure. */
export function restsOn(t: Tally): string {
  if (t.decided === 0) return t.open === 1 ? '1 still open' : `${t.open} still open`
  return `${t.won} of ${t.decided} decided`
}

export function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 1000) / 10} %`
}

/**
 * The domain for the margin dumbbells: the range the rows actually occupy, padded
 * a little and always including zero, so a negative margin reads as below the line
 * rather than as the smallest bar.
 */
export function marginDomain(values: (number | null)[]): { min: number; max: number } {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v))
  if (real.length === 0) return { min: 0, max: 1 }
  const min = Math.min(0, ...real)
  const max = Math.max(0, ...real)
  const pad = Math.max((max - min) * 0.08, 1)
  return { min: min - pad, max: max + pad }
}

/** Where a value sits in a domain, 0 to 1. Clamped, so an outlier cannot escape the track. */
export function position(value: number, domain: { min: number; max: number }): number {
  const span = domain.max - domain.min
  if (span <= 0) return 0
  return Math.min(Math.max((value - domain.min) / span, 0), 1)
}
