import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { Async } from '../../ui/Async'
import { listProcessTypes } from './api'
import { listEffectiveCurrencyFactors, listEffectiveMaterialRates, listLabourRates, listMaterialRates, setLabourRate } from './rates-api'
import { MaterialRateRow } from './MaterialRateRow'
import { CurrencyFactorRow, NewCurrencyRow } from './CurrencyFactorRow'

/**
 * What an hour costs, what a kilogram of copper costs, and what a euro costs
 * once it has landed. These three tables of numbers are what turn hours,
 * weights and purchase prices into money, so they sit together.
 */
export function RatesPage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()

  const processTypes = useQuery({ queryKey: ['process-types'], queryFn: listProcessTypes })
  const labourRates = useQuery({ queryKey: ['labour-rates'], queryFn: listLabourRates })
  const effective = useQuery({
    queryKey: ['material-rates-effective'],
    queryFn: listEffectiveMaterialRates,
  })
  const rawRates = useQuery({ queryKey: ['material-rates'], queryFn: listMaterialRates })
  const factors = useQuery({
    queryKey: ['currency-factors-effective'],
    queryFn: listEffectiveCurrencyFactors,
  })

  if (!company) return null

  const factorsSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ['currency-factors-effective'] })
    void queryClient.invalidateQueries({ queryKey: ['components'] })
  }

  return (
    <>
      <h1>Rates</h1>
      <p className="muted">
        Labour is hours multiplied by these rates — never a percentage of the material cost.
        Changing a rate affects new costings only: existing ones keep the rates they froze.
      </p>

      <LabourRates
        companyId={company.id}
        currencyLabel={company.currency_label}
        processTypes={processTypes.data ?? []}
        rates={labourRates.data ?? []}
        loading={labourRates.isPending}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['labour-rates'] })}
      />

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Material rates</h2>
        <p className="muted">
          Busbar is priced by weight: kilograms per metre times the rate below. The master copper
          rate is held in EUR per kg and lands through the EUR factor (15 × 200 = 3,000 KES/kg).
        </p>
        <div className="table-wrap">
          <Async query={effective} empty="No material rates.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th className="right">Your rate</th>
                    <th className="right">Lands at</th>
                    <th>Source</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <MaterialRateRow
                      key={row.code}
                      code={row.code}
                      name={row.name}
                      unit={row.unit}
                      rate={row.rate}
                      source={row.source}
                      masterRateKes={row.master_rate_kes}
                      kesPerKg={row.kes_per_kg}
                      rateEntered={row.rate_entered}
                      rateCurrency={row.currency_code}
                      masterRate={row.master_rate}
                      masterCurrency={row.master_currency}
                      companyId={company.id}
                      currencyCode={company.currency_code}
                      currencyLabel={company.currency_label}
                      isMasterAdmin={isMasterAdmin}
                      masterRateId={
                        rawRates.data?.find((r) => r.company_id === null && r.code === row.code)?.id
                      }
                      onSaved={() => {
                        void queryClient.invalidateQueries({ queryKey: ['material-rates-effective'] })
                        void queryClient.invalidateQueries({ queryKey: ['material-rates'] })
                        void queryClient.invalidateQueries({ queryKey: ['components'] })
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Currency factors</h2>
        <p className="muted">
          A purchase price lands in KES as price × the currency&rsquo;s landed factor: KES per 1 unit
          with exchange rate, freight, duty and handling in one number (200 per EUR today). Master
          figures apply unless you set your own for a currency.
        </p>
        <div className="table-wrap">
          <Async query={factors} empty="No currencies yet.">
            {(rows) => (
              <table>
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th className="right">KES per 1, landed</th>
                    <th>Source</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <CurrencyFactorRow
                      key={row.currency_code}
                      row={row}
                      companyId={company.id}
                      isMasterAdmin={isMasterAdmin}
                      onSaved={factorsSaved}
                    />
                  ))}
                  {isMasterAdmin && <NewCurrencyRow onSaved={factorsSaved} />}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>
    </>
  )
}

function LabourRates({
  companyId,
  currencyLabel,
  processTypes,
  rates,
  loading,
  onSaved,
}: {
  companyId: string
  currencyLabel: string
  processTypes: { code: string; name: string }[]
  rates: { company_id: string | null; process_type: string; hourly_rate: number }[]
  loading: boolean
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  const own = (code: string) =>
    rates.find((r) => r.company_id === companyId && r.process_type === code)
  const master = (code: string) =>
    rates.find((r) => r.company_id === null && r.process_type === code)

  useEffect(() => {
    if (rates.length === 0) return
    setDraft(
      Object.fromEntries(
        processTypes.map((p) => [p.code, String(own(p.code)?.hourly_rate ?? '')]),
      ),
    )
    // Rebuild only when the rates actually change.
  }, [rates, processTypes.length])

  const save = useMutation({
    mutationFn: async () => {
      for (const p of processTypes) {
        const value = Number(draft[p.code])
        if (!Number.isFinite(value) || draft[p.code] === '') continue
        if (own(p.code)?.hourly_rate === value) continue
        await setLabourRate(companyId, p.code, value)
      }
    },
    onSuccess: () => {
      setSaved(true)
      onSaved()
    },
  })

  if (loading) return <p className="empty">Loading…</p>

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Labour, per hour</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kind of work</th>
              <th className="right">Your rate ({currencyLabel})</th>
              <th className="right">Suggested</th>
            </tr>
          </thead>
          <tbody>
            {processTypes.map((p) => (
              <tr key={p.code}>
                <td>{p.name}</td>
                <td className="right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={{ maxWidth: '9rem', textAlign: 'right' }}
                    value={draft[p.code] ?? ''}
                    placeholder="not set"
                    onChange={(e) => {
                      setSaved(false)
                      setDraft((d) => ({ ...d, [p.code]: e.target.value }))
                    }}
                  />
                </td>
                <td className="right muted">
                  {master(p.code) ? `KES ${master(p.code)?.hourly_rate}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {save.error && <p className="error">{String(save.error)}</p>}
      {saved && <p className="ok">Saved.</p>}

      <div className="row end">
        <button className="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save rates'}
        </button>
      </div>
    </div>
  )
}
