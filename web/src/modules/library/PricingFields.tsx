import { Field } from '../../ui/Async'
import { money } from '../../lib/format'
import type { EffectiveCurrencyFactor, EffectiveMaterialRate, PricingMode } from '../../lib/database.types'

/** The pricing half of the component form: purchase price and currency, or kilograms at a rate. */
export interface PricingValues {
  pricing_mode: PricingMode
  purchase_price: string
  purchase_currency: string
  weight_per_unit: string
  material_rate_code: string
}

/** 42 EUR × 200 → 8,400.00 KES: the landed price before any discount. */
export function landedKes(price: number, factor: EffectiveCurrencyFactor | undefined): number | null {
  if (!factor || !(price > 0)) return null
  return Math.round(price * factor.landed_factor * 100) / 100
}

export function PricingFields({
  values,
  unit,
  currencyLabel,
  materialRates,
  currencyFactors,
  onChange,
}: {
  values: PricingValues
  unit: string
  currencyLabel: string
  materialRates: EffectiveMaterialRate[]
  currencyFactors: EffectiveCurrencyFactor[]
  onChange: <K extends keyof PricingValues>(key: K, value: PricingValues[K]) => void
}) {
  const factor = currencyFactors.find((f) => f.currency_code === values.purchase_currency)
  const landed = landedKes(Number(values.purchase_price), factor)
  const chosenRate = materialRates.find((r) => r.code === values.material_rate_code)
  const weight = Number(values.weight_per_unit)
  const weightPreview =
    values.pricing_mode === 'weight_rate' && chosenRate && weight > 0
      ? money(weight * chosenRate.rate, currencyLabel)
      : null

  return (
    <>
      <Field label="How it is priced">
        <select
          value={values.pricing_mode}
          onChange={(e) => onChange('pricing_mode', e.target.value as PricingMode)}
        >
          <option value="fixed">A purchase price per {unit || 'unit'}</option>
          <option value="weight_rate">By weight, at a rate per kilogram</option>
        </select>
      </Field>

      {values.pricing_mode === 'fixed' ? (
        <>
          <div className="row">
            <div style={{ flex: 1 }}>
              <Field
                label={`Purchase price per ${unit || 'unit'}`}
                hint="what the supplier charges; leave blank to keep the part as an unpriced placeholder"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={values.purchase_price}
                  onChange={(e) => onChange('purchase_price', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ width: '9rem' }}>
              <Field label="Currency" hint="of the purchase price">
                <select
                  value={values.purchase_currency}
                  onChange={(e) => onChange('purchase_currency', e.target.value)}
                >
                  {currencyFactors.map((f) => (
                    <option key={f.currency_code} value={f.currency_code}>
                      {f.currency_code}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          {landed != null && factor && (
            <p className="muted">
              Lands at <strong>{money(landed, 'KES')}</strong> per {unit || 'unit'}
              {factor.currency_code !== 'KES' &&
                ` (× ${factor.landed_factor} KES per ${factor.currency_code}, landed)`}
              . Discounts and company currencies apply after that.
            </p>
          )}
        </>
      ) : (
        <>
          <Field label={`Kilograms per ${unit || 'unit'}`} hint="e.g. 2.688 for 30 x 10 mm copper bar">
            <input
              type="number"
              step="0.001"
              min="0"
              value={values.weight_per_unit}
              required
              onChange={(e) => onChange('weight_per_unit', e.target.value)}
            />
          </Field>
          <Field label="Priced at" hint="change the rate itself on the Rates screen">
            <select
              value={values.material_rate_code}
              onChange={(e) => onChange('material_rate_code', e.target.value)}
            >
              {materialRates.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name} — {money(r.rate, currencyLabel)} per {r.unit}
                </option>
              ))}
            </select>
          </Field>
          {weightPreview && (
            <p className="muted">
              At today&rsquo;s rate that is <strong>{weightPreview}</strong> per {unit || 'unit'}.
            </p>
          )}
        </>
      )}
    </>
  )
}
