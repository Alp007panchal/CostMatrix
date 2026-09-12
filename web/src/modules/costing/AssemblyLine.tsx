import { useState } from 'react'
import { money } from '../../lib/format'
import { describeAnswers } from '../library/kit-parameters'
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
  sections,
  onQuantity,
  onRemove,
  onSection,
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
  /** The section names offered, for moving a kit to another part of the panel. */
  sections: string[]
  onQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  onSection: (id: string, section: string | null) => void
  onItemQuantity: (id: string, quantity: number) => void
  onItemRemove: (id: string) => void
  onHours: (id: string, hours: number) => void
}) {
  const [open, setOpen] = useState(line.kind === 'free')
  const isFree = line.kind === 'free'

  return (
    <>
      <tr>
        <td>
          <button onClick={() => setOpen((o) => !o)} style={{ padding: '.1rem .45rem', marginRight: '.4rem' }}>
            {open ? '▾' : '▸'}
          </button>
          {isFree ? <em>{line.name}</em> : `${line.code} — ${line.name}`}
          {/* What a parameterised kit was worked out from, frozen on the line. */}
          {Object.keys(line.parameters ?? {}).length > 0 && (
            <div className="muted" style={{ fontSize: '.75rem' }}>{describeAnswers(line.parameters)}</div>
          )}
          {editable && !isFree && (
            <select
              aria-label="Section"
              value={line.section ?? ''}
              style={{ marginLeft: '.5rem', fontSize: '.75rem', padding: '.1rem .2rem' }}
              onChange={(e) => onSection(line.id, e.target.value || null)}
            >
              <option value="">No section</option>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              {line.section && !sections.includes(line.section) && (
                <option value={line.section}>{line.section}</option>
              )}
            </select>
          )}
        </td>
        <td className="right">
          {isFree ? (
            <span className="muted">—</span>
          ) : editable ? (
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
          {isFree ? (
            <span className="muted">—</span>
          ) : (
            <>
              {money(totals?.labour_each ?? 0, label)}
              <div className="muted" style={{ fontSize: '.75rem' }}>{(totals?.hours_each ?? 0).toFixed(1)} h</div>
            </>
          )}
        </td>
        <td className="right">
          {money((totals?.material_total ?? 0) + (totals?.labour_total ?? 0), label)}
        </td>
        <td className="right">
          {editable && (isFree ? items.length === 0 : true) && (
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
                      {i.is_manual ? i.name : `${i.code} — ${i.name}`}
                      {i.is_manual && <span className="badge">typed</span>}
                      {i.uplift_pct != null && <span className="badge">+{i.uplift_pct}% uplift</span>}
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

            {!isFree && (
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
            )}
          </td>
        </tr>
      )}
    </>
  )
}
