import { useState } from 'react'
import { longDate } from '../../lib/format'
import type { QuotationRow } from '../../lib/database.types'
import type { FamilyGroup } from './quotation-groups'
import { STATUS } from './QuotationsPage'

/**
 * One offer: its newest revision on a row of its own, the earlier revisions
 * folded behind it. Won and lost are not here — they belong to the enquiry —
 * unless there is no enquiry to decide, in which case this is the only place.
 */
export function QuotationFamily({
  family,
  canChange,
  decidedOnEnquiry,
  onOpenCosting,
  onPdf,
  onSent,
  onChase,
}: {
  family: FamilyGroup
  canChange: boolean
  /** True when an enquiry carries the decision, so this row does not offer it. */
  decidedOnEnquiry: boolean
  onOpenCosting: (costingId: string) => void
  onPdf: (path: string) => void
  onSent: (id: string) => void
  onChase: (quotation: QuotationRow) => void
}) {
  const [showEarlier, setShowEarlier] = useState(false)
  const q = family.latest

  return (
    <>
      <tr>
        <td>
          <button style={{ padding: '.1rem .4rem' }} onClick={() => onOpenCosting(q.costing_id)}>
            {q.reference_no}
          </button>
          {q.costing && q.costing.revision_no > 0 && <span className="badge">Rev {q.costing.revision_no}</span>}
          <div className="muted" style={{ fontSize: '.8125rem' }}>{q.subject}</div>
          {family.earlier.length > 0 && (
            <button
              style={{ padding: '.1rem .4rem', fontSize: '.75rem', marginTop: '.25rem' }}
              onClick={() => setShowEarlier((s) => !s)}
            >
              {showEarlier ? 'Hide' : `${family.earlier.length} earlier revision${family.earlier.length === 1 ? '' : 's'}`}
            </button>
          )}
        </td>
        <td className="muted">{longDate(q.released_at)}</td>
        <td>
          <span className="badge">{STATUS[q.status]}</span>
          {q.status === 'lost' && q.lost_reason && (
            <div className="muted" style={{ fontSize: '.75rem' }}>{q.lost_reason}</div>
          )}
        </td>
        <td className="right">
          <button onClick={() => onPdf(q.pdf_path)}>PDF</button>{' '}
          {canChange && q.status === 'released' && <button onClick={() => onSent(q.id)}>Mark sent</button>}{' '}
          {canChange && q.status === 'sent' && <button onClick={() => onChase(q)}>Follow up</button>}
          {!decidedOnEnquiry && (q.status === 'released' || q.status === 'sent') && (
            <div className="muted" style={{ fontSize: '.75rem' }}>
              Link its costing to an enquiry to record won or lost.
            </div>
          )}
        </td>
      </tr>
      {showEarlier &&
        family.earlier.map((old) => (
          <tr key={old.id} className="inactive">
            <td style={{ paddingLeft: '2rem' }}>
              <button style={{ padding: '.1rem .4rem' }} onClick={() => onOpenCosting(old.costing_id)}>
                {old.reference_no}
              </button>
              {old.costing && <span className="badge">Rev {old.costing.revision_no}</span>}
            </td>
            <td className="muted">{longDate(old.released_at)}</td>
            <td><span className="badge">{STATUS[old.status]}</span></td>
            <td className="right"><button onClick={() => onPdf(old.pdf_path)}>PDF</button></td>
          </tr>
        ))}
    </>
  )
}
