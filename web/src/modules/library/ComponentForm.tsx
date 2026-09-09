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
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: async () => {
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
        purchase_price: form.pricing_mode === 'fixed' ? Number(form.purchase_price) : null,
        purchase_currency: form.pricing_mode === 'fixed' ? form.purchase_currency : 'KES',
        weight_per_unit: form.pricing_mode === 'weight_rate' ? Number(form.weight_per_unit) : null,
        material_rate_code: form.pricing_mode === 'weight_rate' ? form.material_rate_code : null,
        is_enclosure_cubicle: form.category_code === 'enclosure_parts' && form.is_enclosure_cubicle,
        // A placeholder stops being one the moment it gets a price.
        is_placeholder: form.pricing_mode === 'fixed' && form.purchase_price === '',
      }
      return existing ? updateComponent(existing.id, input) : createComponent(input)
    },
    onSuccess: onSaved,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
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
