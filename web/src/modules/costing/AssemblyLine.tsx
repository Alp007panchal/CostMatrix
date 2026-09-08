import { useState } from 'react'
import { money } from '../../lib/format'
import type {
  AssemblyTotals,
  CostingAssembly,
  CostingItem,
  CostingLabour,
} from '../../lib/database.types'

/**
 * One assembly inside a panel: its quantity, its cost, and — opened up — the
 * material and hours behind that cost. In a draft the quantities and hours can
 * be changed here; the source hours stay visible so a change is visible too.
 */
export function AssemblyLine({
  line,
  items,
  labour,
  totals,
  label,
  editable,
  processNames,
  onQuantity,
  onRemove,
  onItemQuantity,
  onItemRemove,
  onHours,
}: {
  line: CostingAssembly
  items: CostingItem[]
  labour: CostingLabour[]
  totals: AssemblyTotals | undefined
  label: string
  editable: boolean
  processNames: Record<string, string>
  onQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  onItemQuantity: (id: string, quantity: number) => void
  onItemRemove: (id: string) => void
  onHours: (id: string, hours: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr>
        <td>
          <button onClick={() => setOpen((o) => !o)} style={{ padding: '.1rem .45rem', marginRight: '.4rem' }}>
            {open ? '▾' : '▸'}
          </button>
          {line.code} — {line.name}
        </td>
        <td className="right">
          {editable ? (
            <input
              type="number"
              step="0.001"
              min="0.001"
              defaultValue={line.quantity}
              style={{ width: '5rem', textAlign: 'right' }}
              onBlur={(e) => {
                const q = Number(e.target.value)
                if (q > 0 && q !== line.quantity) onQuantity(line.id, q)
              }}
            />
          ) : (
            line.quantity
          )}
        </td>
        <td className="right">{money(totals?.material_each ?? 0, label)}</td>
        <td className="right">
          {money(totals?.labour_each ?? 0, label)}
          <div className="muted" style={{ fontSize: '.75rem' }}>{(totals?.hours_each ?? 0).toFixed(1)} h</div>
        </td>
        <td className="right">
          {money((totals?.material_total ?? 0) + (totals?.labour_total ?? 0), label)}
        </td>
        <td className="right">
          {editable && (
            <button className="danger" onClick={() => onRemove(line.id)}>
              Remove
            </button>
          )}
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--page)', padding: '.75rem 1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Make</th>
                  <th className="right">Qty</th>
                  <th className="right">Each</th>
                  <th className="right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">No material.</td>
                  </tr>
                )}
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.code} — {i.name}
                      {i.part_number && <div className="muted">{i.part_number}</div>}
                    </td>
                    <td>{i.manufacturer}</td>
                    <td className="right">
                      {editable ? (
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          defaultValue={i.quantity}
                          style={{ width: '5rem', textAlign: 'right' }}
                          onBlur={(e) => {
                            const q = Number(e.target.value)
                            if (q >= 0 && q !== i.quantity) onItemQuantity(i.id, q)
                          }}
                        />
                      ) : (
                        i.quantity
                      )}
                    </td>
                    <td className="right">{money(i.unit_price, label)}</td>
                    <td className="right">{money(i.quantity * i.unit_price, label)}</td>
                    <td className="right">
                      {editable && (
                        <button className="danger" onClick={() => onItemRemove(i.id)}>×</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table style={{ marginTop: '.75rem' }}>
              <thead>
                <tr>
                  <th>Labour</th>
                  <th className="right">Hours</th>
                  <th className="right">Library said</th>
                  <th className="right">Rate</th>
                  <th className="right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {labour.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">No labour.</td>
                  </tr>
                )}
                {labour.map((l) => {
                  const changed = l.source_hours != null && l.hours !== l.source_hours
                  return (
                    <tr key={l.id}>
                      <td>{processNames[l.process_type] ?? l.process_type}</td>
                      <td className="right">
                        {editable ? (
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            defaultValue={l.hours}
                            style={{ width: '5rem', textAlign: 'right' }}
                            onBlur={(e) => {
                              const h = Number(e.target.value)
                              if (h >= 0 && h !== l.hours) onHours(l.id, h)
                            }}
                          />
                        ) : (
                          l.hours
                        )}
                      </td>
                      <td className={`right ${changed ? '' : 'muted'}`}>
                        {l.source_hours ?? '—'}
                        {changed && <span className="badge">changed</span>}
                      </td>
                      <td className="right muted">{money(l.hourly_rate, label)}/h</td>
                      <td className="right">{money(l.hours * l.hourly_rate, label)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}
