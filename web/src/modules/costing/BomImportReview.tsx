import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import type { ImportRow } from '../../lib/database.types'
import { listJobRows } from '../library/price-list-api'
import { applyBomImport, type BomDecision } from './bom-import-api'
import { choiceKey, choicesFor } from './bom-import-read'

/**
 * What an imported parts list would put on this costing, row by row: what it
 * matched, the kit proposed where the row named a kit's main device, and one
 * choice per row — that kit, another kit using the same device, the part on its
 * own, a placeholder for somebody to price, or nothing.
 */
export function BomImportReview({
  jobId,
  costingId,
  onClose,
}: {
  jobId: string
  costingId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const rows = useQuery({ queryKey: ['import-rows', jobId], queryFn: () => listJobRows(jobId) })
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [panelName, setPanelName] = useState('')
  const [outcome, setOutcome] = useState<string | null>(null)

  const apply = useMutation({
    mutationFn: (lines: BomDecision[]) => applyBomImport(jobId, panelName.trim(), lines),
    onSuccess: async (r) => {
      setOutcome(
        [
          r.lines > 0 ? `${r.lines} line${r.lines === 1 ? '' : 's'} added to the costing.` : null,
          r.placeholders > 0
            ? `${r.placeholders} part${r.placeholders === 1 ? '' : 's'} added to the library as placeholders — price them, then add them.`
            : null,
          r.skipped > 0 ? `${r.skipped} row${r.skipped === 1 ? '' : 's'} left out.` : null,
          r.remaining > 0 ? `${r.remaining} row${r.remaining === 1 ? '' : 's'} still waiting.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
      await queryClient.invalidateQueries({ queryKey: ['import-rows', jobId] })
      await queryClient.invalidateQueries({ queryKey: ['costing', costingId] })
      await queryClient.invalidateQueries({ queryKey: ['bom', costingId] })
      await queryClient.invalidateQueries({ queryKey: ['components'] })
    },
  })

  return (
    <Async query={rows} empty="This list has no rows.">
      {(all) => {
        const open = all.filter((r) => r.status === 'new' || r.status === 'warning')
        const done = all.filter((r) => r.status === 'accepted' || r.status === 'skipped')
        const refused = all.filter((r) => r.status === 'rejected')
        return (
          <Body
            open={open}
            done={done}
            refused={refused}
            decisions={decisions}
            quantities={quantities}
            panelName={panelName}
            outcome={outcome}
            error={apply.error ? String(apply.error) : null}
            busy={apply.isPending}
            onDecision={(id, value) => setDecisions((d) => ({ ...d, [id]: value }))}
            onQuantity={(id, value) => setQuantities((q) => ({ ...q, [id]: value }))}
            onPanelName={setPanelName}
            onApply={(lines) => apply.mutate(lines)}
            onClose={onClose}
          />
        )
      }}
    </Async>
  )
}

function Body({
  open, done, refused, decisions, quantities, panelName, outcome, error, busy,
  onDecision, onQuantity, onPanelName, onApply, onClose,
}: {
  open: ImportRow[]
  done: ImportRow[]
  refused: ImportRow[]
  decisions: Record<string, string>
  quantities: Record<string, string>
  panelName: string
  outcome: string | null
  error: string | null
  busy: boolean
  onDecision: (id: string, value: string) => void
  onQuantity: (id: string, value: string) => void
  onPanelName: (value: string) => void
  onApply: (lines: BomDecision[]) => void
  onClose: () => void
}) {
  // Each row's choices, and what it is set to now: the database's proposal until
  // somebody changes it.
  const state = useMemo(
    () =>
      open.map((row) => {
        const raw = row.raw as Parameters<typeof choicesFor>[0]
        const { choices, defaultKey } = choicesFor(raw)
        return { row, choices, key: decisions[row.id] ?? defaultKey }
      }),
    [open, decisions],
  )

  const lines: BomDecision[] = state
    .map(({ row, key }) => {
      const [kind, ref] = key.split(':')
      const qty = quantities[row.id]
      const line: BomDecision = { row_id: row.id, kind: (kind ?? 'skip') as BomDecision['kind'] }
      if (ref) line.ref_id = ref
      if (qty && Number(qty) > 0) line.qty = Number(qty)
      return line
    })
    .filter((l) => l.kind !== 'skip' || true)

  const bringing = lines.filter((l) => l.kind !== 'skip').length

  return (
    <>
      <div className="spread">
        <h3 style={{ fontSize: '1rem' }}>What this list would add ({open.length} to decide)</h3>
        <button onClick={onClose}>Close</button>
      </div>
      {outcome && <p className="ok">{outcome}</p>}
      {error && <p className="error">{error}</p>}

      {open.length > 0 && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Row</th><th>From the file</th><th>Bring in as</th><th className="right">Qty</th></tr>
              </thead>
              <tbody>
                {state.map(({ row, choices, key }) => (
                  <tr key={row.id}>
                    <td className="muted">{row.row_number ?? '—'}</td>
                    <td>
                      <div>{(row.raw as { key?: string }).key}</div>
                      <div className="muted" style={{ fontSize: '.8125rem' }}>
                        {(row.raw as { description?: string }).description ?? ''}
                      </div>
                      {row.message && (
                        <div className="muted" style={{ fontSize: '.8125rem' }}>{row.message}</div>
                      )}
                    </td>
                    <td>
                      <select
                        aria-label={`What to do with ${(row.raw as { key?: string }).key ?? 'this row'}`}
                        value={key}
                        onChange={(e) => onDecision(row.id, e.target.value)}
                      >
                        {choices.map((c) => (
                          <option key={choiceKey(c)} value={choiceKey(c)}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="right">
                      <input
                        type="number" step="1" min="1" style={{ width: '4.5rem' }}
                        aria-label={`Quantity for ${(row.raw as { key?: string }).key ?? 'this row'}`}
                        value={quantities[row.id] ?? String((row.raw as { qty?: number }).qty ?? 1)}
                        onChange={(e) => onQuantity(row.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row end" style={{ marginTop: '.5rem' }}>
            <input
              placeholder="Name for the new panel"
              aria-label="Name for the new panel"
              style={{ flex: 1, minWidth: '12rem' }}
              value={panelName}
              onChange={(e) => onPanelName(e.target.value)}
            />
            <button className="primary" disabled={bringing === 0 || busy} onClick={() => onApply(lines)}>
              {busy ? 'Bringing in…' : `Bring in ${bringing} line${bringing === 1 ? '' : 's'}`}
            </button>
          </div>
          <p className="muted" style={{ fontSize: '.8125rem' }}>
            They arrive on a panel of their own, priced by the engine exactly as hand-added lines
            are, and each one says it came from this file.
          </p>
        </>
      )}

      {refused.length > 0 && (
        <>
          <h3 style={{ fontSize: '1rem' }}>Rows that could not be read ({refused.length})</h3>
          <ul className="muted" style={{ fontSize: '.875rem' }}>
            {refused.map((r) => (
              <li key={r.id}>Row {r.row_number}: {r.message}</li>
            ))}
          </ul>
        </>
      )}

      {done.length > 0 && (
        <>
          <h3 style={{ fontSize: '1rem' }}>Already decided ({done.length})</h3>
          <ul className="muted" style={{ fontSize: '.875rem' }}>
            {done.map((r) => (
              <li key={r.id}>{(r.raw as { key?: string }).key}: {r.message}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
