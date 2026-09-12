import type { KitGroupLabourVariance } from '../../lib/database.types'

/**
 * Reading a variance in words (roadmap 2.8). Pure, so the wording, the ordering
 * and — most of all — how much weight a suggestion deserves are unit-tested.
 */

/** How much a suggestion rests on. One job is an anecdote; ten are a standard. */
export type Weight = 'thin' | 'fair' | 'solid'

export function weigh(row: Pick<KitGroupLabourVariance, 'jobs' | 'kit_units'>): Weight {
  const jobs = Number(row.jobs)
  const units = Number(row.kit_units)
  if (jobs >= 5 && units >= 20) return 'solid'
  if (jobs >= 2 && units >= 5) return 'fair'
  return 'thin'
}

export function weightSentence(row: Pick<KitGroupLabourVariance, 'jobs' | 'kit_units'>): string {
  const jobs = Number(row.jobs)
  const units = Number(row.kit_units)
  const counted = `${jobs} ${jobs === 1 ? 'job' : 'jobs'}, ${units} ${units === 1 ? 'kit' : 'kits'}`
  switch (weigh(row)) {
    case 'solid':
      return `${counted} — enough to take seriously`
    case 'fair':
      return `${counted} — a useful hint, not yet a standard`
    default:
      return `${counted} — too little to change a standard on`
  }
}

/** Over, under or on the money, in the words the costing team uses. */
export function varianceSentence(row: Pick<KitGroupLabourVariance, 'variance_pct'>): string {
  const pct = row.variance_pct
  if (pct === null || pct === undefined) return 'nothing to compare'
  const n = Number(pct)
  if (Math.abs(n) < 0.05) return 'exactly as estimated'
  const size = `${Math.abs(n).toFixed(1)} %`
  return n > 0 ? `${size} longer than estimated` : `${size} quicker than estimated`
}

/** Whether the suggestion differs from the standard enough to be worth a change. */
export function worthChanging(row: Pick<KitGroupLabourVariance, 'suggested_hours' | 'standard_hours'>): boolean {
  if (row.standard_hours === null || row.standard_hours === undefined) return true
  return Math.abs(Number(row.suggested_hours) - Number(row.standard_hours)) >= 0.05
}

/**
 * Worst first: the rows where the money is. A group 40 % over on twenty kits
 * matters more than one 80 % over on a single kit, so the sort is by the hours
 * at stake rather than by the percentage.
 */
export function byHoursAtStake(rows: KitGroupLabourVariance[]): KitGroupLabourVariance[] {
  return [...rows].sort((a, b) => {
    const stake = (r: KitGroupLabourVariance) => Math.abs(Number(r.actual_hours) - Number(r.estimated_hours))
    return stake(b) - stake(a) || (a.kit_group_name ?? '').localeCompare(b.kit_group_name ?? '')
  })
}

export function groupLabel(row: Pick<KitGroupLabourVariance, 'kit_group_name'>): string {
  return row.kit_group_name ?? 'Kits with no group'
}
