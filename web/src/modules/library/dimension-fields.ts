import type { Clearances, EnclosureLayout, MountingType } from '../../lib/database.types'
import type { DimensionValues } from './DimensionFields'

/**
 * The form boxes of F12 in and out of the shapes the database keeps: a
 * `clearances` object and an `enclosure_layout` object. Pure, so the conversion
 * — the part where an empty box must stay empty rather than become a zero — is
 * covered by tests.
 */

export const EMPTY_DIMENSIONS: DimensionValues = {
  width_mm: '', height_mm: '', depth_mm: '', mounting_type: '', weight_kg: '',
  clearance_top: '', clearance_bottom: '', clearance_left: '', clearance_right: '',
  usable_w_mm: '', usable_h_mm: '', usable_d_mm: '',
  busbar_chamber_w: '', busbar_chamber_h: '', cable_chamber_w: '', cable_chamber_h: '',
  form: '',
}

const text = (value: number | null | undefined): string => (value == null ? '' : String(value))

/** What the form shows for a part as the database holds it. */
export function toDimensionValues(part: {
  width_mm?: number | null
  height_mm?: number | null
  depth_mm?: number | null
  mounting_type?: string | null
  weight_kg?: number | null
  clearances?: Clearances | null
  enclosure_layout?: EnclosureLayout | null
} | null): DimensionValues {
  if (!part) return { ...EMPTY_DIMENSIONS }
  const c = part.clearances ?? {}
  const l = part.enclosure_layout ?? {}
  return {
    width_mm: text(part.width_mm),
    height_mm: text(part.height_mm),
    depth_mm: text(part.depth_mm),
    mounting_type: part.mounting_type ?? '',
    weight_kg: text(part.weight_kg),
    clearance_top: text(c.top),
    clearance_bottom: text(c.bottom),
    clearance_left: text(c.left),
    clearance_right: text(c.right),
    usable_w_mm: text(l.usable_w_mm),
    usable_h_mm: text(l.usable_h_mm),
    usable_d_mm: text(l.usable_d_mm),
    busbar_chamber_w: text(l.busbar_chamber?.w_mm),
    busbar_chamber_h: text(l.busbar_chamber?.h_mm),
    cable_chamber_w: text(l.cable_chamber?.w_mm),
    cable_chamber_h: text(l.cable_chamber?.h_mm),
    form: l.form ?? '',
  }
}

const MOUNTINGS: MountingType[] = ['din_rail', 'plate', 'withdrawable', 'door', 'busbar_chamber', 'other']

const num = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The columns to save. An empty box is null, never zero. */
export function fromDimensionValues(
  values: DimensionValues,
  isCubicle: boolean,
): {
  width_mm: number | null
  height_mm: number | null
  depth_mm: number | null
  mounting_type: MountingType | null
  weight_kg: number | null
  clearances: Clearances
  enclosure_layout: EnclosureLayout
} {
  const clearances: Clearances = {}
  const sides: [keyof Clearances, string][] = [
    ['top', values.clearance_top], ['bottom', values.clearance_bottom],
    ['left', values.clearance_left], ['right', values.clearance_right],
  ]
  for (const [side, raw] of sides) {
    const n = num(raw)
    if (n != null) clearances[side] = n
  }

  // A usable area on anything but a cubicle is refused by the database, so the
  // form does not offer it and does not send it either.
  const layout: EnclosureLayout = {}
  if (isCubicle) {
    const w = num(values.usable_w_mm)
    const h = num(values.usable_h_mm)
    const d = num(values.usable_d_mm)
    if (w != null) layout.usable_w_mm = w
    if (h != null) layout.usable_h_mm = h
    if (d != null) layout.usable_d_mm = d
    const bbW = num(values.busbar_chamber_w)
    const bbH = num(values.busbar_chamber_h)
    if (bbW != null || bbH != null) {
      layout.busbar_chamber = { ...(bbW != null ? { w_mm: bbW } : {}), ...(bbH != null ? { h_mm: bbH } : {}) }
    }
    const ccW = num(values.cable_chamber_w)
    const ccH = num(values.cable_chamber_h)
    if (ccW != null || ccH != null) {
      layout.cable_chamber = { ...(ccW != null ? { w_mm: ccW } : {}), ...(ccH != null ? { h_mm: ccH } : {}) }
    }
    if (values.form.trim() !== '') layout.form = values.form.trim()
  }

  const weight = values.weight_kg.trim() === '' ? null : Number(values.weight_kg)
  return {
    width_mm: num(values.width_mm),
    height_mm: num(values.height_mm),
    depth_mm: num(values.depth_mm),
    // The select only offers the six the database allows, so a value that is
    // not one of them can only be a stale form state: treated as unset.
    mounting_type: MOUNTINGS.includes(values.mounting_type as MountingType)
      ? (values.mounting_type as MountingType)
      : null,
    weight_kg: weight != null && Number.isFinite(weight) && weight >= 0 ? weight : null,
    clearances,
    enclosure_layout: layout,
  }
}

/** The fit check's verdict as a sentence, and how to colour it. */
export function fitSentence(fit: {
  verdict: string
  used_pct: number | null
  kits_unmeasured: number
  cubicles: { known: boolean }[]
}): { tone: 'ok' | 'muted' | 'error'; text: string } {
  const unmeasured =
    fit.kits_unmeasured > 0
      ? ` ${fit.kits_unmeasured} kit${fit.kits_unmeasured === 1 ? '' : 's'} not measured yet, so this counts only what is.`
      : ''
  switch (fit.verdict) {
    case 'fits':
      return { tone: 'ok', text: `Space: the kits use about ${fit.used_pct} % of the cubicles bought for this panel.${unmeasured}` }
    case 'tight':
      return { tone: 'muted', text: `Space: tight — about ${fit.used_pct} % of the cubicles bought. Check it against a drawing before quoting.${unmeasured}` }
    case 'no_fit':
      return { tone: 'error', text: `Space: the kits need about ${fit.used_pct} % of the cubicles bought for this panel. Add a cubicle, or a wider one.${unmeasured}` }
    default:
      return {
        tone: 'muted',
        text:
          fit.cubicles.length === 0
            ? 'Space: no enclosure cubicle on this panel yet, so there is nothing to check against.'
            : 'Space: not known yet — measure the kits and the cubicle on the Components screen.',
      }
  }
}
