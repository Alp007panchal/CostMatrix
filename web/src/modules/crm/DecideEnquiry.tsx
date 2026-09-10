import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field } from '../../ui/Async'
import type { Enquiry, QuotationRow } from '../../lib/database.types'
import { decideEnquiry } from './api'

/**
 * Won or lost is decided once, on the enquiry, naming the quotation that won
 * it. The other offers against the same enquiry were never turned down — they
 * are simply off the table, which the app calls superseded.
 */
export function DecideEnquiry({
  enquiry,
  quotations,
  onClose,
  onDone,
}: {
  enquiry: Enquiry
  /** Every quotation released against this enquiry. */
  quotations: QuotationRow[]
  onClose: () => void
  onDone: () => void
}) {
  const live = quotations.filter((q) => q.status === 'released' || q.status === 'sent')
  const [decision, setDecision] = useState<'won' | 'lost'>('won')
  const [winner, setWinner] = useState(live[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const decide = useMutation({
    mutationFn: () =>
      decideEnquiry(enquiry.id, decision, decision === 'won' ? winner : null, decision === 'lost' ? reason.trim() : null),
    onSuccess: onDone,
  })

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>{enquiry.enquiry_no}: what happened?</h2>
        <button onClick={onClose}>Cancel</button>
      </div>
      <p className="muted">{enquiry.title}</p>

      <div className="row" style={{ gap: '1rem' }}>
        <label className="row" style={{ gap: '.35rem' }}>
          <input type="radio" checked={decision === 'won'} onChange={() => setDecision('won')} /> We won it
        </label>
        <label className="row" style={{ gap: '.35rem' }}>
          <input type="radio" checked={decision === 'lost'} onChange={() => setDecision('lost')} /> We lost it
        </label>
      </div>

      {decision === 'won' ? (
        live.length === 0 ? (
          <p className="error">
            No quotation of this enquiry is still on the table, so there is nothing to name as the
            winner. Release one first.
          </p>
        ) : (
          <Field label="Which quotation won it" hint="the others are marked superseded, not lost">
            <select value={winner} onChange={(e) => setWinner(e.target.value)}>
              {live.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.reference_no} — {q.subject}
                </option>
              ))}
            </select>
          </Field>
        )
      ) : (
        <Field label="Why was it lost" hint="honestly: this is what the sales reports are built on">
          <textarea
            autoFocus
            value={reason}
            placeholder="e.g. Price too high against a local fabricator"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}

      {decide.error && <p className="error">{String(decide.error)}</p>}
      <div className="row end">
        <button
          className={decision === 'won' ? 'ok' : 'danger'}
          disabled={decide.isPending || (decision === 'won' ? !winner : !reason.trim())}
          onClick={() => decide.mutate()}
        >
          {decide.isPending ? 'Saving…' : decision === 'won' ? 'Mark the enquiry won' : 'Mark the enquiry lost'}
        </button>
      </div>
    </div>
  )
}
