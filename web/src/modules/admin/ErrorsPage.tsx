import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { listErrorReports } from './api'
import { kindLabel, nothingWrong, orderReports, summary, timesLabel, whereLabel } from './error-reports'

const DAYS = 30

/**
 * What has gone wrong, for whoever it went wrong for. Reports arrive on their
 * own (migration 0124); nobody has to send one, which is the point — most
 * people never do.
 */
export function ErrorsPage() {
  const { isMasterAdmin } = useSession()
  const reports = useQuery({ queryKey: ['error-reports'], queryFn: () => listErrorReports(DAYS) })

  return (
    <>
      <h1>What has gone wrong</h1>
      <p className="muted">
        Screens that broke in the last {DAYS} days, recorded by the app itself. Reports older than
        ninety days delete themselves.
        {isMasterAdmin && ' As the master administrator you see every company here.'}
      </p>

      <Async query={reports} empty={<p>{nothingWrong(DAYS)}</p>}>
        {(rows) => {
          const ordered = orderReports(rows)
          return (
            <>
              <p className="muted">{summary(ordered)}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>What happened</th>
                      <th>Where</th>
                      <th>Who</th>
                      {isMasterAdmin && <th>Company</th>}
                      <th>How often</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div>{kindLabel(row.kind)}</div>
                          <code className="muted">{row.message}</code>
                        </td>
                        <td>{whereLabel(row.path)}</td>
                        <td>{row.full_name ?? '—'}</td>
                        {isMasterAdmin && <td>{row.company_name}</td>}
                        <td>{timesLabel(row)}</td>
                        <td>{new Date(row.last_seen_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">
                Send me the wording of one of these and what the person was doing, and it is usually
                enough to find it.
              </p>
            </>
          )
        }}
      </Async>
    </>
  )
}
