import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import type { ImportRow } from '../../lib/database.types'
import { acceptPriceRows, discardImportJob, listJobRows } from './price-list-api'
import { changeLabel } from './price-list-read'

/**
 * One uploaded price list, row by row: what it matched, what it has now, what
 * the supplier asks, and by how much that moves. Tick the rows you believe and
 * accept them; everything else is left alone. The rows that need a person's
 * attention — not in the library, ambiguous, priced by weight, unreadable — are
 * listed with the reason rather than hidden.
 */
export function PriceListReview({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const rows = useQuery({ queryKey: ['import-rows', jobId], queryFn: () => listJobRows(jobId) })
  const [chosen, setChosen] = useState<Record<string, boolean>>({})
  const [outcome, setOutcome] = useState<string | null>(null)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['import-rows', jobId] })
    await queryClient.invalidateQueries({ queryKey: ['price-list-jobs'] })
    await queryClient.invalidateQueries({ queryKey: ['components'] })
  }

  const accept = useMutation({
    mutationFn: (ids: string[] | null) => acceptPriceRows(jobId, ids),
    onSuccess: async (r) => {
      setChosen({})
      setOutcome(
        `${r.applied} price${r.applied === 1 ? '' : 's'} updated${r.skipped > 0 ? `, ${r.skipped} row(s) skipped` : ''}.` +
          (r.remaining > 0 ? ` ${r.remaining} change(s) still waiting.` : ' Nothing left to accept.'),
      )
      await refresh()
    },
  })
  const discard = useMutation({
    mutationFn: () => discardImportJob(jobId, 'not wanted'),
    onSuccess: async () => { await refresh(); onClose() },
  })

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>What this list would change</h2>
        <button onClick={onClose}>Close</button>
      </div>

      {outcome && <p className="ok">{outcome}</p>}
      {accept.error && <p className="error">{String(accept.error)}</p>}
      {discard.error && <p className="error">{String(discard.error)}</p>}

      <Async query={rows} empty="This upload has no rows.">
        {(all) => {
          const changes = all.filter((r) => r.status === 'changed')
          const done = all.filter((r) => r.status === 'accepted')
          const attention = all.filter((r) => ['new', 'warning', 'rejected', 'skipped'].includes(r.status))
          const same = all.filter((r) => r.status === 'unchanged')
          const ticked = changes.filter((r) => chosen[r.id]).map((r) => r.id)

          return (
            <>
              {changes.length === 0 && done.length > 0 && (
                <p className="muted">Every price change on this list has been applied.</p>
              )}

              {changes.length > 0 && (
                <>
                  <h3 style={{ fontSize: '1rem' }}>Price changes ({changes.length})</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th></th><th>Part</th><th>Matched on</th>
                          <th className="right">Now</th><th className="right">New</th><th className="right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changes.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Accept ${r.raw.component_code ?? r.raw.key ?? 'row'}`}
                                checked={chosen[r.id] ?? false}
                                onChange={(e) => setChosen({ ...chosen, [r.id]: e.target.checked })}
                              />
                            </td>
                            <td>
                              <div>{r.raw.component_code ?? r.raw.key}</div>
                              <div className="muted" style={{ fontSize: '.8125rem' }}>
                                {r.raw.component_name ?? r.raw.description ?? ''}
                                {r.raw.is_placeholder && <span className="badge">was unpriced</span>}
                              </div>
                            </td>
                            <td className="muted" style={{ fontSize: '.8125rem' }}>{methodLabel(r.match_method)}</td>
                            <td className="right">{money(r.raw.old_price ?? null, r.raw.old_currency ?? '')}</td>
                            <td className="right">{money(r.raw.new_price ?? null, r.raw.new_currency ?? '')}</td>
                            <td className="right">{changeLabel(r.raw.change_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="row end" style={{ marginTop: '.5rem' }}>
                    <button onClick={() => discard.mutate()}>Discard this upload</button>
                    <button disabled={ticked.length === 0 || accept.isPending} onClick={() => accept.mutate(ticked)}>
                      Accept {ticked.length} ticked
                    </button>
                    <button className="primary" disabled={accept.isPending} onClick={() => accept.mutate(null)}>
                      Accept all {changes.length}
                    </button>
                  </div>
                </>
              )}

              {attention.length > 0 && (
                <>
                  <h3 style={{ fontSize: '1rem' }}>Needs a person ({attention.length})</h3>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Row</th><th>From the file</th><th>Why</th></tr></thead>
                      <tbody>
                        {attention.map((r) => (
                          <tr key={r.id}>
                            <td className="muted">{r.row_number ?? '—'}</td>
                            <td>
                              <div>{r.raw.key || '(no part number)'}</div>
                              <div className="muted" style={{ fontSize: '.8125rem' }}>{r.raw.description ?? ''}</div>
                            </td>
                            <td className="muted">{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {done.length > 0 && (
                <>
                  <h3 style={{ fontSize: '1rem' }}>Applied ({done.length})</h3>
                  <ul className="muted" style={{ fontSize: '.875rem' }}>
                    {done.map((r) => (
                      <li key={r.id}>{r.raw.component_code ?? r.raw.key}: {r.message}</li>
                    ))}
                  </ul>
                </>
              )}

              {same.length > 0 && (
                <p className="muted" style={{ fontSize: '.875rem' }}>
                  {same.length} row{same.length === 1 ? '' : 's'} already at the price the list quotes.
                </p>
              )}
            </>
          )
        }}
      </Async>
    </div>
  )
}

/** How the row was found, in words rather than a column name. */
function methodLabel(method: ImportRow['match_method']): string {
  switch (method) {
    case 'code': return 'our code'
    case 'part_number': return "maker's reference"
    case 'manufacturer_part_number': return 'make and reference'
    case 'part_number_loose': return 'reference, punctuation aside'
    default: return '—'
  }
}
