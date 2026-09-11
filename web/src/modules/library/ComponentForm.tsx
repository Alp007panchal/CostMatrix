import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Field } from '../../ui/Async'
import type {
  ComponentCategory,
  ComponentPrice,
  EffectiveCurrencyFactor,
  EffectiveMaterialRate,
  PricingMode,
} from '../../lib/database.types'
import { createComponent, updateComponent, type ComponentInput } from './api'
import { PricingFields } from './PricingFields'
import { ComponentExtraFields } from './ComponentExtraFields'
import { parseAttributes } from './library-fields'

/**
 * Add or change one component.
 *
 * The two pricing modes are mutually exclusive and the database enforces it,
 * so the form shows only the fields that belong to the chosen mode.
 */
export function ComponentForm({
  existing,
  categories,
  materialRates,
  currencyFactors,
  onClose,
  onSaved,
}: {
  existing: ComponentPrice | null
  categories: ComponentCategory[]
  materialRates: EffectiveMaterialRate[]
  currencyFactors: EffectiveCurrencyFactor[]
  onClose: () => void
  onSaved: () => void
}) {
  const { company, isMasterAdmin } = useSession()

  // A master admin adds to the shared library; anyone else adds to their own.
  const [toMaster, setToMaster] = useState(existing ? existing.company_id === null : isMasterAdmin)

  const [form, setForm] = useState({
    category_code: existing?.category_code ?? categories[0]?.code ?? 'switchgear',
    code: existing?.code ?? '',
    name: existing?.name ?? '',
    description: existing?.description ?? '',
    unit: existing?.unit ?? 'pcs',
    manufacturer: existing?.manufacturer ?? '',
    part_number: existing?.part_number ?? '',
    pricing_mode: (existing?.pricing_mode ?? 'fixed') as PricingMode,
    purchase_price: existing?.raw_price != null ? String(existing.raw_price) : '',
    purchase_currency: existing?.purchase_currency ?? currencyFactors[0]?.currency_code ?? 'KES',
    weight_per_unit: existing?.weight_per_unit != null ? String(existing.weight_per_unit) : '',
    material_rate_code: existing?.material_rate_code ?? materialRates[0]?.code ?? 'copper_busbar',
    is_enclosure_cubicle: existing?.is_enclosure_cubicle ?? false,
    // The optional fields of foundations F1. Held as text like the rest of the
    // form and converted on save, so a half-typed number is never sent.
    supplier: existing?.supplier ?? '',
    datasheet_url: existing?.datasheet_url ?? '',
    lead_time_days: existing?.lead_time_days != null ? String(existing.lead_time_days) : '',
    price_valid_from: existing?.price_valid_from ?? '',
    price_source: existing?.price_source ?? '',
    attributes:
      existing?.attributes && Object.keys(existing.attributes).length > 0
        ? JSON.stringify(existing.attributes, null, 2)
        : '',
  })
  const [attributesError, setAttributesError] = useState<string | null>(null)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
      // Checked here so a mistyped bracket is one sentence rather than a
      // Postgres message about JSON syntax.
      const attrs = parseAttributes(form.attributes)
      if ('error' in attrs) throw new Error(attrs.error)
      const attributes = attrs.value

      const input: ComponentInput = {
        company_id: toMaster ? null : (company?.id ?? null),
        category_code: form.category_code,
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit.trim() || 'pcs',
        manufacturer: form.manufacturer.trim() || null,
        part_number: form.part_number.trim() || null,
        pricing_mode: form.pricing_mode,
        // An empty box stays null (a placeholder), never 0: Number('') is 0.
        purchase_price: form.pricing_mode === 'fixed' && form.purchase_price.trim() !== '' ? Number(form.purchase_price) : null,
        purchase_currency: form.pricing_mode === 'fixed' ? form.purchase_currency : 'KES',
        weight_per_unit: form.pricing_mode === 'weight_rate' ? Number(form.weight_per_unit) : null,
        material_rate_code: form.pricing_mode === 'weight_rate' ? form.material_rate_code : null,
        is_enclosure_cubicle: form.category_code === 'enclosure_parts' && form.is_enclosure_cubicle,
        // A placeholder stops being one the moment it gets a price.
        is_placeholder: form.pricing_mode === 'fixed' && form.purchase_price === '',
        supplier: form.supplier.trim() || null,
        datasheet_url: form.datasheet_url.trim() || null,
        lead_time_days: form.lead_time_days.trim() !== '' ? Number(form.lead_time_days) : null,
        price_valid_from: form.price_valid_from.trim() || null,
        price_source: form.price_source.trim() || null,
        attributes,
      }
      return existing ? updateComponent(existing.id, input) : createComponent(input)
    },
    onSuccess: onSaved,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const attrs = parseAttributes(form.attributes)
    setAttributesError('error' in attrs ? attrs.error : null)
    if ('error' in attrs) return
    save.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>{existing ? `Edit ${existing.code}` : 'New component'}</h2>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>

      {isMasterAdmin && !existing && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.9rem' }}>
          <input type="checkbox" checked={toMaster} onChange={(e) => setToMaster(e.target.checked)} />
          Add to the master library, shared with every company
        </label>
      )}

      <Field label="Code" hint="your reference for it, unique in the library">
        <input value={form.code} required onChange={(e) => set('code', e.target.value)} />
      </Field>

      <Field label="Name">
        <input value={form.name} required onChange={(e) => set('name', e.target.value)} />
      </Field>

      <Field label="Category">
        <select
          value={form.category_code}
          onChange={(e) => set('category_code', e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="row">
        <div style={{ flex: 1 }}>
          <Field label="Make" hint="manufacturer">
            <input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Part number">
            <input value={form.part_number} onChange={(e) => set('part_number', e.target.value)} />
          </Field>
        </div>
        <div style={{ width: '7rem' }}>
          <Field label="Unit">
            <input value={form.unit} onChange={(e) => set('unit', e.target.value)} />
          </Field>
        </div>
      </div>

      <PricingFields
        values={form}
        unit={form.unit}
        currencyLabel={company?.currency_label ?? 'KES'}
        materialRates={materialRates}
        currencyFactors={currencyFactors}
        onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
      />

      {form.category_code === 'enclosure_parts' && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.9rem' }}>
          <input
            type="checkbox"
            checked={form.is_enclosure_cubicle}
            onChange={(e) => set('is_enclosure_cubicle', e.target.checked)}
          />
          This is an enclosure cubicle: the company&rsquo;s enclosure uplift is added when it is costed
        </label>
      )}

      <ComponentExtraFields
        values={form}
        status={existing?.status ?? null}
        attributesError={attributesError}
        onChange={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
      />

      <Field label="Description" hint="optional">
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      {save.error && <p className="error">{String(save.error)}</p>}

      <div className="row end">
        <button type="submit" className="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : existing ? 'Save changes' : 'Add component'}
        </button>
      </div>
    </form>
  )
}
