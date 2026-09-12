/**
 * How long a quotation has left (roadmap 2.6). The database works out the days;
 * this says it in words, which is the part worth testing — "ran out yesterday"
 * and "runs out tomorrow" are one day apart and mean opposite things.
 */

export interface Validity {
  valid_until: string | null
  days_left: number | null
  has_run_out: boolean
  expired_at: string | null
}

export function validityLabel(v: Validity | undefined | null): { tone: 'ok' | 'muted' | 'error'; text: string } {
  if (!v || v.valid_until === null) return { tone: 'muted', text: 'No validity date' }
  const days = v.days_left ?? 0
  if (v.has_run_out || days < 0) {
    const ago = Math.abs(days)
    return {
      tone: 'error',
      text: ago === 0 ? 'Ran out today' : `Ran out ${ago} day${ago === 1 ? '' : 's'} ago`,
    }
  }
  if (days === 0) return { tone: 'error', text: 'Runs out today' }
  if (days <= 7) return { tone: 'muted', text: `Runs out in ${days} day${days === 1 ? '' : 's'}` }
  return { tone: 'ok', text: `Valid for ${days} more days` }
}

/** What the sweep found, for the button that runs it by hand. */
export function sweepLabel(outcome: { expired: number; followups: number }): string {
  if (outcome.expired === 0) return 'Nothing had run out.'
  const chased =
    outcome.followups > 0
      ? ` ${outcome.followups} follow-up${outcome.followups === 1 ? '' : 's'} raised for the ones that had been sent.`
      : ''
  return `${outcome.expired} quotation${outcome.expired === 1 ? '' : 's'} marked as run out.${chased}`
}
