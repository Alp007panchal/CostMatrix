import type { DeskItem, DeskKind } from '../../lib/database.types'

/**
 * What is on your desk, in words (migration 0126).
 *
 * The database decides what is waiting; this only groups it and says it. Pure,
 * so the wording is testable without a database, and so a new kind is a row here
 * rather than a branch in the home page.
 */

export const KINDS: { kind: DeskKind; label: string; blurb: string }[] = [
  {
    kind: 'returned_to_you',
    label: 'Sent back to you',
    blurb: 'It is a draft again, so nothing else will remind you. The comment says what to change.',
  },
  {
    kind: 'waiting_for_you',
    label: 'Waiting for you to approve',
    blurb: 'Submitted, and nobody can release a quotation from it until you have looked.',
  },
  {
    kind: 'released_not_sent',
    label: 'Released, never sent',
    blurb: 'The PDF exists and the customer has not been told. Mark it sent once you have sent it.',
  },
  {
    kind: 'sent_unanswered',
    label: 'Sent, still no answer',
    blurb: 'Not a fault — the oldest is simply the one worth asking about.',
  },
]

export function kindLabel(kind: DeskKind): string {
  return KINDS.find((k) => k.kind === kind)?.label ?? kind
}

/** The items grouped by kind, in the database's own order; empty kinds left out. */
export function byKind(items: DeskItem[]): {
  kind: DeskKind
  label: string
  blurb: string
  items: DeskItem[]
}[] {
  return KINDS.map((k) => ({
    ...k,
    items: items
      .filter((i) => i.kind === k.kind)
      // Oldest first: the thing that has waited longest is the thing to do.
      .slice()
      .sort((a, b) => b.days - a.days || a.reference.localeCompare(b.reference)),
  })).filter((group) => group.items.length > 0)
}

/** How long it has sat there, said the way a person says it. */
export function ageWords(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  return `${Math.round(days / 30)} months ago`
}

/**
 * The one line under the heading. It names the oldest thing rather than counting
 * everything, because "4 things" tells you nothing and "one sitting three weeks"
 * tells you which to open.
 */
export function headline(items: DeskItem[]): string {
  if (items.length === 0) return ''
  const oldest = items.reduce((worst, i) => (i.days > worst.days ? i : worst), items[0]!)
  const count = items.length === 1 ? '1 thing' : `${items.length} things`
  if (oldest.days <= 1) return `${count} waiting.`
  return `${count} waiting; the oldest since ${ageWords(oldest.days)}.`
}

/** Where a line goes when it is clicked. */
export function deskLink(item: DeskItem): string {
  return item.entity === 'costing' ? `/costings/${item.entity_id}` : '/quotations'
}
