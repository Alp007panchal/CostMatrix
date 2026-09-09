import { money, percent } from '../../lib/format'
import type { BomItem, Costing, CostingTotals, OptionTotals } from '../../lib/database.types'
import { groupBom } from './bom'

/**
 * The numbers, straight from the database views. Nothing here is calculated;
 * the formula lives in one place in Postgres, and this only shows the result.
 */
export function TotalsPanel({
  costing,
  totals,
  optionTotals,
  bom,
  categoryNames,
}: {
  costing: Costing
  totals: CostingTotals | null
  optionTotals: OptionTotals[]
  bom: BomItem[]
  categoryNames: Record<string, string>
}) {
  const label = costing.currency_label
  const hasOptions = optionTotals.some((o) => o.option_label !== '')
  // Material by category, as the old costing sheets subtotalled it. From the
  // BOM view: quantities already multiplied through kit and panel quantities.
  const byCategory = groupBom(bom, categoryNames).filter((g) => g.rows.length > 0)

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Totals</h2>

      <table>
        <tbody>
          <Row label="Material cost" value={money(totals?.material_cost ?? 0, label)} muted />
          {byCategory.map((g) => (
            <Row key={g.category_code} label={`— ${g.category_name}`} value={money(g.total, label)} muted small />
          ))}
          <Row label="Labour cost" value={money(totals?.labour_cost ?? 0, label)} muted />
          <Row label="Hours" value={(totals?.hours ?? 0).toFixed(1)} muted />
        </tbody>
      </table>

      {hasOptions && (
        <>
          <h3 style={{ fontSize: '.9rem', margin: '1rem 0 .4rem' }}>Per option</h3>
          <table>
            <tbody>
              {optionTotals.map((o) => (
                <Row
                  key={o.option_label}
                  label={o.option_label || 'Base offer'}
                  value={money(o.grand_total, label)}
                  hint={`${money(o.subtotal, label)} + VAT ${money(o.tax, label)}`}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      <table style={{ marginTop: '1rem' }}>
        <tbody>
          <Row label="Subtotal" value={money(totals?.subtotal ?? 0, label)} />
          <Row label={`VAT ${percent(costing.tax_pct)}`} value={money(totals?.tax ?? 0, label)} />
          <Row label="Grand total" value={money(totals?.grand_total ?? 0, label)} strong />
        </tbody>
      </table>

      <details style={{ marginTop: '1rem' }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>
          Frozen settings
        </summary>
        <table style={{ marginTop: '.5rem' }}>
          <tbody>
            <Row label="Material margin" value={percent(costing.material_margin_pct)} muted />
            <Row label="Labour margin" value={percent(costing.labour_margin_pct)} muted />
            <Row label="Negotiation margin" value={percent(costing.negotiation_margin_pct)} muted />
            <Row label="Discount on master prices" value={percent(costing.discount_pct)} muted />
            <Row label="Rounded up to" value={money(costing.price_rounding_step, label)} muted />
            {costing.currency_code !== 'KES' && (
              <Row label="Exchange rate" value={`${costing.exchange_rate} KES per ${costing.currency_code}`} muted />
            )}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: '.75rem' }}>
          Copied from the company when this costing was created. Changing the company&rsquo;s
          settings later does not change this costing.
        </p>
      </details>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
  muted,
  strong,
  small,
}: {
  label: string
  value: string
  hint?: string
  muted?: boolean
  strong?: boolean
  small?: boolean
}) {
  return (
    <tr style={small ? { fontSize: '.8125rem' } : undefined}>
      <td className={muted ? 'muted' : undefined} style={{ border: 0, padding: '.2rem 0', paddingLeft: small ? '.75rem' : 0 }}>
        {label}
        {hint && <div className="muted" style={{ fontSize: '.75rem' }}>{hint}</div>}
      </td>
      <td
        className="right"
        style={{ border: 0, padding: '.2rem 0', fontWeight: strong ? 650 : undefined }}
      >
        {value}
      </td>
    </tr>
  )
}
