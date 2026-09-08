import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import type { EnquiryStatus } from '../../lib/database.types'
import { createEnquiry, listContacts, listCustomers, listEnquiries, listProjects, updateEnquiry } from './api'

const STATUSES: EnquiryStatus[] = ['open', 'quoted', 'won', 'lost', 'closed']

/** The enquiry log. Every costing hangs off one of these. */
export function EnquiriesPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const enquiries = useQuery({ queryKey: ['enquiries'], queryFn: listEnquiries })
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const [adding, setAdding] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const canEdit = hasRole('costing_engineer') || hasRole('approver')

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: EnquiryStatus }) => updateEnquiry(input.id, { status: input.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enquiries'] }),
  })

  if (!company) return null
  const customerName = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? '…'
  const rows = (enquiries.data ?? []).filter((e) => showClosed || !['won', 'lost', 'closed'].includes(e.status))

  return (
    <>
      <div className="spread">
        <h1>Enquiries</h1>
        {canEdit && <button className="primary" onClick={() => setAdding(true)} disabled={(customers.data ?? []).length === 0}>Log enquiry</button>}
      </div>
      <p className="muted">
        Log each request as it comes in. Costings are created against an enquiry, and when the
        quotation is sent, won or lost, the enquiry follows on its own.
        {(customers.data ?? []).length === 0 && ' Add a customer first.'}
      </p>

      {adding && <NewEnquiryForm onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void queryClient.invalidateQueries({ queryKey: ['enquiries'] }) }} />}
      {setStatus.error && <p className="error">{String(setStatus.error)}</p>}

      <div className="card">
        <div className="row end" style={{ marginBottom: '.5rem' }}>
          <label className="row" style={{ gap: '.35rem' }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show won, lost and closed</label>
        </div>
        <div className="table-wrap">
          <Async query={enquiries} empty="No enquiries yet.">
            {() => rows.length === 0 ? <p className="empty">Nothing open.</p> : (
              <table>
                <thead><tr><th>Number</th><th>Customer</th><th>Title</th><th>Received</th><th>Status</th><th className="right"></th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td>{e.enquiry_no}</td>
                      <td><button style={{ padding: '.1rem .4rem' }} onClick={() => navigate(`/crm/customers/${e.customer_id}`)}>{customerName(e.customer_id)}</button></td>
                      <td>{e.title}{e.description && <div className="muted" style={{ fontSize: '.8125rem' }}>{e.description}</div>}</td>
                      <td className="muted">{e.received_on}</td>
                      <td>
                        {canEdit ? (
                          <select value={e.status} onChange={(ev) => setStatus.mutate({ id: e.id, status: ev.target.value as EnquiryStatus })} style={{ width: 'auto' }}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : <span className="badge">{e.status}</span>}
                      </td>
                      <td className="right"><button onClick={() => navigate(`/costings?enquiry=${e.id}`)}>Costings</button></td>
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

function NewEnquiryForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const [customerId, setCustomerId] = useState('')
  const contacts = useQuery({ queryKey: ['contacts', customerId], queryFn: () => listContacts(customerId), enabled: Boolean(customerId) })
  const projects = useQuery({ queryKey: ['projects', customerId], queryFn: () => listProjects(customerId), enabled: Boolean(customerId) })
  const [contactId, setContactId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [source, setSource] = useState('')
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10))

  const create = useMutation({
    mutationFn: () => createEnquiry({
      customer_id: customerId, contact_id: contactId || null, project_id: projectId || null,
      received_on: receivedOn, title: title.trim(), description: description.trim() || null, source: source.trim() || null,
    }),
    onSuccess: onCreated,
  })
  function submit(e: FormEvent) { e.preventDefault(); create.mutate() }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread"><h2 style={{ marginTop: 0 }}>Log an enquiry</h2><button type="button" onClick={onClose}>Cancel</button></div>
      <Field label="Customer">
        <select value={customerId} required onChange={(e) => { setCustomerId(e.target.value); setContactId(''); setProjectId('') }}>
          <option value="">Choose…</option>
          {(customers.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="row">
        <div style={{ flex: 1 }}>
          <Field label="Contact" hint="optional">
            <select value={contactId} disabled={!customerId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">—</option>
              {(contacts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Project" hint="optional">
            <select value={projectId} disabled={!customerId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">—</option>
              {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label="What they asked for" hint="a short title, e.g. LV switchboards for plant expansion">
        <input value={title} required onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Details" hint="optional"><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="row">
        <div style={{ flex: 1 }}><Field label="Received on"><input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="How it came in" hint="email, phone, tender, referral…"><input value={source} onChange={(e) => setSource(e.target.value)} /></Field></div>
      </div>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end"><button type="submit" className="primary" disabled={create.isPending || !customerId}>{create.isPending ? 'Logging…' : 'Log enquiry'}</button></div>
    </form>
  )
}
