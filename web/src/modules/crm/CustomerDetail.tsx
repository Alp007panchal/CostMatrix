import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import type { Customer } from '../../lib/database.types'
import { createContact, createProject, listContacts, listEnquiries, listProjects, updateContact, updateCustomer } from './api'

/** One customer: its details, its people, its projects, its enquiries. */
export function CustomerDetail({ customer, canEdit, onBack }: { customer: Customer; canEdit: boolean; onBack: () => void }) {
  const { company } = useSession()
  const queryClient = useQueryClient()
  const contacts = useQuery({ queryKey: ['contacts', customer.id], queryFn: () => listContacts(customer.id) })
  const projects = useQuery({ queryKey: ['projects', customer.id], queryFn: () => listProjects(customer.id) })
  const enquiries = useQuery({ queryKey: ['enquiries'], queryFn: listEnquiries })
  const refresh = (key: string) => queryClient.invalidateQueries({ queryKey: [key, customer.id] })

  const retire = useMutation({ mutationFn: () => updateCustomer(customer.id, { is_active: false }), onSuccess: onBack })
  const togglePrimary = useMutation({
    mutationFn: (input: { id: string; is_primary: boolean }) => updateContact(input.id, { is_primary: input.is_primary }),
    onSuccess: () => refresh('contacts'),
  })

  if (!company) return null
  const mine = (enquiries.data ?? []).filter((e) => e.customer_id === customer.id)

  return (
    <>
      <button onClick={onBack}>← All customers</button>
      <div className="spread" style={{ marginTop: '.75rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>{customer.name}</h1>
          <p className="muted">{[customer.address, customer.city, customer.country].filter(Boolean).join(', ')}{customer.tax_pin && ` · PIN ${customer.tax_pin}`}</p>
        </div>
        {canEdit && <button className="danger" onClick={() => { if (confirm('Retire this customer? It stays on old quotations but leaves the lists.')) retire.mutate() }}>Retire</button>}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>People</h2>
        <div className="table-wrap">
          <Async query={contacts} empty="Nobody yet.">
            {(rows) => (
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Primary</th></tr></thead>
                <tbody>
                  {rows.filter((c) => c.is_active).map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td><td className="muted">{c.job_title}</td><td>{c.email}</td><td>{c.phone}</td>
                      <td><input type="checkbox" checked={c.is_primary} disabled={!canEdit} onChange={(e) => togglePrimary.mutate({ id: c.id, is_primary: e.target.checked })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
        {canEdit && <QuickAdd label="Add a person" fields={['Name', 'Job title', 'Email', 'Phone']} onAdd={async ([name, job_title, email, phone]) => { await createContact(company.id, customer.id, { name: name ?? '', job_title: job_title || null, email: email || null, phone: phone || null, is_primary: (contacts.data ?? []).length === 0 }); await refresh('contacts') }} />}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Projects</h2>
        <div className="table-wrap">
          <Async query={projects} empty="No projects yet.">
            {(rows) => (
              <table>
                <thead><tr><th>Project</th><th>Site</th></tr></thead>
                <tbody>{rows.filter((p) => p.is_active).map((p) => <tr key={p.id}><td>{p.name}</td><td className="muted">{p.site_location}</td></tr>)}</tbody>
              </table>
            )}
          </Async>
        </div>
        {canEdit && <QuickAdd label="Add a project" fields={['Project name', 'Site location']} onAdd={async ([name, site]) => { await createProject(company.id, customer.id, { name: name ?? '', site_location: site || null, notes: null }); await refresh('projects') }} />}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Enquiries</h2>
        {mine.length === 0 ? <p className="muted">None logged. Log one on the Enquiries screen.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Number</th><th>Title</th><th>Received</th><th>Status</th></tr></thead>
              <tbody>{mine.map((e) => <tr key={e.id}><td>{e.enquiry_no}</td><td>{e.title}</td><td className="muted">{e.received_on}</td><td><span className="badge">{e.status}</span></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/** A one-line add form: N text fields and a button. Keeps the detail screen short. */
function QuickAdd({ label, fields, onAdd }: { label: string; fields: string[]; onAdd: (values: string[]) => Promise<void> }) {
  const [values, setValues] = useState<string[]>(fields.map(() => ''))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    onAdd(values.map((v) => v.trim())).then(() => setValues(fields.map(() => ''))).catch((err: unknown) => setError(String(err))).finally(() => setBusy(false))
  }
  return (
    <form className="row" style={{ marginTop: '.75rem' }} onSubmit={submit}>
      {fields.map((f, i) => (
        <input key={f} placeholder={f} value={values[i] ?? ''} required={i === 0} style={{ flex: 1, minWidth: '8rem' }} onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      <button type="submit" className="primary" disabled={busy}>{label}</button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}
