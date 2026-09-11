import { useState } from 'react'
import type { AssistantProposal, CostingPanel, Document } from '../../lib/database.types'
import { applyProposal, rejectProposal, type ApplyResult } from './api'
import { appliedFindings, evidenceText, findingsOf, lineChangeOf, summaryOf } from './proposal-rows'

/**
 * A review, most serious first (AI spec §3.3): each finding with its severity,
 * the evidence, and — where the model offered one — a single fix the engineer
 * can apply with one click. A blocker does not stop submission in phase 1; the
 * approval rules decide that later.
 */
export function ReviewCard({
  proposal, documents, panels, canApply, onApplied,
}: {
  proposal: AssistantProposal
  documents: Document[]
  panels: CostingPanel[]
  canApply: boolean
  onApplied: (result: ApplyResult) => void
}) {
  const findings = findingsOf(proposal.payload)
  const done = appliedFindings(proposal)
  const [panelId, setPanelId] = useState(panels[0]?.id ?? '')
  const [busy, setBusy] = useState<number | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileName = (id?: string) => documents.find((d) => d.id === id)?.file_name ?? null

  const apply = (index: number) => {
    setBusy(index); setError(null)
    applyProposal(proposal.id, { finding: index, ...(panelId ? { panel_id: panelId } : {}) })
      .then(onApplied)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div className="spread">
        <h3 style={{ margin: 0 }}>Review</h3>
        <span className="badge">{proposal.status === 'partially_applied' ? 'part applied' : proposal.status}</span>
      </div>
      {summaryOf(proposal.payload) && <p style={{ marginTop: '.4rem' }}>{summaryOf(proposal.payload)}</p>}
      <p className="muted" style={{ fontSize: '.8125rem' }}>
        Nothing has been changed. Findings are listed most serious first.
      </p>

      {panels.length > 1 && (
        <label className="field" style={{ maxWidth: '20rem' }}>
          <span>Apply fixes to</span>
          <select value={panelId} onChange={(e) => setPanelId(e.target.value)}>
            {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {findings.map((f) => {
          const fix = f.proposal ? lineChangeOf(f.proposal) : null
          const alreadyDone = done.includes(f.index)
          return (
            <li key={f.index} style={{ borderTop: '1px solid var(--line)', padding: '.6rem 0' }}>
              <div className="row" style={{ gap: '.5rem', alignItems: 'baseline' }}>
                <span className="badge">{f.severity}</span>
                <strong style={{ fontWeight: 550 }}>{f.text}</strong>
              </div>
              <div className="muted" style={{ fontSize: '.8125rem' }}>
                {f.code}
                {evidenceText(f.evidence, fileName(f.evidence?.document_id)) && ` · ${evidenceText(f.evidence, fileName(f.evidence?.document_id))}`}
              </div>
              {fix && (
                <div className="row" style={{ marginTop: '.35rem' }}>
                  <span style={{ fontSize: '.875rem' }}>{describe(fix.action)}: {fix.reason}</span>
                  {alreadyDone ? (
                    <span className="badge">applied</span>
                  ) : canApply ? (
                    <button disabled={busy !== null} onClick={() => apply(f.index)}>
                      {busy === f.index ? 'Applying…' : 'Apply this fix'}
                    </button>
                  ) : null}
                </div>
              )}
            </li>
          )
        })}
        {findings.length === 0 && <li className="muted">No findings: the assistant had nothing to report.</li>}
      </ul>

      {error && <p className="error">{error}</p>}
      {canApply && (
        <div className="row end" style={{ marginTop: '.5rem' }}>
          <button
            className="danger"
            disabled={busy !== null}
            onClick={() => {
              setBusy('reject'); setError(null)
              rejectProposal(proposal.id, null)
                .then(() => onApplied({ costing_id: proposal.entity_id, created_costing: false, status: 'rejected', lines: [] }))
                .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                .finally(() => setBusy(null))
            }}
          >
            Dismiss this review
          </button>
        </div>
      )}
    </div>
  )
}

function describe(action: string): string {
  switch (action) {
    case 'add': return 'Add a line'
    case 'change_qty': return 'Change a quantity'
    case 'remove': return 'Remove a line'
    case 'set_parameter': return 'Correct a parameter'
    default: return 'Change'
  }
}
