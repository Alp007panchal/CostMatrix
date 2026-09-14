import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../../app/PageHeader'
import { getQuotationForCosting } from '../quotation/api'
import type { Costing } from '../../lib/database.types'
import { costingSteps } from './costing-tabs'

/**
 * The top of the costing editor (house style §5): the reference in the top bar,
 * a mono meta line, the lifecycle buttons as page actions, and under them the
 * four steps Draft → Submitted → Approved → Quotation released.
 *
 * The steps exist because "submitted" and "approved" are words, and a person
 * arriving at somebody else's costing had to read three paragraphs to find out
 * whether it had gone out yet.
 */
export function CostingHeader({
  costing,
  panelCount,
  editable,
  isApprover,
  canBuild,
  onSubmit,
  onApprove,
  onReturn,
  onRevision,
  onReissue,
}: {
  costing: Costing
  panelCount: number
  editable: boolean
  isApprover: boolean
  canBuild: boolean
  onSubmit: () => void
  onApprove: () => void
  onReturn: (comment: string) => void
  onRevision: () => void
  onReissue: () => void
}) {
  const navigate = useNavigate()
  const [returning, setReturning] = useState(false)
  const [comment, setComment] = useState('')
  const quotation = useQuery({
    queryKey: ['quotation-for', costing.id],
    queryFn: () => getQuotationForCosting(costing.id),
  })
  const steps = costingSteps(costing, quotation.data != null)

  return (
    <>
      <PageHeader
        title={costing.costing_no}
        meta={[
          costing.revision_no > 0 ? `Rev ${costing.revision_no}` : 'first issue',
          `${panelCount} panel${panelCount === 1 ? '' : 's'}`,
          costing.is_current ? statusLabel(costing.status) : 'superseded',
        ].join(' · ')}
      >
        <button onClick={() => navigate('/costings')}>← Costings</button>
        {editable && <button className="btn" onClick={onSubmit}>Submit for approval</button>}
        {costing.status === 'submitted' && isApprover && costing.is_current && (
          <>
            <button onClick={() => setReturning(true)}>Return to draft</button>
            <button className="btn accent" onClick={onApprove}>Approve</button>
          </>
        )}
        {costing.status === 'approved' && costing.is_current && canBuild && (
          <>
            <button title="A new revision with every line priced at today's prices" onClick={onReissue}>
              Re-issue at today's prices
            </button>
            <button className="btn" onClick={onRevision}>New revision</button>
          </>
        )}
      </PageHeader>

      <div className="steps" style={{ marginBottom: 14 }}>
        {steps.map((step) => (
          <span className={step.state === 'later' ? 'step' : `step ${step.state}`} key={step.label}>
            <span className="c">{step.state === 'done' ? '✓' : ''}</span>
            {step.label}
          </span>
        ))}
      </div>

      {costing.status === 'draft' && costing.return_comment !== null && (
        <p className="error">Returned by the approver: “{costing.return_comment}”</p>
      )}

      {returning && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Return to the engineer</h2>
          <textarea
            autoFocus
            placeholder="Say what needs changing"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="row end" style={{ marginTop: '.5rem' }}>
            <button onClick={() => setReturning(false)}>Cancel</button>
            <button
              className="btn"
              disabled={comment.trim() === ''}
              onClick={() => {
                onReturn(comment.trim())
                setReturning(false)
                setComment('')
              }}
            >
              Return with this note
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export function statusLabel(status: string): string {
  return status === 'draft' ? 'Draft' : status === 'submitted' ? 'Awaiting approval' : 'Approved'
}
