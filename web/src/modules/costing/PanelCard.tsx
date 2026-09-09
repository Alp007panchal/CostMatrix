import { useState } from 'react'
import { money } from '../../lib/format'
import type {
  Assembly,
  AssemblyTotals,
  CostingAssembly,
  CostingItem,
  CostingLabour,
  CostingPanel,
  PanelPrice,
} from '../../lib/database.types'
import { AssemblyLine } from './AssemblyLine'

interface Handlers {
  onPanelChange: (id: string, changes: Partial<CostingPanel>) => void
  onPanelRemove: (id: string) => void
  onAddAssembly: (panelId: string, assemblyId: string, quantity: number) => Promise<void>
  onAssemblyQuantity: (id: string, quantity: number) => void
  onAssemblyRemove: (id: string) => void
  onItemQuantity: (id: string, quantity: number) => void
  onItemRemove: (id: string) => void
  onHours: (id: string, hours: number) => void
}

/** One panel: its details, its price, and the assemblies it is made of. */
export function PanelCard({
  panel,
  price,
  assemblies,
  items,
  labour,
  assemblyTotals,
  library,
  label,
  editable,
  processNames,
  handlers,
}: {
  panel: CostingPanel
  price: PanelPrice | undefined
  assemblies: CostingAssembly[]
  items: CostingItem[]
  labour: CostingLabour[]
  assemblyTotals: AssemblyTotals[]
  library: Assembly[]
  label: string
  editable: boolean
  processNames: Record<string, string>
  handlers: Handlers
}) {
  const [showDetails, setShowDetails] = useState(false)
  const totalsById = new Map(assemblyTotals.map((t) => [t.costing_assembly_id, t]))

  const field = (key: keyof CostingPanel, value: string | number | null) =>
    handlers.onPanelChange(panel.id, { [key]: value })

  return (
    <div className="card">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="row">
            {editable ? (
              <input
                defaultValue={panel.name}
                style={{ fontWeight: 650, fontSize: '1.05rem', flex: 2, minWidth: '12rem' }}
                onBlur={(e) => e.target.value.trim() && e.target.value !== panel.name && field('name', e.target.value.trim())}
              />
            ) : (
              <h2 style={{ margin: 0 }}>{panel.name}</h2>
            )}
            <label className="row" style={{ gap: '.3rem' }}>
              <span className="muted">Qty</span>
              {editable ? (
                <input
                  type="number"
                  step="1"
                  min="1"
                  defaultValue={panel.quantity}
                  style={{ width: '4.5rem' }}
                  onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== panel.quantity && field('quantity', Number(e.target.value))}
                />
              ) : (
                <strong>{panel.quantity}</strong>
              )}
              <span className="muted">{panel.uom}</span>
            </label>
          </div>
          <button
            onClick={() => setShowDetails((s) => !s)}
            style={{ marginTop: '.4rem', fontSize: '.8125rem' }}
          >
            {showDetails ? 'Hide details' : 'Details: tag, option, description'}
          </button>
        </div>

        <div style={{ textAlign: 'right', minWidth: '11rem' }}>
          <div className="muted" style={{ fontSize: '.8125rem' }}>Price each</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 650 }}>
            {money(price?.unit_price ?? 0, label)}
          </div>
          <div className="muted" style={{ fontSize: '.8125rem' }}>
            × {panel.quantity} = {money(price?.line_total ?? 0, label)}
          </div>
          {editable && (
            <button className="danger" style={{ marginTop: '.5rem' }} onClick={() => handlers.onPanelRemove(panel.id)}>
              Remove panel
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <div style={{ marginTop: '.75rem', display: 'grid', gap: '.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
          <Detail label="Tag" value={panel.tag} editable={editable} onCommit={(v) => field('tag', v)} />
          <Detail label="Option" hint="e.g. Option 1" value={panel.option_label} editable={editable} onCommit={(v) => field('option_label', v)} />
          <Detail label="Unit" value={panel.uom} editable={editable} onCommit={(v) => field('uom', v || 'PC')} />
          <Detail label="Enclosure" hint="e.g. 2100(H)×800(W)×800(D)" value={panel.enclosure_dimensions} editable={editable} onCommit={(v) => field('enclosure_dimensions', v)} />
          <div style={{ gridColumn: '1 / -1' }}>
            <span className="muted" style={{ fontSize: '.8125rem' }}>Technical description (printed on the quotation)</span>
            {editable ? (
              <textarea
                defaultValue={panel.technical_description ?? ''}
                style={{ minHeight: '7rem' }}
                onBlur={(e) => e.target.value !== (panel.technical_description ?? '') && field('technical_description', e.target.value || null)}
              />
            ) : (
              <p style={{ whiteSpace: 'pre-wrap' }}>{panel.technical_description || <span className="muted">None</span>}</p>
            )}
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginTop: '.75rem' }}>
        <table>
          <thead>
            <tr>
              <th>Kit</th>
              <th className="right">Qty</th>
              <th className="right">Material each</th>
              <th className="right">Labour each</th>
              <th className="right">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assemblies.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">No kits yet — add one below.</td>
              </tr>
            )}
            {assemblies.map((a) => (
              <AssemblyLine
                key={a.id}
                line={a}
                items={items.filter((i) => i.costing_assembly_id === a.id)}
                labour={labour.filter((l) => l.costing_assembly_id === a.id)}
                totals={totalsById.get(a.id)}
                label={label}
                editable={editable}
                processNames={processNames}
                onQuantity={handlers.onAssemblyQuantity}
                onRemove={handlers.onAssemblyRemove}
                onItemQuantity={handlers.onItemQuantity}
                onItemRemove={handlers.onItemRemove}
                onHours={handlers.onHours}
              />
            ))}
          </tbody>
          {price && (
            <tfoot>
              <tr>
                <th colSpan={2}>Cost of one panel</th>
                <th className="right">{money(price.material_cost, label)}</th>
                <th className="right">{money(price.labour_cost, label)}</th>
                <th className="right">{money(price.material_cost + price.labour_cost, label)}</th>
                <th></th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editable && <AddAssembly library={library} onAdd={(id, qty) => handlers.onAddAssembly(panel.id, id, qty)} />}
    </div>
  )
}

function Detail({ label, hint, value, editable, onCommit }: {
  label: string
  hint?: string
  value: string | null
  editable: boolean
  onCommit: (value: string | null) => void
}) {
  return (
    <label className="field" style={{ margin: 0 }}>
      <span>{label}{hint && <em className="hint"> — {hint}</em>}</span>
      {editable ? (
        <input defaultValue={value ?? ''} onBlur={(e) => e.target.value !== (value ?? '') && onCommit(e.target.value || null)} />
      ) : (
        <div>{value || <span className="muted">—</span>}</div>
      )}
    </label>
  )
}

function AddAssembly({ library, onAdd }: { library: Assembly[]; onAdd: (id: string, qty: number) => Promise<void> }) {
  const [choice, setChoice] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = library.filter((a) => a.is_active)

  return (
    <div className="row" style={{ marginTop: '.75rem' }}>
      <select value={choice} style={{ flex: 3, minWidth: '14rem' }} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Add a kit…</option>
        {active.map((a) => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}{a.company_id ? ' (yours)' : ''}</option>
        ))}
      </select>
      <input type="number" step="1" min="1" value={qty} style={{ width: '5rem' }} aria-label="Quantity" onChange={(e) => setQty(e.target.value)} />
      <button
        className="primary"
        disabled={!choice || busy}
        onClick={() => {
          setBusy(true); setError(null)
          onAdd(choice, Number(qty) || 1)
            .then(() => { setChoice(''); setQty('1') })
            .catch((e: unknown) => setError(String(e)))
            .finally(() => setBusy(false))
        }}
      >
        {busy ? 'Adding…' : 'Add'}
      </button>
      {error && <span className="error">{error}</span>}
    </div>
  )
}
