/**
 * The compatibility checks in words (roadmap 3.4). The database decides what a
 * rule finds; this says what a rule is for, and turns the one number each kind
 * has into a box a person can type in.
 *
 * Pure, and deliberately small: the arithmetic lives in SQL, so there is one
 * answer rather than two that can disagree.
 */
import type { CompatibilityKind, CompatibilityRule } from '../../lib/database.types'

export const KINDS: { kind: CompatibilityKind; label: string; blurb: string }[] = [
  {
    kind: 'device_depth_vs_cubicle',
    label: 'Will it go in?',
    blurb: 'A device deeper than the usable depth of the cubicle bought for it.',
  },
  {
    kind: 'accessory_fits_device',
    label: 'Does that part belong to that device?',
    blurb: 'A part whose catalogue entry lists the devices it fits, on a kit whose device is not among them.',
  },
  {
    kind: 'feeders_vs_incomer',
    label: 'Do the outgoing ways add up?',
    blurb: 'The outgoing ways adding up to far more than the incomer can carry.',
  },
]

/** The one number each kind has, and what it means in a sentence. */
export const NUMBERS: Record<CompatibilityKind, { key: string; label: string; unit: string } | null> = {
  device_depth_vs_cubicle: { key: 'clearance_mm', label: 'Room to leave behind the device', unit: 'mm' },
  accessory_fits_device: null,
  feeders_vs_incomer: { key: 'max_ratio', label: 'How many times the incomer is too many', unit: '×' },
}

export function kindLabel(kind: CompatibilityKind): string {
  return KINDS.find((k) => k.kind === kind)?.label ?? kind
}

/** The rule's number as it stands, or null where the kind has none. */
export function ruleNumber(rule: CompatibilityRule): number | null {
  const spec = NUMBERS[rule.rule_kind]
  if (!spec) return null
  const value = Number(rule.params[spec.key])
  return Number.isFinite(value) ? value : null
}

/** The same params with that one number changed, ready to save. */
export function withNumber(rule: CompatibilityRule, value: number): Record<string, unknown> {
  const spec = NUMBERS[rule.rule_kind]
  if (!spec) return rule.params
  return { ...rule.params, [spec.key]: value }
}

/**
 * Why a typed number would be refused, or null when it is fine. The database
 * refuses it too; this says so before the round trip.
 */
export function numberProblem(kind: CompatibilityKind, value: number): string | null {
  const spec = NUMBERS[kind]
  if (!spec) return null
  if (!Number.isFinite(value)) return 'Type a number.'
  if (kind === 'feeders_vs_incomer' && value <= 0) return 'A rule that triggers at zero times the incomer would warn about every board.'
  if (kind === 'device_depth_vs_cubicle' && value < 0) return 'The room behind a device cannot be less than nothing.'
  return null
}

/** "Master rule" or the company's own, for the source column. */
export function ruleSource(rule: CompatibilityRule): string {
  return rule.company_id === null ? 'Everybody' : 'Ours'
}

/** One rule as a sentence: what it looks at, and how loud it is. */
export function ruleSentence(rule: CompatibilityRule): string {
  const spec = NUMBERS[rule.rule_kind]
  const number = ruleNumber(rule)
  const loudness = rule.severity === 'blocker'
    ? 'An approval rule can refuse a costing over it.'
    : 'A warning on the panel; it changes no figure.'
  if (!spec || number === null) return `${kindLabel(rule.rule_kind)} ${loudness}`
  return `${kindLabel(rule.rule_kind)} ${spec.label}: ${number} ${spec.unit}. ${loudness}`
}
