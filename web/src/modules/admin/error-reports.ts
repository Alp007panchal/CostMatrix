import type { ErrorReport } from '../../lib/database.types'

/**
 * Wording and ordering for the error report screen. Pure, and holds no error
 * logic of its own — the database decides what a report is and when two are the
 * same one.
 */

/** Worst first: what is still happening, and what happens most. */
export function orderReports(rows: ErrorReport[]): ErrorReport[] {
  return [...rows].sort((a, b) => {
    const seen = Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at)
    return seen !== 0 ? seen : b.times_seen - a.times_seen
  })
}

export function kindLabel(kind: ErrorReport['kind']): string {
  return kind === 'render' ? 'The screen stopped drawing' : 'Something would not load'
}

/** "seen 4 times, most recently …" — a count of one is not worth the words. */
export function timesLabel(row: ErrorReport): string {
  return row.times_seen === 1 ? 'once' : `${row.times_seen} times`
}

/** The route, made readable. Ids are long and say nothing on their own. */
export function whereLabel(path: string): string {
  if (!path || path === '/') return 'the home page'
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/…')
}

/**
 * What the screen says when there is nothing. Silence here is good news and
 * should read as good news, not as a broken page.
 */
export function nothingWrong(days: number): string {
  return `Nothing has gone wrong in the last ${days} days. Reports appear here on their own when a screen breaks for somebody; nobody has to send them.`
}

/** One line of context under the heading, honest about what is not covered. */
export function summary(rows: ErrorReport[]): string {
  if (rows.length === 0) return ''
  const people = new Set(rows.map((r) => r.user_id ?? 'unknown')).size
  const total = rows.reduce((sum, r) => sum + r.times_seen, 0)
  const faults = rows.length === 1 ? '1 fault' : `${rows.length} faults`
  const times = total === 1 ? 'once' : `${total} times`
  const who = people === 1 ? '1 person' : `${people} people`
  return `${faults}, ${times} in all, affecting ${who}.`
}
