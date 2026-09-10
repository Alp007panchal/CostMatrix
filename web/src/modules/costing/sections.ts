import type { AssemblyTotals, CostingAssembly } from '../../lib/database.types'

/**
 * A panel is read in sections — incomer, outgoers, APFC bank — the way the old
 * costing sheets were written. This groups a panel's lines into those sections
 * and adds up each one. Pure, so it is unit-tested rather than eyeballed.
 *
 * Order: the sections the master library offers, in its order, then any section
 * somebody typed, in the order it first appears, then the lines that are in no
 * section at all.
 */

export interface SectionGroup {
  /** The section's name, or null for the lines not placed in one. */
  section: string | null
  heading: string
  lines: CostingAssembly[]
  /** For one panel: what its material and labour come to. */
  material: number
  labour: number
}

export const NO_SECTION = 'Not in a section'

export function sectionOf(line: CostingAssembly): string | null {
  const name = (line.section ?? '').trim()
  return name === '' ? null : name
}

export function groupBySection(
  assemblies: CostingAssembly[],
  totals: AssemblyTotals[],
  offered: string[] = [],
): SectionGroup[] {
  const totalsById = new Map(totals.map((t) => [t.costing_assembly_id, t]))
  const groups = new Map<string, SectionGroup>()
  const firstSeen = new Map<string, number>()

  // Kits before the loose parts of the same section, each in the order added.
  const ordered = [...assemblies].sort((a, b) =>
    a.kind === b.kind ? a.sort_order - b.sort_order : a.kind === 'free' ? 1 : -1,
  )

  for (const line of ordered) {
    const section = sectionOf(line)
    const key = section ?? ''
    if (!groups.has(key)) {
      groups.set(key, { section, heading: section ?? NO_SECTION, lines: [], material: 0, labour: 0 })
      firstSeen.set(key, line.sort_order)
    }
    const group = groups.get(key)!
    group.lines.push(line)
    const t = totalsById.get(line.id)
    group.material += t?.material_total ?? 0
    group.labour += t?.labour_total ?? 0
  }

  const rank = (key: string): number => {
    if (key === '') return Number.MAX_SAFE_INTEGER               // no section: last
    const i = offered.findIndex((o) => o.toLowerCase() === key.toLowerCase())
    return i >= 0 ? i : offered.length + (firstSeen.get(key) ?? 0)
  }

  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([, g]) => g)
}
