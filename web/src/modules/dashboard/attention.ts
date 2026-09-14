import type { DeskItem, LibraryHealthRow, QuotationFollowup } from '../../lib/database.types'

/**
 * What is waiting for somebody, counted once (house style §4 rule 7).
 *
 * The sidebar counts, the home tiles and the exception bar are the same four
 * numbers. Working them out here — from the rows the pages already fetch, under
 * the query keys they already use — is what stops the sidebar and the page
 * disagreeing about how many follow-ups are overdue, which is the sort of thing
 * nobody reports and everybody stops trusting.
 *
 * Pure. The fetching is `use-attention.ts`; this is only the arithmetic.
 */

export interface Attention {
  /** Costings on your desk: sent back to you, or waiting for your approval. */
  costings: number
  /** Quotations on your desk: released and never sent, or sent and unanswered. */
  quotations: number
  /** Follow-ups due before today. */
  followupsOverdue: number
  /** Follow-ups open at all, overdue or not. */
  followupsOpen: number
  /** Library faults that would stop a costing. */
  libraryStops: number
  /** Library faults that would let it cost and leave something out. */
  librarySilent: number
}

export const NOTHING: Attention = {
  costings: 0, quotations: 0, followupsOverdue: 0, followupsOpen: 0, libraryStops: 0, librarySilent: 0,
}

export function attentionFrom(
  desk: DeskItem[],
  followups: QuotationFollowup[],
  library: LibraryHealthRow[],
  today: string,
): Attention {
  const open = followups.filter((f) => f.done_at === null)
  return {
    costings: desk.filter((d) => d.entity === 'costing').length,
    quotations: desk.filter((d) => d.entity === 'quotation').length,
    followupsOverdue: open.filter((f) => f.due_on < today).length,
    followupsOpen: open.length,
    libraryStops: library.filter((r) => r.severity === 'refuses').reduce((n, r) => n + r.items, 0),
    librarySilent: library.filter((r) => r.severity === 'silent').reduce((n, r) => n + r.items, 0),
  }
}

/** The count beside a sidebar item, or nothing at all when there is none. */
export function navCount(attention: Attention, key: string): { text: string; hot: boolean } | null {
  const n =
    key === 'costings' ? attention.costings
    : key === 'quotations' ? attention.quotations
    : key === 'followups' ? attention.followupsOpen
    : key === 'library' ? attention.libraryStops
    : 0
  if (n <= 0) return null
  // Orange only for the two that are genuinely late; a count on its own is a
  // fact, and a badge on everything teaches people to ignore badges.
  const hot =
    (key === 'followups' && attention.followupsOverdue > 0) || (key === 'library' && attention.libraryStops > 0)
  return { text: String(n), hot }
}

/** Today, as the date strings in the database are written. */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}
