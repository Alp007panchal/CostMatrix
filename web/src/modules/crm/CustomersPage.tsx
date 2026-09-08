import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { createCustomer, listCustomers, type CustomerInput } from './api'
import { CustomerDetail } from './CustomerDetail'

/** Customers, typed once and chosen from a list everywhere else. */
export function CustomersPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { company, hasRole } = useSession()
  const queryClient = useQueryClient()
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const canEdit = hasRole('costing_engineer') || hasRole('approver')

  if (!company) return null
  if (id) {
    const c = customers.data?.find((x) => x.id === id)
    if (customers.isPending) return <p className="empty">Loading…</p>
    if (!c) return <div className="card"><p>No such customer.</p><button onClick={() => navigate('/crm/customers')}>Back</button></div>
    return <CustomerDetail customer={c} canEdit={canEdit} onBack={() => { void queryClient.invalidateQueries({ queryKey: ['customers'] }); navigate('/crm/customers') }} />
  }

  const needle = search.trim().toLowerCase()
  const rows = (customers.data ?? []).filter((c) => c.is_active && (!needle || c.name.toLowerCase().includes(needle) || (c.city ?? '').toLowerCase().includes(needle)))

  return (
    <>
      <div className="spread">
        <h1>Customers</h1>
        {canEdit && <button className="primary" onClick={() => setAdding(true)}>Add customer</button>}
      </div>
      <p className="muted">Enter a customer once here; enquiries and quotations then pick it from a list.</p>

      {adding && (
        <NewCustomerForm
          companyId={company.id}
          onClose={() => setAdding(false)}
          onCreated={(newId) => { setAdding(false); void queryClient.invalidateQueries({ queryKey: ['customers'] }); navigate(`/crm/customers/${newId}`) }}
        />
      )}

      <div className="card">
        <input placeholder="Search by name or city" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: '.75rem' }} />
        <div className="table-wrap">
          <Async query={customers} empty="No customers yet. Add the first one.">
            {() => rows.length === 0 ? <p className="empty">Nothing matches.</p> : (
              <table>
                <thead><tr><th>Name</th><th>City</th><th>Tax PIN</th><th></th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/crm/customers/${c.id}`)}>
                      <td>{c.name}</td><td className="muted">{c.city}</td><td className="muted">{c.tax_pin}</td>
                      <td className="right"><button>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>
    </>
  )
}

function NewCustomerForm({ companyId, onClose, onCreated }: { companyId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState<CustomerInput>({ name: '', address: '', city: '', country: 'Kenya', tax_pin: '', notes: '' })
  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const create = useMutation({
    mutationFn: () => createCustomer(companyId, {
      name: form.name.trim(), address: form.address?.trim() || null, city: form.city?.trim() || null,
      country: form.country?.trim() || null, tax_pin: form.tax_pin?.trim() || null, notes: form.notes?.trim() || null,
    }),
    onSuccess: (c) => onCreated(c.id),
  })
  function submit(e: FormEvent) { e.preventDefault(); create.mutate() }
  return (
    <form className="card" onSubmit={submit}>
      <div className="spread"><h2 style={{ marginTop: 0 }}>New customer</h2><button type="button" onClick={onClose}>Cancel</button></div>
      <Field label="Company name"><input value={form.name} required autoFocus onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Address"><textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
      <div className="row">
        <div style={{ flex: 1 }}><Field label="City"><input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Country"><input value={form.country ?? ''} onChange={(e) => set('country', e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Tax PIN"><input value={form.tax_pin ?? ''} onChange={(e) => set('tax_pin', e.target.value)} /></Field></div>
      </div>
      <Field label="Notes" hint="optional"><textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end"><button type="submit" className="primary" disabled={create.isPending}>{create.isPending ? 'Saving…' : 'Create and open'}</button></div>
    </form>
  )
}
