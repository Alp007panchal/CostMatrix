import { useState } from 'react'
import type { Costing, CostingPanel, PanelCopyReport } from '../../lib/database.types'
import { copyPanel } from './api'

/**
 * Copy one panel — into this costing (a second, near-identical board) or into
 * another draft. Re-priced at today's rates like any copy, with anything that
 * could not be re-priced named.
 */
export function CopyPanel({
  panel,
  costing,
  drafts,
  onCopied,
}: {
  panel: CostingPanel
  costing: Costing
  /** The company's other open drafts, so a panel can move between jobs. */
  drafts: Costing[]
  onCopied: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(costing.id)
  const [name, setName] = useState(`${panel.name} (copy)`)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PanelCopyReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button style={{ marginTop: '.5rem', fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
        Copy this panel
      </button>
    )
  }

  return (
    <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Copy to</span>
        <select value={target} style={{ minWidth: '14rem' }} onChange={(e) => setTarget(e.target.value)}>
          <option value={costing.id}>This costing ({costing.costing_no})</option>
          {drafts.filter((d) => d.id !== costing.id).map((d) => (
            <option key={d.id} value={d.id}>{d.costing_no} — {d.title}</option>
          ))}
        </select>
        <input value={name} style={{ flex: 2, minWidth: '12rem' }} aria-label="Name of the copy" onChange={(e) => setName(e.target.value)} />
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={() => {
            setBusy(true); setError(null)
            copyPanel(panel.id, target, name.trim())
              .then(async (r) => { setReport(r); await onCopied() })
              .catch((e: unknown) => setError(String(e)))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? 'Copying…' : 'Copy'}
        </button>
        <button onClick={() => { setOpen(false); setReport(null); setError(null) }}>Done</button>
      </div>
      {report && (
        <p className={report.kept.length ? 'error' : 'muted'} style={{ fontSize: '.8125rem' }}>
          Copied; {report.repriced} line{report.repriced === 1 ? '' : 's'} priced again at today&rsquo;s rates
          {report.kept.length > 0
            ? `. Kept at the old price, check before quoting: ${report.kept.map((k) => `${k.code} (${k.reason})`).join(', ')}`
            : '.'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
