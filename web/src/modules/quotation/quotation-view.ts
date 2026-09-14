import type { QuotationFollowup, QuotationRow, QuotationValidity } from '../../lib/database.types'

/**
 * The quotations list's four tiles and its five tabs (house style §5).
 *
 * Pure, and separate from the page for the same reason as the home tiles: what a
 * tab keeps and what a tile counts is a rule, and a rule belongs somewhere a test
 * can read it.
 */

export type QuotationTab = 'open' | 'won' | 'lost' | 'expired' | 'all'

export const QUOTATION_TABS: { key: QuotationTab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'expired', label: 'Expired' },
  { key: 'all', label: 'All' },
]

/** Sixteen days ahead is the horizon for "expiring soon" (house style §5: 14 days). */
export const EXPIRING_SOON_DAYS = 14

export interface QuotationTile {
  label: string
  value: string
  delta: string
  tone?: 'crit' | 'watch'
}

export function keepTab(
  q: Pick<QuotationRow, 'status'>,
  validity: QuotationValidity | undefined,
  tab: QuotationTab,
): boolean {
  const runOut = validity?.has_run_out === true
  const live = q.status === 'released' || q.status === 'sent'
  switch (tab) {
    case 'open': return live && !runOut
    case 'won': return q.status === 'won'
    case 'lost': return q.status === 'lost'
    case 'expired': return live && runOut
    case 'all': return true
  }
}

export function quotationTiles(
  quotations: QuotationRow[],
  validity: QuotationValidity[],
  followups: QuotationFollowup[],
  today: string,
): QuotationTile[] {
  const validityOf = (id: string) => validity.find((v) => v.quotation_id === id)
  const live = quotations.filter((q) => keepTab(q, validityOf(q.id), 'open'))
  const sent = live.filter((q) => q.sent_at !== null)

  const open = followups.filter((f) => f.done_at === null)
  const liveIds = new Set(live.map((q) => q.id))
  const overdue = open.filter((f) => f.due_on < today && liveIds.has(f.quotation_id))

  const soon = live.filter((q) => {
    const days = validityOf(q.id)?.days_left
    return days !== null && days !== undefined && days >= 0 && days <= EXPIRING_SOON_DAYS
  })

  const wonThisMonth = quotations.filter(
    (q) => q.status === 'won' && q.decided_at !== null && q.decided_at.slice(0, 7) === today.slice(0, 7),
  )
  const decidedThisMonth = quotations.filter(
    (q) =>
      (q.status === 'won' || q.status === 'lost') &&
      q.decided_at !== null &&
      q.decided_at.slice(0, 7) === today.slice(0, 7),
  )

  return [
    {
      label: 'Sent and open',
      value: String(live.length),
      delta: `${sent.length} sent · ${live.length - sent.length} released but never sent`,
    },
    {
      label: 'Follow-up overdue',
      value: String(overdue.length),
      delta: overdue.length === 0 ? `${open.length} reminders open` : 'a quotation nobody chases expires',
      ...(overdue.length > 0 ? { tone: 'crit' as const } : {}),
    },
    {
      label: `Expiring within ${EXPIRING_SOON_DAYS} days`,
      value: String(soon.length),
      delta: soon.length === 0 ? 'nothing running out yet' : soon.map((q) => q.reference_no).slice(0, 3).join(' · '),
      ...(soon.length > 0 ? { tone: 'watch' as const } : {}),
    },
    {
      label: 'Won this month',
      value: String(wonThisMonth.length),
      delta:
        decidedThisMonth.length === 0
          ? 'nothing decided this month'
          : `${wonThisMonth.length} of ${decidedThisMonth.length} decided`,
    },
  ]
}
