/**
 * Compatibility warnings in words (roadmap 3.4). The database decides what is
 * wrong and writes the sentence; this groups the findings by panel, orders them
 * so the loudest is read first, and says how many there are.
 *
 * Pure, and holds no rule of its own: a second implementation of a rule is a
 * second answer waiting to disagree with the first.
 */
import type { CompatibilityKind, PanelWarning } from '../../lib/database.types'

/** What each kind of check is about, for the "why am I seeing this" line. */
export const KIND_LABELS: Record<CompatibilityKind, string> = {
  device_depth_vs_cubicle: 'Will it go in?',
  accessory_fits_device: 'Does that part belong to that device?',
  feeders_vs_incomer: 'Do the outgoing ways add up?',
}

/** Blockers first, then by rule order, then by what they are about. */
export function orderWarnings(warnings: PanelWarning[]): PanelWarning[] {
  return [...warnings].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'blocker' ? -1 : 1
    if (a.rule_name !== b.rule_name) return a.rule_name.localeCompare(b.rule_name)
    return a.subject.localeCompare(b.subject)
  })
}

/** Every panel's findings, keyed by panel id, each list already in order. */
export function warningsByPanel(warnings: PanelWarning[]): Map<string, PanelWarning[]> {
  const byPanel = new Map<string, PanelWarning[]>()
  for (const w of warnings) {
    const list = byPanel.get(w.panel_id)
    if (list) list.push(w)
    else byPanel.set(w.panel_id, [w])
  }
  for (const [id, list] of byPanel) byPanel.set(id, orderWarnings(list))
  return byPanel
}

/**
 * The heading above the list: "2 things to check", or "1 of them stops this
 * costing being submitted" where a blocker is among them. Empty string when
 * there is nothing to say, so the caller shows nothing at all.
 */
export function warningsHeading(warnings: PanelWarning[]): string {
  if (warnings.length === 0) return ''
  const blockers = warnings.filter((w) => w.severity === 'blocker').length
  const thing = warnings.length === 1 ? 'thing' : 'things'
  const head = `${warnings.length} ${thing} to check`
  if (blockers === 0) return head
  if (blockers === warnings.length) {
    return blockers === 1
      ? '1 thing to check, and it may stop this costing being submitted'
      : `${blockers} things to check, and they may stop this costing being submitted`
  }
  return `${head}, ${blockers} of which may stop this costing being submitted`
}

/** The whole costing in one line, for the totals card. */
export function costingWarningSummary(warnings: PanelWarning[]): string {
  if (warnings.length === 0) return ''
  const panels = new Set(warnings.map((w) => w.panel_id)).size
  const thing = warnings.length === 1 ? 'thing' : 'things'
  const board = panels === 1 ? 'panel' : 'panels'
  return `${warnings.length} ${thing} to check on ${panels} ${board}`
}
