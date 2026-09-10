import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { CompanyFilterSelect, useCompanyFilter } from '../../ui/CompanyFilter'
import { longDate } from '../../lib/format'
import type { Enquiry, QuotationRow, QuotationStatus } from '../../lib/database.types'
import { listQuotations, pdfDownloadUrl, setQuotationStatus } from './api'
import { groupQuotations } from './quotation-groups'
import { QuotationFamily } from './QuotationFamily'
import { createFollowup, listCustomers, listEnquiries } from '../crm/api'
import { DecideEnquiry } from '../crm/DecideEnquiry'

export const STATUS: Record<QuotationStatus, string> = {
  released: 'Released', sent: 'Sent', won: 'Won', lost: 'Lost', superseded: 'Superseded',
}

/**
 * Every quotation the company has released, grouped as jobs: one enquiry, its
 * offers, and the revisions of each behind the newest. Won and lost are decided
 * on the enquiry, once, naming the quotation that won it.
 */
export function QuotationsPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const enquiries = useQuery({ queryKey: ['enquiries'], queryFn: listEnquiries })
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const [deciding, setDeciding] = useState<Enquiry | null>(null)
  const [chasing, setChasing] = useState<QuotationRow | null>(null)
  const [dueOn, setDueOn] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  const followup = useMutation({
    mutationFn: () => createFollowup(company?.id ?? '', chasing?.id ?? '', dueOn, note.trim() || null, null),
    onSuccess: () => { setChasing(null); setNote(''); void queryClient.invalidateQueries({ queryKey: ['followups'] }) },
  })
  const change = useMutation({
    mutationFn: (input: { id: string; status: QuotationStatus; reason: string | null }) =>
      setQuotationStatus(input.id, input.status, input.reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['quotations'] }),
  })
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['quotations'] })
    void queryClient.invalidateQueries({ queryKey: ['enquiries'] })
  }

  const canChange = hasRole('costing_engineer') || hasRole('approver')
  const byCompany = useCompanyFilter()
  const enquiryById = (id: string | null) => enquiries.data?.find((e) => e.id === id)
  const customerName = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? ''
  const openPdf = (path: string) =>
    pdfDownloadUrl(path).then((url) => window.open(url, '_blank')).catch((e: unknown) => alert(String(e)))

  return (
    <>
      <h1>Quotations</h1>
      <p className="muted">
        One job, one line: the offers made against an enquiry, with the revisions of each behind
        the newest. Mark a quotation sent when it goes out; when you hear back, decide the whole
        enquiry — the quotation that won it is named, and the others are marked superseded rather
        than lost, because they were never turned down.
      </p>

      {change.error && <p className="error">{String(change.error)}</p>}

      {deciding && (
        <DecideEnquiry
          enquiry={deciding}
          quotations={(quotations.data ?? []).filter((q) => q.costing?.enquiry_id === deciding.id)}
          onClose={() => setDeciding(null)}
          onDone={() => { setDeciding(null); refreshAll() }}
        />
      )}

      {chasing && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Follow up {chasing.reference_no}</h2>
          <div className="row">
            <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} style={{ width: 'auto' }} />
            <input placeholder="What to do, e.g. call about delivery date" value={note} style={{ flex: 1 }} onChange={(e) => setNote(e.target.value)} />
            <button className="primary" disabled={followup.isPending} onClick={() => followup.mutate()}>Add reminder</button>
            <button onClick={() => setChasing(null)}>Cancel</button>
          </div>
          {followup.error && <p className="error">{String(followup.error)}</p>}
        </div>
      )}

      {byCompany.multi && <div className="row end"><CompanyFilterSelect filter={byCompany} /></div>}

      <Async query={quotations} empty="No quotations released yet. Approve a costing, then release one from it.">
        {(all) => (
          <>
            {groupQuotations(all.filter((q) => byCompany.keep(q.company_id))).map((group) => {
              const enquiry = enquiryById(group.enquiryId)
              const decided = enquiry ? ['won', 'lost'].includes(enquiry.status) : false
              return (
                <div className="card" key={group.enquiryId ?? group.families[0]?.key}>
                  <div className="spread" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                        {enquiry ? `${enquiry.enquiry_no} — ${enquiry.title}` : 'Not against an enquiry'}
                      </h2>
                      <div className="muted" style={{ fontSize: '.8125rem' }}>
                        {enquiry ? customerName(enquiry.customer_id) : group.families[0]?.latest.customer_name}
                        {byCompany.multi && ` · ${byCompany.companyName(group.families[0]?.latest.company_id ?? '')}`}
                        {' · '}{group.families.length} offer{group.families.length === 1 ? '' : 's'}
                        {' · newest '}{longDate(group.releasedAt)}
                      </div>
                      {enquiry?.status === 'lost' && enquiry.lost_reason && (
                        <div className="muted" style={{ fontSize: '.8125rem' }}>Lost: {enquiry.lost_reason}</div>
                      )}
                    </div>
                    <div className="row end">
                      {enquiry && <span className="badge">{enquiry.status}</span>}
                      {enquiry && canChange && !decided && (
                        <button className="primary" onClick={() => setDeciding(enquiry)}>Won or lost?</button>
                      )}
                    </div>
                  </div>

                  <div className="table-wrap" style={{ marginTop: '.5rem' }}>
                    <table>
                      <tbody>
                        {group.families.map((family) => (
                          <QuotationFamily
                            key={family.key}
                            family={family}
                            canChange={canChange}
                            decidedOnEnquiry={Boolean(enquiry)}
                            onOpenCosting={(id) => navigate(`/costings/${id}`)}
                            onPdf={openPdf}
                            onSent={(id) => change.mutate({ id, status: 'sent', reason: null })}
                            onChase={setChasing}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </Async>
    </>
  )
}
