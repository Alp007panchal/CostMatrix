import type { CostingLabourGaps } from '../../lib/database.types'

/**
 * What the missing-labour check says, in the words a person can act on
 * (migration 0123).
 *
 * The database decides; this only phrases it. Every sentence names the **fix**
 * rather than the symptom, because "no labour" is not useful on its own — the
 * answer is always either a row of the labour template or an hourly rate.
 */

export interface LabourWarning {
  tone: 'bad' | 'warn'
  headline: string
  detail: string
  fix: string
}

export function labourWarning(gaps: CostingLabourGaps | null): LabourWarning | null {
  if (gaps === null) return null

  // Nothing on the costing yet, or everything is timed and priced: say nothing.
  if (gaps.verdict === 'ok' || gaps.verdict === 'no_kits') return null

  const money = (n: number) => Math.round(n).toLocaleString()

  if (gaps.verdict === 'none' && gaps.labour_rows_without_rate > 0 && gaps.kit_lines_without_hours === 0) {
    // Hours are there; the rate they are priced at is nothing.
    return {
      tone: 'bad',
      headline: 'This costing charges nothing for labour.',
      detail: `The hours are recorded, but the hourly rate frozen onto this costing for ${gaps.processes_without_rate} is zero, so they cost nothing. A rate set after a costing is created does not reach it.`,
      fix: 'Set the rate under Rates → Labour rates, then make a new revision of this costing so it freezes the new figure.',
    }
  }

  if (gaps.verdict === 'none') {
    return {
      tone: 'bad',
      headline: 'This costing charges nothing for labour.',
      detail: `Its material comes to ${money(gaps.material_cost)} and its labour to nothing at all, because ${gaps.kit_lines_without_hours} of its ${gaps.kit_lines} kit line(s) have no hours in the library. A quotation from this would leave out the assembly, wiring and busbar time.`,
      fix: gaps.groups_to_fill === null
        ? 'Fill in the hours on the Kit groups screen.'
        : `Fill in the hours for ${gaps.groups_to_fill} on the Kit groups screen, then make a new revision.`,
    }
  }

  if (gaps.verdict === 'some') {
    return {
      tone: 'warn',
      headline: `${gaps.kit_lines_without_hours} of ${gaps.kit_lines} kit lines carry no labour.`,
      detail: `Labour is ${gaps.labour_share_pct ?? 0}% of material here. The lines with no hours are priced for their parts only.`,
      fix: gaps.groups_to_fill === null
        ? 'Fill in the hours on the Kit groups screen.'
        : `The hours come from ${gaps.groups_to_fill}.`,
    }
  }

  // verdict === 'no_rate': some hours priced at nothing, but labour is not zero.
  return {
    tone: 'warn',
    headline: 'Some hours on this costing are priced at nothing.',
    detail: `${gaps.labour_rows_without_rate} labour row(s) for ${gaps.processes_without_rate} have hours but a zero rate.`,
    fix: 'Set the rate under Rates → Labour rates, then make a new revision.',
  }
}
