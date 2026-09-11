import { useMemo, useState } from 'react'
import type { AssistantProposal, Document, Kit } from '../../lib/database.types'
import { applyProposal, rejectProposal, type ApplyResult } from './api'
import {
  acceptedCount, decisionsFor, draftRows, evidenceText, notesOf, rowKey, summaryOf, unresolvedOf,
  type RowChoice, defaultChoices,
} from './proposal-rows'

/**
 * A drafted costing, as a table the engineer edits before applying (AI spec
 * §3.2): every line with its evidence and confidence, Accept / Change / Reject
 * per line, the unresolved items underneath, and one button that applies only
 * what was accepted.
 *
 * Nothing is applied until that button is pressed, and the card says so.
 */
export function ProposalCard({
  proposal, documents, kits, canApply, onApplied,
}: {
  proposal: AssistantProposal
  documents: Document[]
  kits: Kit[]
  canApply: boolean
  onApplied: (result: ApplyResult) => void
}) {
  const rows = useMemo(() => draftRows(proposal.payload), [proposal.payload])
  const [choices, setChoices] = useState<Record<string, RowChoice>>(() => defaultChoices(rows))
  // Only a draft from an enquiry creates a costing, so only that one has a title.
  const forEnquiry = proposal.entity_type === 'enquiry'
  const [title, setTitle] = useState(forEnquiry ? (summaryOf(proposal.payload)?.slice(0, 120) ?? '') : '')
  const [busy, setBusy] = useState<'apply' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [changing, setChanging] = useState<string | null>(null)

  const accepted = acceptedCount(rows, choices)
  const unresolved = unresolvedOf(proposal.payload)
  const notes = notesOf(proposal.payload)
  const fileName = (id?: string) => documents.find((d) => d.id === id)?.file_name ?? null
  const set = (key: string, patch: Partial<RowChoice>) =>
    setChoices((c) => ({ ...c, [key]: { choice: c[key]?.choice ?? 'reject', ...c[key], ...patch } }))

  const run = (what: 'apply' | 'reject') => {
    setBusy(what); setError(null)
    const job = what === 'apply'
      ? applyProposal(proposal.id, decisionsFor(rows, choices, forEnquiry && title.trim() ? { title: title.trim() } : {})).then(onApplied)
      : rejectProposal(proposal.id, null)
    job.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(null))
  }

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>Proposed costing</h3>
        <span className="badge">{proposal.status === 'partially_applied' ? 'part applied' : proposal.status}</span>
      </div>
      {summaryOf(proposal.payload) && <p style={{ marginTop: '.4rem' }}>{summaryOf(proposal.payload)}</p>}
      <p className="muted" style={{ fontSize: '.8125rem' }}>
        Nothing has been changed. Low-confidence lines start rejected; accept the ones you want.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Line</th><th>Proposed</th><th className="right">Qty</th><th>Evidence</th><th>Confidence</th><th>Action</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              const chosen = choices[key]
              const kitName = chosen?.refId ? kits.find((k) => k.id === chosen.refId)?.name : undefined
              return (
                <tr key={key} className={chosen?.choice === 'accept' ? undefined : 'inactive'}>
                  <td>
                    {row.panelName}
                    {row.section && <div className="muted" style={{ fontSize: '.8125rem' }}>{row.section}</div>}
                  </td>
                  <td>
                    {kitName ?? row.name}
                    {row.reason && <div className="muted" style={{ fontSize: '.8125rem' }}>{row.reason}</div>}
                    {changing === key && (
                      <select
                        aria-label={`Choose another kit for ${row.name}`}
                        style={{ marginTop: '.3rem' }}
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          set(key, { choice: 'accept', refId: e.target.value })
                          setChanging(null)
                        }}
                      >
                        <option value="">Another kit…</option>
                        {kits.filter((k) => k.is_active && !k.has_unpriced_part).map((k) => (
                          <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="right">
                    <input
                      type="number" min="0.01" step="1" style={{ width: '4.5rem' }}
                      aria-label={`Quantity for ${row.name}`}
                      value={chosen?.qty ?? row.qty}
                      onChange={(e) => set(key, { qty: Number(e.target.value) || row.qty })}
                    />
                  </td>
                  <td className="muted" style={{ fontSize: '.8125rem' }}>
                    {evidenceText(row.evidence, fileName(row.evidence?.document_id)) || '—'}
                  </td>
                  <td><span className="badge">{row.confidence}</span></td>
                  <td>
                    <div className="row" style={{ gap: '.3rem' }}>
                      <button
                        aria-pressed={chosen?.choice === 'accept'}
                        className={chosen?.choice === 'accept' ? 'primary' : undefined}
                        onClick={() => set(key, { choice: 'accept' })}
                      >
                        Accept
                      </button>
                      <button onClick={() => setChanging(changing === key ? null : key)}>Change</button>
                      <button
                        aria-pressed={chosen?.choice === 'reject'}
                        className={chosen?.choice === 'reject' ? 'danger' : undefined}
                        onClick={() => set(key, { choice: 'reject' })}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">No lines were proposed.</td></tr>}
          </tbody>
        </table>
      </div>

      {unresolved.length > 0 && (
        <>
          <h4 style={{ margin: '1rem 0 .35rem' }}>Could not be matched ({unresolved.length})</h4>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {unresolved.map((u, i) => (
              <li key={i} className="muted" style={{ fontSize: '.875rem' }}>
                {u.text}
                {u.suggestion === 'placeholder' && (
                  <>
                    {' · '}
                    <a href="/library/components" target="_blank" rel="noreferrer">create a placeholder part</a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {notes.length > 0 && (
        <ul style={{ margin: '.75rem 0 0', paddingLeft: '1.1rem' }}>
          {notes.map((n, i) => <li key={i} style={{ fontSize: '.875rem' }}>{n}</li>)}
        </ul>
      )}

      {forEnquiry && (
        <label className="field" style={{ marginTop: '.75rem' }}>
          <span>Title for the new costing</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Drafted by the assistant" />
        </label>
      )}

      {error && <p className="error">{error}</p>}
      {canApply ? (
        <div className="row end" style={{ marginTop: '.5rem' }}>
          <button className="danger" disabled={busy !== null} onClick={() => run('reject')}>Discard</button>
          <button className="primary" disabled={busy !== null || accepted === 0} onClick={() => run('apply')}>
            {busy === 'apply' ? 'Applying…' : `Apply ${accepted} accepted line${accepted === 1 ? '' : 's'}`}
          </button>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          Only a costing engineer or approver can apply this, and only while the costing is an open draft.
        </p>
      )}
    </div>
  )
}
