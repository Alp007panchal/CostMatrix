import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Field } from '../../ui/Async'
import { marginToMarkup, percent } from '../../lib/format'
import type { Company } from '../../lib/database.types'
import { getCompany, updateCompany } from './api'

/**
 * A company's own settings: currency, margins, VAT, rounding and quotation
 * numbering. The discount is shown but not editable — it belongs to the master
 * admin, and a database trigger refuses it from anyone else.
 */
export function CompanyPage() {
  const { company: signedInCompany, refresh: refreshSession } = useSession()
  const queryClient = useQueryClient()
  const companyId = signedInCompany?.id

  const query = useQuery({
    queryKey: ['company', companyId],
    queryFn: () => getCompany(companyId as string),
    enabled: Boolean(companyId),
  })

  const [form, setForm] = useState<Company | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (query.data) setForm(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: async (values: Company) =>
      updateCompany(values.id, {
        name: values.name,
        currency_code: values.currency_code.toUpperCase(),
        currency_label: values.currency_label,
        exchange_rate: values.exchange_rate,
        material_margin_pct: values.material_margin_pct,
        labour_margin_pct: values.labour_margin_pct,
        tax_pct: values.tax_pct,
        price_rounding_step: values.price_rounding_step,
        quotation_prefix: values.quotation_prefix.toUpperCase(),
        quotation_no_includes_year: values.quotation_no_includes_year,
        address: values.address,
        tax_pin: values.tax_pin,
      }),
    onSuccess: async () => {
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['company', companyId] })
      await refreshSession()
    },
  })

  if (query.isPending) return <p className="empty">Loading…</p>
  if (query.error) return <p className="error">{String(query.error)}</p>
  if (!form) return <p className="empty">No company to show.</p>

  const set = <K extends keyof Company>(key: K, value: Company[K]) => {
    setSaved(false)
    setForm({ ...form, [key]: value })
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (form) save.mutate(form)
  }

  const sameMargin = form.material_margin_pct === form.labour_margin_pct

  return (
    <form onSubmit={submit}>
      <h1>{form.name}</h1>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Identity</h2>
        <Field label="Company name">
          <input value={form.name} required onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Address">
          <textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Tax PIN">
          <input value={form.tax_pin ?? ''} onChange={(e) => set('tax_pin', e.target.value)} />
        </Field>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Currency</h2>
        <Field label="Currency code" hint="three letters, e.g. KES or USD">
          <input
            value={form.currency_code}
            maxLength={3}
            required
            onChange={(e) => set('currency_code', e.target.value)}
          />
        </Field>
        <Field label="Printed as" hint="the word on your quotations, e.g. KSH">
          <input
            value={form.currency_label}
            required
            onChange={(e) => set('currency_label', e.target.value)}
          />
        </Field>
        <Field
          label="Exchange rate"
          hint={`KES per 1 ${form.currency_code || 'unit'} — leave at 1 for a KES company`}
        >
          <input
            type="number"
            step="0.000001"
            min="0.000001"
            value={form.exchange_rate}
            required
            onChange={(e) => set('exchange_rate', Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Margins and tax</h2>
        <p className="muted">
          Margins are a share of the selling price, as in your spreadsheets: a 20% margin on a cost
          of 100 sells at 125.
        </p>

        <Field
          label="Material margin %"
          hint={`a ${percent(marginToMarkup(form.material_margin_pct))} markup on cost`}
        >
          <input
            type="number"
            step="0.001"
            min="0"
            max="99.999"
            value={form.material_margin_pct}
            required
            onChange={(e) => {
              const value = Number(e.target.value)
              setSaved(false)
              setForm({
                ...form,
                material_margin_pct: value,
                // The "same for both" convenience: while the two match, they
                // keep matching. Change the labour one to break the link.
                labour_margin_pct: sameMargin ? value : form.labour_margin_pct,
              })
            }}
          />
        </Field>

        <Field
          label="Labour margin %"
          hint={`a ${percent(marginToMarkup(form.labour_margin_pct))} markup on cost`}
        >
          <input
            type="number"
            step="0.001"
            min="0"
            max="99.999"
            value={form.labour_margin_pct}
            required
            onChange={(e) => set('labour_margin_pct', Number(e.target.value))}
          />
        </Field>

        <Field label="VAT %">
          <input
            type="number"
            step="0.001"
            min="0"
            max="99.999"
            value={form.tax_pct}
            required
            onChange={(e) => set('tax_pct', Number(e.target.value))}
          />
        </Field>

        <Field label="Round panel prices up to" hint={`in ${form.currency_label}`}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.price_rounding_step}
            required
            onChange={(e) => set('price_rounding_step', Number(e.target.value))}
          />
        </Field>

        <Field label="Discount on master prices" hint="set by the master administrator">
          <input value={percent(form.discount_pct)} readOnly disabled />
        </Field>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Quotation numbering</h2>
        <Field label="Prefix" hint="the letters your quotations start with">
          <input
            value={form.quotation_prefix}
            maxLength={10}
            required
            onChange={(e) => set('quotation_prefix', e.target.value)}
          />
        </Field>
        <label className="row" style={{ gap: '.4rem', marginBottom: '.9rem' }}>
          <input
            type="checkbox"
            checked={form.quotation_no_includes_year}
            onChange={(e) => set('quotation_no_includes_year', e.target.checked)}
          />
          Include the year
        </label>
        <p className="muted">
          Next quotation looks like{' '}
          <strong>
            {form.quotation_prefix.toUpperCase() || 'QT'}
            {form.quotation_no_includes_year ? `-${new Date().getFullYear()}` : ''}-0001-REV0
          </strong>
        </p>
      </div>

      {save.error && <p className="error">{String(save.error)}</p>}
      {saved && <p className="ok">Saved.</p>}

      <div className="row end">
        <button type="submit" className="primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
