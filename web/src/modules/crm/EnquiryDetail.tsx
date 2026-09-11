import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { longDate, money } from '../../lib/format'
import { getEnquiry, listCustomers } from './api'
import { DocumentFiles } from '../documents/DocumentFiles'
import { listCostings } from '../costing/api'
import { listQuotations } from '../quotation/api'

/** One enquiry: what was asked for, what was costed and quoted, and the files. */
export function EnquiryDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { company, hasRole } = useSession()
  const enquiry = useQuery({ queryKey: ['enquiry', id], queryFn: () => getEnquiry(id), enabled: Boolean(id) })
  const customers = useQuery({ queryKey: ['customers'], queryFn: listCustomers })
  const costings = useQuery({ queryKey: ['costings'], queryFn: listCostings })
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const canEdit = hasRole('costing_engineer') || hasRole('approver')

  if (!company) return null

  return (
    <Async query={enquiry}>
      {(e) => {
        if (!e) return <p className="empty">No such enquiry.</p>
        const customer = customers.data?.find((c) => c.id === e.customer_id)
        const mine = (costings.data ?? []).filter((c) => c.enquiry_id === e.id)
        const quotes = (quotations.data ?? []).filter((q) => q.costing?.enquiry_id === e.id)
        return (
          <>
            <button onClick={() => navigate('/crm/enquiries')}>← All enquiries</button>
            <div className="spread" style={{ marginTop: '.75rem', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0 }}>{e.enquiry_no}</h1>
                <p style={{ margin: '.35rem 0' }}>{e.title}</p>
                <p className="muted">
                  {customer?.name ?? '…'} · received {e.received_on}
                  {e.source && ` · by ${e.source}`}
                </p>
                {e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
                {e.status === 'lost' && e.lost_reason && <p className="error">Lost: {e.lost_reason}</p>}
              </div>
              <div className="row end">
                <span className="badge">{e.status}</span>
                <button onClick={() => navigate(`/costings?enquiry=${e.id}`)}>Costings</button>
              </div>
            </div>

            <DocumentFiles entityType="enquiry" entityId={e.id} companyId={e.company_id} canEdit={canEdit} />

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Costings</h2>
              {mine.length === 0 ? (
                <p className="empty">None yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Number</th><th>Title</th><th>Status</th><th className="right">Total</th></tr></thead>
                    <tbody>
                      {mine.map((c) => (
                        <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/costings/${c.id}`)}>
                          <td>{c.costing_no}{c.revision_no > 0 && <span className="badge">Rev {c.revision_no}</span>}</td>
                          <td>{c.title}</td>
                          <td><span className="badge">{c.status}</span></td>
                          <td className="right">{c.totals ? money(c.totals.grand_total, c.currency_label) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Quotations</h2>
              {quotes.length === 0 ? (
                <p className="empty">Nothing released yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Reference</th><th>Subject</th><th>Released</th><th>Status</th></tr></thead>
                    <tbody>
                      {quotes.map((q) => (
                        <tr key={q.id}>
                          <td>
                            <button style={{ padding: '.1rem .4rem' }} onClick={() => navigate(`/costings/${q.costing_id}`)}>
                              {q.reference_no}
                            </button>
                            {e.won_quotation_id === q.id && <span className="badge">won it</span>}
                          </td>
                          <td className="muted">{q.subject}</td>
                          <td className="muted">{longDate(q.released_at)}</td>
                          <td><span className="badge">{q.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      }}
    </Async>
  )
}
