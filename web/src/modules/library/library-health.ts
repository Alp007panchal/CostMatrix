import type { LibraryHealthRow, LibraryIssueKind, LibrarySeverity } from '../../lib/database.types'

/**
 * The library's faults in words (migration 0125).
 *
 * The database decides what is wrong and how bad it is; this only says it in a
 * sentence. Pure, so the wording can be tested without a database — and kept
 * apart from the page, so a new rule is a row here rather than a branch in JSX.
 */

/** What a severity means, said as a consequence rather than as a colour. */
export const SEVERITIES: { severity: LibrarySeverity; label: string; blurb: string }[] = [
  {
    severity: 'refuses',
    label: 'Stops a costing',
    blurb: 'The costing will not take it, and says which part. Nothing is lost — but the work stops until it is fixed.',
  },
  {
    severity: 'silent',
    label: 'Costs, and leaves something out',
    blurb: 'Worse than the first, because nothing complains. The quotation can be released with the labour missing.',
  },
  {
    severity: 'check',
    label: 'Worth a look',
    blurb: 'Nothing breaks. It may be perfectly right — a supply-only kit really has no connection material.',
  },
]

/** The heading each kind gets, in the owner's words rather than the column's. */
export const KIND_LABELS: Record<LibraryIssueKind, string> = {
  part_no_price: 'Parts with no price',
  part_placeholder: 'Parts waiting for a price',
  part_no_factor: 'Parts priced in a currency with no landed factor',
  part_no_rate: 'Parts priced by weight with no material rate',
  kit_unpriced_part: 'Kits holding a part with no price',
  kit_no_lines: 'Empty kits',
  kit_no_group: 'Kits in no kit group',
  kit_no_hours: 'Kits whose group has no hours',
  kit_only_main_device: 'Kits with only their main device',
  kit_no_main_device: 'Kits with no main device',
  kit_no_rating: 'Kits with no rating',
  kit_obsolete_part: 'Kits holding an obsolete part',
}

export function kindLabel(kind: LibraryIssueKind): string {
  return KIND_LABELS[kind] ?? kind
}

export function severityLabel(severity: LibrarySeverity): string {
  return SEVERITIES.find((s) => s.severity === severity)?.label ?? severity
}

/** Which library a row belongs to, said the way a person would say it. */
export function libraryLabel(library: 'master' | 'private'): string {
  return library === 'master' ? 'the shared catalogue' : 'your own library'
}

/**
 * The rows grouped by severity, worst first, each group in the order the database
 * gave. A severity with nothing in it is left out rather than shown empty.
 */
export function bySeverity(rows: LibraryHealthRow[]): {
  severity: LibrarySeverity
  label: string
  blurb: string
  rows: LibraryHealthRow[]
}[] {
  return SEVERITIES.map((s) => ({
    ...s,
    rows: rows
      .filter((r) => r.severity === s.severity)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.library.localeCompare(b.library)),
  })).filter((group) => group.rows.length > 0)
}

/**
 * The one line at the top. It counts **kinds of work**, not rows, because "240
 * kits have no hours" is one row of a template to fill in, not 240 jobs — and a
 * screen that opens on a four-figure number is a screen nobody opens twice.
 */
export function headline(rows: LibraryHealthRow[]): string {
  if (rows.length === 0) return 'Nothing to fix: every part can be priced and every kit is ready to cost.'
  const stops = rows.filter((r) => r.severity === 'refuses')
  const silent = rows.filter((r) => r.severity === 'silent')
  const parts: string[] = []
  if (stops.length > 0) parts.push(`${plural(count(stops), 'thing')} that would stop a costing`)
  if (silent.length > 0) parts.push(`${plural(count(silent), 'thing')} that would cost and leave something out`)
  if (parts.length === 0) return `${plural(count(rows), 'thing')} worth a look. Nothing is broken.`
  return `${join(parts)}. Each says which screen fixes it.`
}

function count(rows: LibraryHealthRow[]): number {
  return rows.reduce((total, row) => total + row.items, 0)
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

function join(parts: string[]): string {
  if (parts.length === 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The examples as one readable string, saying when there are more than shown. */
export function exampleWords(row: LibraryHealthRow): string {
  const examples = row.examples ?? []
  if (examples.length === 0) return ''
  const more = row.items - examples.length
  return more > 0 ? `${examples.join(', ')} and ${more.toLocaleString()} more` : examples.join(', ')
}
