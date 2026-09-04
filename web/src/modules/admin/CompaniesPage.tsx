import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async, Field } from '../../ui/Async'
import { percent } from '../../lib/format'
import type { CompanyKind } from '../../lib/database.types'
import { createCompany, listCompanies, setCompanyDiscount } from './api'

const KINDS: { value: CompanyKind; label: string }[] = [
  { value: 'in_house', label: 'Our own company' },
  { value: 'external', label: 'Contractor or consultant' },
  { value: 'buyer', label: 'Buyer' },
]

/**
 * Master admin only: every company on the system, and the discount each one
 * gets on master prices. Changing a discount never alters an existing costing,
 * because prices are frozen when they are used.
 */
export function CompaniesPage() {
  const queryClient = useQueryClient()
  const companies = useQuery({ queryKey: ['companies'], queryFn: listCompanies })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['companies'] })

  const saveDiscount = useMutation({
    mutationFn: (input: { id: string; discount: number }) =>
      setCompanyDiscount(input.id, input.discount),
    onSuccess: refresh,
  })

  return (
    <>
      <h1>Companies</h1>
      <p className="muted">
        Every company using CostMatrix. Each one sees only its own data; you can read all of it but
        not change what belongs to them.
      </p>

      {saveDiscount.error && <p className="error">{String(saveDiscount.error)}</p>}

      <div className="card">
        <div className="table-wrap">
          <Async query={companies} empty="No companies yet.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Currency</th>
                    <th className="right">Discount</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((company) => (
                    <tr key={company.id} className={company.is_active ? undefined : 'inactive'}>
                      <td>{company.name}</td>
                      <td>{KINDS.find((k) => k.value === company.kind)?.label ?? company.kind}</td>
                      <td>
                        {company.currency_code}
                        {company.currency_code !== 'KES' && (
                          <span className="muted"> @ {company.exchange_rate}</span>
                        )}
                      </td>
                      <td className="right">
                        <DiscountCell
                          value={company.discount_pct}
                          busy={saveDiscount.isPending}
                          onSave={(discount) => saveDiscount.mutate({ id: company.id, discount })}
                        />
                      </td>
                      <td className="right">{company.is_active ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>

      <NewCompanyForm onCreated={refresh} />
    </>
  )
}

function DiscountCell({
  value,
  busy,
  onSave,
}: {
  value: number
  busy: boolean
  onSave: (discount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(String(value))
          setEditing(true)
        }}
      >
        {percent(value)}
      </button>
    )
  }

  return (
    <span className="row end" style={{ gap: '.35rem' }}>
      <input
        type="number"
        step="0.001"
        min="0"
        max="99.999"
        value={draft}
        style={{ width: '5.5rem' }}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        className="primary"
        disabled={busy}
        onClick={() => {
          onSave(Number(draft))
          setEditing(false)
        }}
      >
        Save
      </button>
      <button onClick={() => setEditing(false)}>Cancel</button>
    </span>
  )
}

function NewCompanyForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<CompanyKind>('external')
  const [currency, setCurrency] = useState('KES')
  const [label, setLabel] = useState('KSH')
  const [rate, setRate] = useState(1)
  const [discount, setDiscount] = useState(0)
  const [created, setCreated] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createCompany({
        name,
        kind,
        currency_code: currency.toUpperCase(),
        currency_label: label,
        exchange_rate: rate,
        discount_pct: discount,
      }),
    onSuccess: (company) => {
      setCreated(`${company.name} created. Invite its first administrator from the People screen.`)
      setName('')
      onCreated()
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setCreated(null)
    create.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>Add a company</h2>

      <Field label="Company name">
        <input value={name} required onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Kind">
        <select value={kind} onChange={(e) => setKind(e.target.value as CompanyKind)}>
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Currency code" hint="three letters">
        <input
          value={currency}
          maxLength={3}
          required
          onChange={(e) => setCurrency(e.target.value)}
        />
      </Field>

      <Field label="Printed as" hint="the word on their quotations">
        <input value={label} required onChange={(e) => setLabel(e.target.value)} />
      </Field>

      <Field label="Exchange rate" hint="KES per 1 unit of their currency">
        <input
          type="number"
          step="0.000001"
          min="0.000001"
          value={rate}
          required
          onChange={(e) => setRate(Number(e.target.value))}
        />
      </Field>

      <Field label="Discount %" hint="off master prices, for this company">
        <input
          type="number"
          step="0.001"
          min="0"
          max="99.999"
          value={discount}
          required
          onChange={(e) => setDiscount(Number(e.target.value))}
        />
      </Field>

      {create.error && <p className="error">{String(create.error)}</p>}
      {created && <p className="ok">{created}</p>}

      <div className="row end">
        <button type="submit" className="primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create company'}
        </button>
      </div>
    </form>
  )
}
