import { useQuery } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { listHistory } from './api'

/** Who did what to this costing, and when. Written by the database, not by us. */
export function HistoryPanel({ costingId }: { costingId: string }) {
  const history = useQuery({
    queryKey: ['costing-history', costingId],
    queryFn: () => listHistory(costingId),
  })

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>History</h2>
      <Async query={history} empty="Nothing yet.">
        {(rows) => (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((row) => (
              <li key={row.id} style={{ padding: '.35rem 0', borderBottom: '1px solid var(--line)' }}>
                <div>{row.action}</div>
                <div className="muted" style={{ fontSize: '.75rem' }}>
                  {row.full_name ?? 'Someone no longer here'} · {new Date(row.at).toLocaleString('en-GB')}
                </div>
                {row.details && typeof row.details['comment'] === 'string' && (
                  <div className="muted" style={{ fontStyle: 'italic' }}>
                    “{row.details['comment']}”
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  )
}
