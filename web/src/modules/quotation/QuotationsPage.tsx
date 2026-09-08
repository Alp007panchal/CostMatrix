import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { longDate } from '../../lib/format'
import type { Quotation, QuotationStatus } from '../../lib/database.types'
import { listQuotations, pdfDownloadUrl, setQuotationStatus } from './api'
import { createFollowup } from '../crm/api'

const STATUS: Record<QuotationStatus, string> = {
  released: 'Released', sent: 'Sent', won: 'Won', lost: 'Lost',
}

/** Every quotation the company has released, newest first, with its fate. */
export function QuotationsPage() {
  const { company, hasRole } = useSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const [losing, setLosing] = useState<Quotation | null>(null)
  const [reason, setReason] = useState('')
  const [chasing, setChasing] = useState<Quotation | null>(null)
  const [dueOn, setDueOn] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const followup = useMutation({
    mutationFn: () => createFollowup(company?.id ?? '', chasing?.id ?? '', dueOn, note.trim() || null, null),
    onSuccess: () => { setChasing(null); setNote(''); void queryClient.invalidateQueries({ queryKey: ['followups'] }) },
  })

  const canChange = hasRole('costing_engineer') || hasRole('approver')
  const change = useMutation({
    mutationFn: (input: { id: string; status: QuotationStatus; reason: string | null }) =>
      setQuotationStatus(input.id, input.status, input.reason),
    onSuccess: () => {
      setLosing(null); setReason('')
      void queryClient.invalidateQueries({ queryKey: ['quotations'] })
    },
  })

  return (
    <>
      <h1>Quotations</h1>
      <p className="muted">
        Each one is the PDF exactly as it was released. Mark it sent when it goes out, then won or
        lost when you hear back — a lost quotation needs a reason, which is what the sales
        pipeline is built on later.
      </p>

      {change.error && <p className="error">{String(change.error)}</p>}

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

      {losing && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Why was {losing.reference_no} lost?</h2>
          <textarea autoFocus value={reason} placeholder="e.g. Price too high against a local fabricator" onChange={(e) => setReason(e.target.value)} />
          <div className="row end" style={{ marginTop: '.5rem' }}>
            <button onClick={() => setLosing(null)}>Cancel</button>
            <button className="primary" disabled={!reason.trim() || change.isPending} onClick={() => change.mutate({ id: losing.id, status: 'lost', reason: reason.trim() })}>
              Mark lost
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <Async query={quotations} empty="No quotations released yet. Approve a costing, then release one from it.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Customer</th>
                    <th>Subject</th>
                    <th>Released</th>
                    <th>Status</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id}>
                      <td>
                        <button onClick={() => navigate(`/costings/${q.costing_id}`)} style={{ padding: '.1rem .4rem' }}>{q.reference_no}</button>
                      </td>
                      <td>{q.customer_name}</td>
                      <td className="muted">{q.subject}</td>
                      <td className="muted">{longDate(q.released_at)}</td>
                      <td>
                        <span className="badge">{STATUS[q.status]}</span>
                        {q.status === 'lost' && q.lost_reason && <div className="muted" style={{ fontSize: '.75rem' }}>{q.lost_reason}</div>}
                      </td>
                      <td className="right">
                        <button onClick={() => pdfDownloadUrl(q.pdf_path).then((url) => window.open(url, '_blank')).catch((e: unknown) => alert(String(e)))}>PDF</button>{' '}
                        {canChange && q.status === 'released' && (
                          <button onClick={() => change.mutate({ id: q.id, status: 'sent', reason: null })}>Mark sent</button>
                        )}{' '}
                        {canChange && q.status === 'sent' && (
                          <button onClick={() => setChasing(q)}>Follow up</button>
                        )}{' '}
                        {canChange && (q.status === 'released' || q.status === 'sent') && (
                          <>
                            <button className="ok" onClick={() => change.mutate({ id: q.id, status: 'won', reason: null })}>Won</button>{' '}
                            <button className="danger" onClick={() => { setLosing(q); setReason('') }}>Lost</button>
                          </>
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
