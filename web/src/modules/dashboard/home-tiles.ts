import type { DeskItem, LibraryHealthRow, QuotationFollowup, QuotationRow } from '../../lib/database.types'
import { ageWords } from './desk'

/**
 * The home page's four tiles and its exception bar, worked out from the rows the
 * app already has (house style §4 rules 2 and 7).
 *
 * Pure, and deliberately so: the wording of "the oldest has waited three weeks"
 * is the sort of thing that is wrong for months before anybody notices, and here
 * it can be asserted in a test with no database at all.
 *
 * Everything is counted from `my-desk`, `quotations` and `followups` — the three
 * queries the pages themselves use. Nothing here asks the database anything new,
 * so a tile and the screen behind it cannot disagree.
 */

export interface Tile {
  label: string
  value: string
  /** The second line: what the number is made of, so it can be acted on. */
  delta: string
  /** Red when somebody must act today, amber to watch, nothing when it is a fact. */
  tone?: 'crit' | 'watch'
}

export interface Exception {
  hl: string
  why: string
  /** Which screen said this, so the warning can be argued with. */
  src: string
  fig: number
  watch?: boolean
  to: string
}

const OUT: ReadonlySet<string> = new Set(['released', 'sent'])

export function homeTiles(
  desk: DeskItem[],
  quotations: QuotationRow[],
  followups: QuotationFollowup[],
  today: string,
): Tile[] {
  const approvals = desk.filter((d) => d.kind === 'waiting_for_you')
  const out = quotations.filter((q) => OUT.has(q.status))
  const open = followups.filter((f) => f.done_at === null)
  const overdue = open.filter((f) => f.due_on < today)
  const wonThisMonth = quotations.filter(
    (q) => q.status === 'won' && q.decided_at !== null && q.decided_at.slice(0, 7) === today.slice(0, 7),
  )

  return [
    {
      label: 'Waiting for your approval',
      value: String(approvals.length),
      delta: approvals.length === 0 ? 'nothing submitted to you' : oldestAnd(approvals),
      ...(approvals.length > 0 ? { tone: 'watch' as const } : {}),
    },
    {
      label: 'Quotations out',
      value: String(out.length),
      delta: sentAndWaiting(out),
    },
    {
      label: 'Follow-ups overdue',
      value: String(overdue.length),
      delta:
        overdue.length === 0
          ? `${open.length} open, none overdue`
          : `${open.length} open · longest ${daysWord(daysLate(overdue, today))} late`,
      ...(overdue.length > 0 ? { tone: 'crit' as const } : {}),
    },
    {
      label: 'Won this month',
      value: String(wonThisMonth.length),
      delta:
        wonThisMonth.length === 0
          ? 'nothing decided yet this month'
          : wonThisMonth.map((q) => q.reference_no).slice(0, 3).join(' · '),
    },
  ]
}

/** At most three things that need a decision today, worst first. */
export function exceptions(
  desk: DeskItem[],
  followups: QuotationFollowup[],
  library: LibraryHealthRow[],
  today: string,
): Exception[] {
  const found: Exception[] = []

  const approvals = desk.filter((d) => d.kind === 'waiting_for_you')
  if (approvals.length > 0) {
    found.push({
      hl: approvals.length === 1 ? 'A costing is waiting for approval' : `${approvals.length} costings are waiting for approval`,
      why: `${approvals.map((d) => d.reference).slice(0, 3).join(', ')} — nobody can release a quotation until you have looked.`,
      src: 'Costings · approval',
      fig: approvals.length,
      to: '/costings',
    })
  }

  const overdue = followups.filter((f) => f.done_at === null && f.due_on < today)
  if (overdue.length > 0) {
    found.push({
      hl: overdue.length === 1 ? 'A follow-up is overdue' : `${overdue.length} follow-ups are overdue`,
      why: `The longest is ${daysWord(daysLate(overdue, today))} late. A quotation nobody chases is a quotation that expires.`,
      src: 'Quotations · follow-ups',
      fig: overdue.length,
      to: '/crm/follow-ups',
    })
  }

  const stops = library.filter((r) => r.severity === 'refuses').reduce((n, r) => n + r.items, 0)
  const silent = library.filter((r) => r.severity === 'silent').reduce((n, r) => n + r.items, 0)
  if (stops > 0 || silent > 0) {
    found.push({
      hl: stops > 0 ? 'The library has gaps that stop costings' : 'The library has gaps that cost silently',
      why:
        stops > 0
          ? `${stops} ${stops === 1 ? 'thing' : 'things'} would refuse a costing outright${silent > 0 ? `, and ${silent} more would let it price and leave something out` : ''}.`
          : `${silent} ${silent === 1 ? 'thing' : 'things'} would let a costing price and leave something out — no error, just a number that is too low.`,
      src: 'Library health',
      fig: stops > 0 ? stops : silent,
      ...(stops > 0 ? {} : { watch: true }),
      to: '/library/health',
    })
  }

  return found.slice(0, 3)
}

function oldestAnd(items: DeskItem[]): string {
  const oldest = items.reduce((worst, i) => (i.days > worst.days ? i : worst), items[0]!)
  const names = items.map((i) => i.reference).slice(0, 3).join(', ')
  return oldest.days <= 1 ? names : `oldest ${ageWords(oldest.days)} · ${names}`
}

function sentAndWaiting(out: QuotationRow[]): string {
  const sent = out.filter((q) => q.sent_at !== null).length
  if (out.length === 0) return 'nothing released and unanswered'
  return `${sent} sent · ${out.length - sent} released but never sent`
}

function daysLate(overdue: QuotationFollowup[], today: string): number {
  const day = 86_400_000
  return Math.max(...overdue.map((f) => Math.round((Date.parse(today) - Date.parse(f.due_on)) / day)))
}

function daysWord(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}
