/**
 * The advanced features and their switches (the road to production). The
 * database decides what is on; this turns the register into something a person
 * can read and act on, and says plainly which switches change what an existing
 * costing does.
 *
 * Pure, and holds no feature logic of its own: a screen that decided for itself
 * whether something was on would be a second answer waiting to disagree.
 */
import type { CompanyFeature } from '../../lib/database.types'

/** In register order, the three that change a costing first within each group. */
export function orderFeatures(features: CompanyFeature[]): CompanyFeature[] {
  return [...features].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

/** "3 of 13 switched on", or the honest thing to say when none is. */
export function featureSummary(features: CompanyFeature[]): string {
  if (features.length === 0) return 'No features to switch on yet.'
  const on = features.filter((f) => f.is_on).length
  if (on === 0) return `Nothing switched on. All ${features.length} are off, which is how every company starts.`
  return `${on} of ${features.length} switched on.`
}

/** What a switch means for this one, in a sentence under the name. */
export function switchNote(feature: CompanyFeature): string {
  return feature.changes_costings
    ? 'Switching this on changes what an existing costing does — try it on staging first.'
    : 'Adds a screen. Nothing already costed changes.'
}

/**
 * Is one feature on? The single question the rest of the app asks. An unknown
 * code is off rather than on: a screen that has lost its register row should
 * disappear, not appear for everybody.
 */
export function isOn(features: CompanyFeature[] | undefined, code: string): boolean {
  return features?.find((f) => f.code === code)?.is_on ?? false
}

/** What the "not switched on" page says, naming the feature where it can. */
export function offMessage(features: CompanyFeature[] | undefined, code: string): string {
  const name = features?.find((f) => f.code === code)?.name
  return name
    ? `${name} is not switched on for your company.`
    : 'This part of the app is not switched on for your company.'
}
