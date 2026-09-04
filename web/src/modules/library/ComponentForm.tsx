import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Field } from '../../ui/Async'
import { money } from '../../lib/format'
import type {
  ComponentCategory,
  ComponentPrice,
  EffectiveMaterialRate,
  PricingMode,
} from '../../lib/database.types'
import { createComponent, updateComponent, type ComponentInput } from './api'

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
  onClose,
  onSaved,
}: {
  existing: ComponentPrice | null
  categories: ComponentCategory[]
  materialRates: EffectiveMaterialRate[]
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
    unit_price: existing?.raw_price != null ? String(existing.raw_price) : '',
    weight_per_unit: existing?.weight_per_unit != null ? String(existing.weight_per_unit) : '',
    material_rate_code: existing?.material_rate_code ?? materialRates[0]?.code ?? 'copper_busbar',
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
        unit_price: form.pricing_mode === 'fixed' ? Number(form.unit_price) : null,
        weight_per_unit: form.pricing_mode === 'weight_rate' ? Number(form.weight_per_unit) : null,
        material_rate_code: form.pricing_mode === 'weight_rate' ? form.material_rate_code : null,
      }
      return existing ? updateComponent(existing.id, input) : createComponent(input)
    },
    onSuccess: onSaved,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  const chosenRate = materialRates.find((r) => r.code === form.material_rate_code)
  const weight = Number(form.weight_per_unit)
  const preview =
    form.pricing_mode === 'weight_rate' && chosenRate && weight > 0
      ? money(weight * chosenRate.rate, company?.currency_label)
      : null

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

      <Field label="How it is priced">
        <select
          value={form.pricing_mode}
          onChange={(e) => set('pricing_mode', e.target.value as PricingMode)}
        >
          <option value="fixed">A price per {form.unit || 'unit'}</option>
          <option value="weight_rate">By weight, at a rate per kilogram</option>
        </select>
      </Field>

      {form.pricing_mode === 'fixed' ? (
        <Field
          label={`Price per ${form.unit || 'unit'}`}
          hint={toMaster ? 'in KES, before any company discount' : `in ${company?.currency_label}`}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.unit_price}
            required
            onChange={(e) => set('unit_price', e.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field label={`Kilograms per ${form.unit || 'unit'}`} hint="e.g. 2.8 for 30 x 10 mm bar">
            <input
              type="number"
              step="0.001"
              min="0"
              value={form.weight_per_unit}
              required
              onChange={(e) => set('weight_per_unit', e.target.value)}
            />
          </Field>
          <Field label="Priced at" hint="change the rate itself on the Rates screen">
            <select
              value={form.material_rate_code}
              onChange={(e) => set('material_rate_code', e.target.value)}
            >
              {materialRates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} — {money(r.rate, company?.currency_label)} per {r.unit}
                </option>
              ))}
            </select>
          </Field>
          {preview && (
            <p className="muted">
              At today&rsquo;s rate that is <strong>{preview}</strong> per {form.unit || 'unit'}.
            </p>
          )}
        </>
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
