import { useMemo, useState } from 'react'
import type { Kit } from '../../lib/database.types'

/**
 * Choose a kit the way the costing team thinks: kit group, then rating, then
 * the kit itself (main device and poles shown), then how many.
 */
export function KitPicker({ kits, onAdd }: { kits: Kit[]; onAdd: (kitId: string, qty: number) => Promise<void> }) {
  const [group, setGroup] = useState('')
  const [rating, setRating] = useState('')
  const [choice, setChoice] = useState('')
  const [qty, setQty] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = useMemo(() => kits.filter((k) => k.is_active), [kits])
  const groups = useMemo(
    () => Array.from(new Set(active.map((k) => k.group_name ?? 'No group'))).sort(),
    [active],
  )
  const inGroup = active.filter((k) => (k.group_name ?? 'No group') === group)
  const ratings = Array.from(
    new Set(inGroup.filter((k) => k.rating != null).map((k) => `${k.rating} ${k.rating_unit ?? ''}`.trim())),
  ).sort((a, b) => parseFloat(a) - parseFloat(b))
  const hasUnrated = inGroup.some((k) => k.rating == null)
  const candidates = inGroup.filter((k) =>
    rating === '' ? true : rating === '—' ? k.rating == null : `${k.rating} ${k.rating_unit ?? ''}`.trim() === rating,
  )
  const chosen = candidates.find((k) => k.id === choice)

  return (
    <div style={{ marginTop: '.75rem' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select value={group} style={{ flex: 1, minWidth: '9rem' }} onChange={(e) => { setGroup(e.target.value); setRating(''); setChoice('') }}>
          <option value="">Kit group…</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={rating} disabled={!group} style={{ width: '8rem' }} onChange={(e) => { setRating(e.target.value); setChoice('') }}>
          <option value="">Any rating</option>
          {ratings.map((r) => <option key={r} value={r}>{r}</option>)}
          {hasUnrated && <option value="—">No rating</option>}
        </select>
        <select value={choice} disabled={!group} style={{ flex: 3, minWidth: '14rem' }} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{group ? `Kit (${candidates.length})…` : 'Kit…'}</option>
          {candidates.map((k) => (
            <option key={k.id} value={k.id} disabled={k.has_unpriced_part}>
              {k.name}{k.poles ? ` · ${k.poles}P` : ''}{k.main_device_code ? ` · ${k.main_device_code}` : ''}
              {k.company_id ? ' (yours)' : ''}{k.has_unpriced_part ? ' — unpriced part' : ''}
            </option>
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
          {busy ? 'Adding…' : 'Add kit'}
        </button>
      </div>
      {chosen && (
        <p className="muted" style={{ margin: '.3rem 0 0', fontSize: '.8125rem' }}>
          {chosen.line_count} line{chosen.line_count === 1 ? '' : 's'}
          {chosen.main_device_name ? `; main device ${chosen.main_device_name}` : ''}.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
