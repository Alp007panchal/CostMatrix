import { useState } from 'react'
import type { ApfcProposal, ApfcStep } from '../../lib/database.types'
import { applyApfcSteps, proposeApfc } from './api'
import { bankTotal, describeBank, shortfallWords, stepsToApply } from './apfc'

/**
 * The APFC bank, worked out from a target (roadmap 3.2). Decision 4 said step
 * kits added by hand in phase 1 and a configurator later: this is the later.
 *
 * It proposes and a person applies. The quantities are editable before Apply,
 * and what is added is what is on the screen — through the ordinary kit
 * function, into the panel's *APFC bank* section, priced and frozen like
 * anything else.
 */
export function ApfcCard({ panelId, onApplied }: { panelId: string; onApplied: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [family, setFamily] = useState('')
  const [proposal, setProposal] = useState<ApfcProposal | null>(null)
  const [steps, setSteps] = useState<ApfcStep[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (!open) {
    return (
      <button style={{ marginTop: '.5rem', fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
        Work out an APFC bank
      </button>
    )
  }

  const propose = () => {
    setBusy(true); setError(null); setDone(null)
    proposeApfc(panelId, Number(target), family || null)
      .then((p) => { setProposal(p); setSteps(p.steps) })
      .catch((e: unknown) => { setProposal(null); setSteps([]); setError(String(e)) })
      .finally(() => setBusy(false))
  }

  const apply = () => {
    setBusy(true); setError(null)
    applyApfcSteps(panelId, stepsToApply(steps))
      .then(async () => {
        setDone(`${describeBank(steps)} added to this panel.`)
        setProposal(null); setSteps([]); setTarget('')
        await onApplied()
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>APFC bank of</span>
        <input
          type="number" step="0.5" min="0" value={target} placeholder="kVAr"
          aria-label="Target kVAr" style={{ width: '6rem' }}
          onChange={(e) => setTarget(e.target.value)}
        />
        <select value={family} aria-label="Step kit family" style={{ width: '10rem' }} onChange={(e) => setFamily(e.target.value)}>
          <option value="">Either kind of step</option>
          <option value="FUSE">Fuse-protected</option>
          <option value="BREAKER">Breaker-protected</option>
        </select>
        <button className="primary" disabled={busy || !(Number(target) > 0)} onClick={propose}>
          {busy ? 'Working…' : 'Work it out'}
        </button>
        <button onClick={() => { setOpen(false); setProposal(null); setError(null); setDone(null) }}>Done</button>
      </div>

      {proposal && (
        <>
          <div className="table-wrap" style={{ marginTop: '.5rem' }}>
            <table>
              <thead>
                <tr><th>Step</th><th className="right">Each</th><th className="right">How many</th><th className="right">kVAr</th></tr>
              </thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={s.assembly_id}>
                    <td>{s.name}</td>
                    <td className="right muted">{s.rating} kVAr</td>
                    <td className="right">
                      <input
                        type="number" min="0" step="1" value={s.quantity}
                        aria-label={`How many ${s.name}`}
                        style={{ width: '4.5rem', textAlign: 'right' }}
                        onChange={(e) => {
                          const quantity = Math.max(0, Math.floor(Number(e.target.value) || 0))
                          setSteps((all) => all.map((x, j) => (j === i ? { ...x, quantity, kvar: x.rating * quantity } : x)))
                        }}
                      />
                    </td>
                    <td className="right">{s.rating * s.quantity}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>{describeBank(steps)}, {proposal.family === 'FUSE' ? 'fuse' : proposal.family.toLowerCase()}-protected</th>
                  <th className="right">{bankTotal(steps)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
          {shortfallWords(proposal, steps) && (
            <p className="error" style={{ fontSize: '.8125rem' }}>{shortfallWords(proposal, steps)}</p>
          )}
          <div className="row end">
            <button className="primary" disabled={busy || stepsToApply(steps).length === 0} onClick={apply}>
              {busy ? 'Adding…' : `Add ${describeBank(steps)}`}
            </button>
          </div>
        </>
      )}

      {done && <p className="muted" style={{ fontSize: '.8125rem' }}>{done}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
