import type { ApfcProposal, ApfcStep } from '../../lib/database.types'

/**
 * The few sums the APFC card does on screen. The grading itself is in the
 * database (app.propose_apfc) and is not repeated here: two implementations of
 * one rule are two answers waiting to disagree. These only add up what the
 * engineer has edited and put it into words.
 */

/** The bank as the engineer has it now, after any quantity they changed. */
export function bankTotal(steps: ApfcStep[]): number {
  return steps.reduce((sum, step) => sum + step.rating * step.quantity, 0)
}

/** Steps worth applying: a quantity of zero is a step the engineer took out. */
export function stepsToApply(steps: ApfcStep[]): ApfcStep[] {
  return steps.filter((step) => step.quantity > 0)
}

/** "400 kVAr in 19 steps" — what the bank on screen comes to. */
export function describeBank(steps: ApfcStep[]): string {
  const kept = stepsToApply(steps)
  const units = kept.reduce((sum, step) => sum + step.quantity, 0)
  if (units === 0) return 'nothing yet'
  return `${round(bankTotal(kept))} kVAr in ${units} step${units === 1 ? '' : 's'}`
}

/** What to say about the gap between the target and what the sizes can reach. */
export function shortfallWords(proposal: ApfcProposal, steps: ApfcStep[]): string | null {
  const total = bankTotal(steps)
  const gap = round(proposal.target_kvar - total)
  if (Math.abs(gap) < 0.001) return null
  return gap > 0
    ? `${gap} kVAr short of the ${round(proposal.target_kvar)} asked for — the sizes in the library cannot reach it exactly.`
    : `${round(-gap)} kVAr over the ${round(proposal.target_kvar)} asked for.`
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
