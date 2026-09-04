import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { longDate, money } from '../../lib/format'
import type { ComponentPrice } from '../../lib/database.types'
import { listPriceHistory } from './api'

/** Every price this component has had, and when it changed. */
export function PriceHistory({
  component,
  onClose,
}: {
  component: ComponentPrice
  onClose: () => void
}) {
  const { company } = useSession()
  const history = useQuery({
    queryKey: ['price-history', component.id],
    queryFn: () => listPriceHistory(component.id),
  })

  const label = component.company_id === null ? 'KES' : (company?.currency_label ?? 'KES')

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ marginTop: 0 }}>
          Price history — {component.code}
        </h2>
        <button onClick={onClose}>Close</button>
      </div>

      <p className="muted">
        {component.company_id === null
          ? 'Master prices are held in KES, before your discount.'
          : `Your own component, priced in ${label}.`}
      </p>

      <div className="table-wrap">
        <Async query={history} empty="No changes recorded — this is still its first price.">
          {(rows) => (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th className="right">From</th>
                  <th className="right">To</th>
                  <th className="right">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const change =
                    row.old_price && row.old_price > 0
                      ? ((row.new_price - row.old_price) / row.old_price) * 100
                      : null
                  return (
                    <tr key={row.id}>
                      <td>{longDate(row.changed_at)}</td>
                      <td className="right">
                        {row.old_price == null ? '—' : money(row.old_price, label)}
                      </td>
                      <td className="right">{money(row.new_price, label)}</td>
                      <td className="right">
                        {change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Async>
      </div>
    </div>
  )
}
