import { useState } from 'react'
import { Field } from '../../ui/Async'

/**
 * The optional fields migration 0100 added to a component (foundations F1), kept
 * out of the way behind a disclosure: nothing here has to be filled in, and the
 * seven hundred parts already imported have none of them.
 *
 * `status` is shown but never edited. It is a generated column derived from
 * "in use" and "placeholder", and the database refuses a write to it.
 */

export interface ExtraValues {
  supplier: string
  datasheet_url: string
  lead_time_days: string
  price_valid_from: string
  price_source: string
  attributes: string
}

export function ComponentExtraFields({
  values,
  status,
  attributesError,
  onChange,
}: {
  values: ExtraValues
  status: 'active' | 'obsolete' | 'placeholder' | null
  attributesError: string | null
  onChange: <K extends keyof ExtraValues>(key: K, value: string) => void
}) {
  const filled = Object.values(values).some((v) => v.trim() !== '' && v.trim() !== '{}')
  const [open, setOpen] = useState(filled)

  if (!open) {
    return (
      <p style={{ margin: '0 0 .9rem' }}>
        <button type="button" onClick={() => setOpen(true)}>
          More about this part…
        </button>
        <span className="muted" style={{ fontSize: '.8125rem', marginLeft: '.6rem' }}>
          supplier, datasheet, lead time, where the price came from. All optional.
        </span>
      </p>
    )
  }

  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 .9rem' }}>
      <div className="spread">
        <legend className="muted" style={{ fontSize: '.8125rem', padding: 0 }}>
          More about this part — all optional
        </legend>
        {status && (
          <span className="muted" style={{ fontSize: '.8125rem' }}>
            State: <strong>{status}</strong>
          </span>
        )}
      </div>

      <div className="row">
        <div style={{ flex: 1 }}>
          <Field label="Supplier" hint="who invoices, if not the make">
            <input value={values.supplier} onChange={(e) => onChange('supplier', e.target.value)} />
          </Field>
        </div>
        <div style={{ width: '9rem' }}>
          <Field label="Lead time" hint="days">
            <input
              type="number"
              min={0}
              value={values.lead_time_days}
              onChange={(e) => onChange('lead_time_days', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Field label="Datasheet address" hint="a link to the manufacturer's sheet">
        <input
          type="url"
          placeholder="https://…"
          value={values.datasheet_url}
          onChange={(e) => onChange('datasheet_url', e.target.value)}
        />
      </Field>

      <div className="row">
        <div style={{ width: '11rem' }}>
          <Field label="Price dates from">
            <input
              type="date"
              value={values.price_valid_from}
              onChange={(e) => onChange('price_valid_from', e.target.value)}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Price came from" hint="the supplier list and its date, or who entered it">
            <input
              value={values.price_source}
              onChange={(e) => onChange('price_source', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <Field
        label="Attributes"
        hint='extras the configurator reads later, e.g. {"mounting": "withdrawable", "ip": "IP31"}'
      >
        <textarea
          rows={3}
          value={values.attributes}
          onChange={(e) => onChange('attributes', e.target.value)}
        />
      </Field>
      {attributesError && <p className="error">{attributesError}</p>}
    </fieldset>
  )
}
