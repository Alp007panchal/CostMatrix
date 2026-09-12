import { useEffect, useState } from 'react'
import type { BusbarBar, BusbarCheckRow, BusbarRun } from '../../lib/database.types'
import {
  applyBusbarRuns,
  busbarBars,
  panelBusbarCheck,
  panelBusbarRuns,
  saveBusbarRuns,
  startingBusbarRuns,
} from './busbar-api'
import { BusbarSchedule } from './BusbarSchedule'
import { blankRun, checkWords, localTotals, scheduleProblems } from './busbar'

/**
 * The busbar run calculator (roadmap 4.1) — the `CU-OPT1` sheet of the owner's
 * workbook, on the panel it belongs to.
 *
 * Decision 12 left busbar metres fixed per kit, adjusted by hand on a
 * non-standard board. This is the arithmetic that adjustment needs: a run a row,
 * metres by bar size, and the one thing the workbook never did — the schedule set
 * beside the metres the panel is actually costed at.
 *
 * Saving moves no price. Applying adds busbar lines through the ordinary
 * component function, so every metre is priced and frozen like a hand-typed one.
 */
export function BusbarCard({
  panelId,
  onApplied,
}: {
  panelId: string
  onApplied: () => Promise<void> | void
}) {
  const [open, setOpen] = useState(false)
  const [bars, setBars] = useState<BusbarBar[]>([])
  const [runs, setRuns] = useState<BusbarRun[]>([])
  const [check, setCheck] = useState<BusbarCheckRow[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (!open || bars.length > 0) return
    busbarBars()
      .then(setBars)
      .catch((e: unknown) => setError(String(e)))
    // What this panel already has, so a schedule is picked up where it was left.
    panelBusbarRuns(panelId)
      .then((saved) => { if (saved.length > 0) setRuns(saved) })
      .catch(() => undefined)
  }, [open, bars.length, panelId])

  useEffect(() => {
    if (!open) return
    panelBusbarCheck(panelId)
      .then(setCheck)
      .catch(() => setCheck([]))
  }, [open, panelId, done])

  if (!open) {
    return (
      <button style={{ marginTop: '.5rem', fontSize: '.8125rem' }} onClick={() => setOpen(true)}>
        Work out the busbar runs
      </button>
    )
  }

  const problems = scheduleProblems(runs, bars)
  const totals = localTotals(runs, bars)
  const gap = checkWords(check)

  const start = () => {
    setBusy(true); setError(null); setDone(null)
    startingBusbarRuns(panelId)
      .then((s) => { setRuns(s.runs); setNote(s.note) })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const save = () => {
    setBusy(true); setError(null); setDone(null)
    saveBusbarRuns(panelId, runs)
      .then((t) => { setRuns(t.runs); setDone(`Schedule saved: ${t.total_metres} m, ${t.total_kg} kg.`) })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  const apply = (replace: boolean) => {
    setBusy(true); setError(null); setDone(null)
    saveBusbarRuns(panelId, runs)
      .then(() => applyBusbarRuns(panelId, replace))
      .then(async (a) => {
        setDone(
          `${a.metres} m of busbar in ${a.sizes} size${a.sizes === 1 ? '' : 's'} added to the Busbar section` +
            (a.replaced > 0 ? `, in place of ${a.replaced} earlier line${a.replaced === 1 ? '' : 's'}.` : '.'),
        )
        await onApplied()
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <strong style={{ fontSize: '.8125rem' }}>Busbar runs</strong>
        <div className="row">
          <button disabled={busy} onClick={start}>Start from this board</button>
          <button disabled={busy || runs.length === 0 || problems.length > 0} onClick={save}>
            {busy ? 'Working…' : 'Save the schedule'}
          </button>
          <button onClick={() => { setOpen(false); setError(null); setDone(null) }}>Done</button>
        </div>
      </div>

      {note !== null && <p className="muted" style={{ fontSize: '.75rem' }}>{note}</p>}

      <BusbarSchedule
        bars={bars}
        runs={runs}
        totals={totals}
        onChange={setRuns}
        onAdd={() => setRuns([...runs, blankRun(bars)])}
      />

      {problems.length > 0 && (
        <ul className="muted" style={{ fontSize: '.75rem', margin: '.25rem 0 0 1rem' }}>
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {gap !== null && (
        <p className="warn" style={{ fontSize: '.75rem' }}>
          {gap} Your workbook never compared the two; this does.
        </p>
      )}

      <div className="row" style={{ marginTop: '.5rem', flexWrap: 'wrap' }}>
        <button
          className="primary"
          disabled={busy || runs.length === 0 || problems.length > 0}
          onClick={() => apply(false)}
        >
          Add these as busbar lines
        </button>
        {check.some((r) => r.costed_m > 0) && (
          <button disabled={busy || problems.length > 0} onClick={() => apply(true)}>
            Replace the busbar lines already there
          </button>
        )}
      </div>

      {error !== null && <p className="error" style={{ fontSize: '.75rem' }}>{error}</p>}
      {done !== null && <p className="ok" style={{ fontSize: '.75rem' }}>{done}</p>}
    </div>
  )
}
