import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import type { KitGroupLabourVariance, UnattributedLabourHours } from '../../lib/database.types'
import { applyLabourSuggestion, listKitGroupVariance, listUnattributedHours } from './labour-variance-api'
import { byHoursAtStake, groupLabel, varianceSentence, weigh, weightSentence, worthChanging } from './labour-variance'

/**
 * Where the labour standards are wrong (roadmap 2.8). Built from the hours
 * recorded against finished jobs: a panel's hours are shared across its kit lines
 * in proportion to the estimate, because the shop records hours per board.
 *
 * Nothing here changes a standard by itself. **Apply** writes one group's hours,
 * and only a master administrator (for a master group) or a company administrator
 * (for its own) is allowed to — the database decides, not this screen.
 */
export function LabourVariancePage() {
  const queryClient = useQueryClient()
  const rows = useQuery({ queryKey: ['labour-variance-groups'], queryFn: listKitGroupVariance })
  const stray = useQuery({ queryKey: ['labour-unattributed'], queryFn: listUnattributedHours })
  const apply = useMutation({
    mutationFn: (row: KitGroupLabourVariance) =>
      applyLabourSuggestion(row.kit_group_id as string, row.process_type),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['labour-variance-groups'] }),
  })

  return (
    <>
      <h1>Labour variance</h1>
      <p className="muted">
        What the shop floor took against what the kits were costed at, by kit group and process. A
        board's hours are shared across its kits in proportion to the estimate, because hours are
        recorded per board — so read a row with its sample size beside it. Nothing on this screen
        changes a standard until you press <strong>Apply</strong>, and an existing costing never
        changes at all: it keeps the hours it was priced on.
      </p>

      {apply.error && <p className="error">{String(apply.error)}</p>}
      {apply.data !== undefined && (
        <p className="muted">Standard updated to {apply.data.toFixed(2)} hours.</p>
      )}

      <Async query={rows} empty="No actual hours have been recorded against a job yet. Record them on a costing, under “Hours actually worked”.">
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Kit group</th><th>Process</th>
                  <th className="right">Standard</th><th className="right">Per kit, actual</th>
                  <th>How it went</th><th>Based on</th><th />
                </tr>
              </thead>
              <tbody>
                {byHoursAtStake(list).map((row) => (
                  <tr key={`${row.kit_group_id}-${row.process_type}`}>
                    <td>{groupLabel(row)}</td>
                    <td>{row.process_name}</td>
                    <td className="right">
                      {row.standard_hours === null
                        ? <span className="muted">none</span>
                        : `${Number(row.standard_hours).toFixed(2)} h`}
                      <div className="muted" style={{ fontSize: '.75rem' }}>
                        costed at {Number(row.estimated_hours_per_kit).toFixed(2)} h
                      </div>
                    </td>
                    <td className="right">
                      <strong>{Number(row.actual_hours_per_kit).toFixed(2)} h</strong>
                      <div className="muted" style={{ fontSize: '.75rem' }}>
                        {Number(row.actual_hours).toFixed(2)} h over {Number(row.kit_units)} kits
                      </div>
                    </td>
                    <td>{varianceSentence(row)}</td>
                    <td className={weigh(row) === 'thin' ? 'muted' : undefined}>{weightSentence(row)}</td>
                    <td className="right">
                      {row.kit_group_id && worthChanging(row) && (
                        <button
                          disabled={apply.isPending}
                          title={`Set this kit group's ${row.process_name.toLowerCase()} standard to ${Number(row.suggested_hours).toFixed(2)} hours`}
                          onClick={() => {
                            if (window.confirm(
                              `Set ${groupLabel(row)} ${row.process_name.toLowerCase()} hours to ${Number(row.suggested_hours).toFixed(2)}? ` +
                              'New costings will use it; existing costings keep the hours they froze.',
                            )) apply.mutate(row)
                          }}
                        >
                          Apply {Number(row.suggested_hours).toFixed(2)} h
                        </button>
                      )}
                      {row.kit_group_id && !worthChanging(row) && (
                        <span className="muted">as costed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>

      <UnattributedHours rows={stray.data ?? []} />
    </>
  )
}

/**
 * Every hour recorded is either shared out above or named here. A panel costed at
 * no hours of that kind gives the allocation nothing to divide by — a board of
 * loose parts, or a kit group whose standard is still blank — and hours that were
 * worked must not vanish because the report has nowhere to put them.
 */
function UnattributedHours({ rows }: { rows: UnattributedLabourHours[] }) {
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + Number(row.hours), 0)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Hours no kit group can be blamed for</h2>
      <p className="muted">
        {total.toFixed(2)} hours were recorded against boards costed at none of that work, so there
        was no estimate to share them out in proportion to. They are in none of the figures above.
        Usually it is a board of loose parts, or a kit group whose standard hours are still blank —
        fill those in on <strong>Kits → kit groups</strong> and the hours join the report.
      </p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Board</th><th>Process</th><th className="right">Hours</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.panel_id}-${row.process_type}`}>
                <td>{row.panel_name}</td>
                <td className="muted">{row.process_name}</td>
                <td className="right">{Number(row.hours).toFixed(2)} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
