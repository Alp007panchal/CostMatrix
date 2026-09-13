import { useState } from 'react'
import { type EplanImportReport, importEplanMetadata } from './eplan-api'

/**
 * Reading an EPLAN project export that somebody pasted in (roadmap 4.3).
 *
 * Propose, then apply — the shape every import in this app uses. It shows what it
 * found and, just as importantly, **every line it could not read**, so a house
 * whose export uses a field name this does not know finds out rather than
 * wondering why nothing happened.
 */
export function EplanImport({
  costingId,
  onApplied,
}: {
  costingId: string
  onApplied: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const [report, setReport] = useState<EplanImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = (apply: boolean) => {
    setBusy(true); setError(null)
    importEplanMetadata(costingId, pasted, apply)
      .then(async (r) => {
        setReport(r)
        if (apply) await onApplied()
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  if (!open) {
    return (
      <p style={{ marginBottom: 0 }}>
        <button style={{ fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
          Paste an EPLAN project export instead
        </button>
      </p>
    )
  }

  const found = report !== null && (report.project !== null || report.drawings.length > 0)

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: '6px', padding: '.6rem', marginTop: '.6rem' }}>
      <p className="muted" style={{ fontSize: '.75rem', marginTop: 0 }}>
        Paste the project properties out of EPLAN — whatever shape they come in. Lines like
        <em> Project name: …</em>, <em>Drawing no = …</em> or a two-column export all read.
        It shows you what it read first; nothing reaches the costing until you say so.
      </p>
      <textarea
        aria-label="Pasted EPLAN export"
        value={pasted}
        rows={5}
        style={{ width: '100%' }}
        onChange={(e) => setPasted(e.target.value)}
      />
      <div className="row" style={{ gap: '.5rem', marginTop: '.4rem' }}>
        <button disabled={busy || pasted.trim() === ''} onClick={() => read(false)}>
          {busy ? 'Reading…' : 'Read it'}
        </button>
        <button disabled={busy || !found} onClick={() => read(true)}>Save what it found</button>
        <button onClick={() => { setOpen(false); setReport(null) }}>Close</button>
      </div>

      {report !== null && (
        <div style={{ fontSize: '.8125rem', marginTop: '.5rem' }}>
          <p style={{ marginBottom: '.2rem' }}>{report.why}</p>
          {report.project !== null && <p style={{ margin: 0 }}>Project: <strong>{report.project}</strong></p>}
          {report.drawings.length > 0 && (
            <p style={{ margin: 0 }}>Drawings: <strong>{report.drawings.join(', ')}</strong></p>
          )}
          {report.unmatched.length > 0 && (
            <details style={{ marginTop: '.3rem' }}>
              <summary className="muted">{report.unmatched.length} line(s) it could not read</summary>
              <ul style={{ margin: '.3rem 0', paddingLeft: '1.1rem' }}>
                {report.unmatched.map((u) => (
                  <li key={u.line}><code>{u.line}</code> — {u.why}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error !== null && <p className="error" style={{ fontSize: '.8125rem' }}>{error}</p>}
    </div>
  )
}
