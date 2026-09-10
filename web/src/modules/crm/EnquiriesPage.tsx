import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { CompanyFilterSelect, useCompanyFilter } from '../../ui/CompanyFilter'
import type { Enquiry, EnquiryStatus } from '../../lib/database.types'
import { createEnquiry, listContacts, listCustomers, listEnquiries, listProjects, updateEnquiry } from './api'
import { DecideEnquiry } from './DecideEnquiry'
import { listQuotations } from '../quotation/api'

// Won and lost are not in this list: they are decided once, on the enquiry,
// naming the quotation that won it (the Won or lost? button).
const STATUSES: EnquiryStatus[] = ['open', 'quoted', 'closed']

/** The enquiry log. Every costing hangs off one of these. */
export function EnquiriesPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const enquiries = useQuery({ queryKey: ['enquiries'], queryFn: listEnquiries })
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const [adding, setAdding] = useState(false)
  const [deciding, setDeciding] = useState<Enquiry | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const canEdit = hasRole('costing_engineer') || hasRole('approver')
  const byCompany = useCompanyFilter()

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: EnquiryStatus }) => updateEnquiry(input.id, { status: input.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enquiries'] }),
  })

  if (!company) return null
  const customerName = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? '…'
  const rows = (enquiries.data ?? []).filter((e) => (showClosed || !['won', 'lost', 'closed'].includes(e.status)) && byCompany.keep(e.company_id))

  return (
    <>
      <div className="spread">
        <h1>Enquiries</h1>
        {canEdit && <button className="primary" onClick={() => setAdding(true)} disabled={(customers.data ?? []).length === 0}>Log enquiry</button>}
      </div>
      <p className="muted">
        Log each request as it comes in. Costings are created against an enquiry, and sending a
        quotation marks the enquiry quoted. When you hear back, <strong>Won or lost?</strong>
        decides the whole enquiry at once: winning it names the quotation that won, and the other
        offers are marked superseded rather than lost.
        {(customers.data ?? []).length === 0 && ' Add a customer first.'}
      </p>

      {adding && <NewEnquiryForm onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void queryClient.invalidateQueries({ queryKey: ['enquiries'] }) }} />}
      {deciding && (
        <DecideEnquiry
          enquiry={deciding}
          quotations={(quotations.data ?? []).filter((q) => q.costing?.enquiry_id === deciding.id)}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null)
            void queryClient.invalidateQueries({ queryKey: ['enquiries'] })
            void queryClient.invalidateQueries({ queryKey: ['quotations'] })
          }}
        />
      )}
      {setStatus.error && <p className="error">{String(setStatus.error)}</p>}

      <div className="card">
        <div className="row end" style={{ marginBottom: '.5rem' }}>
          <CompanyFilterSelect filter={byCompany} />
          <label className="row" style={{ gap: '.35rem' }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />Show won, lost and closed</label>
        </div>
        <div className="table-wrap">
          <Async query={enquiries} empty="No enquiries yet.">
            {() => rows.length === 0 ? <p className="empty">Nothing open.</p> : (
              <table>
                <thead><tr>{byCompany.multi && <th>Company</th>}<th>Number</th><th>Customer</th><th>Title</th><th>Received</th><th>Status</th><th className="right"></th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      {byCompany.multi && <td className="muted">{byCompany.companyName(e.company_id)}</td>}
                      <td><button style={{ padding: '.1rem .4rem' }} onClick={() => navigate(`/crm/enquiries/${e.id}`)}>{e.enquiry_no}</button></td>
                      <td><button style={{ padding: '.1rem .4rem' }} onClick={() => navigate(`/crm/customers/${e.customer_id}`)}>{customerName(e.customer_id)}</button></td>
                      <td>{e.title}{e.description && <div className="muted" style={{ fontSize: '.8125rem' }}>{e.description}</div>}</td>
                      <td className="muted">{e.received_on}</td>
                      <td>
                        {canEdit && !['won', 'lost'].includes(e.status) ? (
                          <select value={e.status} onChange={(ev) => setStatus.mutate({ id: e.id, status: ev.target.value as EnquiryStatus })} style={{ width: 'auto' }}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : <span className="badge">{e.status}</span>}
                        {e.status === 'lost' && e.lost_reason && (
                          <div className="muted" style={{ fontSize: '.75rem' }}>{e.lost_reason}</div>
                        )}
                      </td>
                      <td className="right">
                        {canEdit && !['won', 'lost'].includes(e.status) && (
                          <><button className="primary" onClick={() => setDeciding(e)}>Won or lost?</button>{' '}</>
                        )}
                        <button onClick={() => navigate(`/costings?enquiry=${e.id}`)}>Costings</button>
                      </td>
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
