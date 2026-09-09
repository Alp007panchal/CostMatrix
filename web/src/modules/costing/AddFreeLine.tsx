import { useState } from 'react'
import type { ComponentCategory, ComponentPrice } from '../../lib/database.types'
import { ComponentPicker } from '../library/ComponentPicker'
import type { ManualItemInput } from './api'

/**
 * Add to a panel outside any kit: a catalogue component (a cubicle among
 * them), or a line typed in with its own price for a part no catalogue holds.
 */
export function AddFreeLine({
  components,
  categories,
  label,
  onAddComponent,
  onAddManual,
}: {
  components: ComponentPrice[]
  categories: ComponentCategory[]
  label: string
  onAddComponent: (componentId: string, qty: number) => Promise<void>
  onAddManual: (input: ManualItemInput) => Promise<void>
}) {
  const [mode, setMode] = useState<'catalogue' | 'typed'>('catalogue')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('switchgear')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('pcs')
  const [make, setMake] = useState('')
  const [partNo, setPartNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const priced = components.filter((c) => c.is_active && c.unit_price != null)

  return (
    <div style={{ marginTop: '.75rem', borderTop: '1px solid var(--line)', paddingTop: '.5rem' }}>
      <div className="row" style={{ gap: '.75rem', fontSize: '.8125rem' }}>
        <span className="muted">Outside a kit:</span>
        <label className="row" style={{ gap: '.3rem' }}>
          <input type="radio" checked={mode === 'catalogue'} onChange={() => setMode('catalogue')} /> from the catalogue
        </label>
        <label className="row" style={{ gap: '.3rem' }}>
          <input type="radio" checked={mode === 'typed'} onChange={() => setMode('typed')} /> typed in with a price
        </label>
      </div>

      {mode === 'catalogue' ? (
        <ComponentPicker candidates={priced} label={label} onPick={onAddComponent} />
      ) : (
        <div className="row" style={{ flexWrap: 'wrap', marginTop: '.5rem' }}>
          <input placeholder="Name, e.g. Synchro check relay" value={name} style={{ flex: 3, minWidth: '12rem' }} onChange={(e) => setName(e.target.value)} />
          <select value={category} style={{ width: '13rem' }} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <input type="number" step="0.01" min="0" placeholder={`Price each (${label})`} value={price} style={{ width: '9rem' }} onChange={(e) => setPrice(e.target.value)} />
          <input type="number" step="0.001" min="0.001" value={qty} style={{ width: '5rem' }} aria-label="Quantity" onChange={(e) => setQty(e.target.value)} />
          <input placeholder="unit" value={unit} style={{ width: '4.5rem' }} onChange={(e) => setUnit(e.target.value)} />
          <input placeholder="Make (optional)" value={make} style={{ width: '9rem' }} onChange={(e) => setMake(e.target.value)} />
          <input placeholder="Part number (optional)" value={partNo} style={{ width: '11rem' }} onChange={(e) => setPartNo(e.target.value)} />
          <button
            className="primary"
            disabled={busy || !name.trim() || price === '' || !(Number(qty) > 0)}
            onClick={() => {
              setBusy(true); setError(null)
              onAddManual({
                name: name.trim(), category, unit_price: Number(price), quantity: Number(qty),
                unit: unit.trim() || 'pcs', make: make.trim() || null, part_number: partNo.trim() || null,
              })
                .then(() => { setName(''); setPrice(''); setQty('1'); setMake(''); setPartNo('') })
                .catch((e: unknown) => setError(String(e)))
                .finally(() => setBusy(false))
            }}
          >
            {busy ? 'Adding…' : 'Add line'}
          </button>
          <span className="muted" style={{ fontSize: '.75rem', width: '100%' }}>
            A typed line lives in this costing only; add the part to the catalogue when you know its purchase price.
          </span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
