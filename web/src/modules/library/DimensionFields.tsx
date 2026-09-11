import { useState } from 'react'
import { Field } from '../../ui/Async'
import type { MountingType } from '../../lib/database.types'

/**
 * How big the part is, what it mounts on and the room to leave around it
 * (foundations F12). All optional and all behind a disclosure: seven hundred
 * parts are already in the library with none of it, and nothing breaks while a
 * part is unmeasured — the fit check on a costing simply says so.
 *
 * Millimetres throughout, because that is what a cubicle drawing uses.
 */

export interface DimensionValues {
  width_mm: string
  height_mm: string
  depth_mm: string
  mounting_type: string
  weight_kg: string
  clearance_top: string
  clearance_bottom: string
  clearance_left: string
  clearance_right: string
  /** Enclosure cubicles only. */
  usable_w_mm: string
  usable_h_mm: string
  usable_d_mm: string
  busbar_chamber_w: string
  busbar_chamber_h: string
  cable_chamber_w: string
  cable_chamber_h: string
  form: string
}

export const MOUNTINGS: { value: MountingType; label: string }[] = [
  { value: 'din_rail', label: 'DIN rail' },
  { value: 'plate', label: 'Mounting plate' },
  { value: 'withdrawable', label: 'Withdrawable cassette' },
  { value: 'door', label: 'Door or front plate' },
  { value: 'busbar_chamber', label: 'Busbar chamber' },
  { value: 'other', label: 'Something else' },
]

export function DimensionFields({
  values,
  isCubicle,
  onChange,
}: {
  values: DimensionValues
  isCubicle: boolean
  onChange: <K extends keyof DimensionValues>(key: K, value: string) => void
}) {
  const filled = Object.values(values).some((v) => v.trim() !== '')
  const [open, setOpen] = useState(filled)

  if (!open) {
    return (
      <p style={{ margin: '0 0 .9rem' }}>
        <button type="button" onClick={() => setOpen(true)}>
          Size and mounting…
        </button>
        <span className="muted" style={{ fontSize: '.8125rem', marginLeft: '.6rem' }}>
          width, height, depth, what it mounts on, clearances. All optional; used by the
          space check on a costing.
        </span>
      </p>
    )
  }

  const mm = (key: keyof DimensionValues, label: string, hint?: string) => (
    <div style={{ flex: 1, minWidth: '7rem' }}>
      <Field label={label} {...(hint ? { hint } : {})}>
        <input
          type="number" step="0.1" min="0" inputMode="decimal"
          value={values[key]}
          onChange={(e) => onChange(key, e.target.value)}
        />
      </Field>
    </div>
  )

  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 .9rem' }}>
      <legend className="muted" style={{ fontSize: '.8125rem', padding: 0 }}>
        Size and mounting — all optional, all in millimetres
      </legend>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        {mm('width_mm', 'Width')}
        {mm('height_mm', 'Height')}
        {mm('depth_mm', 'Depth')}
        <div style={{ flex: 1, minWidth: '9rem' }}>
          <Field label="Mounts on">
            <select value={values.mounting_type} onChange={(e) => onChange('mounting_type', e.target.value)}>
              <option value="">—</option>
              {MOUNTINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1, minWidth: '7rem' }}>
          <Field label="Weight" hint="kg">
            <input
              type="number" step="0.001" min="0" inputMode="decimal"
              value={values.weight_kg}
              onChange={(e) => onChange('weight_kg', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '.8125rem', margin: '.2rem 0' }}>
        Clearances — the room the maker says to leave around it. Counted as part of the space
        the part takes on the plate.
      </p>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        {mm('clearance_top', 'Above')}
        {mm('clearance_bottom', 'Below')}
        {mm('clearance_left', 'Left')}
        {mm('clearance_right', 'Right')}
      </div>

      {isCubicle && (
        <>
          <p className="muted" style={{ fontSize: '.8125rem', margin: '.6rem 0 .2rem' }}>
            This cubicle's inside: the area devices can actually be mounted on, the chambers that
            are not available for them, and the form it is built to.
          </p>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {mm('usable_w_mm', 'Usable width')}
            {mm('usable_h_mm', 'Usable height')}
            {mm('usable_d_mm', 'Usable depth')}
            <div style={{ flex: 1, minWidth: '7rem' }}>
              <Field label="Form" hint="3B, 4B…">
                <input value={values.form} onChange={(e) => onChange('form', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {mm('busbar_chamber_w', 'Busbar chamber width')}
            {mm('busbar_chamber_h', 'Busbar chamber height')}
            {mm('cable_chamber_w', 'Cable chamber width')}
            {mm('cable_chamber_h', 'Cable chamber height')}
          </div>
        </>
      )}
    </fieldset>
  )
}
