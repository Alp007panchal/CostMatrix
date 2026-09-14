import type { QuotationRow, QuotationStatus, QuotationValidity } from '../../lib/database.types'

/**
 * The "what next" column on the quotations list, and the colour of the status
 * chip beside it (house style §5).
 *
 * A list of quotations with nothing but statuses on it makes a person work out
 * what to do from five words of jargon. This says the move instead — and says
 * nothing at all when the answer is that somebody else's move is awaited.
 *
 * Pure: the column is the sort of thing that quietly says "Chase it" about a
 * quotation that was won last month, and that is worth a test.
 */

export const CHIP: Record<QuotationStatus, 'dim' | 'blue' | 'ok' | 'bad'> = {
  released: 'dim', sent: 'blue', won: 'ok', lost: 'bad', superseded: 'dim',
}

export function statusChip(
  q: Pick<QuotationRow, 'status'>,
  validity: QuotationValidity | undefined,
): { text: string; tone: 'dim' | 'blue' | 'ok' | 'bad' | 'warn' } {
  if (validity?.has_run_out === true && (q.status === 'released' || q.status === 'sent')) {
    return { text: 'EXPIRED', tone: 'warn' }
  }
  return { text: q.status.toUpperCase(), tone: CHIP[q.status] }
}

export function whatNext(
  q: Pick<QuotationRow, 'status' | 'sent_at'>,
  validity: QuotationValidity | undefined,
  /** The next open follow-up on this quotation, as a date, or null if there is none. */
  nextFollowup: string | null,
  today: string,
): string {
  if (q.status === 'won' || q.status === 'lost' || q.status === 'superseded') return '—'
  if (validity?.has_run_out === true) return 'It has run out — revise it'
  if (q.status === 'released') return 'Send it, then mark it sent'
  if (nextFollowup === null) return 'Chase it, or set a reminder'
  if (nextFollowup < today) return `Chase it — reminder was ${nextFollowup}`
  return `Reminder ${nextFollowup}`
}
