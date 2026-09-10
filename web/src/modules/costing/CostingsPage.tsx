import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async, Field } from '../../ui/Async'
import { CompanyFilterSelect, useCompanyFilter } from '../../ui/CompanyFilter'
import { longDate, money } from '../../lib/format'
import type { Costing, CostingStatus, CostingTotals } from '../../lib/database.types'
import { createCosting, listCostings } from './api'
import { CopyCostingForm } from './CopyCosting'
import { listEnquiries } from '../crm/api'

const STATUS_LABEL: Record<CostingStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
}

/** Every costing in the company, newest first. */
export function CostingsPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const costings = useQuery({ queryKey: ['costings'], queryFn: listCostings })
  const enquiries = useQuery({ queryKey: ['enquiries'], queryFn: listEnquiries })
  const [params] = useSearchParams()
  const enquiryFilter = params.get('enquiry')

  const [creating, setCreating] = useState(false)
  const [copying, setCopying] = useState<Costing | null>(null)
  const [showOld, setShowOld] = useState(false)
  const canCreate = hasRole('costing_engineer') || hasRole('approver')
  const byCompany = useCompanyFilter()

  if (!company) return null

  const rows = (costings.data ?? []).filter((c) => (showOld || c.is_current) && (!enquiryFilter || c.enquiry_id === enquiryFilter) && byCompany.keep(c.company_id))
  const enquiryNo = (id: string | null) => enquiries.data?.find((e) => e.id === id)?.enquiry_no

  return (
    <>
      <div className="spread">
        <h1>Costings</h1>
        {canCreate && (
          <button className="primary" onClick={() => setCreating(true)}>
            New costing
          </button>
        )}
      </div>

      {creating && (
        <NewCostingForm
          enquiries={(enquiries.data ?? []).filter((e) => !['won', 'lost', 'closed'].includes(e.status))}
          defaultEnquiryId={enquiryFilter}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['costings'] })
            navigate(`/costings/${id}`)
          }}
        />
      )}

      {copying && (
        <CopyCostingForm
          source={copying}
          enquiries={(enquiries.data ?? []).filter((e) => !['won', 'lost', 'closed'].includes(e.status))}
          onClose={() => setCopying(null)}
          onOpen={(id) => {
            void queryClient.invalidateQueries({ queryKey: ['costings'] })
            setCopying(null)
            navigate(`/costings/${id}`)
          }}
        />
      )}

      <div className="card">
        <div className="row end" style={{ marginBottom: '.5rem' }}>
          <CompanyFilterSelect filter={byCompany} />
          <label className="row" style={{ gap: '.35rem' }}>
            <input type="checkbox" checked={showOld} onChange={(e) => setShowOld(e.target.checked)} />
            Show superseded revisions
          </label>
        </div>
        <div className="table-wrap">
          <Async query={costings} empty="No costings yet. Create the first one.">
            {() => (
              <table>
                <thead>
                  <tr>
                    {byCompany.multi && <th>Company</th>}
                    <th>Number</th>
                    <th>Title</th>
                    <th>Enquiry</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      className={c.is_current ? undefined : 'inactive'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/costings/${c.id}`)}
                    >
                      {byCompany.multi && <td className="muted">{byCompany.companyName(c.company_id)}</td>}
                      <td>
                        {c.costing_no}
                        {c.revision_no > 0 && <span className="badge">Rev {c.revision_no}</span>}
                        {!c.is_current && <span className="badge">superseded</span>}
                      </td>
                      <td>{c.title}</td>
                      <td className="muted">{enquiryNo(c.enquiry_id) ?? '—'}</td>
                      <td>
                        <span className="badge">{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td className="muted">{longDate(c.created_at)}</td>
                      <td className="right">
                        {c.totals ? money(c.totals.grand_total, c.currency_label) : '—'}
                      </td>
                      <td className="right">
                        {canCreate && (
                          <button
                            title="Start a new job from this one, priced today"
                            onClick={(e) => { e.stopPropagation(); setCopying(stripTotals(c)) }}
                          >
                            Copy
                          </button>
                        )}
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

function NewCostingForm({
  enquiries,
  defaultEnquiryId,
  onClose,
  onCreated,
}: {
  enquiries: { id: string; enquiry_no: string; title: string }[]
  defaultEnquiryId: string | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [enquiryId, setEnquiryId] = useState(defaultEnquiryId ?? '')
  const create = useMutation({
    mutationFn: () => createCosting(title.trim(), notes.trim() || null, enquiryId || null),
    onSuccess: (c) => onCreated(c.id),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>New costing</h2>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
      <p className="muted">
        Your company&rsquo;s current prices, rates, margins and VAT are copied in now and stay
        fixed for this costing, however they change later.
      </p>
      <Field label="Enquiry" hint="which request this costing answers; log one on the Enquiries screen if it is missing">
        <select value={enquiryId} onChange={(e) => { setEnquiryId(e.target.value); const en = enquiries.find((x) => x.id === e.target.value); if (en && !title) setTitle(en.title) }}>
          <option value="">No enquiry yet</option>
          {enquiries.map((en) => <option key={en.id} value={en.id}>{en.enquiry_no} — {en.title}</option>)}
        </select>
      </Field>
      <Field label="Title" hint="the job, as you would say it: e.g. MCC for Triclover">
        <input value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Notes" hint="optional">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {create.error && <p className="error">{String(create.error)}</p>}
      <div className="row end">
        <button type="submit" className="primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create costing'}
        </button>
      </div>
    </form>
  )
}

/** The list carries each costing's totals alongside it; the copy form wants the costing itself. */
function stripTotals(row: Costing & { totals: CostingTotals | null }): Costing {
  const { totals: _totals, ...costing } = row
  return costing
}
