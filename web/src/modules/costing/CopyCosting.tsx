import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field } from '../../ui/Async'
import { money } from '../../lib/format'
import type { CopyReport, Costing } from '../../lib/database.types'
import { copyCosting } from './api'

/**
 * Copy a costing as a new job. Most boards are a version of one quoted before,
 * and a copy re-prices everything at today's rates — quoting a new customer at
 * last year's copper price is the mistake this app exists to prevent. Anything
 * that could not be re-priced is listed rather than quietly carried over.
 */
export function CopyCostingForm({
  source,
  enquiries,
  onClose,
  onOpen,
}: {
  source: Costing
  enquiries: { id: string; enquiry_no: string; title: string }[]
  onClose: () => void
  onOpen: (costingId: string) => void
}) {
  const [title, setTitle] = useState(`${source.title} (copy)`)
  const [enquiryId, setEnquiryId] = useState('')
  const [report, setReport] = useState<CopyReport | null>(null)
  const copy = useMutation({
    mutationFn: () => copyCosting(source.id, title.trim() || null, enquiryId || null),
    onSuccess: setReport,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    copy.mutate()
  }

  if (report) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Copied as {report.costing_no}</h2>
        <p>
          {report.title} — a new job of its own, from {report.from_costing_no}, which has not
          changed. {report.repriced} catalogue line{report.repriced === 1 ? '' : 's'} priced again
          at today&rsquo;s rates.
        </p>
        {report.kept.length > 0 && (
          <>
            <p className="error">
              {report.kept.length} line{report.kept.length === 1 ? '' : 's'} could not be priced
              again and came across at the old price. Check {report.kept.length === 1 ? 'it' : 'them'} before
              you quote:
            </p>
            <ul>
              {report.kept.map((k) => (
                <li key={k.code}>
                  {k.code} — {k.name}: {k.reason}, kept at {money(k.unit_price, source.currency_label)}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="row end">
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={() => onOpen(report.costing_id)}>Open it</button>
        </div>
      </div>
    )
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>Copy {source.costing_no}</h2>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
      <p className="muted">
        A copy is a new job: its own number, its own revision 0, and {source.costing_no} left
        exactly as it is. Every catalogue line is priced again at today&rsquo;s purchase prices and
        rates; a line you typed in keeps the price you typed.
      </p>
      <Field label="Enquiry" hint="which request the copy answers; leave it empty for none">
        <select value={enquiryId} onChange={(e) => setEnquiryId(e.target.value)}>
          <option value="">No enquiry yet</option>
          {enquiries.map((en) => <option key={en.id} value={en.id}>{en.enquiry_no} — {en.title}</option>)}
        </select>
      </Field>
      <Field label="Title" hint="the new job, as you would say it">
        <input value={title} required autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {copy.error && <p className="error">{String(copy.error)}</p>}
      <div className="row end">
        <button type="submit" className="primary" disabled={copy.isPending}>
          {copy.isPending ? 'Copying…' : 'Copy at today’s prices'}
        </button>
      </div>
    </form>
  )
}
