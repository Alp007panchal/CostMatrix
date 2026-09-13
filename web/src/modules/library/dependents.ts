import type { LibraryDependents } from '../../lib/database.types'

/**
 * How much rests on one rate (migration 0127).
 *
 * Shown beside a currency factor and a material rate because that is the size of
 * what a change to it moves: the copper rate carries the whole busbar catalogue,
 * and the EUR factor carries almost the entire library. It is the same figure the
 * deletion guard counts, so a refusal is never a surprise.
 */

/**
 * The count for one row. A company's own factor or rate always reads zero — it
 * falls back to the master row, so nothing rests on it — which is why the master
 * figure is the one taken.
 */
export function dependentsFor(
  rows: LibraryDependents[],
  kind: LibraryDependents['kind'],
  label: string,
): number {
  return rows
    .filter((row) => row.kind === kind && row.label === label)
    .reduce((most, row) => Math.max(most, row.dependents), 0)
}

/** "11 parts", "1 part", or a dash — never "0 parts", which reads as a fault. */
export function dependentWords(count: number, noun = 'part'): string {
  if (count <= 0) return '—'
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`
}
