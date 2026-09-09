import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import { listCategories } from '../library/api'
import { listBomItems } from './api'
import { groupBom } from './bom'
import { downloadBomCsv, downloadBomXlsx } from './bom-io'

/**
 * The four bills of materials for a costing, one per category, as Excel or
 * CSV. Quantities are already multiplied through assembly and panel
 * quantities by the database view, so the purchasing figure is the figure.
 */
export function BomExports({ costingId, costingNo, revisionNo, currencyLabel }: {
  costingId: string
  costingNo: string
  revisionNo: number
  currencyLabel: string
}) {
  const items = useQuery({ queryKey: ['bom', costingId], queryFn: () => listBomItems(costingId) })
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const names = Object.fromEntries((categories.data ?? []).map((c) => [c.code, c.name]))

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Bills of materials</h2>
      <p className="muted">
        One list per category, quantities multiplied through kit and panel quantities.
        Excel keeps the formatting; CSV opens anywhere.
      </p>
      <Async query={items} empty="Nothing in this costing yet.">
        {(rows) => {
          const groups = groupBom(rows, names)
          return (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Category</th><th className="right">Lines</th><th className="right">Material</th><th className="right"></th></tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.category_code} className={g.rows.length === 0 ? 'inactive' : undefined}>
                        <td>{g.category_name}</td>
                        <td className="right">{g.rows.length}</td>
                        <td className="right">{money(g.total, currencyLabel)}</td>
                        <td className="right">
                          <button
                            disabled={g.rows.length === 0 || busy !== null}
                            onClick={() => {
                              setError(null); setBusy(g.category_code)
                              downloadBomXlsx([g], costingNo, revisionNo, currencyLabel)
                                .catch((e: unknown) => setError(String(e)))
                                .finally(() => setBusy(null))
                            }}
                          >
                            {busy === g.category_code ? '…' : 'Excel'}
                          </button>{' '}
                          <button disabled={g.rows.length === 0} onClick={() => downloadBomCsv(g, costingNo, revisionNo)}>CSV</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row end" style={{ marginTop: '.5rem' }}>
                <button
                  className="primary"
                  disabled={rows.length === 0 || busy !== null}
                  onClick={() => {
                    setError(null); setBusy('all')
                    downloadBomXlsx(groups.filter((g) => g.rows.length > 0), costingNo, revisionNo, currencyLabel)
                      .catch((e: unknown) => setError(String(e)))
                      .finally(() => setBusy(null))
                  }}
                >
                  {busy === 'all' ? 'Building…' : 'All four as one workbook'}
                </button>
              </div>
              {error && <p className="error">{error}</p>}
            </>
          )
        }}
      </Async>
    </div>
  )
}
