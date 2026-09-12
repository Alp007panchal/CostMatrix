import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { money } from '../../lib/format'
import type { CostingPanel, PanelLabourVariance, ProcessType } from '../../lib/database.types'
import { listActualEntries, listLabourVariance, recordActualHours, removeActualHours } from './labour-actuals-api'

/**
 * Hours actually worked, against the hours this costing was priced on
 * (roadmap 2.8). Recording them changes nothing about the costing — it keeps the
 * hours it froze — so this card is available on an approved job as well as a
 * draft, which is when the boards are actually built.
 */
export function ActualHoursCard({
  costingId,
  panels,
  processTypes,
  currencyLabel,
  canRecord,
}: {
  costingId: string
  panels: CostingPanel[]
  processTypes: ProcessType[]
  currencyLabel: string
  canRecord: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [panelId, setPanelId] = useState('')
  const [processType, setProcessType] = useState('')
  const [hours, setHours] = useState('')
  const [note, setNote] = useState('')

  const variance = useQuery({
    queryKey: ['labour-variance', costingId],
    queryFn: () => listLabourVariance(costingId),
    enabled: open,
  })
  const entries = useQuery({
    queryKey: ['labour-actuals', costingId],
    queryFn: () => listActualEntries(costingId),
    enabled: open,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['labour-variance', costingId] })
    await queryClient.invalidateQueries({ queryKey: ['labour-actuals', costingId] })
    await queryClient.invalidateQueries({ queryKey: ['costing-history', costingId] })
  }
  const record = useMutation({
    mutationFn: () => recordActualHours({
      panelId, processType, hours: Number(hours), note: note.trim() === '' ? null : note.trim(),
    }),
    onSuccess: async () => { setHours(''); setNote(''); await refresh() },
  })
  const remove = useMutation({ mutationFn: (id: string) => removeActualHours(id), onSuccess: refresh })

  const rows = variance.data ?? []
  const panelName = (id: string) => panels.find((p) => p.id === id)?.name ?? 'a panel since removed'
  const processName = (code: string) => processTypes.find((p) => p.code === code)?.name ?? code
  const ready = panelId !== '' && processType !== '' && Number(hours) > 0

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Hours actually worked</h2>
        <button onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      <p className="muted" style={{ fontSize: '.8125rem', margin: '.3rem 0 0' }}>
        What the shop floor took, against what this costing was priced on. Recording hours changes
        no price and no total: the costing keeps the hours it froze. The figures feed the labour
        variance report, where the standards can be brought up to date.
      </p>

      {open && (
        <>
          {rows.length === 0 && !variance.isPending && (
            <p className="empty" style={{ marginTop: '.75rem' }}>
              No hours estimated or recorded on this costing yet.
            </p>
          )}
          {rows.length > 0 && (
            <div className="table-wrap" style={{ marginTop: '.75rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Panel</th><th>Process</th>
                    <th className="right">Estimated</th><th className="right">Actual</th>
                    <th className="right">Difference</th><th className="right">At the frozen rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => <VarianceRow key={`${r.panel_id}-${r.process_type}`} row={r} label={currencyLabel} />)}
                </tbody>
              </table>
            </div>
          )}

          {canRecord && (
            <div className="row" style={{ marginTop: '.75rem', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="field" style={{ margin: 0, minWidth: '12rem' }}>
                <span>Panel</span>
                <select value={panelId} onChange={(e) => setPanelId(e.target.value)}>
                  <option value="">Choose a panel</option>
                  {panels.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ margin: 0, minWidth: '10rem' }}>
                <span>Process</span>
                <select value={processType} onChange={(e) => setProcessType(e.target.value)}>
                  <option value="">Choose a process</option>
                  {processTypes.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </label>
              <label className="field" style={{ margin: 0, maxWidth: '7rem' }}>
                <span>Hours</span>
                <input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <label className="field" style={{ margin: 0, flex: 1, minWidth: '10rem' }}>
                <span>Note <em className="hint">— optional, e.g. week 32</em></span>
                <input value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button className="primary" disabled={!ready || record.isPending} onClick={() => record.mutate()}>
                Record these hours
              </button>
            </div>
          )}
          {record.error && <p className="error">{String(record.error)}</p>}
          {remove.error && <p className="error">{String(remove.error)}</p>}

          {(entries.data ?? []).length > 0 && (
            <>
              <h3 style={{ fontSize: '.9rem', margin: '1rem 0 .4rem' }}>Every entry</h3>
              <p className="muted" style={{ fontSize: '.75rem', margin: '0 0 .4rem' }}>
                Hours arrive a week at a time and are added up. A wrong figure is corrected by
                removing its entry.
              </p>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {(entries.data ?? []).map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.recorded_at).toLocaleDateString()}</td>
                        <td>{panelName(e.panel_id)}</td>
                        <td>{processName(e.process_type)}</td>
                        <td className="right">{Number(e.hours).toFixed(2)} h</td>
                        <td className="muted">{e.note}</td>
                        <td className="right">
                          {canRecord && (
                            <button className="danger" onClick={() => remove.mutate(e.id)}>Remove</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function VarianceRow({ row, label }: { row: PanelLabourVariance; label: string }) {
  const difference = Number(row.difference_hours)
  const over = difference > 0.005
  return (
    <tr>
      <td>{row.panel_name}</td>
      <td>{row.process_name}</td>
      <td className="right">{Number(row.estimated_hours).toFixed(2)} h</td>
      <td className="right">
        {row.has_actuals ? `${Number(row.actual_hours).toFixed(2)} h` : <span className="muted">not yet</span>}
      </td>
      <td className="right">
        {row.has_actuals ? (
          <>
            {over ? '+' : ''}{difference.toFixed(2)} h
            {row.variance_pct !== null && (
              <div className="muted" style={{ fontSize: '.75rem' }}>
                {Number(row.variance_pct) > 0 ? '+' : ''}{Number(row.variance_pct).toFixed(1)} %
              </div>
            )}
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="right">{row.has_actuals ? money(Number(row.difference_cost), label) : ''}</td>
    </tr>
  )
}
