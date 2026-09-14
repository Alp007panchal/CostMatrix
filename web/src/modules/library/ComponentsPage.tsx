import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { money } from '../../lib/format'
import type { ComponentPrice } from '../../lib/database.types'
import { PageHeader } from '../../app/PageHeader'
import { todayIso } from '../dashboard/attention'
import { priceChip } from './price-age'
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

  const today = todayIso()
  if (!company) return null

  return (
    <>
      <PageHeader
        title="Components"
        meta={`${rows.length} of ${(components.data ?? []).length} · prices in ${company.currency_label}`}
      >
        {canEdit && (
          <>
            <button onClick={() => setExcelOpen((o) => !o)}>Excel</button>
            <button className="btn" onClick={() => setEditing('new')}>
              Add component
            </button>
          </>
        )}
      </PageHeader>

      {excelOpen && (
        <ExcelPanel
          components={components.data ?? []}
          categories={categories.data ?? []}
          onClose={() => setExcelOpen(false)}
          onApplied={() => void refresh()}
        />
      )}

      <p className="intro">
        Purchase is what the supplier charges, in its currency. Your price is what {company.name}{' '}
        pays: the purchase price landed into KES (exchange rate × landed factor, see Rates), less
        your {company.discount_pct}% discount on master parts, in {company.currency_label}. Items
        priced by weight are worked out from the rate per kilogram.
      </p>

      <div className="filters">
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
        <span className="chip">{rows.length} shown</span>
      </div>

      {toggleActive.error && <p className="error">{String(toggleActive.error)}</p>}

      <div className="grid2">
        <div className="panel flush">
          <div className="table-wrap">
            <Async query={components} empty="No components yet.">
              {() =>
                rows.length === 0 ? (
                  <p className="empty">Nothing matches that search.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Part no.</th>
                        <th>Description</th>
                        <th className="right">Purchase</th>
                        <th className="right">Your price</th>
                        <th>Price</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const chip = priceChip(c, today)
                        return (
                          <tr
                            key={c.id}
                            className={rowClass(c, editing)}
                            onClick={() => canEditThis(c, isMasterAdmin, hasRole('company_admin')) && setEditing(c)}
                          >
                            <td className="mono">
                              {c.code}
                              {c.source === 'company' && <span className="sub">yours</span>}
                            </td>
                            <td>
                              {c.name}
                              <span className="sub">
                                {[c.category_name, c.manufacturer, c.part_number].filter(Boolean).join(' · ')}
                              </span>
                            </td>
                            <td className="right muted">
                              {c.pricing_mode === 'weight_rate'
                                ? 'by weight'
                                : c.raw_price != null
                                  ? `${c.purchase_currency} ${c.raw_price}`
                                  : '—'}
                            </td>
                            <td className="right">
                              {c.unit_price == null
                                ? <span className="muted" title="Set a purchase price to cost this part">—</span>
                                : money(c.unit_price, company.currency_label)}
                              {c.pricing_mode === 'weight_rate' && (
                                <span className="sub">{c.weight_per_unit} kg per {c.unit}</span>
                              )}
                            </td>
                            <td>
                              <span className={`chip ${chip.tone}`}>{chip.text}</span>
                            </td>
                            <td className="right">
                              <button className="ghost small" onClick={(e) => { e.stopPropagation(); setHistoryFor(c) }}>
                                History
                              </button>{' '}
                              {canEditThis(c, isMasterAdmin, hasRole('company_admin')) && (
                                <button
                                  className="ghost small"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleActive.mutate({ id: c.id, isActive: !c.is_active })
                                  }}
                                >
                                  {c.is_active ? 'Retire' : 'Restore'}
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              }
            </Async>
          </div>
          <p className="muted" style={{ fontSize: '.8125rem', padding: '10px 20px 14px', margin: 0 }}>
            {rows.length} of {(components.data ?? []).length} shown. Components are retired, never
            deleted, so old costings still explain themselves.
          </p>
        </div>

        {/* Beside the list, not on a page of its own (§4 rule 3): a part is
            usually changed while comparing it with the ones around it. */}
        <div>
          {editing ? (
            <ComponentForm
              key={editing === 'new' ? 'new' : editing.id}
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
          ) : (
            <div className="panel">
              <p className="muted" style={{ margin: 0 }}>
                Click a part to see and change it here.
              </p>
            </div>
          )}
        </div>
      </div>

      {historyFor && <PriceHistory component={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  )
}

/** The row being edited is marked, so the form beside the list is never orphaned. */
function rowClass(c: ComponentPrice, editing: ComponentPrice | 'new' | null): string | undefined {
  const selected = editing !== null && editing !== 'new' && editing.id === c.id
  return [c.is_active ? '' : 'inactive', selected ? 'sel' : ''].filter(Boolean).join(' ') || undefined
}

/** A master row belongs to the master admin; a company's own to its admin. */
function canEditThis(c: ComponentPrice, isMasterAdmin: boolean, isCompanyAdmin: boolean): boolean {
  return c.company_id === null ? isMasterAdmin : isCompanyAdmin
}
