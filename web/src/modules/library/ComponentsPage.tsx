import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import type { ComponentPrice } from '../../lib/database.types'
import { listCategories, listComponentPrices, setComponentActive } from './api'
import { listEffectiveCurrencyFactors, listEffectiveMaterialRates } from './rates-api'
import { ComponentForm } from './ComponentForm'
import { PriceHistory } from './PriceHistory'
import { ExcelPanel } from './ExcelPanel'

/**
 * Everything this company can put in a panel: the master list plus its own.
 * Prices are what this company would pay, after its discount and in its own
 * currency, so nobody has to do that arithmetic in their head.
 */
export function ComponentsPage() {
  const { company, isMasterAdmin, hasRole } = useSession()
  const queryClient = useQueryClient()

  const components = useQuery({ queryKey: ['components'], queryFn: listComponentPrices })
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories })
  const rates = useQuery({ queryKey: ['material-rates-effective'], queryFn: listEffectiveMaterialRates })
  const factors = useQuery({ queryKey: ['currency-factors-effective'], queryFn: listEffectiveCurrencyFactors })

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<ComponentPrice | 'new' | null>(null)
  const [historyFor, setHistoryFor] = useState<ComponentPrice | null>(null)
  const [excelOpen, setExcelOpen] = useState(false)

  const canEdit = isMasterAdmin || hasRole('company_admin')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['components'] })

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      setComponentActive(input.id, input.isActive),
    onSuccess: refresh,
  })

  const rows = useMemo(() => {
    const all = components.data ?? []
    const needle = search.trim().toLowerCase()
    return all.filter((c) => {
      if (!showInactive && !c.is_active) return false
      if (category && c.category_code !== category) return false
      if (!needle) return true
      return [c.code, c.name, c.manufacturer, c.part_number]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    })
  }, [components.data, search, category, showInactive])

  if (!company) return null

  return (
    <>
      <div className="spread">
        <h1>Components</h1>
        {canEdit && (
          <div className="row">
            <button onClick={() => setExcelOpen((o) => !o)}>Excel</button>
            <button className="primary" onClick={() => setEditing('new')}>
              Add component
            </button>
          </div>
        )}
      </div>

      {excelOpen && (
        <ExcelPanel
          components={components.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setExcelOpen(false)}
          onApplied={() => void refresh()}
        />
      )}

      <p className="muted">
        Purchase is what the supplier charges, in its currency. Your price is what {company.name}{' '}
        pays: the purchase price landed into KES (exchange rate × landed factor, see Rates), less
        your {company.discount_pct}% discount on master parts, in {company.currency_label}. Items
        priced by weight are worked out from the rate per kilogram.
      </p>

      <div className="card">
        <div className="row">
          <input
            placeholder="Search code, name, make or part number"
            value={search}
            style={{ flex: 2, minWidth: '14rem' }}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={category}
            style={{ flex: 1, minWidth: '10rem' }}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="row" style={{ gap: '.35rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show retired
          </label>
        </div>
      </div>

      {toggleActive.error && <p className="error">{String(toggleActive.error)}</p>}

      <div className="card">
        <div className="table-wrap">
          <Async query={components} empty="No components yet.">
            {() =>
              rows.length === 0 ? (
                <p className="empty">Nothing matches that search.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Make</th>
                      <th>Category</th>
                      <th>Unit</th>
                      <th className="right">Purchase</th>
                      <th className="right">Your price</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className={c.is_active ? undefined : 'inactive'}>
                        <td>
                          {c.code}
                          {c.source === 'company' && <span className="badge">Yours</span>}
                        </td>
                        <td>
                          {c.name}
                          {c.part_number && <div className="muted">{c.part_number}</div>}
                        </td>
                        <td>{c.manufacturer}</td>
                        <td>{c.category_name}</td>
                        <td>{c.unit}</td>
                        <td className="right muted">
                          {c.pricing_mode === 'weight_rate'
                            ? 'by weight'
                            : c.raw_price != null
                              ? `${c.purchase_currency} ${c.raw_price}`
                              : <span className="error">no price</span>}
                        </td>
                        <td className="right">
                          {money(c.unit_price, company.currency_label)}
                          {c.pricing_mode === 'weight_rate' && (
                            <div className="muted">{c.weight_per_unit} kg per {c.unit}</div>
                          )}
                        </td>
                        <td className="right">
                          <button onClick={() => setHistoryFor(c)}>History</button>{' '}
                          {canEditThis(c, isMasterAdmin, hasRole('company_admin')) && (
                            <>
                              <button onClick={() => setEditing(c)}>Edit</button>{' '}
                              <button
                                onClick={() =>
                                  toggleActive.mutate({ id: c.id, isActive: !c.is_active })
                                }
                              >
                                {c.is_active ? 'Retire' : 'Restore'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </Async>
        </div>
        <p className="muted" style={{ fontSize: '.8125rem' }}>
          {rows.length} of {(components.data ?? []).length} shown. Components are retired, never
          deleted, so old costings still explain themselves.
        </p>
      </div>

      {editing && (
        <ComponentForm
          existing={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          materialRates={rates.data ?? []}
          currencyFactors={factors.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      )}

      {historyFor && <PriceHistory component={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  )
}

/** A master row belongs to the master admin; a company's own to its admin. */
function canEditThis(c: ComponentPrice, isMasterAdmin: boolean, isCompanyAdmin: boolean): boolean {
  return c.company_id === null ? isMasterAdmin : isCompanyAdmin
}
